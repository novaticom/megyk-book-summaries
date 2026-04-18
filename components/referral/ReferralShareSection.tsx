'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  Card,
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  SimpleGrid,
  ThemeIcon,
  Skeleton,
  Alert,
  Tooltip,
  Box,
  Paper,
} from '@mantine/core'
import {
  IconShare,
  IconCopy,
  IconCheck,
  IconUsers,
  IconClock,
  IconCoins,
  IconGift,
  IconAlertCircle,
} from '@tabler/icons-react'
import { ReferralStats, REFERRAL_REWARDS } from '@/lib/types/referral'
import { trackReferralLinkCopied, trackReferralLinkShared } from '@/lib/analytics/gtm'

export function ReferralShareSection() {
  const t = useTranslations('referral')
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareSupported, setShareSupported] = useState(false)

  useEffect(() => {
    // Check if native share is supported
    setShareSupported(typeof navigator !== 'undefined' && !!navigator.share)
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/v1/referrals')

      if (!response.ok) {
        throw new Error('Failed to fetch referral stats')
      }

      const data = await response.json()
      setStats(data.stats)
    } catch (err) {
      console.error('Error fetching referral stats:', err)
      setError(t('loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = useCallback(async () => {
    if (!stats?.referral_link) return

    try {
      await navigator.clipboard.writeText(stats.referral_link)
      trackReferralLinkCopied()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [stats?.referral_link])

  const handleShare = useCallback(async () => {
    if (!stats?.referral_link || !navigator.share) return

    try {
      await navigator.share({
        title: 'Join Megyk Books',
        text: `Sign up for Megyk Books and start with ${REFERRAL_REWARDS.referred_bonus.toLocaleString()} bonus credits.`,
        url: stats.referral_link,
      })
      trackReferralLinkShared()
    } catch (err) {
      // User cancelled or share failed - not an error
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to share:', err)
      }
    }
  }, [stats?.referral_link])

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Skeleton height={24} width="40%" />
          <Skeleton height={16} width="60%" />
          <Skeleton height={40} />
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <Skeleton height={80} />
            <Skeleton height={80} />
            <Skeleton height={80} />
            <Skeleton height={80} />
          </SimpleGrid>
        </Stack>
      </Card>
    )
  }

  if (error) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
          {error}
        </Alert>
      </Card>
    )
  }

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs" mb={4}>
              <ThemeIcon size="md" radius="md" variant="light" color="blue">
                <IconGift size={18} />
              </ThemeIcon>
              <Text fw={600} size="lg">
                {t('title')}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {t('subtitle', { bonus: REFERRAL_REWARDS.referrer_bonus.toLocaleString() })}
            </Text>
          </div>
        </Group>

        {/* Referral Link */}
        <Group gap="xs" align="flex-end">
          <TextInput
            label={t('yourLink')}
            value={stats?.referral_link || ''}
            readOnly
            style={{ flex: 1 }}
            styles={{
              input: { fontFamily: 'monospace', fontSize: 13 },
            }}
          />
          <Tooltip label={copied ? t('copied') : t('copyLink')}>
            <Button
              variant={copied ? 'filled' : 'light'}
              color={copied ? 'green' : 'blue'}
              onClick={handleCopy}
            >
              {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
            </Button>
          </Tooltip>
          {shareSupported && (
            <Button variant="light" onClick={handleShare}>
              <IconShare size={18} />
            </Button>
          )}
        </Group>

        {/* Stats Grid */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <StatCard
            icon={<IconUsers size={20} />}
            label={t('totalInvited')}
            value={(stats?.pending || 0) + (stats?.successful || 0)}
            color="blue"
          />
          <StatCard
            icon={<IconClock size={20} />}
            label={t('pending')}
            value={stats?.pending || 0}
            color="yellow"
          />
          <StatCard
            icon={<IconCheck size={20} />}
            label={t('activated')}
            value={stats?.successful || 0}
            color="green"
          />
          <StatCard
            icon={<IconCoins size={20} />}
            label={t('creditsEarned')}
            value={`${(stats?.total_earned || 0).toLocaleString()} MC`}
            color="blue"
          />
        </SimpleGrid>

        {/* How it works */}
        <Paper p="md" radius="md" bg="gray.0" style={{ border: '1px solid var(--mantine-color-gray-2)' }}>
          <Text size="sm" fw={600} mb="xs">
            {t('howItWorks')}
          </Text>
          <Stack gap={6}>
            <Group gap="xs" wrap="nowrap">
              <Box w={20} ta="center">
                <Text size="sm" c="dimmed">1.</Text>
              </Box>
              <Text size="sm" c="dimmed">{t('step1')}</Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Box w={20} ta="center">
                <Text size="sm" c="dimmed">2.</Text>
              </Box>
              <Text size="sm" c="dimmed">{t('step2')}</Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Box w={20} ta="center">
                <Text size="sm" c="dimmed">3.</Text>
              </Box>
              <Text size="sm" c="dimmed">{t('step3')}</Text>
            </Group>
          </Stack>
          <Group gap="md" mt="md">
            <Group gap={4}>
              <IconGift size={14} color="var(--mantine-color-blue-5)" />
              <Text size="sm" fw={500}>{t('youGet', { bonus: REFERRAL_REWARDS.referrer_bonus.toLocaleString() })}</Text>
            </Group>
            <Group gap={4}>
              <IconGift size={14} color="var(--mantine-color-blue-5)" />
              <Text size="sm" fw={500}>{t('theyGet', { bonus: REFERRAL_REWARDS.referred_bonus.toLocaleString() })}</Text>
            </Group>
          </Group>
        </Paper>
      </Stack>
    </Card>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <Group gap="xs" mb={4}>
        <ThemeIcon size="sm" variant="light" color={color}>
          {icon}
        </ThemeIcon>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Group>
      <Text size="lg" fw={700}>
        {value}
      </Text>
    </Paper>
  )
}
