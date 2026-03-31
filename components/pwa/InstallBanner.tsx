'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Paper, Group, Text, Button, CloseButton, Stack, Box } from '@mantine/core';
import { IconDownload, IconDeviceMobile } from '@tabler/icons-react';
import { useInstallPrompt } from './useInstallPrompt';

export function InstallBanner() {
  const t = useTranslations('pwa');
  const { isInstallable, isIOS, install, dismiss, isDismissed, isInstalled } = useInstallPrompt();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  // Don't show if already installed, dismissed, or not installable
  if (isInstalled || isDismissed || !isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
    } else {
      await install();
    }
  };

  if (showIOSInstructions) {
    return (
      <Paper
        shadow="lg"
        p="md"
        radius="md"
        withBorder
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          right: 16,
          zIndex: 1000,
          maxWidth: 400,
          margin: '0 auto',
        }}
      >
        <Group justify="space-between" align="flex-start" mb="xs">
          <Text fw={600} size="sm">{t('banner.title')}</Text>
          <CloseButton size="sm" onClick={() => setShowIOSInstructions(false)} />
        </Group>
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {t('banner.iosInstructions')}
          </Text>
          <Text size="sm">
            {t('banner.iosStep1')} <Box component="span" style={{ display: 'inline-block', border: '1px solid #ccc', borderRadius: 4, padding: '0 4px', fontSize: 12 }}>↑</Box>
          </Text>
          <Text size="sm">
            {t('banner.iosStep2')}
          </Text>
          <Button variant="light" size="xs" mt="xs" onClick={dismiss}>
            {t('banner.gotIt')}
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper
      shadow="lg"
      p="sm"
      radius="md"
      withBorder
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 1000,
        maxWidth: 400,
        margin: '0 auto',
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <IconDeviceMobile size={24} style={{ flexShrink: 0, opacity: 0.7 }} />
          <Text size="sm" lineClamp={2}>
            {t('banner.installPrompt')}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="filled"
            leftSection={<IconDownload size={14} />}
            onClick={handleInstall}
          >
            {t('banner.install')}
          </Button>
          <CloseButton size="sm" onClick={dismiss} />
        </Group>
      </Group>
    </Paper>
  );
}
