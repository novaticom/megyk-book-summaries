export interface BookTag {
  id: number
  name: string
  slug: string
  display_order?: number
}

export interface BookTranslations {
  [locale: string]: {
    title?: string
    summary?: string
  }
}

export interface Book {
  id: string
  title: string
  author: string
  isbn?: string
  publication_year?: number
  genre?: string
  description?: string
  summary?: string
  cover_image_url?: string
  cover_image_url_de?: string
  page_count?: number
  default_summary_pdf_url?: string
  default_summary_pdf_url_de?: string
  translations?: BookTranslations
  tags?: BookTag[]
  created_at: string
  updated_at: string
}

export interface BooksResponse {
  books: Book[]
  count: number
}
