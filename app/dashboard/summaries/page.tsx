'use client'

import { useEffect, useState } from 'react'
import { Container, Title, Text, Stack, Card, Center, Button, Group, Badge, Loader, Table, SimpleGrid, Box, Image } from '@mantine/core'
import { IconBookmark, IconDownload, IconTrash } from '@tabler/icons-react'
import { SummaryWithBook } from '@/lib/types/summaries'
import { ChatSessionWithBook } from '@/lib/types/chat'
import { ChatHistoryRow } from '@/components/chat/ChatHistoryRow'
import { ChatWithBook } from '@/components/chat/ChatWithBook'
import { getDisplayTitle } from '@/lib/utils/bookTitle'
import { SUMMARY_STYLE_OPTIONS, SUMMARY_LENGTH_OPTIONS } from '@/lib/types/preferences'
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
  const [summaries, setSummaries] = useState<SummaryWithBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [chatSessions, setChatSessions] = useState<ChatSessionWithBook[]>([])
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
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
      setError('Failed to load summaries')
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
          alert('PDF file not found. The file may have been deleted or lost. You can delete this summary and regenerate it if needed.')
        } else {
          alert(`Failed to download summary: ${errorData.error || 'Unknown error'}`)
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
      alert('An unexpected error occurred while downloading the summary.')
    }
  }

  const handleDelete = async (summaryId: string) => {
    if (!confirm('Are you sure you want to delete this summary? This action cannot be undone.')) {
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
      alert('Failed to delete summary. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const getStyleLabel = (style: string) => {
    return SUMMARY_STYLE_OPTIONS.find(opt => opt.value === style)?.label || style
  }

  const getLengthLabel = (length: string) => {
    return SUMMARY_LENGTH_OPTIONS.find(opt => opt.value === length)?.label || length
  }

  const handleResumeChat = (session: ChatSessionWithBook) => {
    setChatBook(session.book)
    setLoadChatHistory(true)
    setChatOpen(true)
  }

  const handleDeleteChat = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this chat history? This action cannot be undone.')) {
      return
    }

    setDeletingChatId(sessionId)

    try {
      const response = await fetch(`/api/v1/chat-sessions/${sessionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete chat session')
      }

      setChatSessions(chatSessions.filter(s => s.id !== sessionId))
    } catch (err) {
      console.error('Error deleting chat session:', err)
      alert('Failed to delete chat history. Please try again.')
    } finally {
      setDeletingChatId(null)
    }
  }

  const handleChatClose = () => {
    setChatOpen(false)
    setChatBook(null)
    setLoadChatHistory(false)
    fetchChatSessions()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
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

  // Create chat sessions lookup by book_id
  const chatSessionsByBook = chatSessions.reduce((acc, session) => {
    acc[session.book_id] = session
    return acc
  }, {} as Record<string, ChatSessionWithBook>)

  // Merge: include books that have summaries OR chat history
  const allBookIds = new Set([
    ...Object.keys(summariesByBook),
    ...Object.keys(chatSessionsByBook),
  ])

  const books = Array.from(allBookIds).map(bookId => ({
    bookId,
    book: summariesByBook[bookId]?.book || chatSessionsByBook[bookId]?.book,
    summaries: summariesByBook[bookId]?.summaries || [],
    chatSession: chatSessionsByBook[bookId] || null,
  }))

  // Sort by most recent activity
  books.sort((a, b) => {
    const aDate = Math.max(
      a.chatSession?.last_message_at ? new Date(a.chatSession.last_message_at).getTime() : 0,
      a.summaries[0]?.updated_at ? new Date(a.summaries[0].updated_at).getTime() : 0
    )
    const bDate = Math.max(
      b.chatSession?.last_message_at ? new Date(b.chatSession.last_message_at).getTime() : 0,
      b.summaries[0]?.updated_at ? new Date(b.summaries[0].updated_at).getTime() : 0
    )
    return bDate - aDate
  })

  return (
    <Container size="xl" pt="0" pb="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} mb="xs" c="#000000">
            My Collection
          </Title>
          <Text size="lg" c="#374151">
            Access all your personalized book summaries
          </Text>
        </div>

        {loading ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Center py="xl">
              <Stack align="center" gap="md">
                <Loader size="lg" type="dots" />
                <Text c="dimmed">Loading your summaries...</Text>
              </Stack>
            </Center>
          </Card>
        ) : error ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Center py="xl">
              <Stack align="center" gap="md">
                <Text c="red" size="lg">{error}</Text>
                <Button onClick={fetchSummaries}>Try Again</Button>
              </Stack>
            </Center>
          </Card>
        ) : summaries.length === 0 && chatSessions.length === 0 ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Center py="xl">
              <Stack align="center" gap="md">
                <IconBookmark size={48} stroke={1.5} style={{ opacity: 0.5 }} />
                <Text size="lg" fw={500}>No Summaries Yet</Text>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                  Generate your first book summary from the Library page
                </Text>
              </Stack>
            </Center>
          </Card>
        ) : (
          <>
            {/* Mobile Card View */}
            <Box className={styles.mobileView}>
              <Stack gap="lg">
                {books.map((bookGroup, idx) => (
                  <Card key={idx} shadow="sm" padding="lg" radius="md" withBorder>
                    <Stack gap="md">
                      {/* Book Header with Cover */}
                      <Group align="flex-start" gap="md" wrap="nowrap">
                        <Box className={styles.bookCoverMobile}>
                          <Image
                            src={getBookCoverPlaceholder(bookGroup.book)}
                            fallbackSrc={getFallbackPlaceholder(bookGroup.book)}
                            alt={`Cover of ${getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || 'Book'}`}
                            fit="cover"
                            radius="md"
                            h={100}
                            w={67}
                          />
                        </Box>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={700} size="xl" lineClamp={2}>
                            {getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || 'Unknown Book'}
                          </Text>
                          <Text c="dimmed" size="sm">by {bookGroup.book?.author || 'Unknown Author'}</Text>
                          <Text c="dimmed" size="xs" mt={4}>
                            {bookGroup.summaries.length} {bookGroup.summaries.length === 1 ? 'summary' : 'summaries'}
                          </Text>
                        </div>
                      </Group>

                      {/* Chat History Row */}
                      {bookGroup.chatSession && (
                        <ChatHistoryRow
                          session={bookGroup.chatSession}
                          onResume={() => handleResumeChat(bookGroup.chatSession!)}
                          onDelete={() => handleDeleteChat(bookGroup.chatSession!.id)}
                          isDeleting={deletingChatId === bookGroup.chatSession!.id}
                        />
                      )}

                      {/* Individual Summaries */}
                      <Stack gap="sm" style={{ paddingLeft: '16px' }}>
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
                                Generated {formatDate(summary.updated_at)}
                              </Text>

                              <Group gap="xs">
                                <Button
                                  size="xs"
                                  variant="light"
                                  leftSection={<IconDownload size={14} />}
                                  onClick={() => handleDownload(summary.id, summary.book?.title || 'summary', summary.length, summary.style)}
                                  style={{ flex: 1 }}
                                >
                                  Download PDF
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
              {books.map((bookGroup, idx) => (
                <Card key={idx} shadow="sm" padding="0" radius="md" withBorder>
                  <Stack gap="md">
                    {/* Book Header with Cover */}
                    <div style={{ padding: '20px 20px 12px 20px', borderBottom: '1px solid #e5e7eb' }}>
                      <Group align="flex-start" gap="lg" wrap="nowrap">
                        <Image
                          src={getBookCoverPlaceholder(bookGroup.book)}
                          fallbackSrc={getFallbackPlaceholder(bookGroup.book)}
                          alt={`Cover of ${getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || 'Book'}`}
                          fit="cover"
                          radius="md"
                          h={120}
                          w={80}
                          className={styles.bookCover}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={700} size="xl">
                            {getDisplayTitle(bookGroup.book?.title) || bookGroup.book?.title || 'Unknown Book'}
                          </Text>
                          <Group gap="md" mt={4}>
                            <Text c="dimmed" size="sm">by {bookGroup.book?.author || 'Unknown Author'}</Text>
                            <Text c="dimmed" size="xs">
                              {bookGroup.summaries.length} {bookGroup.summaries.length === 1 ? 'summary' : 'summaries'}
                            </Text>
                          </Group>
                        </div>
                      </Group>
                    </div>

                    {/* Chat History Row */}
                    {bookGroup.chatSession && (
                      <div style={{ padding: '0 20px' }}>
                        <ChatHistoryRow
                          session={bookGroup.chatSession}
                          onResume={() => handleResumeChat(bookGroup.chatSession!)}
                          onDelete={() => handleDeleteChat(bookGroup.chatSession!.id)}
                          isDeleting={deletingChatId === bookGroup.chatSession!.id}
                        />
                      </div>
                    )}

                    {/* Summaries Table */}
                    <Table.ScrollContainer minWidth={600} style={{ paddingLeft: '44px', paddingBottom: '20px' }}>
                      <Table highlightOnHover horizontalSpacing="sm" layout="fixed">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ width: '20%' }}>Style</Table.Th>
                            <Table.Th style={{ width: '20%' }}>Length</Table.Th>
                            <Table.Th style={{ width: '35%' }}>Generated</Table.Th>
                            <Table.Th style={{ width: '25%', textAlign: 'right' }}>Actions</Table.Th>
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
                                    Download PDF
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
          </>
        )}
      </Stack>

      <ChatWithBook
        opened={chatOpen}
        onClose={handleChatClose}
        book={chatBook}
        loadHistory={loadChatHistory}
      />
    </Container>
  )
}
