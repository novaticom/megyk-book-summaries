'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Container, Paper, Title, Text, TextInput, PasswordInput, Button, Stack, Anchor, Alert } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { trackLogin } from '@/lib/analytics/gtm'

export default function SignInPage() {
  const router = useRouter()
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // Provide more helpful error messages
        if (error.message.includes('Email not confirmed')) {
          setError(t('signIn.verifyEmailNotice'))
        } else {
          setError(error.message)
        }
        return
      }

      // Track successful login
      trackLogin({ method: 'email' })

      // Redirect to dashboard on success
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(t('signIn.unexpectedError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size="xs" py="xl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper shadow="md" p="xl" radius="md" withBorder style={{ width: '100%' }}>
        <Stack gap="lg">
          <div>
            <Title order={2} mb="xs">{t('signIn.title')}</Title>
            <Text c="dimmed" size="sm">
              {t('signIn.subtitle')}
            </Text>
          </div>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSignIn}>
            <Stack gap="md">
              <TextInput
                label={t('signIn.email')}
                placeholder={t('signIn.emailPlaceholder')}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <PasswordInput
                label={t('signIn.password')}
                placeholder={t('signIn.passwordPlaceholder')}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <Button type="submit" fullWidth loading={loading}>
                {t('signIn.submit')}
              </Button>
            </Stack>
          </form>

          <Text size="sm" ta="center">
            {t('signIn.noAccount')}{' '}
            <Anchor href="/auth/signup" fw={500}>
              {t('signIn.signUpLink')}
            </Anchor>
          </Text>
        </Stack>
      </Paper>
    </Container>
  )
}
