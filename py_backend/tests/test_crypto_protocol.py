"""Contract/security tests using actual browser-generated envelopes and a mocked relay DB."""
import copy
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg2.errors import UniqueViolation
from app.routes import chat, crypto_keys, keys
from app.schemas.e2ee import EncryptedEnvelope
from app.security.jwt_service import JwtService

SECRET = 'test-only-cryptographic-relay-secret-at-least-32-bytes'

class CryptoProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[2]
        cls.fixtures = json.loads(subprocess.check_output(['node', str(root / 'frontend/tests/crypto/exportFixtures.mjs')], text=True))

    def setUp(self):
        self.env = patch.dict(os.environ, {'JWT_SECRET': SECRET})
        self.env.start()
        app = FastAPI()
        app.include_router(crypto_keys.router)
        app.include_router(keys.router)
        app.include_router(chat.router)
        self.client = TestClient(app)
        self.token = JwtService(SECRET).issue_access_token(user_id='alice', device_id='login-device')
        self.headers = {'Authorization': f'Bearer {self.token}'}
        self.envelope = copy.deepcopy(self.fixtures['envelopes']['pqc'])
        self.row = {'id': 'db-message', 'thread_type': 'direct', 'thread_id': 'alice_bob',
                    'sender_id': 'alice', 'receiver_id': 'bob',
                    'body': {'text': 'old plaintext', 'starredBy': ['alice']}}
        self.writes = []
        self.receipts = set()
        self.db = patch.object(chat, 'q', side_effect=self.query)
        self.db.start()

    def tearDown(self):
        self.db.stop()
        self.env.stop()
        self.client.close()

    def query(self, sql, params=(), fetch=None):
        if 'SELECT bundle FROM crypto_public_identities' in sql:
            return {'bundle': self.fixtures['envelopes'][params[1]]['sender_bundle']}
        if 'SELECT * FROM messages WHERE id=' in sql:
            return self.row
        if 'SELECT participants FROM conversations' in sql:
            return {'participants': ['alice', 'bob']}
        if sql.lstrip().startswith('WITH receipt'):
            if params[0] in self.receipts:
                raise UniqueViolation('duplicate receipt')
            self.receipts.add(params[0])
        self.writes.append((sql, params))
        return [] if fetch == 'all' else None

    def send(self, envelope=None, **overrides):
        body = {'threadType': 'direct', 'threadId': 'alice_bob', 'actorUid': 'alice', 'targetUid': 'bob',
                'payload': self.envelope if envelope is None else envelope, **overrides}
        return self.client.post('/api/chat/messages/send', json=body, headers=self.headers)

    def test_browser_envelopes_match_backend_contract(self):
        for envelope in self.fixtures['envelopes'].values():
            self.assertEqual(EncryptedEnvelope.model_validate(envelope).model_dump(), envelope)
            self.assertEqual(self.send(envelope).status_code, 200)

    def test_authentication_and_sender_binding(self):
        self.assertEqual(self.client.post('/api/chat/messages/send', json={}).status_code, 401)
        self.assertEqual(self.send(actorUid='bob').status_code, 403)
        expired = JwtService(SECRET, ttl_minutes=-1).issue_access_token(user_id='alice', device_id='x')
        self.assertEqual(self.client.post('/api/chat/messages/send', json={}, headers={'Authorization': f'Bearer {expired}'}).status_code, 401)
        self.assertEqual(self.client.post('/api/chat/messages/send', json={}, headers={'Authorization': 'Bearer invalid'}).status_code, 401)

    def test_plaintext_and_legacy_rejected(self):
        self.assertEqual(self.send({'type': 'text', 'text': 'secret'}).status_code, 400)
        self.envelope['protocol_version'] = '1.0'
        self.assertEqual(self.send().status_code, 400)

    def test_reject_mismatched_suite_context_lengths_and_extra_fields(self):
        for key, value in [('suite_id', 'unknown'), ('kex_algorithm', 'x25519'), ('thread_id', 'wrong'),
                           ('sender_user_id', 'mallory'), ('nonce_b64', 'AA=='), ('text', 'plaintext'),
                           ('rootKeyB64', 'secret')]:
            bad = {**self.envelope, key: value}
            with self.subTest(key=key): self.assertEqual(self.send(bad).status_code, 400)

    def test_public_registry_rejects_secrets_and_spoofed_ownership(self):
        bundles = [b for b in self.fixtures['bundles'] if b['user_id'] == 'alice']
        with patch.object(crypto_keys, 'get_conn') as conn:
            response = self.client.post('/api/keys/v2/devices/register', json={'bundles': bundles}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(conn.called)
        bundles[0]['secretKey'] = 'never-upload-this'
        self.assertEqual(self.client.post('/api/keys/v2/devices/register', json={'bundles': bundles}, headers=self.headers).status_code, 422)
        bob_bundles = [b for b in self.fixtures['bundles'] if b['user_id'] == 'bob']
        self.assertEqual(self.client.post('/api/keys/v2/devices/register', json={'bundles': bob_bundles}, headers=self.headers).status_code, 403)

    def test_edit_replaces_whole_envelope_and_removes_plaintext(self):
        response = self.client.patch('/api/chat/messages/edit', json={'messageId': 'db-message', 'payload': self.envelope}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        sql, params = self.writes[-1]
        self.assertIn('UPDATE messages', sql)
        persisted = params[1]
        self.assertNotIn('text', persisted)
        self.assertEqual(persisted['key_wraps'], self.envelope['key_wraps'])
        self.assertEqual(persisted['signature_b64'], self.envelope['signature_b64'])
        self.assertEqual(persisted['starredBy'], ['alice'])

    def test_edit_rejects_plaintext_or_another_sender(self):
        body = {'messageId': 'db-message', 'payload': self.envelope, 'text': 'leak'}
        self.assertEqual(self.client.patch('/api/chat/messages/edit', json=body, headers=self.headers).status_code, 400)
        self.row['sender_id'] = 'bob'
        self.assertEqual(self.client.patch('/api/chat/messages/edit', json=body, headers=self.headers).status_code, 403)

    def test_duplicate_send_and_edited_identifier_replay_rejected(self):
        self.assertEqual(self.send().status_code, 200)
        self.assertEqual(self.send().status_code, 409)
        self.assertEqual(self.client.patch('/api/chat/messages/edit', json={'messageId': 'db-message', 'payload': self.envelope}, headers=self.headers).status_code, 409)

    def test_history_participant_authorization(self):
        self.assertEqual(self.client.get('/api/chat/messages?threadType=direct&threadId=alice_bob&uid=bob', headers=self.headers).status_code, 403)
        mallory = JwtService(SECRET).issue_access_token(user_id='mallory', device_id='x')
        self.assertEqual(self.client.get('/api/chat/messages?threadType=direct&threadId=alice_bob&uid=mallory', headers={'Authorization': f'Bearer {mallory}'}).status_code, 403)

    def test_retired_secret_endpoints_are_inaccessible(self):
        self.assertEqual(self.client.post('/api/keys/sessions/upsert', json={'rootKeyB64': 'secret'}).status_code, 410)
        self.assertEqual(self.client.get('/api/keys/sessions/thread/alice/bob').status_code, 410)

if __name__ == '__main__':
    unittest.main()
