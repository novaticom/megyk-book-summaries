import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from 'next-intl/server'
import { Book, BookTag } from '@/lib/types/books'
import { localizeBooks } from '@/lib/utils/bookLocale'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const locale = await getLocale()
    console.log(`[Books API] Supabase client created in ${Date.now() - startTime}ms`)

    // Fetch genre mapping from database
    const { data: genres } = await supabase
      .from('book_genres')
      .select('id, name')

    const genreMap: Record<number, string> = {}
    if (genres) {
      for (const g of genres) {
        genreMap[g.id] = g.name
      }
    }
    console.log(`[Books API] Loaded ${Object.keys(genreMap).length} genres from database`)

    // Parse parameters
    const url = new URL(request.url)
    const all = url.searchParams.get('all') === 'true'
    const featured = url.searchParams.get('featured') === 'true'
    const limitParam = url.searchParams.get('limit')
    const tagSlug = url.searchParams.get('tag')
    
    // Helper function to fetch tags for a list of books
    async function fetchTagsForBooks(bookIds: string[]): Promise<Record<string, BookTag[]>> {
      if (bookIds.length === 0) return {}

      const { data: mappings } = await supabase
        .from('book_tag_mappings')
        .select('book_id, book_tags(id, name, slug, display_order)')
        .in('book_id', bookIds)

      const tagsByBookId: Record<string, BookTag[]> = {}
      if (mappings) {
        for (const mapping of mappings) {
          const bookId = mapping.book_id as string
          const tag = mapping.book_tags as unknown as BookTag
          if (!tagsByBookId[bookId]) {
            tagsByBookId[bookId] = []
          }
          if (tag) {
            tagsByBookId[bookId].push(tag)
          }
        }
      }
      return tagsByBookId
    }

    // Handle featured books for carousel (simple limit, no pagination)
    if (featured && limitParam) {
      const limit = parseInt(limitParam, 10)
      if (limit < 1 || limit > 50) {
        return NextResponse.json(
          { error: 'Invalid limit parameter for featured books' },
          { status: 400 }
        )
      }

      const queryStart = Date.now()

      let books: any[] | null = null
      let error: any = null

      // If tag filter is specified, use a different query approach
      if (tagSlug) {
        // First get the tag ID
        const { data: tagData } = await supabase
          .from('book_tags')
          .select('id')
          .eq('slug', tagSlug)
          .single()

        if (!tagData) {
          return NextResponse.json({
            books: [] as Book[]
          })
        }

        // Get book IDs that have this tag
        const { data: mappings } = await supabase
          .from('book_tag_mappings')
          .select('book_id')
          .eq('tag_id', tagData.id)

        if (!mappings || mappings.length === 0) {
          return NextResponse.json({
            books: [] as Book[]
          })
        }

        const bookIds = mappings.map(m => m.book_id)

        // Fetch books with those IDs
        const result = await supabase
          .from('books')
          .select('*')
          .eq('live', true)
          .in('id', bookIds)
          .order('created_at', { ascending: false })
          .limit(limit)

        books = result.data
        error = result.error
      } else {
        // No tag filter, fetch all featured books
        const result = await supabase
          .from('books')
          .select('*')
          .eq('live', true)
          .order('created_at', { ascending: false })
          .limit(limit)

        books = result.data
        error = result.error
      }

      console.log(`[Books API] Featured books query completed in ${Date.now() - queryStart}ms`)

      if (error) {
        console.error('Error fetching featured books:', error)
        return NextResponse.json(
          { error: 'Failed to fetch featured books' },
          { status: 500 }
        )
      }

      // Fetch tags for all books
      const bookIds = books?.map(b => b.id) || []
      const tagsByBookId = await fetchTagsForBooks(bookIds)

      console.log(`[Books API] Success. Fetched ${books?.length || 0} featured books. Total time: ${Date.now() - startTime}ms`)

      // Transform the data to map genre_id to genre name and include tags
      const transformedBooks = books?.map(book => ({
        ...book,
        genre: book.book_genre_id ? genreMap[book.book_genre_id as number] || null : null,
        tags: tagsByBookId[book.id] || []
      })) || []

      return NextResponse.json({
        books: localizeBooks(transformedBooks as Book[], locale)
      })
    }
    
    if (all) {
      // Return all books for client-side sorting
      const queryStart = Date.now()

      let books: any[] | null = null
      let error: any = null
      let count: number | null = null

      // If tag filter is specified, filter by tag
      if (tagSlug) {
        const { data: tagData } = await supabase
          .from('book_tags')
          .select('id')
          .eq('slug', tagSlug)
          .single()

        if (!tagData) {
          return NextResponse.json({
            books: [] as Book[],
            total: 0
          })
        }

        const { data: mappings } = await supabase
          .from('book_tag_mappings')
          .select('book_id')
          .eq('tag_id', tagData.id)

        if (!mappings || mappings.length === 0) {
          return NextResponse.json({
            books: [] as Book[],
            total: 0
          })
        }

        const bookIds = mappings.map(m => m.book_id)

        const result = await supabase
          .from('books')
          .select('*', { count: 'exact' })
          .eq('live', true)
          .in('id', bookIds)
          .order('title', { ascending: true })

        books = result.data
        error = result.error
        count = result.count
      } else {
        const result = await supabase
          .from('books')
          .select('*', { count: 'exact' })
          .eq('live', true)
          .order('title', { ascending: true })

        books = result.data
        error = result.error
        count = result.count
      }

      console.log(`[Books API] Database query completed in ${Date.now() - queryStart}ms`)

      if (error) {
        console.error('Error fetching books:', error)
        return NextResponse.json(
          { error: 'Failed to fetch books' },
          { status: 500 }
        )
      }

      // Fetch tags for all books
      const bookIds = books?.map(b => b.id) || []
      const tagsByBookId = await fetchTagsForBooks(bookIds)

      console.log(`[Books API] Success. Fetched all ${books?.length || 0} books. Total time: ${Date.now() - startTime}ms`)

      // Transform the data to map genre_id to genre name and include tags
      const transformedBooks = books?.map(book => ({
        ...book,
        genre: book.book_genre_id ? genreMap[book.book_genre_id as number] || null : null,
        tags: tagsByBookId[book.id] || []
      })) || []

      return NextResponse.json({
        books: localizeBooks(transformedBooks as Book[], locale),
        total: count || 0
      })
    }

    // Existing pagination logic for backwards compatibility
    const page = parseInt(url.searchParams.get('page') || '1', 10)
    const limit = parseInt(url.searchParams.get('limit') || '10', 10)
    const offset = (page - 1) * limit

    // Parse sorting parameters
    const sortBy = url.searchParams.get('sortBy') || 'title'
    const sortOrder = url.searchParams.get('sortOrder') || 'asc'

    // Define allowed sort columns
    const allowedSortColumns = ['title', 'author', 'genre', 'publication_year', 'page_count']
    const validSortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'title'
    const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'asc'

    // Validate parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      )
    }

    // Fetch paginated and sorted books from the database
    const queryStart = Date.now()

    let books: any[] | null = null
    let error: any = null
    let count: number | null = null

    // If tag filter is specified, filter by tag
    if (tagSlug) {
      const { data: tagData } = await supabase
        .from('book_tags')
        .select('id')
        .eq('slug', tagSlug)
        .single()

      if (!tagData) {
        return NextResponse.json({
          books: [] as Book[],
          pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          sorting: { sortBy: validSortColumn, sortOrder: validSortOrder }
        })
      }

      const { data: mappings } = await supabase
        .from('book_tag_mappings')
        .select('book_id')
        .eq('tag_id', tagData.id)

      if (!mappings || mappings.length === 0) {
        return NextResponse.json({
          books: [] as Book[],
          pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          sorting: { sortBy: validSortColumn, sortOrder: validSortOrder }
        })
      }

      const bookIds = mappings.map(m => m.book_id)

      const result = await supabase
        .from('books')
        .select('*', { count: 'exact' })
        .eq('live', true)
        .in('id', bookIds)
        .order(validSortColumn, { ascending: validSortOrder === 'asc' })
        .range(offset, offset + limit - 1)

      books = result.data
      error = result.error
      count = result.count
    } else {
      const result = await supabase
        .from('books')
        .select('*', { count: 'exact' })
        .eq('live', true)
        .order(validSortColumn, { ascending: validSortOrder === 'asc' })
        .range(offset, offset + limit - 1)

      books = result.data
      error = result.error
      count = result.count
    }

    console.log(`[Books API] Database query completed in ${Date.now() - queryStart}ms`)

    if (error) {
      console.error('Error fetching books:', error)
      return NextResponse.json(
        { error: 'Failed to fetch books' },
        { status: 500 }
      )
    }

    // Fetch tags for all books
    const bookIds = books?.map(b => b.id) || []
    const tagsByBookId = await fetchTagsForBooks(bookIds)

    const totalPages = Math.ceil((count || 0) / limit)

    console.log(`[Books API] Success. Fetched ${books?.length || 0} books (page ${page}/${totalPages}, sorted by ${validSortColumn} ${validSortOrder}). Total time: ${Date.now() - startTime}ms`)

    // Transform the data to map genre_id to genre name and include tags
    const transformedBooks = books?.map(book => ({
      ...book,
      genre: book.book_genre_id ? genreMap[book.book_genre_id as number] || null : null,
      tags: tagsByBookId[book.id] || []
    })) || []

    return NextResponse.json({
      books: localizeBooks(transformedBooks as Book[], locale),
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      sorting: {
        sortBy: validSortColumn,
        sortOrder: validSortOrder
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    console.log(`[Books API] Error occurred. Total time: ${Date.now() - startTime}ms`)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
