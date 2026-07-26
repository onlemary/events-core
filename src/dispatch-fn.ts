// =============================================================================
// events-core — DispatchFn type
// =============================================================================
// This is the **only** thing the host must provide to wire `events-core` with
// any concrete notification transport (SMTP, WhatsApp, Slack, etc.).
//
// IMPORTANT: `events-core` does NOT import `@onlemary/notifier-core` (or any
// concrete transport). The bridge is established by the host at boot time —
// see design.md §9.
// =============================================================================

export type DispatchFnStatus = 'sent' | 'simulated' | 'failed'

export interface DispatchFnResult {
  status: DispatchFnStatus
  error?: string
}

export interface DispatchFnMeta {
  event_id: string
  event_kind: string
  natural_key: string
}

export type DispatchFn = (
  recipient: string,
  channel: 'email' | 'whatsapp' | 'sms' | 'slack',
  message: string,
  meta?: DispatchFnMeta
) => Promise<DispatchFnResult>
