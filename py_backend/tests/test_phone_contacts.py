import sys
import unittest
import os
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.errors import phone_variants  # noqa: E402
from app.routes import auth, users  # noqa: E402
from app.security.jwt_service import JwtService  # noqa: E402


class PhoneContactsTest(unittest.TestCase):
    def test_pakistan_number_forms_share_one_canonical_value(self):
        for value in ('03288179010', '3288179010', '923288179010', '+92 328 8179010'):
            self.assertEqual(phone_variants(value), ['923288179010', '03288179010', '3288179010'])

    def test_invalid_phone_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            phone_variants('123')
        self.assertEqual(error.exception.status_code, 400)

    def test_profile_sync_cannot_erase_phone_or_change_email(self):
        with patch.object(users, 'q') as query:
            users.upsert_profile({'uid': 'alice', 'email': 'other@example.com', 'phoneNumber': ''}, 'alice')
        sql = query.call_args.args[0]
        self.assertNotIn('phone_number', sql)
        self.assertNotIn('email', sql)

    def test_existing_user_can_claim_number_and_be_found(self):
        row = {'uid': 'alice', 'email': 'alice@example.com', 'phone_number': '923288179010'}
        with patch.object(users, 'q', return_value=row) as query:
            result = users.update_my_phone({'phoneNumber': '03288179010'}, 'alice')
        self.assertEqual(result['profile']['phoneNumber'], '923288179010')
        self.assertEqual(query.call_args.args[1][:2], ('923288179010', ['923288179010', '03288179010', '3288179010']))

    def test_contact_lookup_uses_phone_aliases(self):
        candidate = {'uid': 'bob', 'display_name': 'Bob', 'phone_number': '923288179010'}
        with patch.object(users, 'q', side_effect=[candidate, None]) as query:
            result = users.add_contact('alice', {'phoneNumber': '03288179010'}, 'alice')
        self.assertEqual(result['candidate']['uid'], 'bob')
        self.assertIn('03288179010', query.call_args_list[0].args[1][0])

    def test_registration_saves_email_and_phone_together(self):
        row = {'uid': 'new-user', 'email': 'new@example.com', 'display_name': 'New', 'photo_url': ''}
        with patch.dict(os.environ, {'JWT_SECRET': 'test-secret-of-at-least-thirty-two-characters'}), \
             patch.object(auth.password_hasher, 'hash', return_value='hash'), \
             patch.object(auth, 'jwt_service', JwtService('test-secret-of-at-least-thirty-two-characters')), \
             patch.object(auth, 'q', side_effect=[None, row, None]) as query:
            result = auth.register({'email': ' New@Example.com ', 'password': 'password',
                                    'phoneNumber': '03288179010', 'displayName': 'New', 'uid': 'new-user'})
        self.assertEqual(result['user']['email'], 'new@example.com')
        insert_args = query.call_args_list[0].args[1]
        self.assertEqual(insert_args[1], 'new@example.com')
        self.assertEqual(insert_args[4], '923288179010')


if __name__ == '__main__':
    unittest.main()
