// =============================================================================
// events-core — getBufferedEvents
// =============================================================================
// Read API for tooling, scripts, future panel admin. Filters strictly by org
// unless the caller proclaims super-admin (multi-tenant guarantee: admin of
// `gym_iron` cannot read events of `gym_fenix`).
// =============================================================================

import { getPrismaClient } from '../prisma.js'

export interface GetBufferedEventsQuery {
  org_slug?: string
  event_kind?: string
  from?: Date
  to?: Date
  limit?: number
  cursor?: string // id of last seen (cursor pagination)
}

export interface BufferedEventRow {
  id: string
  org_slug: string
  event_kind: string
  natural_key: string
  severity: 'critical' | 'warning' | 'info'
  context: Record<string, unknown>
  created_at: Date
  notified_at: Date | null
  suppressed_reason: 'muted' | 'cooldown' | 'no_recipient' | 'no_policy' | null
  dispatch_attempts: number
}

export interface GetBufferedEventsCtx {
  isSuperAdmin?: boolean
}

const MAX_LIMIT = 1000
const DEFAULT_LIMIT = 100

export async function getBufferedEvents(
  query: GetBufferedEventsQuery,
  ctx: GetBufferedEventsCtx = {}
): Promise<BufferedEventRow[]> {
  // Multi-tenant guard: if not super-admin and no org_slug provided → empty.
  if (!ctx.isSuperAdmin && !query.org_slug) {
    throw new Error(
      'getBufferedEvents: org_slug is required when caller is not super-admin.'
    )
  }

  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const prisma = getPrismaClient()

  const rows = await prisma.bufferedEvent.findMany({
    where: {
      ...(query.org_slug ? { org_slug: query.org_slug } : {}),
      ...(query.event_kind ? { event_kind: query.event_kind } : {}),
      ...(query.from || query.to
        ? {
            created_at: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    },
    orderBy: { created_at: 'desc' },
    take: limit,
  })

  return rows.map(serializeRow)
}

// =============================================================================
// getActiveMutePolicies — live mute policy lookup
// =============================================================================
// Used by the admin eventos panel so the UI badge reflects the CURRENT
// (mutable) policy state, not the historical `BufferedEventRow.suppressed_reason`
// field which is set at emit-time and never updated by `setMuted`.
// =============================================================================

export async function getActiveMutePolicies(
  org_slug: string,
): Promise<string[]> {
  const prisma = getPrismaClient()
  const rows = await prisma.notificationPolicy.findMany({
    where: {
      // Include wildcard default policies (org_slug IS NULL) AND explicit
      // per-org overrides. setMuted currently writes with the org_slug
      // passed in; NULL is reserved for future global defaults.
      OR: [{ org_slug }, { org_slug: null }],
      action: 'mute',
      enabled: true,
    },
    select: { event_kind: true },
  })
  return rows.map((r) => r.event_kind)
}

// =============================================================================
// Internal: Prisma row → domain row
// =============================================================================
// Prisma's generated `context` is typed as `Prisma.JsonValue` (a recursive union
// that includes `null`, primitives, arrays, and objects). The domain contract
// requires `Record<string, unknown>` (a non-null JSON object). The serializer
// asserts the invariant: events-core callers must store validated object shapes
// (see `buffered-event/schemas.ts`), so the runtime value is always a JSON
// object at this layer.
// =============================================================================

type PrismaBufferedEventRow = Awaited<
  ReturnType<ReturnType<typeof getPrismaClient>['bufferedEvent']['findMany']>
>[number]

function serializeRow(r: PrismaBufferedEventRow): BufferedEventRow {
  return {
    id: r.id,
    org_slug: r.org_slug,
    event_kind: r.event_kind,
    natural_key: r.natural_key,
    severity: r.severity as BufferedEventRow['severity'],
    context: r.context as Record<string, unknown>,
    created_at: r.created_at,
    notified_at: r.notified_at,
    suppressed_reason:
      r.suppressed_reason as BufferedEventRow['suppressed_reason'],
    dispatch_attempts: r.dispatch_attempts,
  }
}

