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
