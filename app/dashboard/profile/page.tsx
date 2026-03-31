'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Container, Title, Text, Stack, Card, TextInput, PasswordInput, Button, Alert } from '@mantine/core'
import { IconAlertCircle, IconCheck } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase/client'
import { InstallAppSection } from '@/components/pwa'
import { ReferralShareSection } from '@/components/referral'

export default function ProfilePage() {
  const t = useTranslations('profile')
  const [email, setEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      setEmail(user.email || '')
      setNewEmail(user.email || '')
    }
  }

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        email: newEmail
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccess(t('email.success'))
      setEmail(newEmail)
    } catch (err) {
      setError(t('email.unexpectedError'))
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingPassword(true)
    setPasswordError(null)
    setPasswordSuccess(null)

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setPasswordError(t('password.mismatch'))
      setLoadingPassword(false)
      return
    }

    // Validate password length
    if (newPassword.length < 6) {
      setPasswordError(t('password.tooShort'))
      setLoadingPassword(false)
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        setPasswordError(error.message)
        return
      }

      setPasswordSuccess(t('password.success'))
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(t('email.unexpectedError'))
    } finally {
      setLoadingPassword(false)
    }
  }

  return (
    <Container size="xl" pt="0" pb="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} mb="xs">
            {t('title')}
          </Title>
          <Text size="lg" c="dimmed">
            {t('subtitle')}
          </Text>
        </div>

        {/* Referral Section */}
        <ReferralShareSection />

        {/* Email Update Section */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text fw={600} size="lg" mb="xs">
                {t('email.title')}
              </Text>
              <Text size="sm" c="dimmed">
                {t('email.subtitle')}
              </Text>
            </div>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
                {error}
              </Alert>
            )}

            {success && (
              <Alert icon={<IconCheck size={16} />} color="green" title="Success">
                {success}
              </Alert>
            )}

            <form onSubmit={handleUpdateEmail}>
              <Stack gap="md">
                <TextInput
                  label={t('email.current')}
                  value={email}
                  disabled
                  description={t('email.currentPlaceholder')}
                />

                <TextInput
                  label={t('email.new')}
                  type="email"
                  placeholder={t('email.newPlaceholder')}
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />

                <Button type="submit" loading={loading} disabled={newEmail === email}>
                  {t('email.submit')}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card>

        {/* Password Update Section */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text fw={600} size="lg" mb="xs">
                {t('password.title')}
              </Text>
              <Text size="sm" c="dimmed">
                {t('password.subtitle')}
              </Text>
            </div>

            {passwordError && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
                {passwordError}
              </Alert>
            )}

            {passwordSuccess && (
              <Alert icon={<IconCheck size={16} />} color="green" title="Success">
                {passwordSuccess}
              </Alert>
            )}

            <form onSubmit={handleUpdatePassword}>
              <Stack gap="md">
                <PasswordInput
                  label={t('password.new')}
                  placeholder={t('password.newPlaceholder')}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <PasswordInput
                  label={t('password.confirm')}
                  placeholder={t('password.confirmPlaceholder')}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />

                <Button type="submit" loading={loadingPassword}>
                  {t('password.submit')}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card>

        {/* Install App Section */}
        <InstallAppSection />
      </Stack>
    </Container>
  )
}
