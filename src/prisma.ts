// =============================================================================
// events-core — Prisma client singleton
// =============================================================================
// Lazy-initialized; reads EVENTS_CORE_DB_URL at runtime. Throws if unset.
// Uses Prisma 7 + @prisma/adapter-pg to match peer packages (`notifier-core`,
// `payment-core`, `extensions`).
//
// IMPORTANT: PrismaClient se importa del client generado (`dist/.prisma/client`)
// en vez de `@prisma/client`, porque `@prisma/client/default.js` hace
// `require('.prisma/client/default')` relativo a su propia ruta y no
// encuentra el client generado cuando está fuera del package. Convención
// compartida con `@onlemary/notifier-core`. Requiere haber corrido
// `prisma generate` (parte de `npm run build`) antes de typecheck.
// =============================================================================

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../dist/.prisma/client/index.js'

let _client: PrismaClient | null = null

/**
 * Lazily instantiate and return the singleton PrismaClient. Reads
 * `EVENTS_CORE_DB_URL` at first call. Throws if the env var is unset.
 *
 * Synchronous (matches the schema's `client.d.ts` shape) so callers can
 * use it inline without `await`.
 */
export function getPrismaClient(): PrismaClient {
  if (_client) return _client
  const url = process.env.EVENTS_CORE_DB_URL
  if (!url) {
    throw new Error(
      'EVENTS_CORE_DB_URL is not set. Source .env.events-core before instantiating the events-core PrismaClient.'
    )
  }
  const adapter = new PrismaPg({ connectionString: url })
  _client = new PrismaClient({ adapter })
  return _client
}

/**
 * Reset the cached singleton (used in tests to swap env between describe
 * blocks). Internal — not part of the public API.
 */
export function _resetPrismaClientForTests(): void {
  _client = null
}
