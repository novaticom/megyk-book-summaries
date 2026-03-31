'use client';

import { useTranslations } from 'next-intl';
import { Paper, Group, Text, Button, Stack, ThemeIcon, Badge, Box } from '@mantine/core';
import { IconDownload, IconCheck, IconDeviceMobile } from '@tabler/icons-react';
import { useInstallPrompt } from './useInstallPrompt';

export function InstallAppSection() {
  const t = useTranslations('pwa');
  const { isInstallable, isInstalled, isIOS, install } = useInstallPrompt();

  const handleInstall = async () => {
    if (!isIOS) {
      await install();
    }
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size="xl" radius="md" variant="light">
            <IconDeviceMobile size={24} />
          </ThemeIcon>
          <Stack gap={4}>
            <Group gap="xs">
              <Text fw={600}>{t('section.title')}</Text>
              {isInstalled && (
                <Badge color="green" size="sm" variant="light" leftSection={<IconCheck size={12} />}>
                  {t('section.installed')}
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {isInstalled
                ? t('section.installedMessage')
                : t('section.installMessage')}
            </Text>
          </Stack>
        </Group>

        {!isInstalled && !isIOS && (
          <Button
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={handleInstall}
            disabled={!isInstallable}
          >
            {t('banner.install')}
          </Button>
        )}
      </Group>

      {!isInstalled && isIOS && (
        <Box mt="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
          <Text size="sm" fw={500} mb="xs">
            {t('section.iosInstructions')}
          </Text>
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              {t('section.iosStep1')} <Box component="span" style={{ display: 'inline-block', border: '1px solid #ccc', borderRadius: 4, padding: '0 4px', fontSize: 12 }}>↑</Box>
            </Text>
            <Text size="sm" c="dimmed">
              {t('section.iosStep2')}
            </Text>
          </Stack>
        </Box>
      )}

      {!isInstalled && !isIOS && !isInstallable && (
        <Text size="xs" c="dimmed" mt="sm">
          {t('section.openOnMobile')}
        </Text>
      )}
    </Paper>
  );
}
