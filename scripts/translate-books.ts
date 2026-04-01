/**
 * Batch translation script: translate book title + description into German
 * using the OpenAI API. Results are written to the `translations` JSONB column.
 *
 * Prerequisites:
 *   - Run migration 020_add_book_translations.sql first
 *   - Set OPENAI_API_KEY in .env.local
 *
 * Usage:
 *   # Dry run (shows what would be translated, no writes)
 *   set -a && source .env.local && set +a && npx tsx scripts/translate-books.ts --dry-run
 *
 *   # Live run
 *   set -a && source .env.local && set +a && npx tsx scripts/translate-books.ts
 *
 *   # Retranslate all books even if already translated
 *   set -a && source .env.local && set +a && npx tsx scripts/translate-books.ts --force
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const openaiKey = process.env.OPENAI_API_KEY!

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const TARGET_LOCALE = 'de'

// Delay between OpenAI calls to avoid rate limiting (ms)
const DELAY_MS = 500

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('Usage: set -a && source .env.local && set +a && npx tsx scripts/translate-books.ts')
  process.exit(1)
}

if (!openaiKey) {
  console.error('Missing OPENAI_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const openai = new OpenAI({ apiKey: openaiKey })

interface BookRow {
  id: string
  title: string
  summary: string | null
  translations: Record<string, { title?: string; summary?: string }> | null
}

interface Translation {
  title: string
  summary?: string
}

async function translateBook(book: BookRow): Promise<Translation> {
  const userContent = [
    `Title: ${book.title}`,
    book.summary ? `Description: ${book.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate book metadata from English to German.

Rules:
- Translate naturally — do not transliterate word-for-word
- Keep the author's name exactly as written (do not translate proper nouns that are personal names)
- The word "Essence" (as in "book essence" or "personalized essence") is a brand term — translate it as "Essenz"
- Return ONLY valid JSON with keys "title" and "summary" (omit "summary" if not provided)
- No extra text, no markdown fences`,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('Empty response from OpenAI')

  return JSON.parse(raw) as Translation
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log(`\nBook translation script`)
  console.log(`Target locale: ${TARGET_LOCALE}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${FORCE ? ' + FORCE' : ''}`)
  console.log('─'.repeat(50))

  // Fetch all live books
  const { data: books, error } = await supabase
    .from('books')
    .select('id, title, summary, translations')
    .eq('live', true)
    .order('title', { ascending: true })

  if (error) {
    console.error('Failed to fetch books:', error.message)
    process.exit(1)
  }

  if (!books || books.length === 0) {
    console.log('No books found.')
    return
  }

  // Filter to only untranslated books (unless --force)
  const toTranslate = FORCE
    ? (books as BookRow[])
    : (books as BookRow[]).filter(b => !b.translations?.[TARGET_LOCALE])

  console.log(`Total books: ${books.length}`)
  console.log(`Already translated: ${books.length - toTranslate.length}`)
  console.log(`To translate: ${toTranslate.length}\n`)

  if (toTranslate.length === 0) {
    console.log('Nothing to do. Use --force to retranslate all books.')
    return
  }

  let succeeded = 0
  let failed = 0

  for (let i = 0; i < toTranslate.length; i++) {
    const book = toTranslate[i]
    const progress = `[${i + 1}/${toTranslate.length}]`

    console.log(`${progress} "${book.title}"`)

    if (DRY_RUN) {
      console.log(`  → would translate title + ${book.summary ? 'summary' : 'no summary'}\n`)
      continue
    }

    try {
      const translation = await translateBook(book)

      console.log(`  title:       ${translation.title}`)
      if (translation.summary) {
        const preview = translation.summary.slice(0, 80)
        console.log(`  summary:     ${preview}${translation.summary.length > 80 ? '…' : ''}`)
      }

      // Merge with any existing translations for other locales
      const existingTranslations = book.translations ?? {}
      const updatedTranslations = {
        ...existingTranslations,
        [TARGET_LOCALE]: translation,
      }

      const { error: updateError } = await supabase
        .from('books')
        .update({ translations: updatedTranslations })
        .eq('id', book.id)

      if (updateError) {
        console.error(`  ✗ DB update failed: ${updateError.message}`)
        failed++
      } else {
        console.log(`  ✓ saved\n`)
        succeeded++
      }

      if (i < toTranslate.length - 1) {
        await sleep(DELAY_MS)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ Translation failed: ${message}\n`)
      failed++
    }
  }

  console.log('─'.repeat(50))
  if (DRY_RUN) {
    console.log(`Dry run complete. Would translate ${toTranslate.length} books.`)
  } else {
    console.log(`Done. Succeeded: ${succeeded}, Failed: ${failed}`)
  }
}

main()
