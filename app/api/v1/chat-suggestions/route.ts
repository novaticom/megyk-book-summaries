import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateChatSuggestions } from '@/lib/services/chat';
import { getLocale } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookId = typeof body?.book_id === 'string' ? body.book_id : null;

    if (!bookId) {
      return NextResponse.json({ error: 'Missing book_id' }, { status: 400 });
    }

    const locale = await getLocale();
    const supabase = createAdminClient();

    // Check for cached suggestions
    const { data: cached } = await supabase
      .from('chat_suggestions')
      .select('suggestion')
      .eq('book_id', bookId)
      .eq('locale', locale)

    if (cached && cached.length > 0) {
      const questions = cached.map((row: { suggestion: string }) => row.suggestion)
      return NextResponse.json({ questions });
    }

    // Load book details for prompt
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('title, summary, description')
      .eq('id', bookId)
      .single()

    if (bookError || !book) {
      return NextResponse.json(
        { error: 'Book not found' },
        { status: 404 }
      );
    }

    const bookSummary = book.summary || book.description || ''

    // Generate suggestions via OpenAI
    const questions = await generateChatSuggestions(book.title, bookSummary, locale)

    if (questions.length === 0) {
      return NextResponse.json({ questions: [] });
    }

    // Persist suggestions for future requests
    const rows = questions.map((suggestion) => ({
      suggestion,
      book_id: bookId,
      locale,
    }))

    const { error: insertError } = await supabase
      .from('chat_suggestions')
      .insert(rows)

    if (insertError) {
      console.error('[chat-suggestions] Failed to cache suggestions:', insertError)
      // Still return the questions even if caching fails
    }

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('[chat-suggestions] Error:', error);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      { error: isTimeout ? 'Chat suggestions request timed out' : 'Internal server error' },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
