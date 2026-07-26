// =============================================================================
// events-core — integration tests (Prisma + real Postgres)
// =============================================================================
// Requires EVENTS_CORE_TEST_DB_URL to be set. If not set, the suite gracefully
// skips (per FASE 4 plan: spin up Docker Postgres for green run).
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

const TEST_DB_URL = process.env.EVENTS_CORE_TEST_DB_URL

const hasDb = Boolean(TEST_DB_URL)
const itWithDb = it.skipIf(!hasDb)

async function ensureTestDatabase(): Promise<void> {
  if (!TEST_DB_URL) return
  const adminUrl = TEST_DB_URL.replace(/\/[^/]+$/, '/postgres')
  const admin = new Client({ connectionString: adminUrl })
  await admin.connect()
  const target = TEST_DB_URL.split('/').pop()!.split('?')[0]
  if (!/^[a-zA-Z0-9_]+$/.test(target)) throw new Error(`bad target name: ${target}`)
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [target])
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${target}"`)
  }
  await admin.end()

  // Apply the migration (raw SQL from the file we ship). First drop any
  // pre-existing schema so beforeAll is idempotent across re-runs.
  const client = new Client({ connectionString: TEST_DB_URL })
  await client.connect()
  await client.query(`
    DROP TABLE IF EXISTS "notification_policy" CASCADE;
    DROP TABLE IF EXISTS "system_events" CASCADE;
    DROP TYPE IF EXISTS "SuppressReason";
    DROP TYPE IF EXISTS "PolicyAction";
    DROP TYPE IF EXISTS "NotifyChannel";
    DROP TYPE IF EXISTS "Severity";
  `)
  const migration = await import('node:fs/promises').then((fs) =>
    fs.readFile('prisma/migrations/20260725120000_init/migration.sql', 'utf8')
  )
  await client.query(migration)
  await client.end()
}

beforeAll(async () => {
  await ensureTestDatabase()
})

afterAll(async () => {
  // Connection-cleanup happens via Prisma's singleton reset.
})

describe('Prisma persistence — against real Postgres', () => {
  itWithDb('UNIQUE constraint (silent dedupe): repeated insert with same natural_key → no extra row', async () => {
    await runAgainstDb(async (setup) => {
      const { recordSystemEvent, getBufferedEvents } = setup
      const first = await recordSystemEvent({
        org_slug: 'gym_iron',
        event_kind: 'public_key_missing',
        natural_key: 'op:42',
        context: { surface: 'callback' },
      })
      const second = await recordSystemEvent({
        org_slug: 'gym_iron',
        event_kind: 'public_key_missing',
        natural_key: 'op:42',
        context: { surface: 'callback' },
      })
      expect(first.id).toBe(second.id)
      const rows = await getBufferedEvents({ org_slug: 'gym_iron' }, { isSuperAdmin: true })
      expect(rows).toHaveLength(1)
    })
  })

  itWithDb('Multi-tenant: getBufferedEvents without org_slug is rejected (non-super-admin)', async () => {
    await runAgainstDb(async ({ getBufferedEvents }) => {
      await expect(getBufferedEvents({})).rejects.toThrow(/org_slug.*required/)
    })
  })

  itWithDb('Cross-org leak prevention: getBufferedEvents(gym_iron) does NOT see gym_fenix events', async () => {
    await runAgainstDb(async (setup) => {
      const { recordSystemEvent, getBufferedEvents } = setup
      await recordSystemEvent({
        org_slug: 'gym_fenix',
        event_kind: 'public_key_missing',
        natural_key: 'op:1',
        context: { surface: 'status' },
      })
      const seen = await getBufferedEvents({ org_slug: 'gym_iron' }, { isSuperAdmin: true })
      expect(seen.find((e) => e.org_slug === 'gym_fenix')).toBeUndefined()
    })
  })

  itWithDb('Seed: 4 wildcard rows in notification_policy', async () => {
    if (!TEST_DB_URL) return
    const { getPrismaClient } = await import('../../src/prisma.js')
    // The default client reads EVENTS_CORE_DB_URL — for this test we
    // temporarily push the test URL by using a direct PG query.
    const client = new Client({ connectionString: TEST_DB_URL })
    await client.connect()
    const result = await client.query(
      `SELECT event_kind FROM notification_policy WHERE org_slug IS NULL ORDER BY event_kind`
    )
    await client.end()
    const kinds = result.rows.map((r: { event_kind: string }) => r.event_kind)
    expect(kinds).toEqual([
      'oauth_refresh_failed',
      'public_key_missing',
      'subscription_dunning_locked',
      'webhook_signature_invalid',
    ])
    expect(getPrismaClient).toBeDefined()
  })
})

async function runAgainstDb(body: (setup: typeof import('../../src/index.js')) => Promise<void>): Promise<void> {
  // We bind the test URL by writing into process.env BEFORE importing the module
  // under test. Vitest re-imports from cache if env was set during require.
  process.env.EVENTS_CORE_DB_URL = TEST_DB_URL!
  process.env.EVENTS_CORE_TEST_DB_URL = TEST_DB_URL! // for any nested consumers
  // Force a fresh require to pick up the env
  const url = new URL('../../src/index.js', import.meta.url)
  const setup = await import(url.pathname + `?t=${Date.now()}`)
  await body(setup)
}
