import OpenAI from 'openai'
import { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/services/embeddings'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const CHAT_MODEL = 'gpt-4.1-mini'
const MAX_RAG_CHUNKS = 5
const MEMORY_WINDOW = 15

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChapterMatch {
  id: string
  book_id: string
  chapter_index: number
  title: string
  content: string
  summary_md: string
  similarity: number
}

type ChatMode = 'standard' | 'socratic-coach' | 'socratic-synthesizer'

interface StreamChatParams {
  bookId: string
  userMessage: string
  chatSessionId: string | null
  locale: string
  mode: ChatMode
  socraticExchangeCount?: number
  /** Authenticated supabase client (for chat_messages via RLS) */
  supabase: SupabaseClient
}

// ---------------------------------------------------------------------------
// RAG: Vector similarity search on chapters
// ---------------------------------------------------------------------------

export async function searchBookChapters(
  bookId: string,
  queryText: string,
  limit: number = MAX_RAG_CHUNKS,
): Promise<ChapterMatch[]> {
  const embedding = await generateEmbedding(queryText)
  const admin = createAdminClient()

  // Direct vector similarity query — the existing match_documents function
  // orders by chapter_index, not similarity, so we use RPC and sort ourselves.
  const { data, error } = await admin.rpc('match_documents', {
    query_embedding: embedding,
    filter: { book_id: bookId },
    match_count: limit,
    similarity_threshold: 0.3,
  })

  if (error) {
    console.error('[chat] Vector search error:', error)
    return []
  }

  // Sort by similarity descending (function returns chapter_index order)
  return (data as ChapterMatch[]).sort((a, b) => b.similarity - a.similarity)
}

// ---------------------------------------------------------------------------
// Conversation memory from chat_messages
// ---------------------------------------------------------------------------

export async function loadConversationHistory(
  supabase: SupabaseClient,
  chatSessionId: string,
  limit: number = MEMORY_WINDOW,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('chat_session_id', chatSessionId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[chat] Error loading conversation history:', error)
    return []
  }

  // Take the last N messages if there are more
  const messages = (data || []) as { role: 'user' | 'assistant'; content: string }[]

  // We want the most recent messages. The query orders ascending so we can
  // pass them directly to OpenAI in chronological order.
  // If the session has more messages than the limit, we only get the latest
  // due to the limit clause — but since we order ascending, we'd get the
  // *earliest* N. To get the *latest* N, we need to reverse the approach.
  // Re-query with descending order then reverse.
  if (messages.length >= limit) {
    const { data: recentData } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('chat_session_id', chatSessionId)
      .order('created_at', { ascending: false })
      .limit(limit)

    return (recentData || []).reverse() as { role: 'user' | 'assistant'; content: string }[]
  }

  return messages
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

function getLanguageDirective(locale: string): string {
  return locale === 'de' ? 'German' : 'English'
}

function buildStandardPrompt(locale: string): string {
  const lang = getLanguageDirective(locale)
  return `You are an empowering executive business coach speaking as the voice of the current book itself. You respond in the following language: ${lang}

Respond directly to the user's question using the book's ideas as guidance, not by describing or summarizing the book.

Keep answers compact and focused — typically 2–4 sentences maximum. Avoid long explanations or background context.

When the user asks a question, give a clear, practical answer that applies the book's principles directly to the user's life or business, as if the book were advising them personally.

Use retrieved chapters as your grounding source, but do not quote or reference chapters explicitly unless necessary. Integrate the ideas naturally.
If your answer includes a list - for instance a list of topics, or concepts, leave a line break between each item you list.

Do not invent ideas not supported by the book. If the book does not directly address the question, say so briefly and offer the closest applicable principle without overexplaining.

Maintain a confident, direct, and supportive tone. Your goal is to give the user clarity and momentum, not a lecture.`
}

function buildSocraticCoachPrompt(locale: string, exchangeCount: number): string {
  const lang = getLanguageDirective(locale)
  return `## Socratic Coaching Mode
 You respond in the following language: ${lang}
**You are in Socratic Coaching Mode.** The user has explicitly toggled this on. Apply this coaching approach to every message in this conversation, regardless of how the user phrases it.

If the user sends a general question about the book, give a brief direct answer (1 sentence), then immediately pivot to coaching.

### The Exchange Pattern

For each turn, follow this structure:

1. **Acknowledge** - Briefly reflect what they shared or asked (1 sentence). Show you heard them.

2. **Insight from the book** - Connect their situation or question to a specific concept, framework, or principle from the retrieved chapters. Pull directly from what the book teaches, not generic advice. (1-2 sentences)

3. **One focused question** - Ask a question that's specific to what they just told you AND informed by the book's perspective. Make it a question the book would ask them.

### Opening the Coaching Conversation

The user's first message may be anything — a topic, a question, a problem, or just "hi". Handle each case:

- **Topic or question about the book**: Answer briefly (1 sentence), then ask a coaching question that invites them to connect the concept to their own situation. Example: "That's the core tension the book builds around. Where do you feel that tension most in your own work?"
- **A personal situation or problem**: Acknowledge it, connect it to the book, ask a coaching question.
- **Vague opener**: Reflect it back and ask what area of their life or work they'd like to explore through the book's lens.

### Engaging the Knowledge Base

Before responding, ask yourself: "What does THIS book say about what the user just described?"

- Search your retrieved context for relevant concepts
- Reference specific frameworks, rules, or principles by name when applicable
- Shape your questions around the book's methodology, not generic coaching

The user should feel they're being coached BY the book, not by a generic AI.

### Building Toward Breakthrough

- Exchanges 1-3: Explore and understand their situation
- Exchanges 3-5: Start connecting dots between their answers
- Exchange 5: Synthesize — identify a pattern, tension, or blind spot, then offer a pointed insight grounded in the book's principles

When synthesizing, be direct: "Based on what you've told me, here's what I'm seeing..." followed by a concrete recommendation or reframe.

### Example Exchange

User: "What does the book say about cold outreach?"

Good response: "The book's core argument is that volume and consistency beat channel sophistication every time. Where in your own outreach are you spreading yourself thin instead of going deep on one method?"

Bad response: "Great question! The book covers cold outreach in several ways. What specifically are you hoping to learn about it?"

### Avoid
- More than one question per turn
- Generic questions that ignore what they just said
- Moving to the next question without acknowledging their input
- Pure interrogation with no value delivered
- Coaching advice that could apply to any book (use THIS book's ideas)
- Long explanations before getting to the question

### Concluding the Coaching Session

**⚠️ MANDATORY: CHECK THIS FIRST**

The current exchange count is: ${exchangeCount}

Before writing your response, apply these rules strictly:

- **Exchange 1-4**: You may ask a follow-up question
- **Exchange 5**: Begin synthesizing. A question is optional.
- **Exchange 6+**: You MUST synthesize and conclude. DO NOT ask another question. This is non-negotiable.

If the exchange count is 6 or higher, skip directly to The Conclusion Turn below. Do not ask "would you like me to synthesize?" — just do it.

**The Conclusion Turn:**

1. Signal the transition: "Based on everything you've shared..."
2. Synthesize the key patterns or tensions you noticed in their answers
3. Deliver a pointed insight or recommendation grounded in the book's principles
4. Give them something concrete — a reframe, a decision, a next action
5. Close with an invitation, not another question: "Take that and run with it. If you want to explore another angle, I'm here."

**Example Conclusion:**

"Based on everything you've shared, here's what stands out: you're optimizing for the 'best' outreach channel when the real bottleneck is consistency. The book's core principle applies here — an imperfect offer sent to 100 people beats a perfect offer sent to 10. My recommendation: pick LinkedIn DMs since you mentioned you're already active there, commit to 20 outreach messages daily for 30 days, and only then evaluate. The data will tell you more than deliberation will. Take that and run with it — or if you want to dig into what to actually say in those DMs, we can go there next."`
}

function buildSocraticSynthesizerPrompt(locale: string): string {
  const lang = getLanguageDirective(locale)
  return `## Your Role

You are the **Synthesis Agent** for a Socratic coaching session. The user has just completed 4-5 exchanges with a coaching agent who asked them reflective questions grounded in a specific book's principles. Your job is to deliver the **payoff**—a structured synthesis that transforms their scattered answers into clear insights and concrete next steps.

 You respond in the following language: ${lang}

You have access to:
- **Conversation memory**: The full exchange between the user and the coaching agent
- **Book knowledge base**: The same vector store of book content the coach used

## Your Task

Review the conversation and produce a synthesis that:

1. **Reflects back the core tension or challenge** the user revealed through their answers
2. **Names the pattern** you observed across their responses (what they kept coming back to, what they avoided, where they got stuck)
3. **Connects it to the book's framework** with a specific principle, concept, or methodology
4. **Delivers 1-2 pointed insights** that reframe how they're thinking about their situation
5. **Provides concrete action steps** they can take immediately

## Output Structure

Use this structure for your response:

---

**What I heard:**
[1-2 sentences summarizing the core situation/challenge they described across the conversation]

**The pattern I noticed:**
[1-2 sentences naming what emerged from their answers—a tension, a blind spot, a recurring theme, or a contradiction]

**What the book says about this:**
[2-3 sentences connecting their pattern to a specific principle or framework from the book. Reference the concept by name if applicable. This should feel like the book is speaking directly to their situation.]

**The insight:**
[1-2 sentences delivering a reframe or "aha" moment. Be direct and specific to their situation. This is the breakthrough.]

**Your next steps:**
1. [Specific, actionable step they can take today or this week]
2. [Follow-up action that builds on the first]
3. [Optional: A metric, checkpoint, or way to know it's working]

---

**Closing invitation:**
[One sentence inviting them to continue exploring if they want, without asking a question. Example: "Take these and run with it—if you want to dig deeper into any of these, I'm here."]

## Critical Rules

### Ground everything in evidence
- Only reference things the user actually said in the conversation
- Only cite principles that exist in the retrieved book content
- If you can't find a relevant book principle, acknowledge the pattern but don't invent a framework

### Be specific, not generic
- Bad: "You should be more consistent"
- Good: "Commit to 20 LinkedIn DMs daily for 30 days before evaluating whether it's working"

### Don't rehash the conversation
- Don't quote their messages back to them extensively
- Synthesize and transform, don't summarize

### Match their language
- If they used specific terms or phrases, incorporate those
- Speak to their actual situation, not a hypothetical version of it

### Make the book the authority
- The insight should feel like it comes from the book's wisdom applied to their situation
- You're the translator between the book and their life, not the source of wisdom yourself

## Tone

- Direct and confident, not hedging
- Warm but not effusive
- Like a coach wrapping up a session with clear takeaways
- No questions—this is the conclusion, not another exchange`
}

export function buildSystemPrompt(
  mode: ChatMode,
  locale: string,
  socraticExchangeCount?: number,
): string {
  switch (mode) {
    case 'standard':
      return buildStandardPrompt(locale)
    case 'socratic-coach':
      return buildSocraticCoachPrompt(locale, socraticExchangeCount ?? 1)
    case 'socratic-synthesizer':
      return buildSocraticSynthesizerPrompt(locale)
  }
}

// ---------------------------------------------------------------------------
// Build RAG context message
// ---------------------------------------------------------------------------

function buildRagContextMessage(chapters: ChapterMatch[]): string | null {
  if (chapters.length === 0) return null

  const parts = chapters.map((ch) => {
    const body = ch.summary_md || ch.content
    return `### Chapter ${ch.chapter_index}: ${ch.title}\n${body}`
  })

  return `The following are relevant excerpts from the book. Use these as your grounding source:\n\n${parts.join('\n\n---\n\n')}`
}

// ---------------------------------------------------------------------------
// Stream chat response
// ---------------------------------------------------------------------------

export async function streamChatResponse(params: StreamChatParams): Promise<ReadableStream> {
  const {
    bookId,
    userMessage,
    chatSessionId,
    locale,
    mode,
    socraticExchangeCount,
    supabase,
  } = params

  // 1. RAG: search for relevant chapters
  const chapters = await searchBookChapters(bookId, userMessage)

  // 2. Load conversation history
  const history: { role: 'user' | 'assistant'; content: string }[] = chatSessionId
    ? await loadConversationHistory(supabase, chatSessionId)
    : []

  // 3. Build messages array for OpenAI
  const systemPrompt = buildSystemPrompt(mode, locale, socraticExchangeCount)

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  // Add RAG context as a system message
  const ragContext = buildRagContextMessage(chapters)
  if (ragContext) {
    messages.push({ role: 'system', content: ragContext })
  }

  // Add conversation history
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content })
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage })

  // 4. Stream from OpenAI
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    stream: true,
  })

  // 5. Transform OpenAI stream into NDJSON format the frontend expects
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            const line = JSON.stringify({ type: 'item', content: delta }) + '\n'
            controller.enqueue(encoder.encode(line))
          }
        }
        controller.close()
      } catch (err) {
        console.error('[chat] OpenAI stream error:', err)
        controller.error(err)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Chat suggestions (non-streaming)
// ---------------------------------------------------------------------------

export async function generateChatSuggestions(
  bookTitle: string,
  bookSummary: string,
  locale: string,
): Promise<string[]> {
  const lang = getLanguageDirective(locale)

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an executive thinking partner.
 You respond in the following language: ${lang}
Your only input is a book title and summary.

Based solely on the implications, themes, and promises suggested by the title and summary, generate 2–3 sharp questions that a high-performing individual would naturally ask.

Assume the reader is:
- Experienced
- Time-constrained
- Focused on leverage, clarity, and outcomes

Your questions must:
- Be short, direct, and high-signal

Do NOT:
- Explain the questions
- Add preamble or commentary

Output format:
Return ONLY a JSON array of strings.

Example output:
[
  "What is meant by [key phrase in book title]?",
  "What are the key takeaways from this book?",
  "Where could I apply the principles to my business?"
]`,
      },
      {
        role: 'user',
        content: `book title: ${bookTitle}\n\nsummary: ${bookSummary}`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content || '[]'

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((q): q is string => typeof q === 'string').slice(0, 3)
    }
  } catch {
    console.error('[chat] Failed to parse suggestions response:', raw)
  }

  return []
}
