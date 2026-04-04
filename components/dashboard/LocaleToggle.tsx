'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { SegmentedControl, Text, Group, Skeleton } from '@mantine/core';

const LOCALES = [
  { value: 'en', label: <Text style={{ fontSize: 18, lineHeight: 1 }}>🇺🇸</Text> },
  { value: 'de', label: <Text style={{ fontSize: 18, lineHeight: 1 }}>🇩🇪</Text> },
];

interface LocaleToggleProps {
  compact?: boolean;
}

export function LocaleToggle({ compact = false }: LocaleToggleProps) {
  const [mounted, setMounted] = useState(false);
  const locale = useLocale();

  useEffect(() => {
    setMounted(true);
  }, []);

  const setLocale = (code: string) => {
    document.cookie = `locale=${code}; max-age=31536000; path=/`;
    window.location.reload();
  };

  // Prevent hydration mismatch by only rendering after mount
  if (!mounted) {
    if (compact) {
      return <Skeleton height={24} width={70} radius="sm" />;
    }
    return (
      <Group gap="xs" align="center" mt={4} px={4}>
        <Skeleton height={28} width={80} radius="sm" />
        <Text size="sm" c="dimmed">Language</Text>
      </Group>
    );
  }

  if (compact) {
    return (
      <SegmentedControl
        value={locale}
        onChange={setLocale}
        data={LOCALES}
        size="xs"
      />
    );
  }

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
