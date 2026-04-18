# Chat Save & Resume Feature Design

**Date:** 2026-03-26
**Status:** Approved
**Author:** Claude (with Adam)

## Overview

Enable users to save chat conversations and resume them later. Chat history is accessible from the Collections page, where users can see their chat history per book and click "Resume Chat" to continue where they left off.

## Goals

1. Auto-save chat messages so conversations persist across sessions
2. Allow users to resume chats from the Collections page
3. Maintain existing chat UX — saved messages appear the same as new ones
4. No additional MC charges when loading history

## Non-Goals (Future Features)

- Multiple discrete sessions per book (single session per book for now)
- Chat history search
- Export chat history
- Summarization of old messages for AI context

## Design Decisions

### Session Model
- **One session per book per user** (keep existing `UNIQUE(user_id, book_id)` constraint)
- Multiple sessions per book may be added later as a separate feature

### History Loading
- **Load last 30 messages** when resuming from Collections
- Library page starts with empty UI (current behavior) but still saves messages
- All messages accumulate in the same session regardless of entry point

### Message Persistence
- **Hybrid save approach:**
  - User messages saved when sent
  - Assistant messages saved when stream completes
- Aligns with credit deduction flow (credits deducted after assistant response)

### Collections Page UI
- **Chat row above summaries** within each book section
- Shows: message count, last message date, "Resume Chat" button, delete button
- Only displayed for books with existing chat history
- Books with chat-only (no summaries) now appear in Collections

### Credits
- **Loading history is free** — read-only database query
- **New messages cost 10 MC** — unchanged from current behavior

## Database Schema

### New Table: `chat_messages`

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient "last N messages" queries
CREATE INDEX idx_chat_messages_session_created
  ON chat_messages(chat_session_id, created_at DESC);

-- RLS: Users can only access messages from their own sessions
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT
  USING (
    chat_session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    chat_session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );
```

### Existing Table: `chat_sessions`
No schema changes. Already has `message_count`, `last_message_at`, `total_credits_spent`.

## API Routes

### New Routes

| Route | Method | Purpose | MC Cost |
|-------|--------|---------|---------|
| `/api/v1/chat-history?bookId=<uuid>` | GET | Load last 30 messages for resume | Free |
| `/api/v1/chat-sessions` | GET | List all user's chat sessions (for Collections) | Free |
| `/api/v1/chat-sessions/[id]` | DELETE | Delete session and all messages | Free |

### Modified Routes

| Route | Method | Change |
|-------|--------|--------|
| `/api/v1/book-chat` | POST | Save user + assistant messages after successful exchange |
| `/api/v1/book-chat-socratic` | POST | Save user + assistant messages after successful exchange |

### Route Details

**GET `/api/v1/chat-history`**
```
Query: ?bookId=<uuid>
Response: {
  messages: [{ id, role, content, created_at }],
  session: { id, message_count, last_message_at }
}
```
- Returns last 30 messages ordered oldest→newest for display
- Returns empty array if no session exists

**GET `/api/v1/chat-sessions`**
```
Response: [{
  id, book_id, message_count, last_message_at, total_credits_spent,
  book: { id, title, author, cover_image_url }
}]
```
- Only returns sessions with at least 1 message
- Ordered by `last_message_at` descending

**DELETE `/api/v1/chat-sessions/[id]`**
```
Response: { success: true }
```
- Verifies user owns the session
- Messages deleted automatically via CASCADE

## Frontend Components

### ChatWithBook.tsx

**New prop:**
```typescript
interface ChatWithBookProps {
  book: Book
  isOpen: boolean
  onClose: () => void
  loadHistory?: boolean  // true when resuming from Collections
}
```

**Behavior:**
- `loadHistory=false` (Library): Start with empty messages array
- `loadHistory=true` (Collections): Fetch and display last 30 messages on open

**History loading:**
```typescript
useEffect(() => {
  if (isOpen && loadHistory && book.id) {
    fetchChatHistory(book.id).then(data => {
      setMessages(data.messages)
    })
  }
}, [isOpen, loadHistory, book.id])
```

### Collections Page (`app/dashboard/summaries/page.tsx`)

**Changes:**
1. Fetch chat sessions alongside summaries (parallel API calls)
2. Merge book lists — a book appears if it has summaries OR chat history (or both)
3. Group all content by book (same layout as today)
4. Within each book section:
   - Show chat row above summaries table (if chat history exists)
   - Show summaries table (if summaries exist)
   - Both can appear together for the same book

### New Component: ChatHistoryRow

```typescript
interface ChatHistoryRowProps {
  session: ChatSession & { book: Book }
  onResume: () => void
  onDelete: () => void
}
```

**UI (per approved mockup):**
- Blue-highlighted row with chat icon
- "Chat History" label
- Message count + last message date
- "Resume Chat" button (opens ChatWithBook with `loadHistory={true}`)
- Delete button (trash icon)

## User Flows

### Flow 1: Chat from Library (New or Continuing)
1. User clicks "Chat" on a book in Library
2. Chat modal opens with empty UI
3. User sends messages, AI responds
4. Messages saved to DB after each exchange (user on send, assistant on complete)
5. User closes chat
6. Next time: same flow (empty UI, but messages keep accumulating)

### Flow 2: Resume from Collections
1. User navigates to Collections page
2. Sees chat row for books with history
3. Clicks "Resume Chat"
4. Chat modal opens, fetches last 30 messages
5. Messages displayed (look identical to new messages)
6. User continues conversation
7. New messages saved as usual

### Flow 3: Delete Chat History
1. User clicks delete button on chat row
2. Confirmation dialog appears
3. User confirms
4. API deletes session (messages cascade delete)
5. Chat row disappears from Collections

## Migration Plan

1. Create `chat_messages` table with indexes and RLS
2. No data migration needed (no existing messages to migrate)
3. Deploy API changes
4. Deploy frontend changes

## Testing Considerations

- Verify history loads correctly (order, content)
- Verify no MC charged for history load
- Verify MC charged for new messages (unchanged)
- Verify delete cascades properly
- Verify Library vs Collections entry points behave correctly
- Verify chat row only shows for books with history
- Verify books with chat-only appear in Collections
