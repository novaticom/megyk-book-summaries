import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCreditService } from '@/lib/services/credits'
import { createSummaryGenerationService } from '@/lib/services/summary-generation'
import { SummaryStyle, SummaryLength } from '@/lib/types/preferences'
import { createReferralService } from '@/lib/services/referrals'
import { getLocale } from 'next-intl/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { book_id, preferences, request_id: requestId } = body
    const creditIdempotencyKey = typeof requestId === 'string' && requestId.trim()
      ? `summary:${requestId.trim()}`
      : `summary:${crypto.randomUUID()}`

    if (!book_id) {
      return NextResponse.json(
        { error: 'Book ID is required' },
        { status: 400 }
      )
    }

    if (!preferences || !preferences.style || !preferences.length) {
      return NextResponse.json(
        { error: 'Preferences (style and length) are required' },
        { status: 400 }
      )
    }

    const sanitizeFilename = (str: string) => {
      return str
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
    }

    // Check credit balance before generating summary
    const creditService = createCreditService(supabase)
    const style = preferences.style as SummaryStyle
    const length = preferences.length as SummaryLength
    const creditCost = await creditService.getCreditCost('summary', style, length)

    const creditCheck = await creditService.checkBalance(user.id, creditCost)

    if (!creditCheck.has_sufficient_credits) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          required_credits: creditCheck.required_credits,
          current_balance: creditCheck.current_balance,
          shortfall: Math.abs(creditCheck.remaining_after),
        },
        { status: 402 }
      )
    }

    const locale = await getLocale()

    try {
      // Generate summary PDF using the new service (replaces n8n webhook)
      const summaryService = createSummaryGenerationService(supabase)
      const startTime = Date.now()

      const { pdf: pdfBuffer, book } = await summaryService.generateSummaryPdf(
        book_id,
        style,
        length,
        locale
      )

      const generationTime = (Date.now() - startTime) / 1000

      // Stable storage path per user/book/style/length/locale for idempotency
      // Include locale in path so en/de PDFs don't overwrite each other
      const storagePath = `${user.id}/${book_id}/${preferences.length}_${preferences.style}_${locale}.pdf`

      // Upload PDF to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('summaries')
        .upload(storagePath, Buffer.from(pdfBuffer), {
          contentType: 'application/pdf',
          upsert: true
        })

      if (uploadError) {
        console.error('Error uploading PDF to storage:', uploadError)
        return NextResponse.json(
          { error: 'Failed to save summary PDF' },
          { status: 500 }
        )
      }

      // Create database record (includes locale for i18n support)
      const { data: summaryData, error: summaryError } = await supabase
        .from('summaries')
        .upsert({
          user_id: user.id,
          book_id,
          style: preferences.style,
          length: preferences.length,
          locale,
          file_path: storagePath,
          tokens_spent: null, // No tokens spent since we use pre-generated content
          generation_time: generationTime,
        }, {
          onConflict: 'user_id,book_id,style,length,locale'
        })
        .select()
        .single()

      if (summaryError) {
        console.error('Error saving summary record:', summaryError)
        // Clean up uploaded file if DB upsert fails
        await supabase.storage.from('summaries').remove([storagePath])
        return NextResponse.json(
          { error: 'Failed to save summary record' },
          { status: 500 }
        )
      }

      // Deduct credits after successful summary generation
      const creditTransaction = await creditService.deductForSummary(
        user.id,
        style,
        length,
        summaryData.id,
        book.title,
        creditIdempotencyKey
      )

      if (!creditTransaction) {
        console.error('Failed to deduct credits for summary, but summary was generated')
        // Note: We don't fail the request here since the summary was already generated
        // This should be monitored and resolved manually if it occurs
      }

      // Activate referral if this is the user's first action (chat or summary)
      // This awards bonus credits to both referrer and referred user
      const referralService = createReferralService(supabase)
      referralService.activateReferral(user.id, 'summary').catch((error) => {
        console.error('Failed to activate referral:', error)
        // Don't fail the request if referral activation fails
      })

      const sanitizedTitle = sanitizeFilename(book.title || 'book')
      const filename = `${sanitizedTitle}_${length}_${style}.pdf`

      // Return PDF with appropriate headers for download
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': pdfBuffer.byteLength.toString(),
        },
      })
    } catch (generationError) {
      console.error('Error generating summary:', generationError)
      return NextResponse.json(
        { error: generationError instanceof Error ? generationError.message : 'Failed to generate summary' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in summary generation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
