// =============================================================================
// events-core — Zod schemas
// =============================================================================
// 1) `EventContextSchema` — discriminated union by event_kind (4 kinds).
// 2) `RecordInputSchema` — top-level input shape for `recordSystemEvent`.
// =============================================================================

import { z } from 'zod'

// ---- Discriminated context per event_kind ----------------------------------

export const PublicKeyMissingContext = z.object({
  surface: z.enum(['callback', 'status', 'retry']),
})

export const OAuthRefreshFailedContext = z.object({
  attempts: z.number().int().positive(),
})

export const WebhookSignatureInvalidContext = z.object({
  lastValid: z.string().datetime().optional(),
})

export const SubscriptionDunningLockedContext = z.object({
  invoiceId: z.string().min(1),
  attempt: z.number().int().positive(),
})

export const EventContextSchema = z.discriminatedUnion('event_kind', [
  PublicKeyMissingContext.extend({ event_kind: z.literal('public_key_missing') }),
  OAuthRefreshFailedContext.extend({ event_kind: z.literal('oauth_refresh_failed') }),
  WebhookSignatureInvalidContext.extend({ event_kind: z.literal('webhook_signature_invalid') }),
  SubscriptionDunningLockedContext.extend({ event_kind: z.literal('subscription_dunning_locked') }),
])

export type EventContext = z.infer<typeof EventContextSchema>
export type EventKind = EventContext['event_kind']

const KNOWN_EVENT_KINDS: readonly EventKind[] = [
  'public_key_missing',
  'oauth_refresh_failed',
  'webhook_signature_invalid',
  'subscription_dunning_locked',
] as const

export function isKnownEventKind(k: string): k is EventKind {
  return (KNOWN_EVENT_KINDS as readonly string[]).includes(k)
}

// ---- Record input -----------------------------------------------------------

export const RecordInputSchema = z.object({
  org_slug: z.string().min(1, 'org_slug es obligatorio (multi-tenant)'),
  event_kind: z.string().min(1),
  natural_key: z.string().min(1),
  severity: z.enum(['critical', 'warning', 'info']).default('critical'),
  context: z.record(z.unknown()),
})

export type RecordInput = z.infer<typeof RecordInputSchema>
