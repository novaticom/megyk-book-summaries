import { sendGTMEvent } from '@next/third-parties/google'

// Event names following Google Analytics 4 recommended naming conventions
export const GTM_EVENTS = {
  // Auth events
  SIGN_UP: 'sign_up',
  LOGIN: 'login',

  // Summary events
  SUMMARY_GENERATED: 'summary_generated',
  SUMMARY_DOWNLOADED: 'summary_downloaded',

  // Chat events
  CHAT_MESSAGE_SENT: 'chat_message_sent',

  // Referral events
  REFERRAL_LINK_COPIED: 'referral_link_copied',
  REFERRAL_LINK_SHARED: 'referral_link_shared',
  REFERRAL_INVITE_SENT: 'referral_invite_sent',
} as const

type GTMEventName = typeof GTM_EVENTS[keyof typeof GTM_EVENTS]

interface BaseEventParams {
  [key: string]: string | number | boolean | undefined
}

// Sign up event
interface SignUpParams extends BaseEventParams {
  method?: string
  has_referral?: boolean
}

export function trackSignUp(params?: SignUpParams) {
  sendGTMEvent({
    event: GTM_EVENTS.SIGN_UP,
    method: params?.method || 'email',
    has_referral: params?.has_referral || false,
  })
}

// Login event
interface LoginParams extends BaseEventParams {
  method?: string
}

export function trackLogin(params?: LoginParams) {
  sendGTMEvent({
    event: GTM_EVENTS.LOGIN,
    method: params?.method || 'email',
  })
}

// Summary generated event
interface SummaryGeneratedParams extends BaseEventParams {
  book_id: string
  book_title: string
  style: string
  length: string
  credit_cost: number
}

export function trackSummaryGenerated(params: SummaryGeneratedParams) {
  sendGTMEvent({
    event: GTM_EVENTS.SUMMARY_GENERATED,
    book_id: params.book_id,
    book_title: params.book_title,
    summary_style: params.style,
    summary_length: params.length,
    credit_cost: params.credit_cost,
  })
}

// Summary downloaded event
interface SummaryDownloadedParams extends BaseEventParams {
  summary_id: string
  book_title: string
  style: string
  length: string
}

export function trackSummaryDownloaded(params: SummaryDownloadedParams) {
  sendGTMEvent({
    event: GTM_EVENTS.SUMMARY_DOWNLOADED,
    summary_id: params.summary_id,
    book_title: params.book_title,
    summary_style: params.style,
    summary_length: params.length,
  })
}

// Chat message sent event
interface ChatMessageParams extends BaseEventParams {
  book_id: string
  book_title: string
  is_socratic_mode?: boolean
  credit_cost: number
}

export function trackChatMessageSent(params: ChatMessageParams) {
  sendGTMEvent({
    event: GTM_EVENTS.CHAT_MESSAGE_SENT,
    book_id: params.book_id,
    book_title: params.book_title,
    is_socratic_mode: params.is_socratic_mode || false,
    credit_cost: params.credit_cost,
  })
}

// Referral link copied event
export function trackReferralLinkCopied() {
  sendGTMEvent({
    event: GTM_EVENTS.REFERRAL_LINK_COPIED,
  })
}

// Referral link shared (native share) event
export function trackReferralLinkShared() {
  sendGTMEvent({
    event: GTM_EVENTS.REFERRAL_LINK_SHARED,
  })
}

// Referral invite sent event
interface ReferralInviteParams extends BaseEventParams {
  invite_method: 'email' | 'modal'
}

export function trackReferralInviteSent(params: ReferralInviteParams) {
  sendGTMEvent({
    event: GTM_EVENTS.REFERRAL_INVITE_SENT,
    invite_method: params.invite_method,
  })
}

// Generic event tracker for custom events
export function trackEvent(eventName: string, params?: BaseEventParams) {
  sendGTMEvent({
    event: eventName,
    ...params,
  })
}
