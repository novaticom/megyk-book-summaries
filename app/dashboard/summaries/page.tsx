'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { Container, Title, Text, Stack, Card, Center, Button, Group, Badge, Loader, Table, SimpleGrid, Box, Image, Divider } from '@mantine/core'
import { IconBookmark, IconDownload, IconTrash, IconMessage } from '@tabler/icons-react'
import { SummaryWithBook } from '@/lib/types/summaries'
import { ChatSessionWithBook } from '@/lib/types/chat'
import { ChatBookCard } from '@/components/chat/ChatBookCard'
import { ChatWithBook } from '@/components/chat/ChatWithBook'
import { getDisplayTitle } from '@/lib/utils/bookTitle'
import { trackSummaryDownloaded } from '@/lib/analytics/gtm'
import styles from './summaries.module.css'

// Helper functions for book covers
const getBookCoverPlaceholder = (book: any) => {
  if (book?.cover_image_url) {
    return book.cover_image_url;
  }

  // Generate a consistent color based on book title
  const colors = ['3B82F6', '10B981', 'F59E0B', 'EF4444', '8B5CF6', '06B6D4'];
  const displayTitle = getDisplayTitle(book?.title) || book?.title || 'Book';
  const colorIndex = displayTitle.length % colors.length;

  return `https://placehold.co/300x450/${colors[colorIndex]}/ffffff?text=${encodeURIComponent(displayTitle.slice(0, 20))}`;
};

const getFallbackPlaceholder = (book: any) => {
  return `https://placehold.co/300x450/64748B/ffffff?text=${encodeURIComponent('Book Cover')}`;
};

export default function SummariesPage() {
  const t = useTranslations('summaries')
  const tCommon = useTranslations('common')
  const tPrefs = useTranslations('preferences')
  const locale = useLocale()
  const [summaries, setSummaries] = useState<SummaryWithBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [chatSessions, setChatSessions] = useState<ChatSessionWithBook[]>([])
  const [chatBook, setChatBook] = useState<any>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [loadChatHistory, setLoadChatHistory] = useState(false)

  useEffect(() => {
    fetchSummaries()
    fetchChatSessions()
  }, [])

  const fetchSummaries = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/summaries')

      if (!response.ok) {
        throw new Error('Failed to fetch summaries')
      }

      const data = await response.json()
      setSummaries(data.summaries || [])
    } catch (err) {
      console.error('Error fetching summaries:', err)
      setError(t('loading'))
    } finally {
      setLoading(false)
    }
  }

  const fetchChatSessions = async () => {
    try {
      const response = await fetch('/api/v1/chat-sessions')
      if (response.ok) {
        const data = await response.json()
        setChatSessions(data.sessions || [])
      }
    } catch (err) {
      console.error('Error fetching chat sessions:', err)
    }
  }

  const handleDownload = async (summaryId: string, bookTitle: string, length: string, style: string) => {
    try {
      const response = await fetch(`/api/v1/summaries/${summaryId}/download`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))

        if (response.status === 404) {
          alert(t('fileNotFound'))
        } else {
          alert(t('downloadError', { error: errorData.error || 'Unknown error' }))
        }
        return
      }

      // Sanitize filename helper
      const sanitizeFilename = (str: string) => {
        return str
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .toLowerCase()
      }

      const sanitizedTitle = sanitizeFilename(bookTitle)
      const filename = `${sanitizedTitle}_${length}_${style}.pdf`

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()

      // Track successful download
      trackSummaryDownloaded({
        summary_id: summaryId,
        book_title: bookTitle,
        style,
        length,
      })

      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 100)
    } catch (err) {
      console.error('Error downloading summary:', err)
      alert(t('downloadUnexpectedError'))
    }
  }

  const handleDelete = async (summaryId: string) => {
    if (!confirm(t('deleteConfirm'))) {
      return
    }

    setDeletingId(summaryId)

    try {
      const response = await fetch(`/api/v1/summaries/${summaryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete summary')
      }

      // Remove from local state
      setSummaries(summaries.filter(s => s.id !== summaryId))
    } catch (err) {
      console.error('Error deleting summary:', err)
      alert(t('deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  const getStyleLabel = (style: string) => {
    try { return tPrefs(`styles.${style}`) } catch { return style }
  }

  const getLengthLabel = (length: string) => {
    try { return tPrefs(`lengths.${length}`) } catch { return length }
  }

  const handleResumeChat = (session: ChatSessionWithBook) => {
    setChatBook(session.book)
    setLoadChatHistory(true)
    setChatOpen(true)
  }

  const handleChatClose = () => {
    setChatOpen(false)
    setChatBook(null)
    setLoadChatHistory(false)
    fetchChatSessions()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  // Group summaries by book
  const summariesByBook = summaries.reduce((acc, summary) => {
    const bookId = summary.book_id
    if (!acc[bookId]) {
      acc[bookId] = {
        book: summary.book,
        summaries: []
      }
    }
    acc[bookId].summaries.push(summary)
    return acc
  }, {} as Record<string, { book: any, summaries: SummaryWithBook[] }>)

  // Sort chat sessions by most recent
  const sortedChatSessions = [...chatSessions].sort((a, b) => {
    const aDate = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const bDate = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return bDate - aDate
  })

  // Convert summaries by book to array and sort by most recent
  const summaryBooks = Object.values(summariesByBook).sort((a, b) => {
    const aDate = a.summaries[0]?.updated_at ? new Date(a.summaries[0].updated_at).getTime() : 0
    const bDate = b.summaries[0]?.updated_at ? new Date(b.summaries[0].updated_at).getTime() : 0
    return bDate - aDate
  })

  const hasChats = chatSessions.length > 0
  const hasSummaries = summaries.length > 0
  const hasContent = hasChats || hasSummaries

  return (
    <Container size="xl" pt="0" pb="xl">
      <Stack gap="xl">
        <div>
          <Title order={1} mb="xs" c="#000000">
            {t('title')}
          </Title>
          <Text size="lg" c="#374151">
            {t('subtitle')}
          </Text>
        </div>

        {loading ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Center py="xl">
              <Stack align="center" gap="md">
                <Loader size="lg" type="dots" />
                <Text c="dimmed">{t('loading')}</Text>
              </Stack>
            </Center>
          </Card>
        ) : error ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Center py="xl">
              <Stack align="center" gap="md">
                <Text c="red" size="lg">{error}</Text>
                <Button onClick={fetchSummaries}>{tCommon('retry')}</Button>
              </Stack>
            </Center>
          </Card>
        ) : !hasContent ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Center py="xl">
              <Stack align="center" gap="md">
                <IconBookmark size={48} stroke={1.5} style={{ opacity: 0.5 }} />
                <Text size="lg" fw={500}>{t('empty')}</Text>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                  {t('emptySubtext')}
                </Text>
              </Stack>
            </Center>
          </Card>
        ) : (
          <>
            {/* ==================== CHAT SECTION ==================== */}
            {hasChats && (
              <Box>
                <Group gap="xs" mb="md">
                  <IconMessage size={24} style={{ color: '#4A7DA5' }} />
                  <Title order={2} size="h3" c="#000000">
                    {t('chatHistory')}
                  </Title>
                  <Badge variant="light" color="blue" size="sm">
                    {t('chatCount', { count: chatSessions.length })}
                  </Badge>
                </Group>

                <SimpleGrid
                  cols={{ base: 2, xs: 3, sm: 4, md: 5, lg: 6 }}
                  spacing={{ base: 'sm', sm: 'md' }}
                >
                  {sortedChatSessions.map((session) => (
                    <ChatBookCard
                      key={session.id}
                      session={session}
                      onClick={() => handleResumeChat(session)}
                    />
                  ))}
                </SimpleGrid>
              </Box>
            )}

            {/* Divider between sections */}
            {hasChats && hasSummaries && (
              <Divider my="md" />
            )}

            {/* ==================== SUMMARIES SECTION ==================== */}
            {hasSummaries && (
              <Box>
                <Group gap="xs" mb="md">
                  <IconBookmark size={24} style={{ color: '#4A7DA5' }} />
                  <Title order={2} size="h3" c="#000000">
                    {t('summariesTab')}
                  </Title>
                  <Badge variant="light" color="blue" size="sm">
                    {t('summaryCount', { count: summaries.length })}
                  </Badge>
                </Group>

                {/* Mobile Card View */}
                <Box className={styles.mobileView}>
                  <Stack gap="lg">
                    {summaryBooks.map((bookGroup, idx) => (
                      <Card key={idx} shadow="sm" padding="lg" radius="md" withBorder>
                        <Stack gap="md">
                          {/* Book Header with Cover */}
                          <Group align="flex-start" gap="md" wrap="nowrap">
                            <Box className={styles.bookCoverMobile}>
                              <Image
                                src={getBookCoverPlaceholder(bookGroup.book)}
                                fallbackSrc={getFallbackPlaceholder(bookGroup.book)}
                                alt={`Cover of ${getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || tCommon('unknownBook')}`}
                                fit="cover"
                                radius="md"
                                h={100}
                                w={67}
                              />
                            </Box>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Text fw={700} size="xl" lineClamp={2}>
                                {getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || tCommon('unknownBook')}
                              </Text>
                              <Text c="dimmed" size="sm">by {bookGroup.book?.author || tCommon('unknownAuthor')}</Text>
                              <Text c="dimmed" size="xs" mt={4}>
                                {t('bookSummaryCount', { count: bookGroup.summaries.length })}
                              </Text>
                            </div>
                          </Group>

                          {/* Individual Summaries */}
                          <Stack gap="sm">
                            {bookGroup.summaries.map((summary) => (
                              <Card key={summary.id} padding="md" radius="sm" withBorder style={{ borderLeft: '3px solid var(--mantine-color-blue-5)' }}>
                                <Stack gap="xs">
                                  <Group gap="xs">
                                    <Badge variant="light" color="green" size="sm">
                                      {getStyleLabel(summary.style)}
                                    </Badge>
                                    <Badge variant="light" color="blue" size="sm">
                                      {getLengthLabel(summary.length)}
                                    </Badge>
                                  </Group>

                                  <Text size="xs" c="dimmed">
                                    {t('generated')} {formatDate(summary.updated_at)}
                                  </Text>

                                  <Group gap="xs">
                                    <Button
                                      size="xs"
                                      variant="light"
                                      leftSection={<IconDownload size={14} />}
                                      onClick={() => handleDownload(summary.id, summary.book?.title || 'summary', summary.length, summary.style)}
                                      style={{ flex: 1 }}
                                    >
                                      {t('downloadPdf')}
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="gray"
                                      onClick={() => handleDelete(summary.id)}
                                      loading={deletingId === summary.id}
                                      disabled={deletingId === summary.id}
                                    >
                                      <IconTrash size={14} />
                                    </Button>
                                  </Group>
                                </Stack>
                              </Card>
                            ))}
                          </Stack>
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                </Box>

                {/* Desktop Table View */}
                <Stack gap="lg" className={styles.desktopView}>
                  {summaryBooks.map((bookGroup, idx) => (
                    <Card key={idx} shadow="sm" padding="0" radius="md" withBorder>
                      <Stack gap="md">
                        {/* Book Header with Cover */}
                        <div style={{ padding: '20px 20px 12px 20px', borderBottom: '1px solid #e5e7eb' }}>
                          <Group align="flex-start" gap="lg" wrap="nowrap">
                            <Image
                              src={getBookCoverPlaceholder(bookGroup.book)}
                              fallbackSrc={getFallbackPlaceholder(bookGroup.book)}
                              alt={`Cover of ${getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || tCommon('unknownBook')}`}
                              fit="cover"
                              radius="md"
                              h={120}
                              w={80}
                              className={styles.bookCover}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Text fw={700} size="xl">
                                {getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || tCommon('unknownBook')}
                              </Text>
                              <Group gap="md" mt={4}>
                                <Text c="dimmed" size="sm">by {bookGroup.book?.author || tCommon('unknownAuthor')}</Text>
                                <Text c="dimmed" size="xs">
                                  {t('bookSummaryCount', { count: bookGroup.summaries.length })}
                                </Text>
                              </Group>
                            </div>
                          </Group>
                        </div>

                        {/* Summaries Table */}
                        <Table.ScrollContainer minWidth={600} style={{ paddingLeft: '20px', paddingRight: '20px', paddingBottom: '20px' }}>
                          <Table highlightOnHover horizontalSpacing="sm" layout="fixed">
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th style={{ width: '20%' }}>{t('style')}</Table.Th>
                                <Table.Th style={{ width: '20%' }}>{t('length')}</Table.Th>
                                <Table.Th style={{ width: '35%' }}>{t('generated')}</Table.Th>
                                <Table.Th style={{ width: '25%', textAlign: 'right' }}>{t('actions')}</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {bookGroup.summaries.map((summary) => (
                                <Table.Tr key={summary.id}>
                                  <Table.Td>
                                    <Badge variant="light" color="green" size="sm">
                                      {getStyleLabel(summary.style)}
                                    </Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    <Badge variant="light" color="blue" size="sm">
                                      {getLengthLabel(summary.length)}
                                    </Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm">{formatDate(summary.updated_at)}</Text>
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    <Group gap="xs" justify="flex-end">
                                      <Button
                                        size="xs"
                                        variant="light"
                                        leftSection={<IconDownload size={14} />}
                                        onClick={() => handleDownload(summary.id, summary.book?.title || 'summary', summary.length, summary.style)}
                                      >
                                        {t('downloadPdf')}
                                      </Button>
                                      <Button
                                        size="xs"
                                        variant="light"
                                        color="gray"
                                        onClick={() => handleDelete(summary.id)}
                                        loading={deletingId === summary.id}
                                        disabled={deletingId === summary.id}
                                      >
                                        <IconTrash size={14} />
                                      </Button>
                                    </Group>
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </Table.ScrollContainer>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}
      </Stack>

      <ChatWithBook
        opened={chatOpen}
        onClose={handleChatClose}
        book={chatBook}
        loadHistory={loadChatHistory}
        skipHistoryConfirmation={loadChatHistory}
      />
    </Container>
  )
}
