"""Opt-in integration against a disposable database, never the application's database."""
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import db
from app.routes import chat, crypto_keys
from app.security.jwt_service import JwtService


@unittest.skipUnless(os.getenv('PQC_TEST_DATABASE_URL'), 'Set PQC_TEST_DATABASE_URL to a disposable quantx_crypto_test database')
class PostgresIntegrationTests(unittest.TestCase):
    def test_migration_registry_send_edit_history_and_replay(self):
        secret = 'integration-test-only-secret-at-least-32-bytes'
        with patch.dict(os.environ, {'DATABASE_URL': os.environ['PQC_TEST_DATABASE_URL'], 'JWT_SECRET': secret}):
            # Require an explicitly named test DB before any schema/data writes.
            with db.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute('SELECT current_database()')
                    self.assertEqual(cur.fetchone()[0], 'quantx_crypto_test')
            db.init_db()
            db.init_db()  # Schema upgrades are idempotent.
            for user in ['alice', 'bob']:
                db.q('INSERT INTO users(uid,email,password_hash) VALUES (%s,%s,%s) ON CONFLICT(uid) DO NOTHING', (user, user + '@test.invalid', 'unused-test-hash'))
            root = Path(__file__).resolve().parents[2]
            fixture = json.loads(subprocess.check_output(['node', str(root / 'frontend/tests/crypto/exportFixtures.mjs')], text=True))
            app = FastAPI()
            app.include_router(crypto_keys.router)
            app.include_router(chat.router)
            def headers(user):
                return {'Authorization': 'Bearer ' + JwtService(secret).issue_access_token(user_id=user, device_id='login')}
            with TestClient(app) as client:
                for user in ['alice', 'bob']:
                    bundles = [b for b in fixture['bundles'] if b['user_id'] == user]
                    response = client.post('/api/keys/v2/devices/register', headers=headers(user), json={'bundles': bundles})
                    self.assertEqual(response.status_code, 200, response.text)
                envelope = fixture['envelopes']['pqc']
                body = {'threadType': 'direct', 'threadId': 'alice_bob', 'actorUid': 'alice', 'targetUid': 'bob', 'payload': envelope}
                response = client.post('/api/chat/messages/send', headers=headers('alice'), json=body)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(client.post('/api/chat/messages/send', headers=headers('alice'), json=body).status_code, 409)
                history = client.get('/api/chat/messages?threadType=direct&threadId=alice_bob&uid=bob', headers=headers('bob'))
                self.assertEqual(history.status_code, 200, history.text)
                row = next(m for m in history.json()['messages'] if m.get('message_id') == envelope['message_id'])
                self.assertNotIn('text', row)
                self.assertEqual(row['ciphertext_b64'], envelope['ciphertext_b64'])
                updated = fixture['envelopes']['classical']
                response = client.patch('/api/chat/messages/edit', headers=headers('alice'), json={'messageId': row['id'], 'payload': updated})
                self.assertEqual(response.status_code, 200, response.text)
                saved = db.q('SELECT body FROM messages WHERE id=%s', (row['id'],), fetch='one')['body']
                self.assertEqual(saved, updated)
                self.assertEqual(client.post('/api/chat/messages/send', headers=headers('alice'), json=body).status_code, 409, 'An edited-away identifier must still be rejected')
                self.assertEqual(db.q('SELECT count(*) AS n FROM crypto_public_identities', fetch='one')['n'], 4)
            db._POOL.closeall()
            db._POOL = None
