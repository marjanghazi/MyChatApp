CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  phone_lookup_keys TEXT[] DEFAULT '{}',
  contacts TEXT[] DEFAULT '{}',
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMPTZ,
  active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  member_ids TEXT[] DEFAULT '{}',
  admins TEXT[] DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id TEXT NOT NULL,
  follower_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_post TEXT DEFAULT '',
  last_post_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  participants TEXT[] NOT NULL,
  participant_phones TEXT[] DEFAULT '{}',
  last_message TEXT DEFAULT '',
  last_message_type TEXT,
  last_message_sender TEXT,
  last_message_status TEXT,
  last_message_at TIMESTAMPTZ,
  typing JSONB DEFAULT '{}'::jsonb,
  unread_by JSONB DEFAULT '{}'::jsonb,
  cleared_at_by JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_type TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  sender_id TEXT,
  receiver_id TEXT,
  sender_name TEXT,
  body JSONB NOT NULL,
  delivered_to TEXT[] DEFAULT '{}',
  read_by TEXT[] DEFAULT '{}',
  deleted_for TEXT[] DEFAULT '{}',
  deleted_for_everyone BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT NOT NULL,
  type TEXT,
  sender TEXT,
  receiver TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_devices (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kex_algorithm TEXT NOT NULL DEFAULT 'x25519',
  identity_public_key_b64 TEXT NOT NULL,
  signed_prekey_public_key_b64 TEXT NOT NULL,
  signed_prekey_signature_b64 TEXT NOT NULL,
  identity_sign_public_key_b64 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS one_time_prekeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  prekey_id TEXT NOT NULL,
  prekey_public_key_b64 TEXT NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, prekey_id)
);


CREATE TABLE IF NOT EXISTS e2ee_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  peer_user_id TEXT NOT NULL,
  root_key_b64 TEXT NOT NULL,
  send_chain_key_b64 TEXT NOT NULL,
  recv_chain_key_b64 TEXT NOT NULL,
  send_counter BIGINT DEFAULT 0,
  recv_counter BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(thread_id, user_id, peer_user_id)
);


CREATE TABLE IF NOT EXISTS e2ee_replay_index (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  msg_counter BIGINT NOT NULL,
  consumed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(thread_id, recipient_user_id, sender_user_id, msg_counter)
);

-- Protocol v2 stores public material only. The retired v1 tables are not used.
CREATE TABLE IF NOT EXISTS crypto_public_identities (
  user_id TEXT NOT NULL REFERENCES users(uid),
  suite_id TEXT NOT NULL CHECK (suite_id IN ('classical', 'pqc')),
  device_id TEXT NOT NULL,
  bundle JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, suite_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_crypto_message_id
ON messages ((body->>'message_id')) WHERE body->>'protocol_version' = '2.0';

-- Retain identifiers even when messages are edited or deleted.
CREATE TABLE IF NOT EXISTS crypto_message_receipts (
  message_id UUID PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO crypto_message_receipts(message_id)
SELECT (body->>'message_id')::uuid FROM messages WHERE body->>'protocol_version' = '2.0'
ON CONFLICT DO NOTHING;
