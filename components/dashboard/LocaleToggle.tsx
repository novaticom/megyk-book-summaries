'use client';

import { useLocale } from 'next-intl';
import { SegmentedControl, Text, Group } from '@mantine/core';

const LOCALES = [
  { value: 'en', label: <Text style={{ fontSize: 18, lineHeight: 1 }}>🇺🇸</Text> },
  { value: 'de', label: <Text style={{ fontSize: 18, lineHeight: 1 }}>🇩🇪</Text> },
];

export function LocaleToggle() {
  const locale = useLocale();

  const setLocale = (code: string) => {
    document.cookie = `locale=${code}; max-age=31536000; path=/`;
    window.location.reload();
  };

  return (
    <Group gap="xs" align="center" mt={4} px={4}>
      <SegmentedControl
        value={locale}
        onChange={setLocale}
        data={LOCALES}
        size="sm"
      />
      <Text size="sm" c="dimmed">Language</Text>
    </Group>
  );
}
