-- Migration: Create chat_messages table for storing chat history
-- This table stores individual messages linked to chat sessions

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient "last N messages" queries (ordered by created_at DESC)
CREATE INDEX idx_chat_messages_session_created
  ON chat_messages(chat_session_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view messages from their own chat sessions
CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT
  USING (
    chat_session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can only insert messages into their own chat sessions
CREATE POLICY "Users can insert own chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    chat_session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete messages from their own chat sessions
CREATE POLICY "Users can delete own chat messages"
  ON chat_messages FOR DELETE
  USING (
    chat_session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );
