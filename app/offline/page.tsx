'use client';

import { Container, Center, Stack, Title, Text, Button } from '@mantine/core';
import { useTranslations } from 'next-intl';
import { IconWifiOff } from '@tabler/icons-react';

export default function OfflinePage() {
  const t = useTranslations('offline');

  return (
    <Container size="sm" py="xl">
      <Center style={{ minHeight: '60vh' }}>
        <Stack align="center" gap="lg" ta="center">
          <IconWifiOff size={64} stroke={1.5} style={{ opacity: 0.5 }} />
          <Title order={1}>{t('title')}</Title>
          <Text size="lg" c="dimmed" maw={400}>
            {t('description')}
          </Text>
          <Button variant="filled" onClick={() => window.location.reload()}>
            {t('retry')}
          </Button>
        </Stack>
      </Center>
    </Container>
  );
}
