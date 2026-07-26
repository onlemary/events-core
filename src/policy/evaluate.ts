// =============================================================================
// events-core — evaluatePolicy
// =============================================================================
// Pure function. No side-effects on the DB. Reads:
//   - `ctx.policySnapshot.get(org_slug, event_kind)` → policy row (wildcard or specific)
//   - `ctx.resolveAdminRecipient(org_slug)`        → email/phone for the org admin
//   - `ctx.lastDispatchedAt?(org_slug, event_kind)` → optional cooldown source of truth
//
// Returns a `Decision` (dispatch plan or suppression reason). Render strategy:
//   - template per `event_kind` (4 starter templates; extensible)
//   - default channel = 'email' (per D14)
// =============================================================================

import { PolicyEvaluationError } from '../errors.js'
import { getDefaultMessage } from './messages.js'

export interface PolicySnapshotEntry {
  org_slug: string | null // null = wildcard
  event_kind: string
  action: 'notify_immediate' | 'digest_daily' | 'mute'
  channel: 'email' | 'whatsapp' | 'sms' | 'slack' | null
  cooldown_ms: number | null
  daily_digest_at_hour: number | null
  enabled: boolean
}

export interface EvaluateInput {
  org_slug: string
  event_kind: string
  natural_key: string
  created_at: Date
}

export interface EvaluateContext {
  policySnapshot: PolicySnapshotEntry[]
  resolveAdminRecipient(orgSlug: string): Promise<string | null>
  lastDispatchedAt?(org_slug: string, event_kind: string): Date | null
}

export interface DispatchPlan {
  recipient: string
  channel: 'email' | 'whatsapp' | 'sms' | 'slack'
  message: string
  meta?: { event_id: string; event_kind: string; natural_key: string }
}

export type Decision =
  | { dispatch: DispatchPlan; suppressReason: null }
  | { dispatch: null; suppressReason: 'muted' | 'cooldown' | 'no_recipient' | 'no_policy' }

const DEFAULT_COOLDOWN_MS = 3_600_000 // 1h

function lookupPolicy(
  snapshot: PolicySnapshotEntry[],
  org_slug: string,
  event_kind: string
): PolicySnapshotEntry | null {
  // Specific org override first
  const specific = snapshot.find(
    (p) => p.org_slug === org_slug && p.event_kind === event_kind && p.enabled
  )
  if (specific) return specific
  // Then wildcard (org_slug = null)
  return (
    snapshot.find((p) => p.org_slug === null && p.event_kind === event_kind && p.enabled) ??
    null
  )
}

function inCooldown(ctx: EvaluateContext, org_slug: string, event_kind: string, cooldownMs: number): boolean {
  const last = ctx.lastDispatchedAt?.(org_slug, event_kind)
  if (!last) return false
  const elapsed = Date.now() - last.getTime()
  return elapsed >= 0 && elapsed < cooldownMs
}

export async function evaluatePolicy(
  input: EvaluateInput,
  ctx: EvaluateContext
): Promise<Decision> {
  if (!input.org_slug || !input.event_kind) {
    throw new PolicyEvaluationError(
      'evaluatePolicy requires org_slug and event_kind',
      { input }
    )
  }

  const policy = lookupPolicy(ctx.policySnapshot, input.org_slug, input.event_kind)

  // D27: no fila → no_policy (NOT notify_immediate by default)
  if (!policy) {
    return { dispatch: null, suppressReason: 'no_policy' }
  }

  // mute → muted
  if (policy.action === 'mute') {
    return { dispatch: null, suppressReason: 'muted' }
  }

  // digest_daily → MVP: no_policy (digest cron is out of scope)
  if (policy.action === 'digest_daily') {
    return { dispatch: null, suppressReason: 'no_policy' }
  }

  // notify_immediate → check cooldown, then recipient
  const cooldownMs = policy.cooldown_ms ?? DEFAULT_COOLDOWN_MS

  if (inCooldown(ctx, input.org_slug, input.event_kind, cooldownMs)) {
    return { dispatch: null, suppressReason: 'cooldown' }
  }

  const recipient = await ctx.resolveAdminRecipient(input.org_slug)
  if (!recipient) {
    return { dispatch: null, suppressReason: 'no_recipient' }
  }

  if (!policy.channel) {
    return { dispatch: null, suppressReason: 'no_policy' }
  }

  return {
    dispatch: {
      recipient,
      channel: policy.channel,
      message: getDefaultMessage(input.event_kind, input.org_slug, input.natural_key),
      meta: {
        event_id: '', // filled by host when persisting notified_at
        event_kind: input.event_kind,
        natural_key: input.natural_key,
      },
    },
    suppressReason: null,
  }
}
