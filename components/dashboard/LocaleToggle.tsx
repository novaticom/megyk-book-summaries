'use client';

import { useLocale } from 'next-intl';
import { SegmentedControl, Text } from '@mantine/core';

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
    <SegmentedControl
      value={locale}
      onChange={setLocale}
      data={LOCALES}
      size="sm"
      mt={4}
    />
  );
}
