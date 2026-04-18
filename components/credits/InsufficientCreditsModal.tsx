'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Modal, Stack, Text, Button, Group, ThemeIcon, Box, Paper, TextInput, Tooltip } from '@mantine/core'
import { IconCoins, IconAlertCircle, IconGift, IconSend, IconCheck, IconCopy, IconLoader2 } from '@tabler/icons-react'
import { formatCredits } from '@/lib/types/credits'
import { REFERRAL_REWARDS } from '@/lib/types/referral'

interface InsufficientCreditsModalProps {
  opened: boolean
  onClose: () => void
  requiredCredits: number
  currentBalance: number
  actionName?: string
}

export function InsufficientCreditsModal({
  opened,
  onClose,
  requiredCredits,
  currentBalance,
  actionName = 'this action',
}: InsufficientCreditsModalProps) {
  const t = useTranslations('credits.insufficient')
  const tCommon = useTranslations('common')
  const shortfall = requiredCredits - currentBalance

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [referralLink, setReferralLink] = useState<string | null>(null)

  // Fetch referral link on first render if not already fetched
  const fetchReferralLink = async () => {
    if (referralLink) return referralLink
    try {
      const response = await fetch('/api/v1/referrals')
      if (response.ok) {
        const data = await response.json()
        setReferralLink(data.stats?.referral_link || null)
        return data.stats?.referral_link
      }
    } catch (err) {
      console.error('Failed to fetch referral link:', err)
    }
    return null
  }

  const handleSendInvite = async () => {
    if (!email.trim()) {
      setError(t('emailRequired'))
      return
    }

    setSending(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/v1/referrals/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || t('inviteError'))
        return
      }

      setSuccess(t('inviteSent', { email }))
      setEmail('')
      setName('')

      // Clear success after 3 seconds to allow another invite
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(t('inviteError'))
    } finally {
      setSending(false)
    }
  }

  const handleCopyLink = async () => {
    const link = await fetchReferralLink()
    if (link) {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !sending && email.trim()) {
      handleSendInvite()
    }
  }

  // Reset state when modal closes
  const handleClose = () => {
    setEmail('')
    setName('')
    setError(null)
    setSuccess(null)
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="red" variant="light" size="lg">
            <IconAlertCircle size={20} />
          </ThemeIcon>
          <Text size="lg" fw={600}>
            {t('title')}
          </Text>
        </Group>
      }
      centered
      size="md"
      zIndex={1500}
    >
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {t('description', { action: actionName })}
        </Text>

        <Box
          p="md"
          style={{
            backgroundColor: 'var(--mantine-color-gray-0)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">{t('required')}</Text>
              <Text size="sm" fw={600} c="red">{formatCredits(requiredCredits)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">{t('balance')}</Text>
              <Text size="sm" fw={600}>{formatCredits(currentBalance)}</Text>
            </Group>
            <Box
              style={{
                borderTop: '1px solid var(--mantine-color-gray-3)',
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{t('shortfall')}</Text>
                <Text size="sm" fw={700} c="red">{formatCredits(shortfall)}</Text>
              </Group>
            </Box>
          </Stack>
        </Box>

        {/* Inline Invite Form */}
        <Paper
          p="md"
          radius="md"
          style={{
            background: 'linear-gradient(135deg, var(--mantine-color-blue-0) 0%, var(--mantine-color-blue-1) 100%)',
            border: '1px solid var(--mantine-color-blue-2)',
          }}
        >
          <Group gap="sm" mb="md" wrap="nowrap">
            <ThemeIcon size="lg" radius="md" variant="light" color="blue">
              <IconGift size={20} />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={600}>
                {t('referralEarn', { bonus: REFERRAL_REWARDS.referrer_bonus.toLocaleString() })}
              </Text>
              <Text size="xs" c="dimmed">
                {t('referralTheyGet', { bonus: REFERRAL_REWARDS.referred_bonus.toLocaleString() })}
              </Text>
            </div>
          </Group>

          {success ? (
            <Box
              p="md"
              style={{
                backgroundColor: 'var(--mantine-color-green-0)',
                borderRadius: 'var(--mantine-radius-md)',
                border: '1px solid var(--mantine-color-green-3)',
              }}
            >
              <Group gap="xs">
                <IconCheck size={18} color="var(--mantine-color-green-6)" />
                <Text size="sm" fw={500} c="green">
                  {success}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt="xs">
                {t('inviteAnother')}
              </Text>
            </Box>
          ) : (
            <Stack gap="sm">
              <Group gap="sm" grow>
                <TextInput
                  placeholder={t('friendEmail')}
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  error={error}
                  size="sm"
                  style={{ flex: 2 }}
                />
                <TextInput
                  placeholder={t('friendName')}
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  size="sm"
                  style={{ flex: 1 }}
                />
              </Group>

              <Button
                variant="gradient"
                gradient={{ from: 'violet', to: 'indigo' }}
                leftSection={sending ? <IconLoader2 size={18} className="animate-spin" /> : <IconSend size={18} />}
                onClick={handleSendInvite}
                disabled={sending || !email.trim()}
                fullWidth
              >
                {sending ? t('sending') : t('sendInvite')}
              </Button>
            </Stack>
          )}

          {/* Copy link fallback */}
          <Group justify="center" mt="md" gap="xs">
            <Text size="xs" c="dimmed">{tCommon('or')}</Text>
            <Tooltip label={copied ? tCommon('copied') : tCommon('copyLink')}>
              <Button
                variant="subtle"
                size="xs"
                color={copied ? 'green' : 'gray'}
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                onClick={handleCopyLink}
              >
                {copied ? tCommon('copied') : tCommon('copyLink')}
              </Button>
            </Tooltip>
          </Group>
        </Paper>

        <Text size="xs" c="dimmed" ta="center">
          {t('plansComingSoon')}
        </Text>

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>
            {t('close')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
