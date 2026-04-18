/**
 * Types for chat messages and sessions
 */

import { Book } from './books'

/**
 * Individual chat message stored in database
 */
export interface ChatMessage {
  id: string
  chat_session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/**
 * Chat session with book information (for Collections page)
 */
export interface ChatSessionWithBook {
  id: string
  user_id: string
  book_id: string
  message_count: number
  total_credits_spent: number
  last_message_at: string | null
  created_at: string
  updated_at: string
  book: Pick<Book, 'id' | 'title' | 'author' | 'cover_image_url'>
}

/**
 * Response from chat-history endpoint
 */
export interface ChatHistoryResponse {
  messages: ChatMessage[]
  session: {
    id: string
    message_count: number
    last_message_at: string | null
  } | null
}

/**
 * Response from chat-sessions endpoint
 */
export interface ChatSessionsResponse {
  sessions: ChatSessionWithBook[]
}
