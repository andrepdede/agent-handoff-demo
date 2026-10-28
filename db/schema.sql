-- Persistence for the demo (the running code keeps conversations in memory; this is the PostgreSQL target).
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,           -- phone number
  state       TEXT NOT NULL,
  is_customer BOOLEAN NOT NULL DEFAULT FALSE,
  lead        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender          TEXT NOT NULL,          -- contact | sales | legal | finance | support
  body            TEXT NOT NULL,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_trace (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  type            TEXT NOT NULL,          -- handoff | escalation | tool
  detail          TEXT NOT NULL,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, at);
