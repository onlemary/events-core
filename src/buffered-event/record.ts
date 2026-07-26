// =============================================================================
// events-core — recordSystemEvent
// =============================================================================
// Persists an event to `system_events` as an orphan (no dispatch). Idempotent
// by `(org_slug, event_kind, natural_key)` via Prisma upsert on the UNIQUE
// constraint (design.md §3 + §4).
// =============================================================================

import { getPrismaClient } from '../prisma.js'
import {
  BufferedEventValidationError,
  BufferedEventWriteError,
} from '../errors.js'
import {
  RecordInputSchema,
  EventContextSchema,
  isKnownEventKind,
  type RecordInput,
} from './schemas.js'

export interface RecordResult {
  id: string
  created: boolean // false = row already existed for the natural_key
}

export async function recordSystemEvent(input: RecordInput): Promise<RecordResult> {
  // ---- Validate top-level shape -------------------------------------------
  const parsed = RecordInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new BufferedEventValidationError(
      'Invalid recordSystemEvent input',
      { issues: parsed.error.issues, input }
    )
  }

  // ---- Validate event_kind is known + refine context ---------------------
  if (!isKnownEventKind(parsed.data.event_kind)) {
    throw new BufferedEventValidationError(
      `Unknown event_kind "${parsed.data.event_kind}". Add an entry to EventContextSchema.`,
      { event_kind: parsed.data.event_kind }
    )
  }

  const contextWrapped = { event_kind: parsed.data.event_kind, ...parsed.data.context }
  const contextParsed = EventContextSchema.safeParse(contextWrapped)
  if (!contextParsed.success) {
    throw new BufferedEventValidationError(
      `Invalid context for event_kind "${parsed.data.event_kind}"`,
      { issues: contextParsed.error.issues, context: contextWrapped }
    )
  }

  // ---- Persist with deterministic created/merge semantics ----------------
  // Strategy: `findUnique` first (observable `created: false` path). On miss,
  // try `create`. If a parallel writer races us between findUnique and create,
  // the UNIQUE constraint throws Prisma P2002 — we recover by re-reading and
  // reporting `created: false`. This is non-atomic but RACE-SAFE.
  const prisma = getPrismaClient()
  const uniqueKey = {
    org_slug: parsed.data.org_slug,
    event_kind: parsed.data.event_kind,
    natural_key: parsed.data.natural_key,
  }

  try {
    const existing = await prisma.bufferedEvent.findUnique({
      where: { org_slug_event_kind_natural_key: uniqueKey },
      select: { id: true },
    })
    if (existing) {
      return { id: existing.id, created: false }
    }
    const created = await prisma.bufferedEvent.create({
      data: {
        ...uniqueKey,
        severity: parsed.data.severity,
        context: contextParsed.data,
      },
    })
    return { id: created.id, created: true }
  } catch (e) {
    // Race recovery: P2002 = unique violation → someone else won the create.
    if ((e as { code?: string }).code === 'P2002') {
      const recon = await prisma.bufferedEvent.findUnique({
        where: { org_slug_event_kind_natural_key: uniqueKey },
        select: { id: true },
      })
      if (recon) return { id: recon.id, created: false }
    }
    throw new BufferedEventWriteError(
      `Failed to persist event ${parsed.data.event_kind}/${parsed.data.natural_key}`,
      e as Error
    )
  }
}
