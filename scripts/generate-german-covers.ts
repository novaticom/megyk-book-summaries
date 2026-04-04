#!/usr/bin/env npx tsx
/**
 * Generate German Book Covers
 *
 * For each book with cover_image_url:
 *   1. Download cover from Supabase Storage
 *   2. GPT-4o Vision extracts: background color, text elements with positions/sizes/colors
 *   3. GPT-4o translates text elements to German
 *   4. ImageMagick reconstructs the cover (same layout, German text, Nunito ExtraBold)
 *   5. Upload to Supabase Storage under covers-de/
 *   6. Update books.cover_image_url_de
 *
 * Usage:
 *   npx tsx scripts/generate-german-covers.ts
 *   npx tsx scripts/generate-german-covers.ts --dry-run   (skip upload/DB update)
 *   npx tsx scripts/generate-german-covers.ts --book-id <uuid>  (single book)
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { execSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { config } from 'dotenv'

config({ path: path.join(process.cwd(), '.env.local') })

// ─── Config ────────────────────────────────────────────────────────────────

const MAGICK = '/opt/homebrew/bin/magick'
const FONT_EXTRABOLD = path.join(os.homedir(), 'Library/Fonts/Oswald-Bold.ttf')
const FONT_BOLD = path.join(os.homedir(), 'Library/Fonts/Oswald-SemiBold.ttf')
const TMP_DIR = '/tmp/german-covers'
const STORAGE_BUCKET = 'book-covers'
const STORAGE_PREFIX = 'covers-de'
// Padding: text canvas is this fraction of image width
const TEXT_WIDTH_RATIO = 0.87

// ─── Types ──────────────────────────────────────────────────────────────────

interface TextElement {
  text: string
  /** Top edge of this text block as % of image height (0=top, 100=bottom) */
  yTopPercent: number
  color: string
  /** Capital letter height as fraction of image height, e.g. 0.20 */
  fontSizeRatio: number
  weight: 'extrabold' | 'bold'
}

interface CoverAnalysis {
  backgroundColor: string
  width: number
  height: number
  elements: TextElement[]
}

interface Book {
  id: string
  title: string
  cover_image_url: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function magick(...args: string[]): void {
  const result = spawnSync(MAGICK, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`ImageMagick failed:\n${result.stderr}`)
  }
}

function magickOutput(...args: string[]): string {
  const result = spawnSync(MAGICK, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`ImageMagick failed:\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function tmpPath(bookId: string, suffix: string): string {
  return path.join(TMP_DIR, `${bookId}-${suffix}`)
}

function cleanup(files: string[]): void {
  for (const f of files) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
}

function escapeForMagick(text: string): string {
  // Escape characters that are special in ImageMagick label strings
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '%%')
    .replace(/@/g, '\\@')
}

// ─── Step 1: Analyze cover with GPT-4o Vision ───────────────────────────────

async function analyzeCover(imageUrl: string, openai: OpenAI): Promise<CoverAnalysis> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this book cover image carefully and return ONLY valid JSON — no markdown, no explanation.

CRITICAL RULE: Any text block that has a DIFFERENT color OR a DIFFERENT font size from another block MUST be a separate element. Never combine differently-styled text into one element.

Return this exact structure:
{
  "backgroundColor": "#RRGGBB",
  "width": <pixel width as integer>,
  "height": <pixel height as integer>,
  "elements": [
    {
      "text": "exact text (single line or wrapped block — use actual newlines for wrapping within ONE same-style block)",
      "yTopPercent": <top edge of this text block as % from top of image, 0-100>,
      "color": "#RRGGBB",
      "fontSizeRatio": <height of a capital letter / total image height, e.g. 0.20 for large title, 0.10 for subtitle, 0.07 for author>,
      "weight": "extrabold"
    }
  ]
}

Rules:
- List elements strictly top to bottom
- Each element with a unique color or unique font size is its own entry
- yTopPercent: 0 = very top of image, 100 = very bottom — this is the TOP EDGE of the text block, NOT its center
- fontSizeRatio examples: big title ≈ 0.18-0.22, secondary title ≈ 0.14-0.18, subtitle/tagline ≈ 0.08-0.12, author name ≈ 0.06-0.09
- weight is always "extrabold"
- backgroundColor is the flat solid fill color of the entire background`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
    max_tokens: 1200,
  })

  const raw = response.choices[0].message.content ?? ''
  const json = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(json) as CoverAnalysis
}

// ─── Step 2: Translate text elements to German ──────────────────────────────

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '')
  return letters.length > 0 && letters === letters.toUpperCase()
}

async function translateElements(
  elements: TextElement[],
  bookTitle: string,
  openai: OpenAI,
): Promise<TextElement[]> {
  const texts = elements.map((e) => e.text)

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `Translate these book cover text elements from English to German for the book "${bookTitle}".

Rules:
- Author names and proper nouns must NOT be translated — return them unchanged
- Remove any line breaks from the translation — return each element as a single continuous string with no \\n characters
- Use natural, idiomatic German phrasing suitable for a book cover
- Return ONLY a JSON array of translated strings in the exact same order
- No markdown, no explanation

Texts:
${JSON.stringify(texts, null, 2)}`,
      },
    ],
    max_tokens: 600,
  })

  const raw = response.choices[0].message.content ?? '[]'
  const json = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const translated: string[] = JSON.parse(json)

  return elements.map((el, i) => {
    let text = (translated[i] ?? el.text).replace(/\n/g, ' ').trim()
    // Preserve ALL CAPS if the original was ALL CAPS
    if (isAllCaps(el.text)) text = text.toUpperCase()
    return { ...el, text }
  })
}

// ─── Step 3: Reconstruct cover with ImageMagick ──────────────────────────────

const MIN_FONT_SIZE = 10
const GAP_RATIO = 0.015   // minimum gap between elements as fraction of image height
const MARGIN_RATIO = 0.04 // top/bottom margin as fraction of image height

/** Measure the pixel width of a single word at a given font size. */
function measureWordWidth(word: string, font: string, fontSize: number): number {
  const result = spawnSync(
    MAGICK,
    ['-font', font, '-pointsize', String(fontSize), `label:${escapeForMagick(word)}`, '-format', '%w', 'info:'],
    { encoding: 'utf8' },
  )
  return parseInt(result.stdout.trim(), 10) || 9999
}

/**
 * Render a text element, auto-scaling the font down until it fits within maxHeight.
 * If enforceSingleLine is true, also scales down until the text fits on one line
 * (rendered height ≤ 1.6× font size).
 */
function renderText(
  text: string,
  font: string,
  fontSize: number,
  color: string,
  textWidth: number,
  maxHeight: number,
  outputFile: string,
  enforceSingleLine = false,
): { renderedHeight: number; finalFontSize: number } {
  let size = fontSize

  // Pre-scale: ensure the longest word in the text fits within textWidth.
  // This prevents ImageMagick from breaking words mid-character.
  const longestWord = text.split(/[\s\n]+/).reduce((a, b) => (a.length > b.length ? a : b), '')
  if (longestWord.length > 8) {
    while (size >= MIN_FONT_SIZE && measureWordWidth(longestWord, font, size) > textWidth) {
      size = Math.max(MIN_FONT_SIZE, Math.round(size * 0.88))
    }
  }

  while (size >= MIN_FONT_SIZE) {
    magick(
      '-background', 'transparent',
      '-fill', color,
      '-font', font,
      '-pointsize', String(size),
      '-size', `${textWidth}x`,
      '-gravity', 'center',
      `caption:${escapeForMagick(text)}`,
      outputFile,
    )
    const h = parseInt(magickOutput('identify', '-format', '%h', outputFile), 10)
    const fitsHeight = h <= maxHeight
    const fitsSingleLine = !enforceSingleLine || h <= Math.round(size * 1.6)
    if (fitsHeight && fitsSingleLine) return { renderedHeight: h, finalFontSize: size }
    size = Math.max(MIN_FONT_SIZE, Math.round(size * 0.88))
  }

  const h = parseInt(magickOutput('identify', '-format', '%h', outputFile), 10)
  return { renderedHeight: h, finalFontSize: size }
}

function buildCover(
  analysis: CoverAnalysis,
  elements: TextElement[],
  outputPath: string,
  debug = false,
): void {
  const { backgroundColor, width, height } = analysis
  const textWidth = Math.round(width * TEXT_WIDTH_RATIO)
  const xOffset = Math.round((width - textWidth) / 2)
  const marginPx = Math.round(height * MARGIN_RATIO)
  const minGapPx = Math.round(height * GAP_RATIO)
  const availableHeight = height - marginPx * 2

  // Each element gets an equal maximum share of the available height
  const maxElementHeight = Math.floor(availableHeight / elements.length)

  const tempFiles: string[] = []

  // ── Pass 1: render every element, scaling font to fit its height quota ───
  interface RenderedEl {
    el: TextElement
    textFile: string
    renderedHeight: number
    finalFontSize: number
  }

  const rendered: RenderedEl[] = elements.map((el, i) => {
    const font = el.weight === 'extrabold' ? FONT_EXTRABOLD : FONT_BOLD
    const startFontSize = Math.round(el.fontSizeRatio * height)
    const textFile = `${outputPath}.text${i}.png`
    tempFiles.push(textFile)

    // Last element is always the author — enforce single line
    const isLastElement = i === elements.length - 1
    const { renderedHeight, finalFontSize } = renderText(
      el.text, font, startFontSize, el.color, textWidth, maxElementHeight, textFile, isLastElement,
    )

    if (debug) {
      console.log(
        `      [debug] el[${i}]: startPt=${startFontSize} finalPt=${finalFontSize} ` +
        `renderedH=${renderedHeight} maxH=${maxElementHeight} yTop=${el.yTopPercent}%`,
      )
    }

    return { el, textFile, renderedHeight, finalFontSize }
  })

  // ── Pass 2: assign Y positions ───────────────────────────────────────────
  // Use Vision's yTopPercent as a hint but clamp and push down to avoid overlaps.
  const yPositions: number[] = []
  let cursor = marginPx

  for (let i = 0; i < rendered.length; i++) {
    const { el, renderedHeight } = rendered[i]

    // Desired top from Vision hint
    let yTop = Math.round((el.yTopPercent / 100) * height)

    // Clamp: must not start above previous element's bottom + gap
    yTop = Math.max(yTop, cursor)

    // Clamp: must not overflow image bottom
    yTop = Math.min(yTop, height - marginPx - renderedHeight)

    yPositions.push(yTop)
    cursor = yTop + renderedHeight + minGapPx
  }

  // ── Pass 3: composite text layers onto solid background ──────────────────
  const bgPath = `${outputPath}.bg.png`
  magick('-size', `${width}x${height}`, `xc:${backgroundColor}`, bgPath)
  tempFiles.push(bgPath)

  let currentBase = bgPath

  for (let i = 0; i < rendered.length; i++) {
    const { textFile } = rendered[i]
    const yTop = yPositions[i]
    const composited = `${outputPath}.comp${i}.png`

    magick(
      'composite',
      '-gravity', 'NorthWest',
      '-geometry', `+${xOffset}+${yTop}`,
      textFile,
      currentBase,
      composited,
    )
    tempFiles.push(composited)
    currentBase = composited
  }

  fs.copyFileSync(currentBase, outputPath)
  cleanup(tempFiles)
}

// ─── Step 4: Upload to Supabase Storage ─────────────────────────────────────

async function uploadCover(
  filePath: string,
  bookId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath)
  const storagePath = `${STORAGE_PREFIX}/${bookId}.png`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// ─── Step 5: Update DB ───────────────────────────────────────────────────────

async function updateBook(
  bookId: string,
  url: string,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { error } = await supabase
    .from('books')
    .update({ cover_image_url_de: url })
    .eq('id', bookId)

  if (error) throw new Error(`DB update failed: ${error.message}`)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const debugMode = args.includes('--debug')
  const force = args.includes('--force')
  const singleBookId = args.includes('--book-id')
    ? args[args.indexOf('--book-id') + 1]
    : null

  console.log('🇩🇪 German Cover Generator')
  console.log(dryRun ? '   [DRY RUN — no uploads]\n' : '\n')

  // Validate dependencies
  if (!fs.existsSync(MAGICK)) throw new Error(`ImageMagick not found at ${MAGICK}`)
  if (!fs.existsSync(FONT_EXTRABOLD)) throw new Error(`Font not found: ${FONT_EXTRABOLD}`)

  // Init clients
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Fetch books
  let query = supabase
    .from('books')
    .select('id, title, cover_image_url')
    .not('cover_image_url', 'eq', '')
    .not('cover_image_url', 'is', null)
    .order('title')

  if (singleBookId) {
    query = query.eq('id', singleBookId) as typeof query
  }

  const { data: books, error } = await query
  if (error) throw new Error(`Failed to fetch books: ${error.message}`)

  // Fetch existing German cover URLs separately (column may not exist yet pre-migration)
  const existingDeUrls = new Map<string, string>()
  if (!singleBookId) {
    const { data: deData } = await supabase
      .from('books')
      .select('id, cover_image_url_de')
      .not('cover_image_url_de', 'eq', '')
      .not('cover_image_url_de', 'is', null)
    for (const row of deData ?? []) {
      existingDeUrls.set(row.id, row.cover_image_url_de)
    }
  }
  if (!books || books.length === 0) {
    console.log('No books found.')
    return
  }

  console.log(`Found ${books.length} book(s) to process\n`)

  // Ensure temp dir exists
  fs.mkdirSync(TMP_DIR, { recursive: true })

  let success = 0
  let skipped = 0
  let failed = 0

  for (const book of books as Book[]) {
    console.log(`📖 ${book.title}`)

    // Skip if already done (unless --force or single-book mode)
    if (!force && !singleBookId && existingDeUrls.has(book.id)) {
      console.log('   ⏭  Already has German cover, skipping\n')
      skipped++
      continue
    }

    const outputPath = tmpPath(book.id, 'de.png')

    try {
      // 1. Analyze
      process.stdout.write('   🔍 Analyzing cover... ')
      const analysis = await analyzeCover(book.cover_image_url, openai)
      console.log(`${analysis.elements.length} text elements, bg ${analysis.backgroundColor}`)

      // 2. Translate
      process.stdout.write('   🌍 Translating to German... ')
      const translatedElements = await translateElements(analysis.elements, book.title, openai)
      console.log('done')
      for (const el of translatedElements) {
        console.log(`      "${el.text.replace(/\n/g, ' / ')}"`)
      }

      // 3. Build
      process.stdout.write('   🎨 Building cover... ')
      buildCover(analysis, translatedElements, outputPath, debugMode)
      console.log('done')

      if (!dryRun) {
        // 4. Upload
        process.stdout.write('   ☁️  Uploading... ')
        const url = await uploadCover(outputPath, book.id, supabase)
        console.log('done')

        // 5. Update DB
        process.stdout.write('   💾 Updating database... ')
        await updateBook(book.id, url, supabase)
        console.log('done')
        console.log(`   ✅ ${url}\n`)
      } else {
        console.log(`   ✅ [dry run] cover saved to ${outputPath}\n`)
      }

      success++
    } catch (err) {
      console.error(`   ❌ Failed: ${err instanceof Error ? err.message : err}\n`)
      failed++
    } finally {
      if (!dryRun && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath)
      }
    }
  }

  console.log('─'.repeat(50))
  console.log(`✅ Success: ${success}  ⏭  Skipped: ${skipped}  ❌ Failed: ${failed}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
