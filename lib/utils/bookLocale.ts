import { Book } from '@/lib/types/books'

/**
 * Returns a copy of the book with locale-specific fields merged in.
 * Falls back to base English columns when the locale or field is absent.
 */
export function localizeBook(book: Book, locale: string): Book {
  if (locale === 'en' || !book.translations) return book

  const t = book.translations[locale]
  if (!t) return book

  return {
    ...book,
    title: t.title ?? book.title,
    summary: t.summary ?? book.summary,
  }
}

export function localizeBooks(books: Book[], locale: string): Book[] {
  if (locale === 'en') return books
  return books.map(book => localizeBook(book, locale))
}
