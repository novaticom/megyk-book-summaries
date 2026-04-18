'use client'

import { Button, Group, Text, Box } from '@mantine/core'
import { useTranslations, useLocale } from 'next-intl'
import { IconMessage, IconTrash } from '@tabler/icons-react'
import { ChatSessionWithBook } from '@/lib/types/chat'

interface ChatHistoryRowProps {
  session: ChatSessionWithBook
  onResume: () => void
  onDelete: () => void
  isDeleting?: boolean
}

export function ChatHistoryRow({
  session,
  onResume,
  onDelete,
  isDeleting = false
}: ChatHistoryRowProps) {
  const t = useTranslations('chatHistory')
  const tCard = useTranslations('chatCard')
  const locale = useLocale()

  const formatDate = (dateString: string | null) => {
    if (!dateString) return tCard('noMessages')
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Box
      style={{
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '12px',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <IconMessage size={20} style={{ color: '#6b7280', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <Text fw={500} c="dark" size="sm">
              {t('title')}
            </Text>
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                {t('messageCount', { count: session.message_count })}
              </Text>
              <Text size="xs" c="dimmed">•</Text>
              <Text size="xs" c="dimmed">
                {t('lastMessage', { date: formatDate(session.last_message_at) })}
              </Text>
            </Group>
          </div>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="filled"
            color="blue"
            onClick={onResume}
          >
            {t('resumeChat')}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            onClick={onDelete}
            loading={isDeleting}
            disabled={isDeleting}
            style={{ color: '#9ca3af' }}
          >
            <IconTrash size={14} />
          </Button>
        </Group>
      </Group>
    </Box>
  )
}
