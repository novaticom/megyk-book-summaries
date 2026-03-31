'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Container, Paper, Title, Text, TextInput, PasswordInput, Button, Stack, Anchor, Alert, Loader, Center, Badge, Group } from '@mantine/core'
import { IconAlertCircle, IconCheck, IconGift } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { useUTMTracking } from '@/hooks/useUTMTracking'
import { trackSignUp } from '@/lib/analytics/gtm'
import { REFERRAL_CODE_PARAM, REFERRAL_CODE_COOKIE, REFERRAL_COOKIE_MAX_AGE, REFERRAL_REWARDS } from '@/lib/types/referral'

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('auth')
  const { utmParams } = useUTMTracking()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [referralValidated, setReferralValidated] = useState(false)
  const [referralValidating, setReferralValidating] = useState(false)

  // Capture and validate referral code from URL
  useEffect(() => {
    const code = searchParams.get(REFERRAL_CODE_PARAM)
    if (code && !referralCode) {
      validateReferralCode(code)
    }
  }, [searchParams])

  const validateReferralCode = async (code: string) => {
    setReferralValidating(true)
    try {
      const response = await fetch(`/api/v1/referrals/validate?code=${encodeURIComponent(code)}`)
      const data = await response.json()

      if (data.valid) {
        setReferralCode(data.code)
        setReferralValidated(true)
        // Store in cookie for the email verification flow
        document.cookie = `${REFERRAL_CODE_COOKIE}=${data.code}; path=/; max-age=${REFERRAL_COOKIE_MAX_AGE}; SameSite=Lax`
      }
    } catch (err) {
      console.error('Failed to validate referral code:', err)
    } finally {
      setReferralValidating(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    // Validate passwords match
    if (password !== confirmPassword) {
      setError(t('signUp.passwordMismatch'))
      setLoading(false)
      return
    }

    // Validate password length
    if (password.length < 6) {
      setError(t('signUp.passwordTooShort'))
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const emailRedirectUrl = new URL('/auth/confirm', window.location.origin)
      console.log('[UTM] signup utmParams:', utmParams)
      if (utmParams) {
        Object.entries(utmParams).forEach(([key, value]) => {
          if (value) {
            emailRedirectUrl.searchParams.set(key, value)
          }
        })
      }
      // Include referral code in redirect URL so it survives cross-device verification
      if (referralCode) {
        emailRedirectUrl.searchParams.set(REFERRAL_CODE_PARAM, referralCode)
      }
      console.log('[UTM] emailRedirectTo:', emailRedirectUrl.toString())

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: emailRedirectUrl.toString(),
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      // Call n8n webhook after successful signup
      try {
        await fetch('/api/webhook/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'user_signup',
            email: data.user?.email,
            user_id: data.user?.id,
            utm: utmParams,
          }),
        })
      } catch (webhookError) {
        console.error('Signup webhook failed:', webhookError)
        // Don't fail the signup if webhook fails
      }

      // Track successful signup
      trackSignUp({
        method: 'email',
        has_referral: !!referralCode,
      })

      // Check if email confirmation is required
      if (data.user && !data.user.confirmed_at) {
        setSuccess(true)
        // Don't redirect - user needs to confirm email first
      } else {
        // Auto-confirm is enabled, redirect to dashboard
        setSuccess(true)
        setTimeout(() => {
          router.push('/dashboard')
          router.refresh()
        }, 2000)
      }
    } catch (err) {
      setError(t('signUp.unexpectedError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size="xs" py="xl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper shadow="md" p="xl" radius="md" withBorder style={{ width: '100%' }}>
        <Stack gap="lg">
          <div>
            <Group justify="space-between" align="flex-start" mb="xs">
              <Title order={2}>{t('signUp.title')}</Title>
              {referralValidating && (
                <Loader size="xs" />
              )}
              {referralValidated && referralCode && (
                <Badge
                  color="green"
                  variant="light"
                  size="lg"
                  leftSection={<IconGift size={14} />}
                >
                  {t('signUp.referralApplied')}
                </Badge>
              )}
            </Group>
            <Text c="dimmed" size="sm">
              {t('signUp.subtitle')}
            </Text>
            {referralValidated && referralCode && (
              <Text size="sm" c="green" mt="xs">
                {t('signUp.referralBonus', { bonus: REFERRAL_REWARDS.referred_bonus.toLocaleString() })}
              </Text>
            )}
          </div>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}

          {success && (
            <Alert icon={<IconCheck size={16} />} color="green" title="Success!">
              {t('signUp.success')}
            </Alert>
          )}

          <form onSubmit={handleSignUp}>
            <Stack gap="md">
              <TextInput
                label={t('signUp.email')}
                placeholder={t('signUp.emailPlaceholder')}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <PasswordInput
                label={t('signUp.password')}
                placeholder={t('signUp.passwordPlaceholder')}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <PasswordInput
                label={t('signUp.confirmPassword')}
                placeholder={t('signUp.confirmPasswordPlaceholder')}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <Button type="submit" fullWidth loading={loading} disabled={success}>
                {t('signUp.submit')}
              </Button>
            </Stack>
          </form>

          <Text size="sm" ta="center">
            {t('signUp.hasAccount')}{' '}
            <Anchor href="/auth/signin" fw={500}>
              {t('signUp.signInLink')}
            </Anchor>
          </Text>
        </Stack>
      </Paper>
    </Container>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <Container size="xs" py="xl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        <Center style={{ width: '100%' }}>
          <Loader />
        </Center>
      </Container>
    }>
      <SignUpForm />
    </Suspense>
  )
}
