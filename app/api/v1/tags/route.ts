import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BookTag } from '@/lib/types/books'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: tags, error } = await supabase
      .from('book_tags')
      .select('id, name, slug, display_order')
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching tags:', error)
      return NextResponse.json(
        { error: 'Failed to fetch tags' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      tags: tags as BookTag[]
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
