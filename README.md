# @onlemary/events-core

> Critical **system events buffer** + **notification policy** estimator.
> Producer-emits → evaluator-decides → dispatcher-sends (the dispatcher is
> injected at the app boot — `events-core` knows nothing about channels).

## Overview

This package provides a **decoupled** mechanism for surfacing critical
infrastructure events to the right human recipient, without coupling the
producer code to any notification channel.

The producer (`payment-core`, `extensions`, future auth/billing) calls
`recordSystemEvent(...)` whenever something critical happens. The host
application, at boot, wires `evaluatePolicy(...)` to a `DispatchFn` that uses
its preferred channel (SMTP, WhatsApp, Slack, etc.).

A declarative `notification_policy` table decides per `event_kind` and per
`org_slug`:
- `notify_immediate` (channel + cooldown window)
- `digest_daily` (out of scope of the v1 spec)
- `mute` (silence forward-looking)

`mute = flipping a row in the DB` — no code change, no redeploy.

## Install

```bash
# NOT YET PUBLISHED — see `.kiro/specs/events-core/HANDOFF.md` §1 for context.
# In dev: place at `packages/events-core/` at the repo root.
# In prod: consumed via npm.pkg.github.com with `@onlemary/events-core: "latest"`.
```

## Quick start

```ts
import {
  recordSystemEvent,
  evaluatePolicy,
  setMuted,
  getBufferedEvents,
} from '@onlemary/events-core'

// 1. Producer side (in payment-core / extensions):
await recordSystemEvent({
  org_slug: 'gym_iron',
  event_kind: 'public_key_missing',
  natural_key: `op:${operationId}`,
  context: { surface: 'callback' },
})

// 2. Host side (in apps/admin, after the producer):
const decision = evaluatePolicy(
  { org_slug: 'gym_iron', event_kind: 'public_key_missing', natural_key: `op:${operationId}`, created_at: new Date() },
  { resolveAdminRecipient: async (slug) => (await getOrgConfig(slug)).adminEmail }
)

// 3. If dispatch -> invoke the wired transport
if (decision.dispatch) {
  await dispatchFn(decision.dispatch.recipient, decision.dispatch.channel, decision.dispatch.message)
}
```

## API

### `recordSystemEvent(input)`

Persists an event to `system_events`. **Idempotent** by `(org_slug, event_kind, natural_key)`.
Returns `{ id, created }` where `created=false` means the row already existed.

```ts
interface RecordInput {
  org_slug: string
  event_kind: string          // one of the catalog (Zod discriminated union)
  natural_key: string         // unique per (org_slug, event_kind)
  context: Record<string, unknown>
  severity?: 'critical' | 'warning' | 'info'
}
```

### `evaluatePolicy(input, ctx) → Decision`

Pure function. Reads (in-memory) the `notification_policy` snapshot +
last-dispatched timestamp, returns:

```ts
type Decision =
  | { dispatch: DispatchPlan; suppressReason: null }
  | { dispatch: null; suppressReason: 'muted' | 'cooldown' | 'no_recipient' | 'no_policy' }
```

### `setMuted({ event_kind, org_slug?, muted })`

Operator-only. Flips the `action` column to/from `'mute'` for a `(org_slug, event_kind)` pair.

### `getBufferedEvents(query)`

Query tool for future admin UI / scripts. Filters by `org_slug`, `event_kind`,
time range, with pagination.

## Env vars

| Variable | Required | Purpose |
|---|---|---|
| `EVENTS_CORE_DB_URL` | yes | Postgres connection string (creates DB if missing) |
| `EVENTS_CORE_TEST_DB_URL` | integration | Different DB for the integration test suite |

## Migrations

```bash
pnpm --filter @onlemary/events-core db:setup
# Equivalent to: node dist/db-setup.js
# 1. CREATE DATABASE IF NOT EXISTS events_core_db
# 2. prisma migrate deploy
```

## How to add a new `event_kind`

1. Add an entry to `src/buffered-event/schemas.ts` in the `EventContextSchema` discriminated union.
2. Add a row to the migration seed (or insert via ops script) in `notification_policy` for the new `event_kind`.
3. If using a new template, fill `src/policy/evaluate.ts` `renderMessage()` switch.

## Limitations / Out of scope

- ❌ UI admin (silenciar eventos vía panel, ver historial). Out of scope.
- ❌ Outbox diferido en `@onlemary/notifier-core` (motor de cola con `'pending'`).
- ❌ Implementación concreta del bridge (responsabilidad de la app host).
- ❌ Migración de `Notifier.send()` calls legacy no-admin-alert.
- ❌ Cooldown persistente en DB. Ventana en memoria para MVP.
- ❌ Digest diario automático (`action='digest_daily'` retorna `'no_policy'` en MVP).

## License

MIT
