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

    def test_chat_reply_snapshot_is_preserved(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            original, original_error = watch_party._handle_chat_message(
                party,
                leader,
                {'message': 'original message'}
            )
            reply, reply_error = watch_party._handle_chat_message(
                party,
                member,
                {'message': 'reply message', 'reply_to_id': original['id']}
            )

        self.assertIsNone(original_error)
        self.assertIsNone(reply_error)
        self.assertEqual(reply['reply_to']['id'], original['id'])
        self.assertEqual(reply['reply_to']['username'], 'leader')
        self.assertEqual(reply['reply_to']['message'], 'original message')

    def test_member_can_edit_own_chat_message(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            message, chat_error = watch_party._handle_chat_message(
                party,
                member,
                {'message': 'original message'}
            )
            edit_error = watch_party._handle_chat_edit_message(
                party,
                member,
                {'message_id': message['id'], 'message': 'edited message'}
            )

        self.assertIsNone(chat_error)
        self.assertIsNone(edit_error)
        self.assertEqual(message['message'], 'edited message')
        self.assertIn('edited_at', message)

    def test_member_cannot_edit_another_users_message(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            message, chat_error = watch_party._handle_chat_message(
                party,
                leader,
                {'message': 'leader message'}
            )
            edit_error = watch_party._handle_chat_edit_message(
                party,
                member,
                {'message_id': message['id'], 'message': 'edited by member'}
            )

        self.assertIsNone(chat_error)
        self.assertEqual(edit_error, 'Only the message author can edit this message')
        self.assertEqual(message['message'], 'leader message')

    def test_muted_member_cannot_chat(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            error = watch_party._handle_moderation_message(
                party,
                leader,
                {'action': 'mute', 'target_user_id': 2}
            )
            message, chat_error = watch_party._handle_chat_message(
                party,
                member,
                {'message': 'hello'}
            )

        self.assertIsNone(error)
        self.assertIsNone(message)
        self.assertEqual(chat_error, 'You are muted in this party')

    def test_leader_can_delete_chat_message(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            message, error = watch_party._handle_chat_message(
                party,
                leader,
                {'message': 'remove me'}
            )
            delete_error = watch_party._handle_moderation_message(
                party,
                leader,
                {'action': 'delete_message', 'message_id': message['id']}
            )

        self.assertIsNone(error)
        self.assertIsNone(delete_error)
        self.assertNotIn(message['id'], {item['id'] for item in party['chat']})
        self.assertEqual(party['chat'][-1]['type'], 'system')

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

    def test_leader_can_update_settings(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            error = watch_party._handle_settings_update_message(
                party,
                leader,
                {'settings': {'members_can_control_playback': False}}
            )

        self.assertIsNone(error)
        self.assertFalse(party['settings']['members_can_control_playback'])
        self.assertEqual(party['chat'][-1]['type'], 'system')

    def test_settings_can_block_member_play_pause(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            party['settings']['members_can_control_playback'] = False
            playback, error = watch_party._handle_playback_message(
                party,
                member,
                {'action': 'pause', 'position': 12}
            )

        self.assertIsNone(playback)
        self.assertEqual(error, 'Only the party leader can control playback')

    def test_party_lock_requires_approval_for_new_members(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        stranger = FakeUser(3, 'stranger')
        created = watch_party._create_party_for_user(leader, 'm-123')

        joined = watch_party._join_party_for_user(member, created['code'])
        self.assertIsNotNone(joined)

        with watch_party._party_lock:
            watch_party._parties[created['code']]['settings']['party_locked'] = True

        existing_member_party, existing_error = watch_party._join_party_for_user_with_error(member, created['code'])
        new_member_party, new_member_error = watch_party._join_party_for_user_with_error(stranger, created['code'])

        self.assertIsNotNone(existing_member_party)
        self.assertIsNone(existing_error)
        self.assertIsNone(new_member_party)
        self.assertEqual(new_member_error, 'Join request pending')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            self.assertIn(3, party['join_requests'])
            error = watch_party._handle_join_request_message(
                party,
                leader,
                {'action': 'approve', 'target_user_id': 3}
            )

        self.assertIsNone(error)

        approved_party, approved_error = watch_party._join_party_for_user_with_error(
            stranger,
            created['code'],
            announce=True
        )

        self.assertIsNone(approved_error)
        self.assertIsNotNone(approved_party)
        self.assertEqual({item['id'] for item in approved_party['members']}, {1, 2, 3})

    def test_party_lock_denied_join_request_is_rejected(self):
        leader = FakeUser(1, 'leader')
        stranger = FakeUser(3, 'stranger')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            watch_party._parties[created['code']]['settings']['party_locked'] = True

        pending_party, pending_error = watch_party._join_party_for_user_with_error(stranger, created['code'])
        self.assertIsNone(pending_party)
        self.assertEqual(pending_error, 'Join request pending')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            error = watch_party._handle_join_request_message(
                party,
                leader,
                {'action': 'deny', 'target_user_id': 3}
            )

        self.assertIsNone(error)

        denied_party, denied_error = watch_party._join_party_for_user_with_error(stranger, created['code'])
        self.assertIsNone(denied_party)
        self.assertEqual(denied_error, 'Join request denied')

    def test_leader_can_change_watch_video(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            party['playback']['position'] = 42.0
            party['playback']['playing'] = False
            error = watch_party._handle_watch_change_message(
                party,
                leader,
                {'watch_id': 't-456-1-2', 'playing': True}
            )

        self.assertIsNone(error)
        self.assertEqual(party['watch_id'], 't-456-1-2')
        self.assertEqual(party['playback']['position'], 0.0)
        self.assertTrue(party['playback']['playing'])
        self.assertEqual(party['playback']['last_action'], 'watch_change')
        self.assertEqual(party['chat'][-1]['type'], 'system')

    def test_non_leader_cannot_change_watch_video(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            error = watch_party._handle_watch_change_message(
                party,
                member,
                {'watch_id': 't-456-1-2'}
            )

        self.assertEqual(error, 'Only the party leader can change the video')
        self.assertEqual(party['watch_id'], 'm-123')

    def test_chat_controls_block_member_profanity_and_spam(self):
        leader = FakeUser(1, 'leader')
        member = FakeUser(2, 'member')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            watch_party._upsert_member_locked(party, member)
            message, profanity_error = watch_party._handle_chat_message(
                party,
                member,
                {'message': 'this is shit'}
            )
            self.assertIsNone(message)
            self.assertEqual(profanity_error, 'Message blocked by profanity filter')

            for index in range(watch_party.SPAM_MAX_MESSAGES):
                message, error = watch_party._handle_chat_message(
                    party,
                    member,
                    {'message': f'ok message {index}'}
                )
                self.assertIsNone(error)
                self.assertIsNotNone(message)

            message, spam_error = watch_party._handle_chat_message(
                party,
                member,
                {'message': 'one more message'}
            )

        self.assertIsNone(message)
        self.assertEqual(spam_error, 'Slow down before sending another message')

    def test_playback_action_feed_skips_sync(self):
        leader = FakeUser(1, 'leader')
        created = watch_party._create_party_for_user(leader, 'm-123')

        with watch_party._party_lock:
            party = watch_party._parties[created['code']]
            feed_item = watch_party._append_playback_action_locked(
                party,
                leader,
                'pause',
                65
            )
            sync_item = watch_party._append_playback_action_locked(
                party,
                leader,
                'sync',
                65
            )

        self.assertIsNotNone(feed_item)
        self.assertEqual(feed_item['type'], 'playback_action')
        self.assertIn('1:05', feed_item['message'])
        self.assertIsNone(sync_item)

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
