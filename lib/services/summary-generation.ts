/**
 * Summary Generation Service
 *
 * Handles the complete summary PDF generation pipeline:
 * 1. Load pre-generated summary content from summaries_v2
 * 2. Generate HTML using templates or layout generators
 * 3. Convert HTML to PDF via external service
 *
 * This replaces the n8n webhook-based approach for better
 * performance, reliability, and scalability.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { SummaryStyle, SummaryLength } from '@/lib/types/preferences'
import { readFile } from 'fs/promises'
import path from 'path'

// ============================================================================
// Types
// ============================================================================

/** Formatted summary structure for short/medium templates */
export interface FormattedSummary {
  TITLE: string
  AUTHOR: string
  CORE_IDEA: string
  PROBLEM_SOLVED: string | WorkbookSection
  WHY_IT_MATTERS: string | WorkbookSection
  MAIN_THESIS: string | WorkbookSection
  INSIGHTS_LI?: string[]
  INSIGHTS?: WorkbookSection
  STEPS_LI?: string[]
  STEPS?: WorkbookSection
  TLDR_QUOTE_OR_SUMMARY_LINE: string
}

/** Workbook section with summary and questions */
export interface WorkbookSection {
  SUMMARY?: string
  QUESTION?: string
  QUESTIONS?: string[]
}

/** Chapter structure for long format summaries */
export interface ChapterSummary {
  chapter_index: number
  title: string
  summary: string | string[]  // string for narrative, string[] for bullet_points
  questions?: string[]        // for workbook style
  answers?: string[]          // for workbook style
}

/** Raw data from summaries_v2 table */
export interface SummaryV2Data {
  id: string
  book_id: string
  style: SummaryStyle
  length: SummaryLength
  locale: string
  summary: ChapterSummary[]
  formatted_summary: FormattedSummary | null
  complete_book_summary: string | null
  created_at: string
  updated_at: string
}

/** Book data from books table */
export interface BookData {
  id: string
  title: string
  author: string
}

/** Combined book and summary data for rendering */
export interface BookSummaryData {
  book: BookData
  summaryV2: SummaryV2Data
  style: SummaryStyle
  length: SummaryLength
  locale: string
}

// ============================================================================
// HTML Helpers
// ============================================================================

function escapeHtml(str: string = ''): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function stripHtml(input: string = ''): string {
  return String(input)
    .replace(/<[^>]*>/g, '')
    .trim()
}

function renderList(arr: string[] = []): string {
  if (!Array.isArray(arr) || !arr.length) return ''
  return `<ul>${arr.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
}

function renderField(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return renderList(value)
  }
  return escapeHtml(value || '')
}

function renderWorkbookSection(section: string | WorkbookSection | undefined): string {
  if (!section || typeof section !== 'object') return ''

  let html = ''

  if (section.SUMMARY) {
    html += `<span class="workbook-summary">${escapeHtml(section.SUMMARY)}</span>`
  }

  const questions: string[] = []
  if (section.QUESTION) {
    questions.push(section.QUESTION)
  }
  if (Array.isArray(section.QUESTIONS)) {
    questions.push(...section.QUESTIONS)
  }

  if (questions.length) {
    html += `
      <div class="workbook-questions">
        ${questions.map(q => `<div class="workbook-question">${escapeHtml(q)}</div>`).join('')}
      </div>
    `
  }

  return html
}

function renderAnswerLines(lineCount: number = 4): string {
  let lines = ''
  for (let i = 0; i < lineCount; i++) {
    lines += `<div class="answer-line"></div>`
  }
  return lines
}

function renderWorkbookAnswerBlock(section: string | WorkbookSection | undefined, lineCount: number = 6): string {
  if (!section || typeof section !== 'object') return ''

  const questions: string[] = []
  if (section.QUESTION) {
    questions.push(section.QUESTION)
  }
  if (Array.isArray(section.QUESTIONS)) {
    questions.push(...section.QUESTIONS)
  }

  if (!questions.length) return ''

  return questions.map(q => `
    <div class="workbook-answer-block">
      <div class="workbook-question">${escapeHtml(q)}</div>
      ${renderAnswerLines(lineCount)}
    </div>
  `).join('')
}

function cleanChapterTitle(chapter: ChapterSummary, withNumber: boolean = false): string {
  let title = chapter.title || ''
  title = title.replace(/^(Chapter\s*\d+[:.\\-]?\s*|[0-9IVXLCDM]+\s+)/i, '').trim()
  return withNumber ? `Chapter ${chapter.chapter_index + 1}: ${title}` : title
}

// ============================================================================
// Template Rendering
// ============================================================================

function renderShortMediumTemplate(
  templateHtml: string,
  data: FormattedSummary,
  style: SummaryStyle,
  length: SummaryLength
): string {
  let finalHtml = templateHtml

  // Add style class to body
  finalHtml = finalHtml.replace(
    /<body([^>]*)>/i,
    `<body$1 class="${style}">`
  )

  // Parse title and subtitle
  const titleComponents = data.TITLE.split(':')
  const title = titleComponents[0]
  const subtitle = titleComponents.length > 1 ? titleComponents[1] : ''

  // Common replacements
  finalHtml = finalHtml
    .replace(/{{TITLE}}/g, escapeHtml(title))
    .replace(/{{SUBTITLE}}/g, escapeHtml(subtitle))
    .replace(/{{AUTHOR}}/g, escapeHtml(data.AUTHOR))

  if (style === 'workbook') {
    // Workbook style rendering
    finalHtml = finalHtml
      .replace(/{{CORE_IDEA}}/g, renderField(data.CORE_IDEA))
      .replace(/{{PROBLEM_SOLVED}}/g, renderWorkbookSection(data.PROBLEM_SOLVED))
      .replace(/{{WHY_IT_MATTERS}}/g, renderWorkbookSection(data.WHY_IT_MATTERS))
      .replace(/{{MAIN_THESIS}}/g, renderWorkbookSection(data.MAIN_THESIS))
      .replace(/{{INSIGHTS_LI}}/g, renderWorkbookSection(data.INSIGHTS))
      .replace(/{{STEPS_LI}}/g, renderWorkbookSection(data.STEPS))
      .replace(/{{TLDR_QUOTE_OR_SUMMARY_LINE}}/g, renderField(data.TLDR_QUOTE_OR_SUMMARY_LINE))
      .replace(/{{WORKBOOK_ANSWER_PAGE}}/g, `
        <div class="page workbook-answers">
          <h2>Reflection & Notes</h2>
          ${renderWorkbookAnswerBlock(data.PROBLEM_SOLVED, 4)}
          ${renderWorkbookAnswerBlock(data.WHY_IT_MATTERS, 4)}
          ${renderWorkbookAnswerBlock(data.MAIN_THESIS, 4)}
          ${renderWorkbookAnswerBlock(data.INSIGHTS, 5)}
          ${renderWorkbookAnswerBlock(data.STEPS, 5)}
        </div><br /><br /><br />
      `)
      .replace(/{{AD_CLICK_URL}}/g, `https://thenew.gold/wds_in/?utm_source=megyk&utm_medium=${encodeURIComponent(data.TITLE)}`)
  } else {
    // Narrative/Bullet Points style rendering
    const insightsHtml = (data.INSIGHTS_LI || [])
      .map(i => `<li>${escapeHtml(i)}</li>`)
      .join('')

    const stepsHtml = (data.STEPS_LI || [])
      .map(i => `<li>${escapeHtml(i)}</li>`)
      .join('')

    finalHtml = finalHtml
      .replace(/{{CORE_IDEA}}/g, renderField(data.CORE_IDEA))
      .replace(/{{PROBLEM_SOLVED}}/g, renderField(data.PROBLEM_SOLVED as string))
      .replace(/{{WHY_IT_MATTERS}}/g, renderField(data.WHY_IT_MATTERS as string))
      .replace(/{{MAIN_THESIS}}/g, renderField(data.MAIN_THESIS as string))
      .replace(/{{INSIGHTS_LI}}/g, insightsHtml)
      .replace(/{{STEPS_LI}}/g, stepsHtml)
      .replace(/{{TLDR_QUOTE_OR_SUMMARY_LINE}}/g, renderField(data.TLDR_QUOTE_OR_SUMMARY_LINE || stripHtml(data.TLDR_QUOTE_OR_SUMMARY_LINE)))
      .replace(/{{AD_CLICK_URL}}/g, `https://thenew.gold/wds_in/?utm_source=megyk&utm_medium=${encodeURIComponent(data.TITLE)}`)
      .replace(/{{WORKBOOK_ANSWER_PAGE}}/g, '')
  }

  return finalHtml
}

// ============================================================================
// Long Format Layout Generators
// ============================================================================

function generateNarrativeLayout(book: BookData, chapters: ChapterSummary[]): string {
  const title = escapeHtml(book.title)
  const author = escapeHtml(book.author)

  const tocHtml = chapters.map(ch => `<li>${escapeHtml(cleanChapterTitle(ch))}</li>`).join('')

  const chaptersHtml = chapters.map(ch => `
    <article>
      <h3>${escapeHtml(cleanChapterTitle(ch))}</h3>
      <p>${escapeHtml(ch.summary as string)}</p>
    </article>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page {
      @top-right {
        content: string(chaptertitle);
        font-size: 9pt;
        font-style: italic;
        color: #666;
      }
      @bottom-center {
        content: "AI-generated summary. Not affiliated with or endorsed by the original author or publisher.";
        font-size: 8.5pt;
        font-style: italic;
        color: #777;
      }
    }
    @page:first {
      @top-left { content: normal; }
      @top-right { content: normal; }
      @bottom-center { content: normal; }
    }
    body {
      font-family: "Times New Roman", "Nimbus Roman", serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #111;
      text-align: left;
      margin: 0;
    }
    h1, h2 {
      text-align: center;
      color: #000;
      font-weight: 700;
      line-height: 1.25;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    h1 { font-size: 2.4em; margin-top: 1em; margin-bottom: 0.3em; }
    h2 { margin-top: 1em; margin-bottom: 0.75em; }
    h3 { margin-top: .5em; margin-bottom: 0.55em; }
    p { margin: 0 0 10px 0; text-indent: 0; }
    #toc {
      border: 1px solid #000;
      padding: 1.25em 2em;
      width: 90%;
      margin: 2.5em auto;
      background: #fff;
      page-break-inside: avoid;
    }
    #toc ol {
      list-style-position: outside;
      padding-left: 1.2em;
      line-height: 1.35;
    }
    #toc li { margin: 0 0 7px 0; font-size: 10.8pt; }
    #chapters { page-break-before: always; }
    article {
      page-break-inside: avoid;
      padding-top: 18px;
      border-top: 1px solid #333;
      margin-top: 28px;
    }
    footer {
      text-align: center;
      font-size: 9pt;
      margin-top: 6em;
      padding-top: 1.2em;
      color: #666;
      border-top: 1px solid #ccc;
    }
    #cover { text-align: center; }
    #cover em { display: block; margin-top: 0em; font-size: 10pt; color: #666; }
    .fullpage-ad {
      page-break-before: always;
      position: relative;
      width: 100%;
      height: calc(11in - 1.3in);
    }
    .fullpage-ad img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .ad-cta {
      position: absolute;
      bottom: 1.2in;
      left: 50%;
      transform: translateX(-50%);
      font-family: "Open Sans Condensed", "Arial Narrow", Arial, sans-serif;
      font-weight: 700;
      font-size: 18pt;
      letter-spacing: 0.04em;
      color: #ffffff;
      text-decoration: none;
      text-align: center;
      text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    }
    .ad-cta span { padding: 10px 24px; display: inline-block; }
    @media screen { .ad-cta { bottom: 1.1in; } }
    @media print { .ad-cta { bottom: 1.46in; } }
  </style>
</head>
<body>
  <section id="cover">
    <h1>${title}</h1>
    <h3>${author}</h3>
    <h3>Megyk Books Summary — Narrative Style</h3><br />
  </section>
  <section id="toc">
    <h2>Table of Contents</h2>
    <ol>${tocHtml}</ol>
  </section>
  <section id="chapters">
    <h2>Chapters</h2>
    ${chaptersHtml}
  </section>
  <div class="fullpage-ad">
    <img src="https://app.megyk.com/medium-long-a.png" alt="Sponsored full-page advertisement" />
    <a href="https://thenew.gold/wds_in/?utm_source=megyk&utm_medium=${encodeURIComponent(book.title)}" class="ad-cta" target="_blank" rel="noopener noreferrer">
      <span>TAKE THE SURVEY</span>
    </a>
  </div>
  <footer>
    Generated by <strong>Megyk Books</strong> — ${new Date().toLocaleDateString()}
  </footer>
</body>
</html>
`
}

function generateBulletPointsLayout(book: BookData, chapters: ChapterSummary[]): string {
  const title = escapeHtml(book.title)
  const author = escapeHtml(book.author)

  function toList(content: string | string[]): string {
    if (!content) return ''
    if (Array.isArray(content)) {
      return `<ul>${content.map(b => `<li>${b.trim()}</li>`).join('\n')}</ul>`
    }
    const sentences = content.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean)
    return `<ul>${sentences.map(s => `<li>${s}</li>`).join('\n')}</ul>`
  }

  const tocHtml = chapters.map(ch => `<li>${cleanChapterTitle(ch)}</li>`).join('\n')

  const chaptersHtml = chapters.map(ch => `
    <article>
      <h3>${cleanChapterTitle(ch)}</h3>
      ${toList(ch.summary)}
    </article>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body {
    font-family: "Helvetica Neue", Arial, sans-serif;
    margin: 1in;
    line-height: 1.6;
    color: #000000;
    background: #FFFFFF;
  }
  h1, h2, h3 { color: #000000; }
  h1, h2 {
    text-align: center;
    font-weight: 700;
    line-height: 1.25;
    page-break-after: avoid;
    page-break-inside: avoid;
  }
  #cover h1, #cover h2, #cover h3 { text-align: center; }
  h1 { font-size: 2.4em; margin-top: 1em; margin-bottom: 0.3em; }
  h2 { margin-top: 1em; margin-bottom: 0.75em; }
  h3 { margin-top: .5em; margin-bottom: 0.55em; }
  ul { list-style-type: disc; margin-left: 1.5em; line-height: 1.5; }
  li { margin-bottom: 0.3em; }
  #toc { border: 1px solid #000000; padding: 1em; margin-bottom: 2em; }
  #toc h2 { border: none; margin-bottom: 0.5em; }
  #toc ol { margin-left: 1.5em; line-height: 1.5; }
  #chapters { page-break-before: always; }
  article { margin-top: 2em; padding: 1em; border-top: 2px solid #000000; }
  footer { margin-top: 50px; text-align: center; font-size: 0.8em; border-top: 1px solid #000000; padding-top: 10px; }
  @page {
    margin: 0.6in 0.7in;
    @bottom-center {
      content: "AI-generated summary. Not affiliated with or endorsed by the original author or publisher.";
      font-size: 8.5pt;
      font-style: italic;
      color: #777;
    }
  }
  @media print {
    body { margin: 0; }
    h1, h2, h3, li, p { color: #000000 !important; background: #FFFFFF !important; }
    #chapters { page-break-before: always; }
  }
  .fullpage-ad {
    page-break-before: always;
    position: relative;
    width: 100%;
    height: calc(11in - 1.3in);
  }
  .fullpage-ad img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .ad-cta {
    position: absolute;
    bottom: 1.2in;
    left: 50%;
    transform: translateX(-50%);
    font-family: "Open Sans Condensed", "Arial Narrow", Arial, sans-serif;
    font-weight: 700;
    font-size: 18pt;
    letter-spacing: 0.04em;
    color: #ffffff;
    text-decoration: none;
    text-align: center;
    text-shadow: 0 1px 3px rgba(0,0,0,0.6);
  }
  .ad-cta span { padding: 10px 24px; display: inline-block; }
  .fullpage-ad { margin: 0px; }
  @media screen { .ad-cta { bottom: 1.1in; } }
  @media print { .ad-cta { bottom: 1.35in; } }
</style>
</head>
<body>
  <section id="cover">
    <h1>${title}</h1>
    <h3>${author}</h3>
    <h3>Megyk Books Summary — Bullet Point Style</h3><br />
  </section>
  <section id="toc">
    <h2>Table of Contents</h2>
    <ol>${tocHtml}</ol>
  </section>
  <section id="chapters">
    <h2>Chapters</h2>
    ${chaptersHtml}
  </section>
  <div class="fullpage-ad">
    <img src="https://app.megyk.com/medium-long-a.png" alt="Sponsored full-page advertisement" />
    <a href="https://thenew.gold/wds_in/?utm_source=megyk&utm_medium=${encodeURIComponent(book.title)}" class="ad-cta" target="_blank" rel="noopener noreferrer">
      <span>TAKE THE SURVEY</span>
    </a>
  </div>
  <footer>
    <p>Generated by <strong>Megyk Books</strong> — ${new Date().toLocaleDateString()}</p>
  </footer>
</body>
</html>
`
}

function generateWorkbookLayout(book: BookData, chapters: ChapterSummary[]): string {
  const title = escapeHtml(book.title)
  const author = escapeHtml(book.author)

  function cleanTitle(chapterTitle: string = ''): string {
    return chapterTitle.replace(/^(Chapter\s*\d+[:.\\-]?\s*|[0-9IVXLCDM]+\s+)/i, '').trim()
  }

  const tocHtml = chapters.map(ch => `<li>${cleanTitle(ch.title)}</li>`).join('\n')

  // Build index entries for global Q&A table
  const indexEntries: Array<{
    chapter_index: number
    chapter_title: string
    question: string
    answer: string
  }> = []

  const chaptersHtml = chapters.map(ch => {
    const chapterTitle = cleanTitle(ch.title)
    const questions = Array.isArray(ch.questions) ? ch.questions : []
    const answers = Array.isArray(ch.answers) ? ch.answers : []

    // Add to global index
    questions.forEach((q, i) => {
      indexEntries.push({
        chapter_index: ch.chapter_index,
        chapter_title: chapterTitle,
        question: q,
        answer: answers[i] || ''
      })
    })

    const questionsHtml = questions.length ? `
      <h3>Questions for Reflection</h3>
      <ol>
        ${questions.map(q => `
          <li>
            <strong>${escapeHtml(q)}</strong><br/>
            <div class="answer-space"></div>
            <div class="answer-space"></div>
          </li>
        `).join('')}
      </ol>
    ` : ''

    return `
      <div class="chapter">
        <h2>Chapter ${ch.chapter_index + 1}: ${chapterTitle}</h2>
        ${ch.summary ? `<div class="summary"><p>${escapeHtml(ch.summary as string)}</p></div>` : ''}
        ${questionsHtml}
      </div>
    `
  }).join('')

  // Build global index table
  let indexHtml = ''
  if (indexEntries.length) {
    let lastChapter = ''
    const rows = indexEntries.map(entry => {
      const chapterLabel = entry.chapter_title !== lastChapter
        ? `Chapter ${entry.chapter_index + 1}: ${entry.chapter_title}`
        : ''
      lastChapter = entry.chapter_title
      return `
        <tr>
          <td>${chapterLabel}</td>
          <td>${escapeHtml(entry.question)}</td>
          <td>${escapeHtml(entry.answer)}</td>
        </tr>
      `
    }).join('')

    indexHtml = `
      <div class="chapter">
        <h2>Workbook Index — All Questions & Answers</h2>
        <table>
          <tr><th>Chapter</th><th>Question</th><th>Answer</th></tr>
          ${rows}
        </table>
      </div>
    `
  }

  return `
<html>
<head>
  <style>
    body {
      font-family: "Helvetica Neue", Arial, sans-serif;
      padding: 40px;
      background: #FFFFFF;
      color: #000000;
      line-height: 1.6;
    }
    h1, h2 {
      text-align: center;
      color: #000;
      font-weight: 700;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    h1 { font-size: 2.4em; margin-top: 1em; margin-bottom: 0.3em; }
    #cover h1, #cover h2, #cover h3 { text-align: center; }
    #toc { border: 1px solid #000000; padding: 1em; margin-bottom: 2em; }
    #toc h2 { border: none; margin-bottom: 0.5em; }
    #toc ol { margin-left: 1.5em; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 0.95em; background: #FFFFFF; }
    td, th { border: 1px solid #000000; padding: 8px; vertical-align: top; }
    th { font-weight: bold; }
    .chapter { page-break-before: always; margin-top: 60px; }
    .summary { margin-top: 10px; margin-bottom: 20px; }
    .cover { text-align: center; page-break-after: always; margin-top: 200px; }
    ol { margin-left: 25px; }
    .answer-space { border-bottom: 1px solid #000000; height: 25px; margin: 5px 0 15px; }
    @page {
      @bottom-center {
        content: "AI-generated summary. Not affiliated with or endorsed by the original author or publisher.";
        font-size: 8.5pt;
        font-style: italic;
        color: #777;
      }
    }
    footer { margin-top: 50px; text-align: center; font-size: 0.8em; border-top: 1px solid #000000; padding-top: 10px; }
    .fullpage-ad {
      page-break-before: always;
      position: relative;
      width: 100%;
      height: calc(11in - 1.3in);
    }
    .fullpage-ad img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .ad-cta {
      position: absolute;
      bottom: 1.2in;
      left: 50%;
      transform: translateX(-50%);
      font-family: "Open Sans Condensed", "Arial Narrow", Arial, sans-serif;
      font-weight: 700;
      font-size: 18pt;
      letter-spacing: 0.04em;
      color: #ffffff;
      text-decoration: none;
      text-align: center;
      text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    }
    .ad-cta span { padding: 10px 24px; display: inline-block; }
    .fullpage-ad { margin: -40px; }
    @media screen { .ad-cta { bottom: 1.1in; } }
    @media print { .ad-cta { bottom: 1.90in; } }
  </style>
</head>
<body>
  <section id="cover">
    <h1>${title}</h1>
    <h3>${author}</h3>
    <h3>Megyk Books Summary — Workbook Style</h3><br />
  </section>
  <section id="toc">
    <h2>Table of Contents</h2>
    <ol>${tocHtml}</ol>
  </section>
  ${chaptersHtml}
  ${indexHtml}
  <div class="fullpage-ad">
    <img src="https://app.megyk.com/medium-long-a.png" alt="Sponsored full-page advertisement" />
    <a href="https://thenew.gold/wds_in/?utm_source=megyk&utm_medium=${encodeURIComponent(book.title)}" class="ad-cta" target="_blank" rel="noopener noreferrer">
      <span>TAKE THE SURVEY</span>
    </a>
  </div>
  <footer>
    Generated on ${new Date().toLocaleDateString()} by Megyk Books
    <em>AI-generated summary. Not affiliated with or endorsed by the original author or publisher.</em>
  </footer>
</body>
</html>
`
}

// ============================================================================
// Summary Generation Service
// ============================================================================

export class SummaryGenerationService {
  private supabase: SupabaseClient
  private templatesDir: string

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
    this.templatesDir = path.join(process.cwd(), 'html2pdf')
  }

  /**
   * Load book data from books table
   */
  async loadBook(bookId: string): Promise<BookData | null> {
    const { data, error } = await this.supabase
      .from('books')
      .select('id, title, author')
      .eq('id', bookId)
      .single()

    if (error) {
      console.error('Error loading book:', error)
      return null
    }

    return data as BookData
  }

  /**
   * Load pre-generated summary from summaries_v2 table
   */
  async loadSummaryV2(
    bookId: string,
    style: SummaryStyle,
    length: SummaryLength,
    locale: string
  ): Promise<SummaryV2Data | null> {
    const { data, error } = await this.supabase
      .from('summaries_v2')
      .select('*')
      .eq('book_id', bookId)
      .eq('style', style)
      .eq('length', length)
      .eq('locale', locale)
      .single()

    if (error) {
      console.error('Error loading summary_v2:', error)
      return null
    }

    return data as SummaryV2Data
  }

  /**
   * Load HTML template from file system
   */
  async loadTemplate(templateName: string): Promise<string> {
    const templatePath = path.join(this.templatesDir, templateName)
    return await readFile(templatePath, 'utf-8')
  }

  /**
   * Generate HTML for a summary based on style and length
   */
  async generateHtml(data: BookSummaryData): Promise<string> {
    const { book, summaryV2, style, length } = data

    if (length === 'long') {
      // Long format: Generate full HTML layout
      const chapters = summaryV2.summary || []

      switch (style) {
        case 'narrative':
          return generateNarrativeLayout(book, chapters)
        case 'bullet_points':
          return generateBulletPointsLayout(book, chapters)
        case 'workbook':
          return generateWorkbookLayout(book, chapters)
        default:
          return generateNarrativeLayout(book, chapters)
      }
    } else {
      // Short/Medium format: Use templates with token replacement
      const templateName = length === 'short' ? 'one-page-template.html' : 'three-page-template.html'
      const templateHtml = await this.loadTemplate(templateName)

      if (!summaryV2.formatted_summary) {
        throw new Error(`No formatted_summary found for book ${book.id} with style=${style}, length=${length}`)
      }

      return renderShortMediumTemplate(templateHtml, summaryV2.formatted_summary, style, length)
    }
  }

  /**
   * Convert HTML to PDF using external service
   */
  async convertToPdf(html: string): Promise<ArrayBuffer> {
    const pdfServiceUrl = process.env.PDF_SERVICE_URL || 'https://pdf.megyk.com/html-to-pdf'

    const response = await fetch(pdfServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add API key header if configured
        ...(process.env.PDF_SERVICE_API_KEY && {
          'X-API-Key': process.env.PDF_SERVICE_API_KEY
        })
      },
      body: JSON.stringify({ html })
    })

    if (!response.ok) {
      throw new Error(`PDF service error: ${response.status} ${response.statusText}`)
    }

    return await response.arrayBuffer()
  }

  /**
   * Generate a complete summary PDF
   * This is the main entry point that orchestrates the full pipeline
   */
  async generateSummaryPdf(
    bookId: string,
    style: SummaryStyle,
    length: SummaryLength,
    locale: string
  ): Promise<{ pdf: ArrayBuffer; book: BookData }> {
    // Load book data
    const book = await this.loadBook(bookId)
    if (!book) {
      throw new Error(`Book not found: ${bookId}`)
    }

    // Load pre-generated summary
    const summaryV2 = await this.loadSummaryV2(bookId, style, length, locale)
    if (!summaryV2) {
      throw new Error(`Summary not found for book ${bookId} with style=${style}, length=${length}, locale=${locale}`)
    }

    // Generate HTML
    const html = await this.generateHtml({
      book,
      summaryV2,
      style,
      length,
      locale
    })

    // Convert to PDF
    const pdf = await this.convertToPdf(html)

    return { pdf, book }
  }
}

/**
 * Factory function to create a SummaryGenerationService instance
 */
export function createSummaryGenerationService(supabase: SupabaseClient): SummaryGenerationService {
  return new SummaryGenerationService(supabase)
}
