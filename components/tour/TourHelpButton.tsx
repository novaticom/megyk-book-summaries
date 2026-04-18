'use client';

import { NavLink } from '@mantine/core';
import { IconHelp } from '@tabler/icons-react';
import { useNextStep } from 'nextstepjs';
import { useTranslations } from 'next-intl';

export function TourHelpButton() {
  const { startNextStep } = useNextStep();

  const t = useTranslations('tour');

  const handleClick = () => {
    // Only desktop tour - mobile tour disabled due to positioning issues
    startNextStep('dashboard_desktop');
  };

  return (
    <NavLink
      label={t('help')}
      leftSection={<IconHelp size={20} stroke={1.5} />}
      onClick={handleClick}
      color="blue"
      style={{ cursor: 'pointer' }}
    />
  );
}
