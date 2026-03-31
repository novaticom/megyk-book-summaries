import { getTranslations } from 'next-intl/server'
import { Container, Title, Text, Stack } from '@mantine/core'
import { PreferencesForm } from '@/components/preferences/PreferencesForm'

export default async function PreferencesPage() {
  const t = await getTranslations('preferences')

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

        <PreferencesForm />
      </Stack>
    </Container>
  )
}
