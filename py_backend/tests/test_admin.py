import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routes import admin  # noqa: E402
from app.routes import crypto_activity  # noqa: E402
from app.security.jwt_service import JwtService  # noqa: E402


ADMIN_ENV = {
    'ADMIN_EMAIL': 'admin@gmail.com',
    'ADMIN_PASSWORD': 'admin123',
    'JWT_SECRET': 'test-secret-of-at-least-thirty-two-characters',
    'JWT_TTL_MINUTES': '60',
}


class AdminRoutesTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, ADMIN_ENV)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_admin_login_and_user_list(self):
        with patch.object(admin, 'q') as write_event:
            session = admin.login({'email': 'ADMIN@gmail.com', 'password': 'admin123'})
        self.assertIn('admin_login', write_event.call_args.args[0])
        self.assertEqual(admin.authenticated_admin(f"Bearer {session['token']}"), 'admin@gmail.com')
        row = {
            'uid': 'user-1', 'email': 'user@example.com', 'display_name': 'User One',
            'phone_number': '123', 'contacts': ['456'], 'password_hash': 'private',
        }
        with patch.object(admin, 'q', return_value=[row]) as query:
            result = admin.list_users('admin@gmail.com')
        self.assertEqual(result['users'][0]['email'], 'user@example.com')
        self.assertNotIn('password_hash', result['users'][0])
        self.assertNotIn('passwordHash', result['users'][0])
        self.assertIn('FROM users', query.call_args.args[0])

    def test_regular_user_token_cannot_list_users(self):
        regular_token = JwtService(ADMIN_ENV['JWT_SECRET']).issue_access_token(user_id='user-1', device_id='device-1')
        with self.assertRaises(HTTPException) as error:
            admin.authenticated_admin(f'Bearer {regular_token}')
        self.assertEqual(error.exception.status_code, 401)

    def test_missing_token_and_wrong_password_are_rejected(self):
        with self.assertRaises(HTTPException) as missing:
            admin.authenticated_admin('')
        self.assertEqual(missing.exception.status_code, 401)
        with self.assertRaises(HTTPException) as wrong:
            admin.login({'email': 'admin@gmail.com', 'password': 'wrong'})
        self.assertEqual(wrong.exception.status_code, 401)

    def test_user_list_route_requires_admin_dependency(self):
        protected = ('/api/admin/users', '/api/admin/users/{uid}', '/api/admin/crypto/overview', '/api/admin/crypto/identities',
                     '/api/admin/crypto/messages', '/api/admin/crypto/logins', '/api/admin/live/{uid}/start',
                     '/api/admin/live/{uid}/stop', '/api/admin/live/{uid}',
                     '/api/admin/registration-live/start', '/api/admin/registration-live/stop',
                     '/api/admin/registration-live')
        for path in protected:
            route = next(route for route in admin.router.routes if route.path == path)
            self.assertTrue(any(dependency.call is admin.authenticated_admin for dependency in route.dependant.dependencies), path)

    def test_crypto_records_are_paged_from_current_pqc_tables(self):
        with patch.object(admin, 'q', side_effect=[{'total': 1}, [{'user_id': 'user-1', 'suite_id': 'pqc', 'bundle': {'encryption_public_key_b64': 'public'}}]]) as query:
            result = admin.crypto_identities(1, 'admin@gmail.com')
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['suite_id'], 'pqc')
        self.assertIn("suite_id='pqc'", query.call_args_list[0].args[0])

    def test_admin_can_edit_only_supported_profile_fields(self):
        row = {'uid': 'user-1', 'email': 'new@example.com', 'display_name': 'New Name', 'phone_number': '923288179010'}
        patch_body = admin.AdminUserPatch(displayName='New Name', email=' New@Example.com ', phoneNumber='03288179010')
        with patch.object(admin, 'q', return_value=row) as query:
            result = admin.update_user('user-1', patch_body, 'admin@gmail.com')
        self.assertEqual(result['user']['phoneNumber'], '923288179010')
        self.assertEqual(query.call_args.args[1], ('New Name', 'new@example.com', '923288179010',
                                                  ['923288179010', '03288179010', '3288179010'], 'user-1'))
        self.assertNotIn('password', query.call_args.args[0])
        with self.assertRaises(HTTPException):
            admin.update_user('user-1', admin.AdminUserPatch(email='bad-email'), 'admin@gmail.com')

    def test_crypto_overview_reports_actual_algorithms(self):
        with patch.object(admin, 'q', return_value={'identities': 1, 'encrypted_messages': 2, 'auth_events': 3}):
            result = admin.crypto_overview('admin@gmail.com')
        self.assertEqual(result['algorithms'], {
            'keyExchange': 'ml-kem-768', 'signature': 'ml-dsa-65', 'messageCipher': 'aes-256-gcm',
        })

    def test_live_demo_is_admin_scoped_and_records_only_allowed_user_stages(self):
        from uuid import uuid4

        route = next(route for route in crypto_activity.router.routes if route.path == '/api/crypto/activity')
        self.assertTrue(any(dependency.call is crypto_activity.authenticated_user for dependency in route.dependant.dependencies))

        with patch.object(admin, 'q', side_effect=[{'uid': 'user-1'}, None, {'active_until': 'later'}]) as query:
            result = admin.start_live_demo('user-1', 'admin@gmail.com')
        self.assertEqual(result['activeUntil'], 'later')
        self.assertIn('DELETE FROM crypto_demo_events', query.call_args_list[1].args[0])

        body = crypto_activity.CryptoActivity(
            flowId=uuid4(), kind='login', step='kem', status='done', detail='generated', sequence=2,
        )
        with patch.object(crypto_activity, 'q', return_value={'id': 1}) as insert:
            self.assertEqual(crypto_activity.record_activity(body, 'user-1'), {'recorded': True})
        self.assertEqual(insert.call_args.args[1][0], 'user-1')
        self.assertNotIn('key', insert.call_args.args[0].split('SELECT')[0].lower())

        invalid = crypto_activity.CryptoActivity(
            flowId=uuid4(), kind='login', step='secret_key', status='done', sequence=1,
        )
        with self.assertRaises(HTTPException) as error:
            crypto_activity.record_activity(invalid, 'user-1')
        self.assertEqual(error.exception.status_code, 422)

    def test_live_demo_returns_message_captured_after_start(self):
        from datetime import datetime, timezone

        started = datetime.now(timezone.utc)
        envelope = {'suite_id': 'pqc', 'ciphertext_b64': 'encrypted'}
        values = [
            {'started_at': started, 'active_until': started},
            {'bundle': {'encryption_public_key_b64': 'public'}},
            [{'id': 1, 'kind': 'send', 'sequence': 0}],
            {'id': 'message-1', 'envelope': envelope},
        ]
        with patch.object(admin, 'q', side_effect=values) as query:
            result = admin.get_live_demo('user-1', 'admin@gmail.com')
        self.assertEqual(result['latestMessage']['envelope'], envelope)
        self.assertEqual(result['events'][0]['kind'], 'send')
        self.assertEqual(query.call_args.args[1], ('user-1', 'user-1', started))

    def test_live_activity_accepts_bounded_timings_and_sizes_only_for_matching_stage(self):
        from uuid import uuid4
        from pydantic import ValidationError

        body = crypto_activity.CryptoActivity(
            flowId=uuid4(), kind='send', step='kem', status='done', sequence=2,
            durationMs=4.25, metrics={'kemCiphertextBytes': 2176, 'wrapCount': 2},
        )
        with patch.object(crypto_activity, 'q', return_value={'id': 1}) as insert:
            self.assertEqual(crypto_activity.record_activity(body, 'user-1'), {'recorded': True})
        self.assertEqual(insert.call_args.args[1][7], 4.25)
        self.assertEqual(insert.call_args.args[1][8].adapted, {'kemCiphertextBytes': 2176, 'wrapCount': 2})

        identity_signature = crypto_activity.CryptoActivity(
            flowId=uuid4(), kind='register', step='identity_sign', status='done', detail='generated',
            sequence=7, durationMs=3.5, metrics={'signatureBytes': 3309},
        )
        with patch.object(crypto_activity, 'q', return_value={'id': 2}):
            self.assertEqual(crypto_activity.record_activity(identity_signature, 'new-user'), {'recorded': True})

        wrong_stage = crypto_activity.CryptoActivity(
            flowId=uuid4(), kind='login', step='auth', status='done', sequence=1,
            metrics={'privateKeyBytes': 10},
        )
        with self.assertRaises(HTTPException):
            crypto_activity.record_activity(wrong_stage, 'user-1')
        with self.assertRaises(ValidationError):
            crypto_activity.CryptoActivity(flowId=uuid4(), kind='send', step='aes', status='done',
                                           sequence=1, metrics={'secretKey': 'hidden'})

    def test_next_registration_capture_returns_only_new_account_activity(self):
        from datetime import datetime, timezone

        started = datetime.now(timezone.utc)
        with patch.object(admin, 'q', return_value={'active_until': started}) as query:
            self.assertEqual(admin.start_registration_demo('admin@gmail.com')['activeUntil'], started)
        self.assertIn('crypto_demo_registration_capture', query.call_args.args[0])

        values = [
            {'started_at': started, 'active_until': started},
            {'uid': 'new-user', 'email': 'new@example.com', 'display_name': 'New'},
            {'bundle': {'encryption_public_key_b64': 'public'}},
            [{'kind': 'register', 'duration_ms': 7, 'sequence': 1}],
            None,
        ]
        with patch.object(admin, 'q', side_effect=values) as query:
            result = admin.get_registration_demo('admin@gmail.com')
        self.assertEqual(result['capturedUser']['uid'], 'new-user')
        self.assertEqual(result['events'][0]['kind'], 'register')
        self.assertEqual(query.call_args_list[3].args[1], ('new-user', started))


if __name__ == '__main__':
    unittest.main()
