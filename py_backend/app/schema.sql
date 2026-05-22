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
