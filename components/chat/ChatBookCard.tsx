'use client'

import { Box, Text, Image, Group, Button } from '@mantine/core'
import { useTranslations, useLocale } from 'next-intl'
import { IconMessage } from '@tabler/icons-react'
import { ChatSessionWithBook } from '@/lib/types/chat'
import { getDisplayTitle } from '@/lib/utils/bookTitle'

interface ChatBookCardProps {
  session: ChatSessionWithBook
  onClick: () => void
}

const getBookCoverPlaceholder = (book: any) => {
  if (book?.cover_image_url) {
    return book.cover_image_url
  }

  const colors = ['3B82F6', '10B981', 'F59E0B', 'EF4444', '8B5CF6', '06B6D4']
  const displayTitle = getDisplayTitle(book?.title) || book?.title || 'Book'
  const colorIndex = displayTitle.length % colors.length

  return `https://placehold.co/300x450/${colors[colorIndex]}/ffffff?text=${encodeURIComponent(displayTitle.slice(0, 20))}`
}

const getFallbackPlaceholder = () => {
  return `https://placehold.co/300x450/64748B/ffffff?text=${encodeURIComponent('Book Cover')}`
}

export function ChatBookCard({ session, onClick }: ChatBookCardProps) {
  const t = useTranslations('chatCard')
  const locale = useLocale()

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('noMessages')
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    })
  }

  const displayTitle = getDisplayTitle(session.book?.title) || session.book?.title || t('noMessages')

  return (
    <Box
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        background: '#ffffff',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Book Cover */}
      <Box style={{ position: 'relative', aspectRatio: '2/3', overflow: 'hidden' }}>
        <Image
          src={getBookCoverPlaceholder(session.book)}
          fallbackSrc={getFallbackPlaceholder()}
          alt={`Cover of ${displayTitle}`}
          fit="cover"
          h="100%"
          w="100%"
                  />
        {/* Overlay gradient for text readability */}
        <Box
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '50%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
          }}
        />
        {/* Last chat date badge */}
        <Box
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            right: '12px',
          }}
        >
          <Group gap={4} align="center">
            <IconMessage size={14} style={{ color: 'white' }} />
            <Text size="xs" c="white" fw={500}>
              {t('lastMessage', { date: formatDate(session.last_message_at) })}
            </Text>
          </Group>
        </Box>
      </Box>

      {/* Card Footer */}
      <Box p="sm">
        <Text fw={600} size="sm" lineClamp={2} mb={4} style={{ minHeight: '2.5em' }}>
          {displayTitle}
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          {session.book?.author || ''}
        </Text>
        <Button
          size="xs"
          variant="light"
          color="blue"
          fullWidth
          leftSection={<IconMessage size={14} />}
          onClick={(e) => {
            e.stopPropagation() // Prevent double-firing
            onClick()
          }}
        >
          {t('continueChatting')}
        </Button>
      </Box>
    </Box>
  )
}
