import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const HISTORY_LIMIT = 30

/**
 * GET /api/v1/chat-history
 * Fetch chat message history for a specific book
 * Query params:
 *   - bookId: ID of the book (required)
 */
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
