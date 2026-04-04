#!/usr/bin/env npx tsx
/**
 * Translate Summaries to German
 *
 * For each summaries_v2 row with locale='en':
 *   1. Translate the summary JSONB (chapter titles and summaries)
 *   2. Translate the formatted_summary JSONB (CORE_IDEA, STEPS_LI, INSIGHTS_LI)
 *   3. Insert a new row with locale='de'
 *
 * Usage:
 *   npx tsx scripts/translate-summaries-to-german.ts
 *   npx tsx scripts/translate-summaries-to-german.ts --dry-run   (no DB writes)
 *   npx tsx scripts/translate-summaries-to-german.ts --book-id <uuid>  (single book)
 *   npx tsx scripts/translate-summaries-to-german.ts --limit 10  (process N summaries)
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import * as path from 'path'
import { config } from 'dotenv'

config({ path: path.join(process.cwd(), '.env.local') })

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChapterSummary {
  title: string
  summary: string
  chapter_index: number
}

// Narrative/Bullet Points format
interface FormattedSummaryStandard {
  TITLE: string
  AUTHOR: string
  CORE_IDEA: string
  STEPS_LI: string[]
  INSIGHTS_LI: string[]
}

// Workbook format (can have QUESTIONS array or QUESTION string)
interface FormattedSummaryWorkbook {
  TITLE: string
  AUTHOR: string
  STEPS: {
    SUMMARY: string
    QUESTIONS?: string[]
    QUESTION?: string
  }
  INSIGHTS: {
    SUMMARY: string
    QUESTIONS?: string[]
    QUESTION?: string
  }
  // Short workbook has additional sections
  CORE_IDEA?: string
  KEY_THEMES?: { SUMMARY: string; QUESTION?: string }
  MAIN_THESIS?: { SUMMARY: string; QUESTION?: string }
  PROBLEM_SOLVED?: { SUMMARY: string; QUESTION?: string }
  WHY_IT_MATTERS?: { SUMMARY: string; QUESTION?: string }
  WHO_THIS_BOOK_IS_FOR?: { SUMMARY: string; QUESTION?: string }
  INTEGRATION?: { SUMMARY: string; QUESTION?: string }
  TLDR_QUOTE_OR_SUMMARY_LINE?: string
}

type FormattedSummary = FormattedSummaryStandard | FormattedSummaryWorkbook

function isWorkbookFormat(f: FormattedSummary): f is FormattedSummaryWorkbook {
  return 'STEPS' in f && typeof f.STEPS === 'object' && 'SUMMARY' in f.STEPS
}

interface SummaryV2 {
  id: string
  book_id: string
  summary: ChapterSummary[]
  formatted_summary: FormattedSummary | null
  complete_book_summary: string | null
  length: string
  style: string
  locale: string
}

interface BookTranslation {
  title?: string
  summary?: string
}

interface Book {
  id: string
  title: string
  author: string
  translations: Record<string, BookTranslation>
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function parseJsonSafely(raw: string): string[] {
  // Clean up common GPT response issues
  let json = raw
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim()

  // Try parsing as-is first
  try {
    return JSON.parse(json)
  } catch {
    // Try fixing common issues: unescaped quotes, truncated strings
    // Remove trailing incomplete string
    json = json.replace(/,\s*"[^"]*$/, ']')
    json = json.replace(/,\s*$/, ']')
    if (!json.endsWith(']')) json += ']'
    return JSON.parse(json)
  }
}

async function translateWithRetry(
  texts: string[],
  systemPrompt: string,
  userPromptPrefix: string,
  openai: OpenAI,
  maxRetries = 2
): Promise<string[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${userPromptPrefix}

Texts to translate:
${JSON.stringify(texts, null, 2)}`
          }
        ],
        max_tokens: 8000,
        temperature: 0.3,
      })

      const raw = response.choices[0].message.content ?? '[]'
      return parseJsonSafely(raw)
    } catch (err) {
      if (attempt === maxRetries) throw err
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  return texts // Fallback to original
}

// ─── Translation Functions ──────────────────────────────────────────────────

async function translateChapterSummaries(
  chapters: ChapterSummary[],
  bookTitle: string,
  openai: OpenAI
): Promise<ChapterSummary[]> {
  const systemPrompt = `You are a professional translator specializing in book summaries. Translate the following texts from English to German. Maintain the tone, style, and meaning. Use natural, idiomatic German suitable for educated readers.`
  const userPromptPrefix = `Translate these texts for the book "${bookTitle}". Return ONLY a JSON array of translated strings in the exact same order. No markdown, no explanation.`

  // For long content, batch into smaller chunks to avoid JSON truncation
  const BATCH_SIZE = 8 // chapters per batch
  const translatedChapters: ChapterSummary[] = []

  for (let i = 0; i < chapters.length; i += BATCH_SIZE) {
    const batch = chapters.slice(i, i + BATCH_SIZE)
    const textsToTranslate = batch.flatMap(ch => [ch.title, ch.summary])

    const translated = await translateWithRetry(
      textsToTranslate,
      systemPrompt,
      userPromptPrefix,
      openai
    )

    // Reconstruct chapter objects with translated text
    for (let j = 0; j < batch.length; j++) {
      translatedChapters.push({
        ...batch[j],
        title: translated[j * 2] ?? batch[j].title,
        summary: translated[j * 2 + 1] ?? batch[j].summary,
      })
    }

    // Small delay between batches
    if (i + BATCH_SIZE < chapters.length) {
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }

  return translatedChapters
}

async function translateFormattedSummary(
  formatted: FormattedSummary,
  germanBookTitle: string,
  openai: OpenAI
): Promise<FormattedSummary> {
  if (isWorkbookFormat(formatted)) {
    // Workbook format - collect all translatable strings dynamically
    const textsToTranslate: string[] = []
    const structure: { key: string; subkey?: string; isArray?: boolean; count?: number }[] = []

    // Helper to add text and track structure
    const addText = (key: string, subkey: string | undefined, value: string | string[] | undefined) => {
      if (!value) return
      if (Array.isArray(value)) {
        textsToTranslate.push(...value)
        structure.push({ key, subkey, isArray: true, count: value.length })
      } else {
        textsToTranslate.push(value)
        structure.push({ key, subkey, isArray: false })
      }
    }

    // Core sections
    addText('STEPS', 'SUMMARY', formatted.STEPS.SUMMARY)
    addText('STEPS', 'QUESTIONS', formatted.STEPS.QUESTIONS)
    addText('STEPS', 'QUESTION', formatted.STEPS.QUESTION)
    addText('INSIGHTS', 'SUMMARY', formatted.INSIGHTS.SUMMARY)
    addText('INSIGHTS', 'QUESTIONS', formatted.INSIGHTS.QUESTIONS)
    addText('INSIGHTS', 'QUESTION', formatted.INSIGHTS.QUESTION)

    // Additional short workbook sections
    addText('CORE_IDEA', undefined, formatted.CORE_IDEA)
    addText('TLDR_QUOTE_OR_SUMMARY_LINE', undefined, formatted.TLDR_QUOTE_OR_SUMMARY_LINE)

    const additionalSections = ['KEY_THEMES', 'MAIN_THESIS', 'PROBLEM_SOLVED', 'WHY_IT_MATTERS', 'WHO_THIS_BOOK_IS_FOR', 'INTEGRATION'] as const
    for (const section of additionalSections) {
      const s = formatted[section]
      if (s) {
        addText(section, 'SUMMARY', s.SUMMARY)
        addText(section, 'QUESTION', s.QUESTION)
      }
    }

    const translated = await translateWithRetry(
      textsToTranslate,
      'You are a professional translator. Translate the following texts from English to German. Maintain clarity and professional tone.',
      'Translate these workbook components to German. Return ONLY a JSON array of translated strings in the exact same order. No markdown, no explanation.',
      openai
    )

    // Reconstruct the object
    const result: any = { TITLE: germanBookTitle, AUTHOR: formatted.AUTHOR }
    let idx = 0

    for (const s of structure) {
      if (!result[s.key] && s.subkey) result[s.key] = {}

      if (s.isArray) {
        const arr = translated.slice(idx, idx + (s.count ?? 0))
        if (s.subkey) result[s.key][s.subkey] = arr
        else result[s.key] = arr
        idx += s.count ?? 0
      } else {
        if (s.subkey) result[s.key][s.subkey] = translated[idx]
        else result[s.key] = translated[idx]
        idx++
      }
    }

    return result as FormattedSummaryWorkbook
  } else {
    // Standard format: CORE_IDEA, STEPS_LI[], INSIGHTS_LI[]
    const textsToTranslate = [
      formatted.CORE_IDEA,
      ...formatted.STEPS_LI,
      ...formatted.INSIGHTS_LI,
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following texts from English to German. Maintain clarity and professional tone.`
        },
        {
          role: 'user',
          content: `Translate these summary components to German. Return ONLY a JSON array of translated strings in the exact same order. No markdown, no explanation.

Texts to translate:
${JSON.stringify(textsToTranslate, null, 2)}`
        }
      ],
      max_tokens: 3000,
      temperature: 0.3,
    })

    const raw = response.choices[0].message.content ?? '[]'
    const json = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const translated: string[] = JSON.parse(json)

    const stepsCount = formatted.STEPS_LI.length
    const insightsCount = formatted.INSIGHTS_LI.length

    return {
      TITLE: germanBookTitle,
      AUTHOR: formatted.AUTHOR,
      CORE_IDEA: translated[0] ?? formatted.CORE_IDEA,
      STEPS_LI: translated.slice(1, 1 + stepsCount),
      INSIGHTS_LI: translated.slice(1 + stepsCount, 1 + stepsCount + insightsCount),
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const singleBookId = args.includes('--book-id')
    ? args[args.indexOf('--book-id') + 1]
    : null
  const limitArg = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1], 10)
    : null

  console.log('🇩🇪 German Summary Translator')
  console.log(dryRun ? '   [DRY RUN — no DB writes]\n' : '\n')

  // Init clients
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Fetch English summaries that don't have German translations yet
  let query = supabase
    .from('summaries_v2')
    .select('*')
    .eq('locale', 'en')
    .order('book_id')
    .order('style')
    .order('length')

  if (singleBookId) {
    query = query.eq('book_id', singleBookId)
  }
  if (limitArg) {
    query = query.limit(limitArg)
  }

  const { data: englishSummaries, error: fetchError } = await query

  if (fetchError) {
    throw new Error(`Failed to fetch summaries: ${fetchError.message}`)
  }

  if (!englishSummaries || englishSummaries.length === 0) {
    console.log('No English summaries found to translate.')
    return
  }

  // Check which already have German versions
  const { data: existingGerman } = await supabase
    .from('summaries_v2')
    .select('book_id, style, length')
    .eq('locale', 'de')

  const existingKeys = new Set(
    (existingGerman ?? []).map(s => `${s.book_id}:${s.style}:${s.length}`)
  )

  // Filter out already translated
  const toTranslate = englishSummaries.filter(
    s => !existingKeys.has(`${s.book_id}:${s.style}:${s.length}`)
  )

  console.log(`Found ${englishSummaries.length} English summaries`)
  console.log(`Already translated: ${englishSummaries.length - toTranslate.length}`)
  console.log(`To translate: ${toTranslate.length}\n`)

  if (toTranslate.length === 0) {
    console.log('Nothing to translate!')
    return
  }

  // Fetch book info for German titles
  const bookIds = [...new Set(toTranslate.map(s => s.book_id))]
  const { data: books } = await supabase
    .from('books')
    .select('id, title, author, translations')
    .in('id', bookIds)

  const bookMap = new Map<string, Book>(
    (books ?? []).map(b => [b.id, b as Book])
  )

  let success = 0
  let failed = 0

  for (const summary of toTranslate as SummaryV2[]) {
    const book = bookMap.get(summary.book_id)
    const bookTitle = book?.title ?? 'Unknown Book'
    const germanTitle = book?.translations?.de?.title ?? bookTitle

    console.log(`📖 ${bookTitle}`)
    console.log(`   Style: ${summary.style}, Length: ${summary.length}`)

    try {
      // 1. Translate chapter summaries
      process.stdout.write('   🌍 Translating chapters... ')
      const translatedChapters = await translateChapterSummaries(
        summary.summary,
        bookTitle,
        openai
      )
      console.log(`${translatedChapters.length} chapters`)

      // 2. Translate formatted summary if present
      let translatedFormatted: FormattedSummary | null = null
      if (summary.formatted_summary) {
        process.stdout.write('   🌍 Translating formatted summary... ')
        translatedFormatted = await translateFormattedSummary(
          summary.formatted_summary,
          germanTitle,
          openai
        )
        console.log('done')
      }

      if (!dryRun) {
        // 3. Insert German version
        process.stdout.write('   💾 Saving to database... ')
        const { error: insertError } = await supabase
          .from('summaries_v2')
          .insert({
            book_id: summary.book_id,
            summary: translatedChapters,
            formatted_summary: translatedFormatted,
            complete_book_summary: null, // Not used currently
            length: summary.length,
            style: summary.style,
            locale: 'de',
          })

        if (insertError) {
          throw new Error(`Insert failed: ${insertError.message}`)
        }
        console.log('done')
      } else {
        console.log('   ✅ [dry run] Would insert German translation')
      }

      console.log('')
      success++

      // Rate limiting - avoid hitting OpenAI too fast
      await new Promise(resolve => setTimeout(resolve, 500))

    } catch (err) {
      console.error(`   ❌ Failed: ${err instanceof Error ? err.message : err}\n`)
      failed++
    }
  }

  console.log('─'.repeat(50))
  console.log(`✅ Success: ${success}  ❌ Failed: ${failed}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
