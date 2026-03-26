-- Migration: Add trigger to update chat_sessions when messages are inserted
-- This keeps message_count and last_message_at in sync automatically

-- Function to update chat_sessions metadata when a message is inserted
CREATE OR REPLACE FUNCTION update_chat_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions
  SET
    message_count = message_count + 1,
    last_message_at = NEW.created_at,
    updated_at = NOW()
  WHERE id = NEW.chat_session_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger that fires after each message insert
CREATE TRIGGER trigger_update_chat_session_on_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_on_message();

-- Also create a trigger for message deletion (to decrement count)
CREATE OR REPLACE FUNCTION update_chat_session_on_message_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions
  SET
    message_count = GREATEST(message_count - 1, 0),
    updated_at = NOW()
  WHERE id = OLD.chat_session_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_session_on_message_delete
  AFTER DELETE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_session_on_message_delete();
