import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from flask import Flask


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api import service_controller, visitor_queue as vq
from api.cache import admin_cache, blacklist_cache, user_cache
from api.utils import generate_admin_token, generate_token
from api.visitor_queue import IDLE_TIMEOUT, TAB_TIMEOUT, WAITING_TIMEOUT, VisitorQueue, install_visitor_gate
from models import Admin, User, db


class Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class QueueTestCase(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.enabled = True
        self.limit = 2
        self.queue = VisitorQueue(lambda: (self.enabled, self.limit), clock=self.clock)

    def join(self, idle=0):
        return self.queue.check_in(None, idle)

    def again(self, response, idle=0):
        return self.queue.check_in(response['ticket'], idle)


class AdmissionTests(QueueTestCase):
    def test_admits_up_to_the_limit_then_queues_in_order(self):
        a, b, c, d = self.join(), self.join(), self.join(), self.join()
        self.assertEqual([r['status'] for r in (a, b)], ['admitted', 'admitted'])
        self.assertEqual((c['status'], c['position'], c['ahead']), ('waiting', 1, 0))
        self.assertEqual((d['status'], d['position'], d['ahead'], d['queue_length']), ('waiting', 2, 1, 2))
        self.assertTrue(self.queue.is_admitted(a['ticket']))
        self.assertFalse(self.queue.is_admitted(c['ticket']))

    def test_all_tabs_of_a_browser_share_one_slot(self):
        a = self.join()
        for _ in range(3):
            self.assertEqual(self.again(a)['status'], 'admitted')
        self.assertEqual(self.queue.stats()['active'], 1)

    def test_closed_tab_frees_the_slot_for_the_first_in_line(self):
        a, b = self.join(), self.join()
        c, d = self.join(), self.join()
        for _ in range(4):                       # a, c and d keep checking in; b's tab closed
            self.clock.advance(TAB_TIMEOUT / 4 + 1)
            self.again(a), self.again(c), self.again(d)
        self.assertEqual(self.again(c)['status'], 'admitted')
        self.assertEqual((self.again(d)['status'], self.again(d)['position']), ('waiting', 1))
        self.assertFalse(self.queue.is_admitted(b['ticket']))

    def test_requests_with_the_ticket_keep_the_slot(self):
        a = self.join()
        for _ in range(4):
            self.clock.advance(TAB_TIMEOUT / 2)
            self.assertTrue(self.queue.is_admitted(a['ticket']))
        self.assertEqual(self.again(a)['status'], 'admitted')

    def test_waiting_visitor_who_left_loses_the_place(self):
        a, b = self.join(), self.join()
        c, d = self.join(), self.join()
        self.queue.leave(c['ticket'])
        self.assertEqual(self.again(d)['position'], 1)
        for _ in range(3):                        # a and b stay; d stops checking in
            self.clock.advance(WAITING_TIMEOUT / 3 + 1)
            self.again(a), self.again(b)
        e = self.join()
        self.assertEqual(e['position'], 1)       # d stopped checking in and was dropped

    def test_refreshing_the_waiting_page_keeps_the_place(self):
        self.join(), self.join()
        c, d = self.join(), self.join()
        self.queue.leave(c['ticket'])              # pagehide on refresh
        self.clock.advance(3)
        self.assertEqual(self.again(c)['position'], 1)
        self.assertEqual(self.again(d)['position'], 2)

    def test_closed_waiting_page_frees_the_place_after_the_grace(self):
        a, b = self.join(), self.join()
        c, d = self.join(), self.join()
        self.queue.leave(c['ticket'])
        self.clock.advance(vq.LEAVE_GRACE + 1)
        self.again(a), self.again(b)
        self.assertEqual(self.again(d)['position'], 1)
        self.assertEqual(self.queue.stats()['waiting'], 1)
        self.assertEqual(self.again(c)['position'], 2)   # came back later: end of the line

    def test_unknown_or_invalid_ticket_is_treated_as_new(self):
        r = self.queue.check_in('not a ticket!', 0)
        self.assertEqual(r['status'], 'admitted')
        self.assertNotEqual(r['ticket'], 'not a ticket!')
        # a valid ticket the server forgot (restart) gets in if there is room
        forgotten = self.queue.check_in('A' * 24, 0)
        self.assertEqual((forgotten['status'], forgotten['ticket']), ('admitted', 'A' * 24))
        self.assertTrue(self.queue.is_admitted('A' * 24))


class AdminTicketTests(QueueTestCase):
    def test_admin_gets_in_while_full_without_taking_a_slot(self):
        self.join(), self.join()
        admin = self.queue.check_in(None, 0, is_admin=True)
        self.assertEqual(admin['status'], 'admitted')
        self.assertTrue(self.queue.is_admitted(admin['ticket']))
        self.assertEqual(self.queue.stats()['active'], 2)
        self.assertEqual(self.join()['status'], 'waiting')

    def test_visitor_who_signs_in_as_admin_frees_their_slot(self):
        a, b = self.join(), self.join()
        c = self.join()
        self.queue.check_in(a['ticket'], 0, is_admin=True)
        self.assertEqual(self.again(c)['status'], 'admitted')

    def test_admin_ticket_expires_when_the_tab_closes(self):
        admin = self.queue.check_in(None, 0, is_admin=True)
        self.clock.advance(TAB_TIMEOUT + 1)
        self.join()                                # any check-in sweeps
        self.assertFalse(self.queue.is_admitted(admin['ticket']))


class IdleTests(QueueTestCase):
    def test_idle_visitor_keeps_the_slot_when_nobody_waits(self):
        a = self.join()
        self.clock.advance(IDLE_TIMEOUT + 60)
        self.assertEqual(self.again(a, idle=IDLE_TIMEOUT + 60)['status'], 'admitted')

    def test_idle_visitor_gives_the_slot_to_someone_waiting(self):
        a, b = self.join(), self.join()
        self.clock.advance(IDLE_TIMEOUT - 10)
        self.again(a, idle=IDLE_TIMEOUT - 10)      # a has been idle all along
        self.again(b, idle=0)                      # b is active
        c = self.join()
        self.assertEqual(c['status'], 'waiting')
        self.clock.advance(20)
        self.again(a, idle=IDLE_TIMEOUT + 10)
        self.assertEqual(self.again(c)['status'], 'admitted')
        back = self.again(a, idle=IDLE_TIMEOUT + 10)
        self.assertEqual((back['status'], back['reason']), ('waiting', 'idle'))
        self.assertEqual(self.again(b)['status'], 'admitted')

    def test_video_playing_counts_as_activity(self):
        a, b = self.join(), self.join()
        c = self.join()
        for _ in range(IDLE_TIMEOUT // 20 + 10):  # a watches a movie (no input, video playing)
            self.clock.advance(20)
            self.again(a, idle=0), self.again(b, idle=0), self.again(c)
        self.assertEqual(self.again(a)['status'], 'admitted')
        self.assertEqual(self.again(c)['status'], 'waiting')

    def test_returning_visitor_is_ahead_of_idle_ones_in_line(self):
        a, b = self.join(), self.join()
        self.clock.advance(IDLE_TIMEOUT + 1)
        self.again(a, idle=IDLE_TIMEOUT + 1), self.again(b, idle=IDLE_TIMEOUT + 1)
        c = self.join()                            # b (longest idle) goes to the line for c
        self.assertEqual(self.again(c)['status'], 'admitted')
        d = self.join()
        self.assertEqual((d['status'], d['position']), ('waiting', 1))   # ahead of idle ones


class LimitTests(QueueTestCase):
    def test_lowering_the_limit_keeps_everyone_in(self):
        a, b = self.join(), self.join()
        self.limit = 1
        self.assertEqual(self.again(a)['status'], 'admitted')
        self.assertEqual(self.again(b)['status'], 'admitted')
        self.assertEqual(self.join()['status'], 'waiting')

    def test_raising_the_limit_lets_people_in(self):
        self.join(), self.join()
        c = self.join()
        self.limit = 3
        self.assertEqual(self.again(c)['status'], 'admitted')

    def test_disabled_limit_admits_everyone(self):
        self.enabled = False
        results = [self.join() for _ in range(10)]
        self.assertTrue(all(r['status'] == 'admitted' for r in results))
        self.assertTrue(self.queue.is_admitted(None))


class EstimateTests(QueueTestCase):
    def test_estimate_before_any_slot_frees_uses_the_default_visit(self):
        self.join(), self.join()
        c = self.join()
        self.assertEqual(c['eta_seconds'], round(vq.DEFAULT_VISIT_SECONDS / self.limit))

    def test_estimate_follows_how_fast_slots_free_up(self):
        self.limit = 1
        waiting = []
        self.join()
        for _ in range(8):
            waiting.append(self.join())
        # one slot frees every 150 s: the admitted visitor's tab closes each time
        for _ in range(6):
            self.clock.advance(TAB_TIMEOUT + 30)
            for r in waiting:
                self.again(r)
        last = self.again(waiting[-1])
        self.assertEqual(last['status'], 'waiting')
        per_slot = last['eta_seconds'] / last['position']
        self.assertAlmostEqual(per_slot, TAB_TIMEOUT + 30, delta=40)


class DatabaseTestCase(unittest.TestCase):
    def setUp(self):
        admin_cache.clear(), user_cache.clear(), blacklist_cache.clear()
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
                               SQLALCHEMY_TRACK_MODIFICATIONS=False)
        db.init_app(self.app)
        with self.app.app_context():
            db.create_all()
            for username, role in (('boss', 'superadmin'), ('mod', 'moderator')):
                db.session.add(Admin(username=username, email=f'{username}@x.com', password='x', role=role))
            db.session.add(User(username='viewer', password='x'))
            db.session.commit()
            self.superadmin_token = generate_admin_token(Admin.query.filter_by(username='boss').first().id, 'superadmin')
            self.user_token = generate_token(User.query.filter_by(username='viewer').first().id)
        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        admin_cache.clear(), user_cache.clear(), blacklist_cache.clear()


class GateTests(DatabaseTestCase):
    def setUp(self):
        super().setUp()
        self.clock = Clock()
        self.queue = VisitorQueue(lambda: (True, 1), clock=self.clock)
        install_visitor_gate(self.app, self.queue)
        for path in ('/api/movies', '/cdn/search', '/api/service/status', '/cdn/images/x.jpg',
                     '/api/stream/1', '/api/admin/users', '/api/analytics/heartbeat', '/other'):
            self.app.add_url_rule(path, path, lambda: 'ok', methods=['GET', 'POST', 'OPTIONS'])

    def test_waiting_visitor_is_turned_away(self):
        inside = self.queue.check_in(None, 0)
        waiting = self.queue.check_in(None, 0)
        self.assertEqual(self.client.get('/api/movies', headers={'X-Visitor-Ticket': inside['ticket']}).status_code, 200)
        for headers in ({'X-Visitor-Ticket': waiting['ticket']}, {}):
            response = self.client.get('/cdn/search', headers=headers)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.get_json()['error'], 'queue_required')

    def test_exempt_requests_pass_without_a_ticket(self):
        self.queue.check_in(None, 0)   # the site is full
        for path in ('/api/service/status', '/cdn/images/x.jpg', '/api/stream/1', '/api/admin/users',
                     '/api/analytics/heartbeat', '/other'):
            self.assertEqual(self.client.get(path).status_code, 200, path)
        self.assertEqual(self.client.options('/api/movies').status_code, 200)

    def test_admins_pass_but_user_tokens_do_not(self):
        self.queue.check_in(None, 0)
        admin = self.client.get('/api/movies', headers={'Authorization': f'Bearer {self.superadmin_token}'})
        self.assertEqual(admin.status_code, 200)
        user = self.client.get('/api/movies', headers={'Authorization': f'Bearer {self.user_token}'})
        self.assertEqual(user.status_code, 503)


class ServiceConfigTests(DatabaseTestCase):
    def setUp(self):
        super().setUp()
        from api.routes.service_control import service_control_bp
        self.app.register_blueprint(service_control_bp)
        self.tmpdir = tempfile.TemporaryDirectory()
        self.original = (service_controller.SERVICE_CONFIG_PATH, service_controller._service_config)
        service_controller.SERVICE_CONFIG_PATH = os.path.join(self.tmpdir.name, 'service_config.json')
        # a config file written before the visitor limit existed
        with open(service_controller.SERVICE_CONFIG_PATH, 'w') as f:
            json.dump({'service_enabled': True, 'maintenance_mode': False, 'allow_admin_access': True}, f)
        service_controller._service_config = None

    def tearDown(self):
        service_controller.SERVICE_CONFIG_PATH, service_controller._service_config = self.original
        self.tmpdir.cleanup()
        super().tearDown()

    def test_older_config_file_gets_the_new_defaults(self):
        config = service_controller.get_service_config()
        self.assertEqual((config['visitor_limit_enabled'], config['max_visitors']), (True, 150))

    def test_superadmin_changes_the_limit(self):
        headers = {'Authorization': f'Bearer {self.superadmin_token}'}
        response = self.client.post('/api/service/config', headers=headers,
                                    data={'max_visitors': '200', 'visitor_limit_enabled': 'false'})
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        self.assertEqual((response.get_json()['config']['max_visitors'],
                          response.get_json()['config']['visitor_limit_enabled']), (200, False))
        with open(service_controller.SERVICE_CONFIG_PATH) as f:
            self.assertEqual(json.load(f)['max_visitors'], 200)
        self.assertEqual(vq._settings_from_service_config(), (False, 200))

    def test_invalid_limit_is_rejected(self):
        headers = {'Authorization': f'Bearer {self.superadmin_token}'}
        for value in ('0', '-5', 'abc', '10001', '2.5'):
            response = self.client.post('/api/service/config', headers=headers, data={'max_visitors': value})
            self.assertEqual(response.status_code, 400, value)

    def test_only_superadmins_see_stats_and_change_the_limit(self):
        with self.app.app_context():
            mod = generate_admin_token(Admin.query.filter_by(username='mod').first().id, 'moderator')
        for token in (mod,):
            headers = {'Authorization': f'Bearer {token}'}
            self.assertNotEqual(self.client.get('/api/service/queue/stats', headers=headers).status_code, 200)
            self.assertNotEqual(self.client.post('/api/service/config', headers=headers,
                                                 data={'max_visitors': '5'}).status_code, 200)
        stats = self.client.get('/api/service/queue/stats',
                                headers={'Authorization': f'Bearer {self.superadmin_token}'})
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(set(stats.get_json()), {'enabled', 'limit', 'active', 'waiting', 'eta_for_next_seconds',
                                                 'admitted_last_hour', 'released_last_hour'})

    def test_admin_check_in_is_admitted_when_full(self):
        from api.visitor_queue import visitor_queue
        original = visitor_queue._get_settings
        visitor_queue._get_settings = lambda: (True, 1)
        try:
            self.client.post('/api/service/queue/check-in', json={})           # fills the site
            user = self.client.post('/api/service/queue/check-in', json={},
                                    headers={'Authorization': f'Bearer {self.user_token}'}).get_json()
            self.assertEqual(user['status'], 'waiting')                       # a user token is no admin
            admin = self.client.post('/api/service/queue/check-in', json={},
                                     headers={'Authorization': f'Bearer {self.superadmin_token}'}).get_json()
            self.assertEqual(admin['status'], 'admitted')
            self.assertTrue(visitor_queue.is_admitted(admin['ticket']))
        finally:
            visitor_queue._get_settings = original

    def test_check_in_and_leave_routes(self):
        first = self.client.post('/api/service/queue/check-in', json={'idle_seconds': 3}).get_json()
        self.assertEqual(first['status'], 'admitted')
        again = self.client.post('/api/service/queue/check-in', json={'ticket': first['ticket']}).get_json()
        self.assertEqual(again['ticket'], first['ticket'])
        # sendBeacon posts text/plain
        response = self.client.post('/api/service/queue/leave', data=json.dumps({'ticket': first['ticket']}),
                                    content_type='text/plain')
        self.assertEqual(response.status_code, 200)


if __name__ == '__main__':
    unittest.main()
