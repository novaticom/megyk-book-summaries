import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCreditService } from '@/lib/services/credits';
import { createReferralService } from '@/lib/services/referrals';
import { streamChatResponse } from '@/lib/services/chat';
import { getLocale } from 'next-intl/server';

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
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { book_id: bookId, message, request_id: requestId } = body || {};
    const creditIdempotencyKey = typeof requestId === 'string' && requestId.trim()
      ? `chat:${requestId.trim()}`
      : `chat:${crypto.randomUUID()}`;

    console.log('[book-chat] Request received', {
      bookId,
      userId: user.id,
      requestId: creditIdempotencyKey,
      messageLength: message?.length,
    });

    if (!bookId || !message) {
      return NextResponse.json(
        { error: 'Book ID and message are required' },
        { status: 400 }
      );
    }

    // Check credit balance
    const creditService = createCreditService(supabase);
    const creditCheck = await creditService.checkChatAffordability(user.id);

    if (!creditCheck.has_sufficient_credits) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          required_credits: creditCheck.required_credits,
          current_balance: creditCheck.current_balance,
          remaining_messages: 0,
        },
        { status: 402 }
      );
    }

    // Get or create chat session
    const chatSession = await creditService.getOrCreateChatSession(user.id, bookId);
    const locale = await getLocale();

    // Generate streaming response natively
    const chatStream = await streamChatResponse({
      bookId,
      userMessage: message,
      chatSessionId: chatSession?.id || null,
      locale,
      mode: 'standard',
      supabase,
    });

    // Deduct credits after stream starts successfully
    const creditTransaction = await creditService.deductForChat(
      user.id,
      bookId,
      chatSession?.id,
      creditIdempotencyKey
    );

    if (!creditTransaction) {
      console.error('[book-chat] Failed to deduct credits, but chat was processed');
    }

    // Activate referral if first action
    const referralService = createReferralService(supabase);
    referralService.activateReferral(user.id, 'chat').catch((error) => {
      console.error('Failed to activate referral:', error);
    });

    // Pipe through a transform to capture the full response for DB persistence
    let fullAssistantResponse = ''

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk)

        const text = new TextDecoder().decode(chunk)
        const lines = text.split('\n')

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const data = JSON.parse(trimmed)
            if (data?.type === 'item' && typeof data?.content === 'string') {
              fullAssistantResponse += data.content
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      async flush() {
        console.log('[book-chat] Stream complete', {
          sessionId: chatSession?.id,
          responseLength: fullAssistantResponse.length,
        })

        if (chatSession?.id && fullAssistantResponse) {
          await saveChatMessage(supabase, chatSession.id, 'user', message)
          await saveChatMessage(supabase, chatSession.id, 'assistant', fullAssistantResponse)
          console.log('[book-chat] Messages saved')
        }
      }
    })

    const transformedStream = chatStream.pipeThrough(transformStream)

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error in book chat:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
