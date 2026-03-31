import { Container, Title, Text, Button, Stack } from '@mantine/core';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <Container size="sm" py="xl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Stack align="center" gap="lg" ta="center">
        <Title order={1} size="4rem" fw={800} c="#000000">
          {t('code')}
        </Title>
        <Title order={2} c="#374151">
          {t('title')}
        </Title>
        <Text size="lg" c="#374151" maw={400}>
          {t('description')}
        </Text>
        <Stack gap="sm" mt="md">
          <Button
            component={Link}
            href="/"
            size="lg"
            style={{
              fontWeight: 600,
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
            }}
          >
            {t('goHome')}
          </Button>
          <Button
            component={Link}
            href="/dashboard"
            size="lg"
            variant="outline"
            c="#000000"
            style={{
              borderColor: '#374151',
              color: '#000000',
              fontWeight: 600
            }}
          >
            {t('goToDashboard')}
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
