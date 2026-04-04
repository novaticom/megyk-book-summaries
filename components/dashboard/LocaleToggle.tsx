'use client';

import { useLocale } from 'next-intl';
import { Group, UnstyledButton, Text } from '@mantine/core';

const LOCALES = [
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
] as const;

export function LocaleToggle() {
  const locale = useLocale();

  const setLocale = (code: string) => {
    if (code === locale) return;
    document.cookie = `locale=${code}; max-age=31536000; path=/`;
    window.location.reload();
  };

  return (
    <Group gap={4} px={4} pt={4}>
      {LOCALES.map(({ code, flag, label }) => {
        const active = locale === code;
        return (
          <UnstyledButton
            key={code}
            onClick={() => setLocale(code)}
            title={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 8,
              border: active ? '2px solid #2563EB' : '2px solid transparent',
              backgroundColor: active ? '#EFF6FF' : 'transparent',
              opacity: active ? 1 : 0.5,
              transition: 'all 0.15s ease',
              cursor: active ? 'default' : 'pointer',
            }}
          >
            <Text style={{ fontSize: 20, lineHeight: 1 }}>{flag}</Text>
            <Text size="sm" fw={active ? 600 : 400} c={active ? '#2563EB' : 'dimmed'}>
              {label}
            </Text>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
