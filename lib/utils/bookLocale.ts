import { Book } from '@/lib/types/books'

/**
 * Returns a copy of the book with locale-specific fields merged in.
 * Falls back to base English columns when the locale or field is absent.
 */
export function localizeBook(book: Book, locale: string): Book {
  if (locale === 'en') return book

  const t = book.translations?.[locale]
  const localizedCover = locale === 'de' && book.cover_image_url_de
    ? { cover_image_url: book.cover_image_url_de }
    : {}

  return {
    ...book,
    ...(t ? { title: t.title ?? book.title, summary: t.summary ?? book.summary } : {}),
    ...localizedCover,
  }
}

export function localizeBooks(books: Book[], locale: string): Book[] {
  return books.map(book => localizeBook(book, locale))
}
