'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Container, Paper, Title, Text, Button, Stack, Alert, Loader } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import Link from 'next/link'

function ErrorContent() {
  const searchParams = useSearchParams()
  const t = useTranslations('auth')
  const message = searchParams.get('message') || t('error.subtitle')

  return (
    <Alert icon={<IconAlertCircle size={16} />} color="red">
      {message}
    </Alert>
  )
}

export default function AuthErrorPage() {
  const t = useTranslations('auth')

  return (
    <Container size="xs" py="xl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper shadow="md" p="xl" radius="md" withBorder style={{ width: '100%' }}>
        <Stack gap="lg">
          <div>
            <Title order={2} mb="xs">{t('error.title')}</Title>
            <Text c="dimmed" size="sm">
              {t('error.subtitle')}
            </Text>
          </div>

          <Suspense fallback={
            <Alert icon={<Loader size={16} />} color="gray">
              {t('error.loadingDetails')}
            </Alert>
          }>
            <ErrorContent />
          </Suspense>

          <Stack gap="sm">
            <Button component={Link} href="/auth/signin" fullWidth>
              {t('error.backToSignIn')}
            </Button>
            <Button component={Link} href="/" variant="outline" fullWidth>
              {t('error.goToHomepage')}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  )
}
