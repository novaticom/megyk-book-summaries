import { NextRequest, NextResponse } from 'next/server'
import { getN8nWebhookHeaders } from '@/lib/n8n-webhooks'

type SignupWebhookPayload = {
  user_id?: string
  [key: string]: unknown
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SignupWebhookPayload
    const webhookUrl = process.env.N8N_SIGNUP_WEBHOOK_URL
    const idempotencyKey = typeof body.user_id === 'string' ? body.user_id : ''

    if (!webhookUrl) {
      console.error('N8N_SIGNUP_WEBHOOK_URL not configured')
      return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 })
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getN8nWebhookHeaders(),
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Signup webhook error:', error)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
