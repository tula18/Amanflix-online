import sys
import time
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.routes import watch_party


class FakeUser:
    def __init__(self, user_id, username):
        self.id = user_id
        self.username = username
        self.is_banned = False


class WatchPartyMemoryTests(unittest.TestCase):
    def setUp(self):
        with watch_party._party_lock:
            watch_party._parties.clear()

    def test_create_party_uses_memory_state(self):
        leader = FakeUser(1, 'leader')

        party = watch_party._create_party_for_user(leader, 'm-123')

        self.assertEqual(party['watch_id'], 'm-123')
        self.assertEqual(party['leader_id'], 1)
        self.assertTrue(party['is_leader'])
        self.assertIn(party['code'], watch_party._parties)

    def test_join_party_adds_member_without_changing_leader(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        joined = watch_party._join_party_for_user(member, created['code'])

        self.assertFalse(joined['is_leader'])
        self.assertEqual(joined['leader_id'], 1)
        self.assertEqual({item['id'] for item in joined['members']}, {1, 2})

    def test_non_leader_cannot_seek_but_can_pause(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            playback, error = watch_party._handle_playback_message(
                party,
                member,
                {'action': 'seek', 'position': 55}
            )
            self.assertIsNone(playback)
            self.assertIsNotNone(error)

            playback, error = watch_party._handle_playback_message(
                party,
                member,
                {'action': 'pause', 'position': 12}
            )
            self.assertIsNone(error)
            self.assertFalse(playback['playing'])
            self.assertEqual(playback['position'], 12)

    def test_chat_is_trimmed_and_bounded(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            message, error = watch_party._handle_chat_message(
                party,
                leader,
                {'message': 'x' * (watch_party.MAX_CHAT_LENGTH + 20)}
            )
            self.assertIsNone(error)
            self.assertEqual(len(message['message']), watch_party.MAX_CHAT_LENGTH)

            for index in range(watch_party.MAX_CHAT_MESSAGES + 5):
                watch_party._handle_chat_message(party, leader, {'message': f'msg {index}'})

            self.assertEqual(len(party['chat']), watch_party.MAX_CHAT_MESSAGES)

    def test_reactions_are_chat_items(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            message, error = watch_party._handle_reaction_message(
                party,
                leader,
                {'reaction': '🔥'}
            )

        self.assertIsNone(error)
        self.assertEqual(message['type'], 'reaction')
        self.assertEqual(message['reaction'], '🔥')

    def test_invalid_reaction_is_rejected(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            message, error = watch_party._handle_reaction_message(
                party,
                leader,
                {'reaction': 'invalid'}
            )

        self.assertIsNone(message)
        self.assertIsNotNone(error)

    def test_leader_can_transfer_leadership(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member, connected=True)
            error = watch_party._handle_leader_transfer_message(
                party,
                leader,
                {'target_user_id': 2}
            )

        self.assertIsNone(error)
        self.assertEqual(party['leader_id'], 2)
        self.assertFalse(party['members'][1]['is_leader'])
        self.assertTrue(party['members'][2]['is_leader'])
        self.assertEqual(party['chat'][-1]['type'], 'system')

    def test_non_leader_cannot_transfer_leadership(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            error = watch_party._handle_leader_transfer_message(
                party,
                member,
                {'target_user_id': 2}
            )

        self.assertIsNotNone(error)
        self.assertEqual(party['leader_id'], 1)

    def test_expired_parties_are_removed(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            watch_party._parties[created['code']]['last_activity'] = (
                time.time() - watch_party.PARTY_TTL_SECONDS - 1
            )
            expired_codes, _ = watch_party._cleanup_expired_locked()

        self.assertIn(created['code'], expired_codes)
        self.assertNotIn(created['code'], watch_party._parties)


if __name__ == '__main__':
    unittest.main()
