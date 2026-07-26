// =============================================================================
// events-core — setMuted
// =============================================================================
// Operator-side function (NOT called by producers). Toggles the `action` on
// `notification_policy` for a given `(org_slug, event_kind)` pair.
//
// Semantics:
//   muted=true  → upsert a row with action='mute' (creates wildcard if absent)
//   muted=false → if the row is currently 'mute', switch it to 'notify_immediate';
//                 if no row exists, do nothing and return { changed: false }.
// =============================================================================

import { getPrismaClient } from '../prisma.js'
import { BufferedEventWriteError } from '../errors.js'

export interface SetMutedInput {
  event_kind: string
  org_slug?: string
  muted: boolean
}

export interface SetMutedResult {
  changed: boolean
}

export async function setMuted(input: SetMutedInput): Promise<SetMutedResult> {
  const prisma = getPrismaClient()
  const targetOrgSlug: string | null = input.org_slug ?? null
  try {
    // findFirst (not findUnique on a compound) so the nullable org_slug
    // column accepts both string and null cleanly without type gymnastics.
    const existing = await prisma.notificationPolicy.findFirst({
      where: { org_slug: targetOrgSlug, event_kind: input.event_kind },
    })

    if (input.muted) {
      if (existing?.action === 'mute') {
        return { changed: false }
      }
      if (existing) {
        await prisma.notificationPolicy.update({
          where: { id: existing.id },
          data: { action: 'mute', enabled: true },
        })
      } else {
        await prisma.notificationPolicy.create({
          data: {
            org_slug: targetOrgSlug,
            event_kind: input.event_kind,
            action: 'mute',
            enabled: true,
          },
        })
      }
      return { changed: true }
    }

    // muted = false
    if (!existing || existing.action !== 'mute') {
      return { changed: false }
    }
    await prisma.notificationPolicy.update({
      where: { id: existing.id },
      data: { action: 'notify_immediate', channel: 'email', cooldown_ms: 3_600_000 },
    })
    return { changed: true }
  } catch (e) {
    throw new BufferedEventWriteError(
      `Failed to setMuted(${input.muted}) for ${input.event_kind}`,
      e as Error
    )
  }
}
