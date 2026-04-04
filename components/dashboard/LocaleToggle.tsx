'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Group, UnstyledButton, Text } from '@mantine/core';

const LOCALES = [
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
] as const;

export function LocaleToggle() {
  const locale = useLocale();
  const router = useRouter();

  const setLocale = (code: string) => {
    if (code === locale) return;
    document.cookie = `locale=${code}; max-age=31536000; path=/`;
    router.refresh();
  };

  return (
    <Group gap={6} justify="center">
      {LOCALES.map(({ code, flag, label }) => {
        const active = locale === code;
        return (
          <UnstyledButton
            key={code}
            onClick={() => setLocale(code)}
            title={label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 10px',
              borderRadius: 8,
              border: active ? '2px solid #2563EB' : '2px solid transparent',
              backgroundColor: active ? '#EFF6FF' : 'transparent',
              opacity: active ? 1 : 0.5,
              transition: 'all 0.15s ease',
              cursor: active ? 'default' : 'pointer',
            }}
          >
            <Text style={{ fontSize: 22, lineHeight: 1 }}>{flag}</Text>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
