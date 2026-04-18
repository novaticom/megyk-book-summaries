# Chat Save & Resume Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to save chat conversations and resume them from the Collections page.

**Architecture:** Add `chat_messages` table to persist messages. Modify chat API routes to save messages after each exchange. Add API routes for history retrieval and session listing. Update Collections page to show chat history rows with resume functionality.

**Tech Stack:** Next.js 15, Supabase (Postgres), TypeScript, Mantine UI

---

## File Structure

### New Files
- `supabase/migrations/017_create_chat_messages.sql` — Database migration for chat_messages table
- `app/api/v1/chat-history/route.ts` — GET endpoint to load chat messages for resume
- `app/api/v1/chat-sessions/route.ts` — GET endpoint to list all user's chat sessions
- `app/api/v1/chat-sessions/[id]/route.ts` — DELETE endpoint to delete a chat session
- `lib/types/chat.ts` — TypeScript types for chat messages and sessions
- `components/chat/ChatHistoryRow.tsx` — Chat row component for Collections page

### Modified Files
- `app/api/v1/book-chat/route.ts` — Add message persistence after successful exchange
- `app/api/v1/book-chat-socratic/route.ts` — Add message persistence after successful exchange
- `components/chat/ChatWithBook.tsx` — Add `loadHistory` prop and history loading logic
- `app/dashboard/summaries/page.tsx` — Fetch chat sessions and display ChatHistoryRow

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/017_create_chat_messages.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Run the migration**

```bash
source .env.local && psql "$DATABASE_URL" -f supabase/migrations/017_create_chat_messages.sql
```

Expected output: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY` (x3)

- [ ] **Step 3: Verify the table exists**

```bash
source .env.local && psql "$DATABASE_URL" -c "\d chat_messages"
```

Expected: Table schema showing `id`, `chat_session_id`, `role`, `content`, `created_at` columns

- [ ] **Step 4: Commit the migration**

```bash
git add supabase/migrations/017_create_chat_messages.sql
git commit -m "feat(db): add chat_messages table for chat persistence"
```

---

## Task 2: TypeScript Types for Chat

**Files:**
- Create: `lib/types/chat.ts`

- [ ] **Step 1: Create the chat types file**

```typescript
/**
 * Types for chat messages and sessions
 */

import { Book } from './books'

/**
 * Individual chat message stored in database
 */
export interface ChatMessage {
  id: string
  chat_session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/**
 * Chat session with book information (for Collections page)
 */
export interface ChatSessionWithBook {
  id: string
  user_id: string
  book_id: string
  message_count: number
  total_credits_spent: number
  last_message_at: string | null
  created_at: string
  updated_at: string
  book: Pick<Book, 'id' | 'title' | 'author' | 'cover_image_url'>
}

/**
 * Response from chat-history endpoint
 */
export interface ChatHistoryResponse {
  messages: ChatMessage[]
  session: {
    id: string
    message_count: number
    last_message_at: string | null
  } | null
}

/**
 * Response from chat-sessions endpoint
 */
export interface ChatSessionsResponse {
  sessions: ChatSessionWithBook[]
}
```

- [ ] **Step 2: Commit the types**

```bash
git add lib/types/chat.ts
git commit -m "feat(types): add chat message and session types"
```

---

## Task 3: Chat History API Endpoint

**Files:**
- Create: `app/api/v1/chat-history/route.ts`

- [ ] **Step 1: Create the chat-history endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const HISTORY_LIMIT = 30

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get bookId from query params
    const url = new URL(request.url)
    const bookId = url.searchParams.get('bookId')

    if (!bookId) {
      return NextResponse.json(
        { error: 'bookId query parameter is required' },
        { status: 400 }
      )
    }

    // Get the chat session for this user and book
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, message_count, last_message_at')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .single()

    // No session exists - return empty
    if (sessionError?.code === 'PGRST116') {
      return NextResponse.json({
        messages: [],
        session: null,
      })
    }

    if (sessionError) {
      console.error('Error fetching chat session:', sessionError)
      return NextResponse.json(
        { error: 'Failed to fetch chat session' },
        { status: 500 }
      )
    }

    // Fetch last N messages ordered oldest to newest for display
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('chat_session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (messagesError) {
      console.error('Error fetching chat messages:', messagesError)
      return NextResponse.json(
        { error: 'Failed to fetch chat messages' },
        { status: 500 }
      )
    }

    // Reverse to get oldest-to-newest order for display
    const orderedMessages = (messages || []).reverse()

    return NextResponse.json({
      messages: orderedMessages,
      session: {
        id: session.id,
        message_count: session.message_count,
        last_message_at: session.last_message_at,
      },
    })
  } catch (error) {
    console.error('Error in chat-history endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verify the endpoint compiles**

```bash
cd /var/www/html/book-summaries-megyk && yarn build 2>&1 | head -50
```

Expected: Build succeeds or shows unrelated warnings (not errors in chat-history route)

- [ ] **Step 3: Commit the endpoint**

```bash
git add app/api/v1/chat-history/route.ts
git commit -m "feat(api): add GET /api/v1/chat-history endpoint"
```

---

## Task 4: Chat Sessions List API Endpoint

**Files:**
- Create: `app/api/v1/chat-sessions/route.ts`

- [ ] **Step 1: Create the chat-sessions endpoint**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch all chat sessions with book data
    // Only return sessions that have at least 1 message
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        user_id,
        book_id,
        message_count,
        total_credits_spent,
        last_message_at,
        created_at,
        updated_at,
        book:books(id, title, author, cover_image_url)
      `)
      .eq('user_id', user.id)
      .gt('message_count', 0)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (error) {
      console.error('Error fetching chat sessions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch chat sessions' },
        { status: 500 }
      )
    }

    return NextResponse.json({ sessions: sessions || [] })
  } catch (error) {
    console.error('Error in chat-sessions endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit the endpoint**

```bash
git add app/api/v1/chat-sessions/route.ts
git commit -m "feat(api): add GET /api/v1/chat-sessions endpoint"
```

---

## Task 5: Delete Chat Session API Endpoint

**Files:**
- Create: `app/api/v1/chat-sessions/[id]/route.ts`

- [ ] **Step 1: Create the delete endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: sessionId } = await params

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Verify the session belongs to the user before deleting
    const { data: session, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !session) {
      return NextResponse.json(
        { error: 'Chat session not found' },
        { status: 404 }
      )
    }

    // Delete the session (messages will cascade delete)
    const { error: deleteError } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)

    if (deleteError) {
      console.error('Error deleting chat session:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete chat session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in delete chat session endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit the endpoint**

```bash
git add app/api/v1/chat-sessions/[id]/route.ts
git commit -m "feat(api): add DELETE /api/v1/chat-sessions/[id] endpoint"
```

---

## Task 6: Modify Book Chat API to Save Messages

**Files:**
- Modify: `app/api/v1/book-chat/route.ts`

- [ ] **Step 1: Add helper function to save messages**

Add this function at the top of the file, after the imports:

```typescript
/**
 * Save a chat message to the database
 */
async function saveChatMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chatSessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      chat_session_id: chatSessionId,
      role,
      content,
    })

  if (error) {
    console.error('Error saving chat message:', error)
    // Don't throw - message saving failure shouldn't break the chat
  }
}
```

- [ ] **Step 2: Capture the streamed response for saving**

The challenge: we need to save the full assistant response after streaming completes. We'll use a `TransformStream` to capture content while passing it through.

Replace the streaming response section (around lines 106-116) with:

```typescript
    // Stream the response from n8n to enable real-time updates
    // Also capture the full response to save to database
    if (webhookResponse.body) {
      let fullAssistantResponse = ''

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          // Pass chunk through to client
          controller.enqueue(chunk)

          // Decode and capture content for saving
          const text = new TextDecoder().decode(chunk)
          const lines = text.split('\n')

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            try {
              const data = JSON.parse(trimmed)
              // Handle n8n NDJSON format
              if (data?.type === 'item' && typeof data?.content === 'string') {
                fullAssistantResponse += data.content
              }
              // Handle SSE format
              else if (typeof data?.progress?.delta === 'string') {
                fullAssistantResponse += data.progress.delta
              }
            } catch {
              // Ignore parse errors
            }
          }
        },
        async flush() {
          // Stream complete - save messages to database
          if (chatSession?.id && fullAssistantResponse) {
            // Save user message
            await saveChatMessage(supabase, chatSession.id, 'user', message)
            // Save assistant response
            await saveChatMessage(supabase, chatSession.id, 'assistant', fullAssistantResponse)
          }
        }
      })

      const transformedStream = webhookResponse.body.pipeThrough(transformStream)

      return new Response(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }
```

- [ ] **Step 3: Verify the build**

```bash
cd /var/www/html/book-summaries-megyk && yarn build 2>&1 | head -50
```

Expected: Build succeeds

- [ ] **Step 4: Commit the changes**

```bash
git add app/api/v1/book-chat/route.ts
git commit -m "feat(api): save chat messages to database in book-chat endpoint"
```

---

## Task 7: Modify Book Chat Socratic API to Save Messages

**Files:**
- Modify: `app/api/v1/book-chat-socratic/route.ts`

- [ ] **Step 1: Add helper function to save messages**

Add this function at the top of the file, after the imports (same as Task 6):

```typescript
/**
 * Save a chat message to the database
 */
async function saveChatMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chatSessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      chat_session_id: chatSessionId,
      role,
      content,
    })

  if (error) {
    console.error('Error saving chat message:', error)
    // Don't throw - message saving failure shouldn't break the chat
  }
}
```

- [ ] **Step 2: Replace the streaming response section**

Replace lines 108-117 (the streaming response section) with:

```typescript
    // Stream the response from n8n
    // Also capture the full response to save to database
    if (webhookResponse.body) {
      let fullAssistantResponse = ''

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          // Pass chunk through to client
          controller.enqueue(chunk)

          // Decode and capture content for saving
          const text = new TextDecoder().decode(chunk)
          const lines = text.split('\n')

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            try {
              const data = JSON.parse(trimmed)
              // Handle n8n NDJSON format
              if (data?.type === 'item' && typeof data?.content === 'string') {
                fullAssistantResponse += data.content
              }
              // Handle SSE format
              else if (typeof data?.progress?.delta === 'string') {
                fullAssistantResponse += data.progress.delta
              }
            } catch {
              // Ignore parse errors
            }
          }
        },
        async flush() {
          // Stream complete - save messages to database
          if (chatSession?.id && fullAssistantResponse) {
            // Save user message
            await saveChatMessage(supabase, chatSession.id, 'user', message)
            // Save assistant response
            await saveChatMessage(supabase, chatSession.id, 'assistant', fullAssistantResponse)
          }
        }
      })

      const transformedStream = webhookResponse.body.pipeThrough(transformStream)

      return new Response(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }
```

- [ ] **Step 3: Verify the build**

```bash
cd /var/www/html/book-summaries-megyk && yarn build 2>&1 | head -50
```

Expected: Build succeeds

- [ ] **Step 4: Commit the changes**

```bash
git add app/api/v1/book-chat-socratic/route.ts
git commit -m "feat(api): save chat messages to database in book-chat-socratic endpoint"
```

---

## Task 8: Create ChatHistoryRow Component

**Files:**
- Create: `components/chat/ChatHistoryRow.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { Button, Group, Text, Box, Badge } from '@mantine/core'
import { IconMessage, IconTrash } from '@tabler/icons-react'
import { ChatSessionWithBook } from '@/lib/types/chat'

interface ChatHistoryRowProps {
  session: ChatSessionWithBook
  onResume: () => void
  onDelete: () => void
  isDeleting?: boolean
}

export function ChatHistoryRow({
  session,
  onResume,
  onDelete,
  isDeleting = false
}: ChatHistoryRowProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No messages yet'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Box
      style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '12px',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <IconMessage size={20} style={{ color: '#60a5fa', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <Text fw={500} c="white" size="sm">
              Chat History
            </Text>
            <Group gap="xs">
              <Text size="xs" c="gray.4">
                {session.message_count} {session.message_count === 1 ? 'message' : 'messages'}
              </Text>
              <Text size="xs" c="gray.5">•</Text>
              <Text size="xs" c="gray.4">
                Last: {formatDate(session.last_message_at)}
              </Text>
            </Group>
          </div>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="filled"
            color="blue"
            onClick={onResume}
          >
            Resume Chat
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            onClick={onDelete}
            loading={isDeleting}
            disabled={isDeleting}
            style={{ color: '#9ca3af' }}
          >
            <IconTrash size={14} />
          </Button>
        </Group>
      </Group>
    </Box>
  )
}
```

- [ ] **Step 2: Commit the component**

```bash
git add components/chat/ChatHistoryRow.tsx
git commit -m "feat(ui): add ChatHistoryRow component for Collections page"
```

---

## Task 9: Update ChatWithBook to Support History Loading

**Files:**
- Modify: `components/chat/ChatWithBook.tsx`

- [ ] **Step 1: Add loadHistory prop to interface**

Find the `ChatWithBookProps` interface (around line 35) and update it:

```typescript
interface ChatWithBookProps {
  opened: boolean;
  onClose: () => void;
  book: Book | null;
  loadHistory?: boolean;  // NEW: true when resuming from Collections
}
```

- [ ] **Step 2: Add loadHistory to function signature**

Update the function signature (around line 94):

```typescript
export function ChatWithBook({ opened, onClose, book, loadHistory = false }: ChatWithBookProps) {
```

- [ ] **Step 3: Add state for history loading**

Add after the existing state declarations (around line 111):

```typescript
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
```

- [ ] **Step 4: Add history loading effect**

Add this effect after the existing `useEffect` that fetches credit balance (after line 157):

```typescript
  // Load chat history when resuming from Collections
  useEffect(() => {
    if (!opened || !loadHistory || !bookId) return;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const response = await fetch(`/api/v1/chat-history?bookId=${bookId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Convert API messages to ChatMessage format
            const loadedMessages: ChatMessage[] = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
            }));
            setMessages(loadedMessages);
          }
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [opened, loadHistory, bookId]);
```

- [ ] **Step 5: Show loading state in the chat UI**

In the ScrollArea section, after the suggestions block and before the "no messages" text (around line 547), add a loading indicator:

```typescript
          {isLoadingHistory && (
            <Box py="md">
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  Loading chat history...
                </Text>
              </Group>
            </Box>
          )}
```

And update the empty state condition to not show when loading:

```typescript
          {messages.length === 0 && !isSending && !isLoadingHistory && (
```

- [ ] **Step 6: Verify the build**

```bash
cd /var/www/html/book-summaries-megyk && yarn build 2>&1 | head -50
```

Expected: Build succeeds

- [ ] **Step 7: Commit the changes**

```bash
git add components/chat/ChatWithBook.tsx
git commit -m "feat(ui): add loadHistory prop to ChatWithBook for resume functionality"
```

---

## Task 10: Update Collections Page to Show Chat History

**Files:**
- Modify: `app/dashboard/summaries/page.tsx`

- [ ] **Step 1: Add imports**

Add these imports at the top of the file:

```typescript
import { ChatSessionWithBook } from '@/lib/types/chat'
import { ChatHistoryRow } from '@/components/chat/ChatHistoryRow'
import { ChatWithBook } from '@/components/chat/ChatWithBook'
```

- [ ] **Step 2: Add state for chat sessions and chat modal**

After the existing state declarations (around line 34), add:

```typescript
  const [chatSessions, setChatSessions] = useState<ChatSessionWithBook[]>([])
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  const [chatBook, setChatBook] = useState<any>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [loadChatHistory, setLoadChatHistory] = useState(false)
```

- [ ] **Step 3: Add function to fetch chat sessions**

After the `fetchSummaries` function, add:

```typescript
  const fetchChatSessions = async () => {
    try {
      const response = await fetch('/api/v1/chat-sessions')
      if (response.ok) {
        const data = await response.json()
        setChatSessions(data.sessions || [])
      }
    } catch (err) {
      console.error('Error fetching chat sessions:', err)
    }
  }
```

- [ ] **Step 4: Update useEffect to fetch both**

Update the existing useEffect (around line 36-38):

```typescript
  useEffect(() => {
    fetchSummaries()
    fetchChatSessions()
  }, [])
```

- [ ] **Step 5: Add handlers for chat resume and delete**

After the `getLengthLabel` function (around line 144), add:

```typescript
  const handleResumeChat = (session: ChatSessionWithBook) => {
    setChatBook(session.book)
    setLoadChatHistory(true)
    setChatOpen(true)
  }

  const handleDeleteChat = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this chat history? This action cannot be undone.')) {
      return
    }

    setDeletingChatId(sessionId)

    try {
      const response = await fetch(`/api/v1/chat-sessions/${sessionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete chat session')
      }

      // Remove from local state
      setChatSessions(chatSessions.filter(s => s.id !== sessionId))
    } catch (err) {
      console.error('Error deleting chat session:', err)
      alert('Failed to delete chat history. Please try again.')
    } finally {
      setDeletingChatId(null)
    }
  }

  const handleChatClose = () => {
    setChatOpen(false)
    setChatBook(null)
    setLoadChatHistory(false)
    // Refresh chat sessions in case new messages were sent
    fetchChatSessions()
  }
```

- [ ] **Step 6: Update grouping logic to include chat-only books**

Replace the grouping logic (around lines 157-169) with:

```typescript
  // Group summaries by book
  const summariesByBook = summaries.reduce((acc, summary) => {
    const bookId = summary.book_id
    if (!acc[bookId]) {
      acc[bookId] = {
        book: summary.book,
        summaries: []
      }
    }
    acc[bookId].summaries.push(summary)
    return acc
  }, {} as Record<string, { book: any, summaries: SummaryWithBook[] }>)

  // Create chat sessions lookup by book_id
  const chatSessionsByBook = chatSessions.reduce((acc, session) => {
    acc[session.book_id] = session
    return acc
  }, {} as Record<string, ChatSessionWithBook>)

  // Merge: include books that have summaries OR chat history
  const allBookIds = new Set([
    ...Object.keys(summariesByBook),
    ...Object.keys(chatSessionsByBook),
  ])

  const books = Array.from(allBookIds).map(bookId => ({
    bookId,
    book: summariesByBook[bookId]?.book || chatSessionsByBook[bookId]?.book,
    summaries: summariesByBook[bookId]?.summaries || [],
    chatSession: chatSessionsByBook[bookId] || null,
  }))

  // Sort by most recent activity (chat or summary)
  books.sort((a, b) => {
    const aDate = Math.max(
      a.chatSession?.last_message_at ? new Date(a.chatSession.last_message_at).getTime() : 0,
      a.summaries[0]?.updated_at ? new Date(a.summaries[0].updated_at).getTime() : 0
    )
    const bDate = Math.max(
      b.chatSession?.last_message_at ? new Date(b.chatSession.last_message_at).getTime() : 0,
      b.summaries[0]?.updated_at ? new Date(b.summaries[0].updated_at).getTime() : 0
    )
    return bDate - aDate
  })
```

- [ ] **Step 7: Update empty state condition**

Update the empty state condition (around line 201) to check both:

```typescript
        ) : summaries.length === 0 && chatSessions.length === 0 ? (
```

- [ ] **Step 8: Add ChatHistoryRow to desktop view**

In the desktop view section, inside each book card, after the book header div and before the Table.ScrollContainer, add the chat row. Find the closing `</div>` of the book header (around line 324) and add after it:

```typescript
                    {/* Chat History Row */}
                    {books.find(b => b.bookId === bookGroup.bookId)?.chatSession && (
                      <div style={{ padding: '0 20px' }}>
                        <ChatHistoryRow
                          session={books.find(b => b.bookId === bookGroup.bookId)!.chatSession!}
                          onResume={() => handleResumeChat(books.find(b => b.bookId === bookGroup.bookId)!.chatSession!)}
                          onDelete={() => handleDeleteChat(books.find(b => b.bookId === bookGroup.bookId)!.chatSession!.id)}
                          isDeleting={deletingChatId === books.find(b => b.bookId === bookGroup.bookId)!.chatSession!.id}
                        />
                      </div>
                    )}
```

Note: The mapping needs to be updated to use the new `books` structure. The iteration should change from `{books.map((bookGroup, idx) =>` to use the new merged structure.

- [ ] **Step 9: Update the iteration to use new books structure**

Replace the desktop view iteration to use the new structure. The book group now has `bookId`, `book`, `summaries`, and `chatSession` properties.

- [ ] **Step 10: Add ChatHistoryRow to mobile view similarly**

Apply the same pattern to the mobile view section.

- [ ] **Step 11: Add the ChatWithBook modal at the end of the component**

Just before the closing `</Container>` tag, add:

```typescript
      <ChatWithBook
        opened={chatOpen}
        onClose={handleChatClose}
        book={chatBook}
        loadHistory={loadChatHistory}
      />
```

- [ ] **Step 12: Verify the build**

```bash
cd /var/www/html/book-summaries-megyk && yarn build 2>&1 | head -50
```

Expected: Build succeeds

- [ ] **Step 13: Commit the changes**

```bash
git add app/dashboard/summaries/page.tsx
git commit -m "feat(ui): integrate chat history into Collections page"
```

---

## Task 11: Manual Testing

- [ ] **Step 1: Start the dev server**

```bash
cd /var/www/html/book-summaries-megyk && yarn dev
```

- [ ] **Step 2: Test chat from Library (messages should save)**

1. Go to Library page
2. Open chat with any book
3. Send a message
4. Verify response streams correctly
5. Close the chat

- [ ] **Step 3: Verify messages saved in database**

```bash
source .env.local && psql "$DATABASE_URL" -c "SELECT id, role, LEFT(content, 50) as content_preview, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 5;"
```

Expected: Should see the messages you just sent

- [ ] **Step 4: Test resume from Collections**

1. Go to Collections page
2. Verify chat row appears for the book you chatted with
3. Click "Resume Chat"
4. Verify history loads (last 30 messages)
5. Send a new message
6. Verify it works and is added to history

- [ ] **Step 5: Test delete chat**

1. On Collections page, click delete button on a chat row
2. Confirm deletion
3. Verify chat row disappears
4. Verify database messages are deleted:

```bash
source .env.local && psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM chat_messages;"
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: verify chat save and resume feature works end-to-end"
```

---

## Summary

This plan implements chat persistence in 11 tasks:

1. **Database migration** - Create `chat_messages` table
2. **TypeScript types** - Define interfaces for chat data
3. **Chat history API** - GET endpoint to load messages
4. **Chat sessions API** - GET endpoint to list sessions
5. **Delete session API** - DELETE endpoint for cleanup
6. **Book chat save** - Modify POST to persist messages
7. **Socratic chat save** - Modify POST to persist messages
8. **ChatHistoryRow** - UI component for Collections
9. **ChatWithBook update** - Add `loadHistory` prop
10. **Collections page** - Integrate chat rows
11. **Manual testing** - Verify end-to-end functionality
