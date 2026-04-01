import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCreditService } from '@/lib/services/credits';
import { getChatMessageCreditCost } from '@/lib/types/credits';
import { createReferralService } from '@/lib/services/referrals';
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
    // Don't throw - message saving failure shouldn't break the chat
  }
}

const getWebhookUrl = () => {
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nWebhookUrl) return null;

  const normalized = n8nWebhookUrl.replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  const base = lastSlash === -1 ? `${normalized}/` : normalized.slice(0, lastSlash + 1);

  return `${base}book_chat_socratic`;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { book_id: bookId, message, socratic_exchange_count } = body || {};

    if (!bookId || !message) {
      return NextResponse.json(
        { error: 'Book ID and message are required' },
        { status: 400 }
      );
    }

    // Check credit balance before processing chat message
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

    // Get or create chat session for tracking
    const chatSession = await creditService.getOrCreateChatSession(user.id, bookId);

    const webhookUrl = getWebhookUrl();
    console.log('[Socratic Chat] Webhook URL:', webhookUrl);

    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N webhook URL not configured' },
        { status: 500 }
      );
    }

    const locale = await getLocale();

    const requestBody = {
      user_id: user.id,
      book_id: bookId,
      message,
      socratic_exchange_count: socratic_exchange_count ?? 1,
      locale,
    };
    console.log('[Socratic Chat] Request body:', JSON.stringify(requestBody));

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log('[Socratic Chat] Response status:', webhookResponse.status);

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('[Socratic Chat] Webhook error response:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch chat response', details: errorText, status: webhookResponse.status },
        { status: 502 }
      );
    }

    // Deduct credits after successful webhook call
    const creditTransaction = await creditService.deductForChat(
      user.id,
      bookId,
      chatSession?.id
    );

    if (!creditTransaction) {
      console.error('Failed to deduct credits for Socratic chat message, but message was processed');
    }

    // Activate referral if this is the user's first action
    const referralService = createReferralService(supabase);
    referralService.activateReferral(user.id, 'chat').catch((error) => {
      console.error('Failed to activate referral:', error);
    });

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
          console.log('[book-chat-socratic] Stream flush called', {
            hasSession: !!chatSession?.id,
            sessionId: chatSession?.id,
            bookId,
            responseLength: fullAssistantResponse.length,
            messagePreview: message.substring(0, 50)
          })

          if (chatSession?.id && fullAssistantResponse) {
            console.log('[book-chat-socratic] Saving messages to session:', chatSession.id)
            // Save user message
            await saveChatMessage(supabase, chatSession.id, 'user', message)
            // Save assistant response
            await saveChatMessage(supabase, chatSession.id, 'assistant', fullAssistantResponse)
            console.log('[book-chat-socratic] Messages saved successfully')
          } else {
            console.log('[book-chat-socratic] NOT saving messages:', {
              reason: !chatSession?.id ? 'no session' : 'empty response'
            })
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

    return NextResponse.json({
      reply: '',
      data: null,
    });
  } catch (error) {
    console.error('[Socratic Chat] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}
