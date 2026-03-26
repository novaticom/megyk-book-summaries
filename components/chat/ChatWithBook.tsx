'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Portal,
  ScrollArea,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconSend, IconX, IconCoins, IconGift } from '@tabler/icons-react';
import { REFERRAL_REWARDS } from '@/lib/types/referral';
import { Book } from '@/lib/types/books';
import { getDisplayTitle } from '@/lib/utils/bookTitle';
import {
  getChatMessageCreditCost,
  formatCredits,
  calculateRemainingChatMessages,
  CreditBalance,
} from '@/lib/types/credits';
import { InsufficientCreditsModal, refreshCreditBalance } from '@/components/credits';
import { trackChatMessageSent } from '@/lib/analytics/gtm';

interface ChatWithBookProps {
  opened: boolean;
  onClose: () => void;
  book: Book | null;
  loadHistory?: boolean;  // true when resuming from Collections
}

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const renderWithLineBreaks = (content: string) =>
  content.split(/\n/).map((line, index, lines) => (
    <span key={`${index}-${line}`}>
      {line}
      {index < lines.length - 1 && <br />}
    </span>
  ));

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getChatReply = (payload: unknown) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const candidates = [
      data.reply,
      data.message,
      data.response,
      data.text,
      data.output,
    ];
    const found = candidates.find((value) => typeof value === 'string') as string | undefined;
    if (found) return found;
  }
  return '';
};

// Socratic mode prompts - randomly selected when chat opens
const SOCRATIC_PROMPTS = [
  'Help me apply this to a specific situation',
  'Coach me through implementing this',
  'Challenge my thinking on this topic',
  'Help me discover what\'s holding me back',
  'Guide me to find my own answers',
  'Ask me questions to deepen my understanding',
];

const getRandomSocraticPrompt = () => {
  return SOCRATIC_PROMPTS[Math.floor(Math.random() * SOCRATIC_PROMPTS.length)];
};

export function ChatWithBook({ opened, onClose, book, loadHistory = false }: ChatWithBookProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [socraticModeEnabled, setSocraticModeEnabled] = useState(false);
  // Track the message index where Socratic mode started (for exchange counting)
  const [socraticStartIndex, setSocraticStartIndex] = useState<number | null>(null);
  // Randomly selected Socratic prompt (changes each time chat opens)
  const [socraticPrompt, setSocraticPrompt] = useState<string>(getRandomSocraticPrompt);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const bookId = book?.id;
  const isMobile = useMediaQuery('(max-width: 576px)', true, { getInitialValueInEffect: false });

  const chatCost = getChatMessageCreditCost();
  const remainingMessages = creditBalance ? calculateRemainingChatMessages(creditBalance.current_balance) : 0;
  const canAffordChat = creditBalance ? creditBalance.current_balance >= chatCost : false;

  const headerTitle = useMemo(() => {
    if (!book) return 'Chat with book';
    return `Chat with "${getDisplayTitle(book.title) || book.title}"`;
  }, [book]);

  useEffect(() => {
    if (!bookId) {
      setMessages([]);
      setSuggestions([]);
      setSocraticStartIndex(null);
      suggestionsAbortRef.current?.abort();
      suggestionsAbortRef.current = null;
      return;
    }
    setMessages([]);
    setSocraticStartIndex(null);
  }, [bookId]);

  const fetchCreditBalance = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/credits');
      if (response.ok) {
        const data = await response.json();
        setCreditBalance(data.balance);
      }
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    }
  }, []);

  // Fetch credit balance, reset Socratic mode, and pick new prompt when chat opens
  useEffect(() => {
    if (opened) {
      fetchCreditBalance();
      setShowInsufficientModal(false);
      setSocraticModeEnabled(false);
      setSocraticStartIndex(null);
      setSocraticPrompt(getRandomSocraticPrompt());
    }
  }, [opened, fetchCreditBalance]);

  // Load chat history when resuming from Collections
  useEffect(() => {
    if (!opened || !loadHistory || !bookId) return;

    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const response = await fetch(`/api/v1/chat-history?bookId=${bookId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Convert API messages to ChatMessage format
            const loadedMessages: ChatMessage[] = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
            }));
            setMessages(loadedMessages);
          }
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [opened, loadHistory, bookId]);

  useEffect(() => {
    if (!opened || !bookId) return;

    suggestionsAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    setIsLoadingSuggestions(true);
    setSuggestions([]);

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[ChatWithBook] fetching suggestions', { bookId });
    }

    fetch('/api/v1/chat-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_id: bookId }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const details = await res.text().catch(() => '');
          throw new Error(`Failed to load suggestions (${res.status}). ${details}`.trim());
        }
        const payload = (await res.json().catch(() => ({}))) as { questions?: unknown };
        const questions = Array.isArray(payload?.questions)
          ? payload.questions.filter((q) => typeof q === 'string').slice(0, 3)
          : [];
        setSuggestions(questions as string[]);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[ChatWithBook] suggestions failed', err);
        }
        // suggestions are non-critical; fail silently in UI
        setSuggestions([]);
      })
      .finally(() => {
        if (suggestionsAbortRef.current === controller) {
          setIsLoadingSuggestions(false);
        }
      });

    return () => {
      controller.abort();
      if (suggestionsAbortRef.current === controller) {
        suggestionsAbortRef.current = null;
      }
    };
  }, [opened, bookId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending, opened]);

  useEffect(() => {
    if (!opened) {
      setInput('');
      setIsSending(false);
      setErrorMessage(null);
      setShowInsufficientModal(false);
      setSocraticModeEnabled(false);
      setSocraticStartIndex(null);
    }
  }, [opened]);

  const sendMessageWithText = async (text: string) => {
    if (!book || !text.trim() || isSending) return;

    const messageText = text.trim();
    setInput('');
    setErrorMessage(null);

    // Calculate Socratic mode state for the API
    const inSocraticMode = socraticModeEnabled;
    const socraticExchangeCount = inSocraticMode && socraticStartIndex !== null
      ? messages.slice(socraticStartIndex).filter(m => m.role === 'user').length + 1
      : inSocraticMode ? 1 : 0;

    setMessages((prev) => [...prev, { id: createId(), role: 'user', content: messageText }]);
    setIsSending(true);

    // Use separate endpoint for Socratic mode (shares memory via book_id session key)
    const endpoint = inSocraticMode ? '/api/v1/book-chat-socratic' : '/api/v1/book-chat';

    try {
      console.log('[ChatWithBook] Sending message', {
        endpoint,
        bookId: book.id,
        bookTitle: book.title,
        messageLength: messageText.length
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: book.id,
          message: messageText,
          socratic_exchange_count: socraticExchangeCount,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));

        // Handle insufficient credits
        if (response.status === 402) {
          // Remove the user message we just added since it wasn't sent
          setMessages((prev) => prev.slice(0, -1));
          setShowInsufficientModal(true);
          setIsSending(false);
          return;
        }

        throw new Error(errorPayload.error || 'Failed to send chat message.');
      }

      const contentType = response.headers.get('content-type') || '';

      // Handle SSE streaming response
      if (contentType.includes('text/event-stream')) {
        const assistantMessageId = createId();
        // Add empty assistant message that we'll update as chunks arrive
        setMessages((prev) => [
          ...prev,
          { id: assistantMessageId, role: 'assistant', content: '' },
        ]);

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to read streaming response.');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events from the buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            try {
              const data = JSON.parse(trimmedLine);

              // Check for socratic_complete flag to exit Socratic mode
              if (data?.socratic_complete === true) {
                setSocraticStartIndex(null);
              }

              // Handle n8n NDJSON format: {"type":"item","content":"text",...}
              if (data?.type === 'item' && typeof data?.content === 'string') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
                // Also check for socratic_complete in the item data
                if (data?.socratic_complete === true) {
                  setSocraticStartIndex(null);
                }
              }
              // Handle SSE format: {"progress":{"delta":"text"}}
              else if (typeof data?.progress?.delta === 'string') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + data.progress.delta }
                      : msg
                  )
                );
              }
            } catch {
              // Ignore JSON parse errors for malformed lines
            }
          }
        }

        // Ensure we have some content, or show fallback
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId && !msg.content.trim()
              ? { ...msg, content: 'No response returned yet. Please try again.' }
              : msg
          )
        );
      } else {
        // Handle non-streaming JSON response (backwards compatibility)
        const payload = await response.json().catch(() => ({}));
        const replyText = getChatReply(payload?.reply ?? payload?.data ?? payload);

        // Check for socratic_complete flag to exit Socratic mode
        if (payload?.socratic_complete === true) {
          setSocraticModeEnabled(false);
          setSocraticStartIndex(null);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'assistant',
            content: replyText || 'No response returned yet. Please try again.',
          },
        ]);
      }
      // Track successful chat message
      trackChatMessageSent({
        book_id: book.id,
        book_title: book.title,
        is_socratic_mode: inSocraticMode,
        credit_cost: chatCost,
      });

      // Refresh credit balance after message completes (small delay for DB sync)
      setTimeout(() => {
        fetchCreditBalance();
        refreshCreditBalance();
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat request failed.';
      setErrorMessage(message);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
      // Auto-disable after max exchanges so the backend synthesizes and wraps up
      if (inSocraticMode && socraticExchangeCount >= 5) {
        setSocraticModeEnabled(false);
        setSocraticStartIndex(null);
      }
    }
  };

  const sendMessage = async () => {
    return sendMessageWithText(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    // Auto-send on click
    sendMessageWithText(suggestion);
  };

  const handleSocraticSuggestionClick = () => {
    // Enable Socratic mode and send the opening message
    setSocraticModeEnabled(true);
    setSocraticStartIndex(messages.length);
    sendMessageWithText(socraticPrompt);
  };

  if (!opened) return null;

  return (
    <Portal>
      <>
      <Paper
        id="tour-chatbox"
        shadow="lg"
        radius="md"
        withBorder
        style={{
          position: 'fixed',
          bottom: isMobile ? 0 : 24,
          left: isMobile ? 0 : undefined,
          right: isMobile ? 0 : 24,
          width: isMobile ? '100vw' : 480,
          maxWidth: isMobile ? '100vw' : 'calc(100vw - 32px)',
          height: 620,
          maxHeight: '85vh',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderColor: 'rgba(37, 99, 235, 0.55)',
        }}
      >
        <Group justify="space-between" px="md" py="sm" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <img
              src="/chat-with-book/chat-with-book.png"
              alt=""
              aria-hidden="true"
              style={{ display: 'block', height: 34, width: 'auto' }}
            />
            <Tooltip label={headerTitle} withArrow>
              <Text fw={600} size="sm" lineClamp={1} style={{ flex: 1, minWidth: 0, color: '#000000' }}>
                {headerTitle}
              </Text>
            </Tooltip>
          </Group>
          <Group gap="xs" wrap="nowrap" align="center">
            <Tooltip label="Socratic mode guides you to insights through questions" withArrow>
              <Switch
                size="xs"
                label="Socratic"
                labelPosition="left"
                checked={socraticModeEnabled}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked;
                  setSocraticModeEnabled(enabled);
                  setSocraticStartIndex(enabled ? messages.length : null);
                }}
                styles={{
                  label: { color: '#92400e', fontWeight: 600, fontSize: 11, cursor: 'pointer' },
                  track: {
                    backgroundColor: socraticModeEnabled ? '#f59e0b' : undefined,
                    borderColor: socraticModeEnabled ? '#f59e0b' : undefined,
                    cursor: 'pointer',
                  },
                }}
              />
            </Tooltip>
            <ActionIcon variant="subtle" size="sm" onClick={onClose} aria-label="Close chat">
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Group>
        <Divider />
        <ScrollArea style={{ flex: 1 }} px="md" py="sm">
          {(isLoadingSuggestions || suggestions.length > 0 || messages.length === 0) && (
            <Box mb="sm">
              <Group gap={8} wrap="wrap">
                {isLoadingSuggestions && (
                  <Text size="xs" c="dimmed">
                    Loading Suggestions…
                  </Text>
                )}
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    size="xs"
                    variant="filled"
                    radius="xl"
                    onClick={() => handleSuggestionClick(suggestion)}
                    disabled={isSending}
                    style={
                      {
                        fontWeight: 500,
                        paddingLeft: 10,
                        paddingRight: 10,
                        '--button-bg': '#f3f4f6',
                        '--button-hover': '#e5e7eb',
                        '--button-color': '#4b5563',
                        '--button-bd': '1px solid #e5e7eb',
                      } as any
                    }
                  >
                    {suggestion}
                  </Button>
                ))}
                {/* Socratic mode suggestion - amber styling */}
                <Button
                  size="xs"
                  variant="filled"
                  radius="xl"
                  onClick={handleSocraticSuggestionClick}
                  disabled={isSending || socraticModeEnabled}
                  leftSection={<Badge size="xs" color="orange" variant="filled" style={{ fontSize: 9, padding: '2px 4px' }}>NEW</Badge>}
                  style={
                    {
                      fontWeight: 500,
                      paddingLeft: 8,
                      paddingRight: 12,
                      '--button-bg': '#fef3c7',
                      '--button-hover': '#fde68a',
                      '--button-color': '#92400e',
                      '--button-bd': '1px solid #fcd34d',
                    } as any
                  }
                >
                  Socratic Mode: {socraticPrompt}
                </Button>
              </Group>
            </Box>
          )}
          {isLoadingHistory && (
            <Box py="md">
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  Loading chat history...
                </Text>
              </Group>
            </Box>
          )}
          {messages.length === 0 && !isSending && !isLoadingHistory && (
            <Box py="md">
              <Text size="sm" c="dimmed">
                Ask a question about this book and I'll respond here.
              </Text>
            </Box>
          )}
          {messages.map((message, index) => {
            const isStreamingEmpty =
              isSending &&
              message.role === 'assistant' &&
              index === messages.length - 1 &&
              !message.content;

            return (
              <Box
                key={message.id}
                mb="sm"
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Box
                  px="sm"
                  py="xs"
                  style={{
                    maxWidth: '80%',
                    borderRadius: 12,
                    backgroundColor: message.role === 'user' ? '#2563eb' : '#f3f4f6',
                    color: message.role === 'user' ? '#ffffff' : '#111827',
                  }}
                >
                  {isStreamingEmpty ? (
                    <Group gap={8} align="center">
                      <Loader size="xs" color="blue" />
                      <Text size="md" c="dimmed">Thinking...</Text>
                    </Group>
                  ) : (
                    <Text size="md">{renderWithLineBreaks(message.content)}</Text>
                  )}
                </Box>
              </Box>
            );
          })}
          {isSending && messages[messages.length - 1]?.role !== 'assistant' && (
            <Box mb="sm" style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Box
                px="sm"
                py="xs"
                style={{
                  borderRadius: 12,
                  backgroundColor: '#f3f4f6',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Loader size="xs" color="blue" />
                <Text size="md">Thinking...</Text>
              </Box>
            </Box>
          )}
          {errorMessage && (
            <Box mb="sm">
              <Text size="xs" c="red">
                {errorMessage}
              </Text>
            </Box>
          )}
          <div ref={bottomRef} />
        </ScrollArea>
        <Divider />
        {/* Credit balance indicator */}
        {creditBalance && (
          <Box px="md" pt="xs" pb={0}>
            <Group justify="space-between" gap="xs">
              <Group gap={4}>
                <IconCoins size={12} style={{ color: canAffordChat ? '#2563EB' : '#dc2626' }} />
                <Text size="xs" c={canAffordChat ? 'dimmed' : 'red'}>
                  {formatCredits(chatCost)}/message
                </Text>
              </Group>
              <Badge
                size="xs"
                variant="light"
                color={remainingMessages > 5 ? 'blue' : remainingMessages > 0 ? 'yellow' : 'red'}
              >
                {remainingMessages} messages left
              </Badge>
            </Group>
            {!canAffordChat && (
              <Group gap={4} mt={4}>
                <IconGift size={12} style={{ color: 'var(--mantine-color-violet-6)' }} />
                <Text
                  size="xs"
                  c="violet"
                  fw={500}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowInsufficientModal(true)}
                >
                  Invite friends to earn {REFERRAL_REWARDS.referrer_bonus.toLocaleString()} MC per referral
                </Text>
              </Group>
            )}
          </Box>
        )}
        <Group px="md" py="sm" gap="xs">
          <TextInput
            id="tour-chat-input"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder={
              !book
                ? 'Pick a book to chat'
                : !canAffordChat
                ? 'Insufficient credits'
                : 'Type your message...'
            }
            disabled={!book || isSending || !canAffordChat}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
          />
          <ActionIcon
            variant="filled"
            color="blue"
            size="lg"
            onClick={sendMessage}
            disabled={!input.trim() || !book || isSending || !canAffordChat}
            aria-label="Send message"
          >
            <IconSend size={18} />
          </ActionIcon>
        </Group>
      </Paper>
      <InsufficientCreditsModal
        opened={showInsufficientModal}
        onClose={() => setShowInsufficientModal(false)}
        requiredCredits={chatCost}
        currentBalance={creditBalance?.current_balance || 0}
        actionName="chat message"
      />
      </>
    </Portal>
  );
}
