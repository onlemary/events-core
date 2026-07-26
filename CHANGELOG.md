# Changelog — `@onlemary/events-core`

> Major version 0 = pre-estable. Iteramos rápido. Rompemos sin previo aviso hasta que lleguemos a 1.0.0.

---

## 0.1.0 — 2026-07-25 — Initial release (Phase 0 cerrada)

### Added

- **`recordSystemEvent(input)`** — Persiste un evento en `system_events` (Postgres). Idempotente por `natural_key`: el segundo insert con misma `(org_slug, event_kind, natural_key)` retorna `{id, created:false}` sin error.
- **`evaluatePolicy(input, ctx)`** — Función pura. Decide `dispatch | suppressed_reason` revisando la fila de `notification_policy`. NO side-effects en DB.
- **`setMuted({event_kind, org_slug?})`** — Flippea `notification_policy.action = 'mute'/'notify_immediate'`. Idempotente.
- **`getBufferedEvents(query)`** — Query admin-utility sobre `system_events` filtrado por `org_slug`/`event_kind`/`from`/`to`.
- **DispatchFn injectable type** — La app wirea `dispatchFn = (recipient, channel, message, meta?) => Promise<DispatchFnResult>` en el boot. Z edición cero entre `events-core` y `notifier-core` (DI).
- **Schema Prisma** con 2 tablas:
  - `system_events` (con UNIQUE en `(org_slug, event_kind, natural_key)` + index `(org_slug, event_kind, created_at DESC)`).
  - `notification_policy` (con UNIQUE en `(org_slug, event_kind)` + index `(event_kind)`).
- **4 event_kinds seeded en `notification_policy`** con `action='notify_immediate', channel='email', cooldown_ms=3600000`:
  - `public_key_missing`
  - `oauth_refresh_failed`
  - `webhook_signature_invalid`
  - `subscription_dunning_locked`
- **Cooldown en memoria** (default 1h por `(org_slug, event_kind)`). Trade-off known: se pierde en restart (cubierto por dedupe de `natural_key`).
- **Multi-tenant enforcement**: cada evento lleva `org_slug` validado (`^[a-z0-9_-]+$`, 1-64 chars).
- **Diagnostic error types**: `BufferedEventValidationError`, `BufferedEventWriteError`, `PolicyEvaluationError`.
- **`scripts/db-setup.ts`** (bin: `events-core-db-setup`) — Crea la DB `EVENTS_CORE_DB_URL` si no existe y corre migraciones.
- **Tests PBT** con `fast-check` (≥ 100 runs por property):
  - P1: rate-limit windowed.
  - P2: natural_key UNIQUE idempotencia.
  - P3: multi-tenant org_slug regex.
  - P4: fail-safe del recorder write.
  - P5: recipient resolution contract (mock-only; real implementation vive en `apps/admin`).
- **Tests de integration** contra Postgres real (Docker):
  - INSERT/UPSERT race-recovery.
  - `notification_policy` upsert.
  - Read/write flush.
- **EventReducer utilities**: `RecordInput` Zod schema + `RecordResult` shape + `EventContext` Zod discriminated union.
- **`packages/events-core/scripts/install-consumers.sh`** — Replicado de `payment-core/scripts/install-consumers.sh`. Corre `events-core-db-setup` después de `pnpm install` para los consumers.

### Fixed

- N/A (initial release).

### Known limitations (→ Phase 5 / v0.2 / v2)

- **No UI panel admin.** `getBufferedEvents` está disponible como API, pero no hay dashboard todavía. Phase 4.
- **Cleanup de `system_events` viejos no automatizado.** Crecimiento lineal. Cron cleanup = Phase 5.
- **Cooldown se pierde en restart del proceso.** Aceptable por UNIQUE dedup. Persistencia = Phase 5.
- **`notification_policy.action='digest_daily'` no implementado.** Schema soporta, falta motor de digest. Phase 5.
- **Sin retry automático en `dispatch_failed`.** Recovery manual via panel cuando exista. Phase 5.
- **`debug_daily`/`digest_daily` no implementados.** Phase 5 / v2.

### Migration path

- Sin migration path porque es la versión inicial. La próxima versión (0.1.1, 0.2.0) sí tendrá notas de migration.

### Tech details

- Stack: Node.js ≥22, TypeScript ≥5 con `strict`, ES2022, ESNext modules.
- Deps runtime: `@prisma/client@^7`, `@prisma/adapter-pg`.
- Devs: `vitest`, `fast-check`, `prisma@^7`, `tsx`.
- License: MIT.

---

## Pendiente documentar (futuras releases)

- v0.1.1 (patch) — TBD si PHASE 4 panel requiere nuevo API de events.
- v0.2.0 (minor) — Phase 5 features (cron cleanup, persistence, digest).
- v1.0.0 (major) — Stable. Garantía de API surface.

---

Generated con Phase 0 → Phase 3 sequence.
