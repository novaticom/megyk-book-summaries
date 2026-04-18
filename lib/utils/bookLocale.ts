import { Book } from '@/lib/types/books'

// Bump this version when German covers are regenerated to bust browser cache
const GERMAN_COVER_VERSION = 'v2'

/**
 * Adds cache-busting version parameter to a URL
 */
function addCacheBuster(url: string, version: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${version}`
}

/**
 * Returns a copy of the book with locale-specific fields merged in.
 * Falls back to base English columns when the locale or field is absent.
 */
export function localizeBook(book: Book, locale: string): Book {
  if (locale === 'en') return book

  const t = book.translations?.[locale]
  const localizedCover = locale === 'de' && book.cover_image_url_de
    ? { cover_image_url: addCacheBuster(book.cover_image_url_de, GERMAN_COVER_VERSION) }
    : {}
  const localizedSummaryPdf = locale === 'de' && book.default_summary_pdf_url_de
    ? { default_summary_pdf_url: book.default_summary_pdf_url_de }
    : {}

  return {
    ...book,
    ...(t ? { title: t.title ?? book.title, summary: t.summary ?? book.summary } : {}),
    ...localizedCover,
    ...localizedSummaryPdf,
  }
}

export function localizeBooks(books: Book[], locale: string): Book[] {
  return books.map(book => localizeBook(book, locale))
}
