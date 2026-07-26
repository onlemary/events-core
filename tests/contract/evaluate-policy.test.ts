// =============================================================================
// events-core — PBT contract tests for evaluatePolicy
// =============================================================================
// 5 properties covered (per spec §R15 / tasks T21):
//   P1 — mute idempotent
//   P2 — notify_immediate + no cooldown → dispatch
//   P3 — notify_immediate + within cooldown → suppressed
//   P4 — resolveAdminRecipient returning null → no_recipient
//   P5 — determinism (twice → equal)
//   D27: event_kind without policy row → no_policy
// =============================================================================

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  evaluatePolicy,
  type EvaluateContext,
  type PolicySnapshotEntry,
} from '../../src/policy/evaluate.js'

const EVENT_KINDS = [
  'public_key_missing',
  'oauth_refresh_failed',
  'webhook_signature_invalid',
  'subscription_dunning_locked',
] as const

const arbOrgSlug = fc.string({ minLength: 1, maxLength: 32 })
const arbNaturalKey = fc.string({ minLength: 1, maxLength: 64 })

function snapshotOf(row: PolicySnapshotEntry): PolicySnapshotEntry[] {
  return [row]
}

function ctxWith(opts: Partial<EvaluateContext>): EvaluateContext {
  return {
    policySnapshot: opts.policySnapshot ?? [],
    resolveAdminRecipient: opts.resolveAdminRecipient ?? (async () => 'admin@example.com'),
    lastDispatchedAt: opts.lastDispatchedAt ?? (() => null),
  }
}

describe('evaluatePolicy — contract properties', () => {
  it('P1: mute is idempotent — any event for a (slug,kind) with action=mute returns muted', async () => {
    await fc.assert(
      fc.asyncProperty(arbOrgSlug, fc.constantFrom(...EVENT_KINDS), arbNaturalKey, async (slug, kind, key) => {
        const ctx = ctxWith({
          policySnapshot: snapshotOf({
            org_slug: slug,
            event_kind: kind,
            action: 'mute',
            channel: 'email',
            cooldown_ms: null,
            daily_digest_at_hour: null,
            enabled: true,
          }),
        })
        const decision = await evaluatePolicy(
          { org_slug: slug, event_kind: kind, natural_key: key, created_at: new Date() },
          ctx
        )
        return decision.suppressReason === 'muted' && decision.dispatch === null
      })
    )
  })

  it('P2: notify_immediate + no cooldown → dispatch (with resolved recipient)', async () => {
    await fc.assert(
      fc.asyncProperty(arbOrgSlug, fc.constantFrom(...EVENT_KINDS), async (slug, kind) => {
        const ctx = ctxWith({
          policySnapshot: snapshotOf({
            org_slug: slug,
            event_kind: kind,
            action: 'notify_immediate',
            channel: 'email',
            cooldown_ms: 3_600_000,
            daily_digest_at_hour: null,
            enabled: true,
          }),
          lastDispatchedAt: () => null,
        })
        const decision = await evaluatePolicy(
          { org_slug: slug, event_kind: kind, natural_key: 'k', created_at: new Date() },
          ctx
        )
        return decision.dispatch !== null && decision.suppressReason === null
      })
    )
  })

  it('P3: notify_immediate + within cooldown → suppressed (cooldown)', async () => {
    await fc.assert(
      fc.asyncProperty(arbOrgSlug, fc.constantFrom(...EVENT_KINDS), async (slug, kind) => {
        const within = new Date(Date.now() - 30 * 60_000) // 30 min ago
        const ctx = ctxWith({
          policySnapshot: snapshotOf({
            org_slug: slug,
            event_kind: kind,
            action: 'notify_immediate',
            channel: 'email',
            cooldown_ms: 3_600_000,
            daily_digest_at_hour: null,
            enabled: true,
          }),
          lastDispatchedAt: () => within,
        })
        const decision = await evaluatePolicy(
          { org_slug: slug, event_kind: kind, natural_key: 'k', created_at: new Date() },
          ctx
        )
        return decision.suppressReason === 'cooldown' && decision.dispatch === null
      })
    )
  })

  it('P4: resolveAdminRecipient returning null → no_recipient', async () => {
    await fc.assert(
      fc.asyncProperty(arbOrgSlug, fc.constantFrom(...EVENT_KINDS), async (slug, kind) => {
        const ctx = ctxWith({
          policySnapshot: snapshotOf({
            org_slug: slug,
            event_kind: kind,
            action: 'notify_immediate',
            channel: 'email',
            cooldown_ms: 3_600_000,
            daily_digest_at_hour: null,
            enabled: true,
          }),
          resolveAdminRecipient: async () => null,
        })
        const decision = await evaluatePolicy(
          { org_slug: slug, event_kind: kind, natural_key: 'k', created_at: new Date() },
          ctx
        )
        return decision.suppressReason === 'no_recipient' && decision.dispatch === null
      })
    )
  })

  it('P5: determinism — repeated invocation with same input yields same Decision', async () => {
    await fc.assert(
      fc.asyncProperty(arbOrgSlug, fc.constantFrom(...EVENT_KINDS), async (slug, kind) => {
        const ctx = ctxWith({
          policySnapshot: snapshotOf({
            org_slug: slug,
            event_kind: kind,
            action: 'notify_immediate',
            channel: 'email',
            cooldown_ms: 3_600_000,
            daily_digest_at_hour: null,
            enabled: true,
          }),
        })
        const input = { org_slug: slug, event_kind: kind, natural_key: 'k', created_at: new Date() }
        const a = await evaluatePolicy(input, ctx)
        const b = await evaluatePolicy(input, ctx)
        return JSON.stringify(a) === JSON.stringify(b)
      })
    )
  })

  it('D27: event_kind without policy row → no_policy (NOT notify_immediate)', async () => {
    const decision = await evaluatePolicy(
      {
        org_slug: 'gym_iron',
        event_kind: 'public_key_missing',
        natural_key: 'k',
        created_at: new Date(),
      },
      ctxWith({ policySnapshot: [] })
    )
    expect(decision.suppressReason).toBe('no_policy')
    expect(decision.dispatch).toBeNull()
  })
})
