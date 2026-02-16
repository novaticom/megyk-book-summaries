import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createReferralService } from '@/lib/services/referrals'
import { REFERRAL_REWARDS, generateReferralLink } from '@/lib/types/referral'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email, name } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Prevent self-invite
    if (email.toLowerCase() === user.email?.toLowerCase()) {
      return NextResponse.json({ error: "You can't invite yourself!" }, { status: 400 })
    }

    // Get user's referral code
    const referralService = createReferralService(supabase)
    const referralCode = await referralService.getReferralCode(user.id)

    if (!referralCode) {
      return NextResponse.json({ error: 'Referral code not found' }, { status: 500 })
    }

    // Generate referral link
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.megyk.com'
    const referralLink = generateReferralLink(referralCode.code, baseUrl)

    // Get inviter's name/email for personalization
    const inviterName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'A friend'

    // Send the invite email
    const resend = new Resend(process.env.RESEND_API_KEY)

    const friendName = name || 'there'
    const subject = `${inviterName} invited you to join Megyk Books`

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 40px;">
    <img src="${baseUrl}/megyk-logo-no-book.png" alt="Megyk Books" style="height: 48px; width: auto;" />
  </div>

  <h1 style="color: #1a1a2e; font-size: 22px; font-weight: 600; margin-bottom: 24px;">${friendName}, you've been invited</h1>

  <p style="font-size: 15px; color: #4a4a68; margin-bottom: 24px;">
    <strong>${inviterName}</strong> thinks you'd benefit from Megyk Books — the strategy-first book summary app that turns essential reads into actionable insights for real decisions.
  </p>

  <div style="background-color: #f8f9fc; border-radius: 8px; padding: 24px; margin: 28px 0;">
    <p style="font-size: 16px; font-weight: 600; color: #1a1a2e; margin: 0 0 8px 0;">
      Start with ${REFERRAL_REWARDS.referred_bonus.toLocaleString()} bonus credits
    </p>
    <p style="font-size: 14px; color: #6b7280; margin: 0;">
      ${inviterName} receives ${REFERRAL_REWARDS.referrer_bonus.toLocaleString()} credits when you join.
    </p>
  </div>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${referralLink}" style="display: inline-block; background-color: #1a1a2e; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-weight: 500; font-size: 15px;">
      Get Started
    </a>
  </div>

  <p style="font-size: 13px; color: #9ca3af; margin-top: 32px;">
    Or copy this link: <a href="${referralLink}" style="color: #6b7280;">${referralLink}</a>
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 40px 0 24px 0;" />

  <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
    Megyk Books — Strategy-first book summaries for executives<br />
    <a href="https://megyk.com" style="color: #9ca3af; text-decoration: none;">megyk.com</a>
  </p>
</body>
</html>
`

    const text = `
${friendName}, you've been invited

${inviterName} thinks you'd benefit from Megyk Books — the strategy-first book summary app that turns essential reads into actionable insights for real decisions.

Start with ${REFERRAL_REWARDS.referred_bonus.toLocaleString()} bonus credits. ${inviterName} receives ${REFERRAL_REWARDS.referrer_bonus.toLocaleString()} credits when you join.

Get started: ${referralLink}

Megyk Books — Strategy-first book summaries for executives
megyk.com
`

    const { data, error } = await resend.emails.send({
      from: 'Megyk Books <noreply@megyk.com>',
      to: email,
      subject,
      html,
      text,
    })

    if (error) {
      console.error('Resend API error:', error)
      return NextResponse.json({ error: 'Failed to send invite email' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${email}`,
      messageId: data?.id,
    })
  } catch (error) {
    console.error('Error sending invite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
