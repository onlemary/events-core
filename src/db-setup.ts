#!/usr/bin/env node
// =============================================================================
// events-core-db-setup — CLI to bootstrap the events-core Postgres database
// =============================================================================
// 1. Reads EVENTS_CORE_DB_URL from env.
// 2. Performs CREATE DATABASE IF NOT EXISTS via a one-shot `pg` connection
//    to the parent postgres database (the URL minus the dbname path).
// 3. Runs `prisma migrate deploy` to apply pending migrations.
// =============================================================================

import { Client } from 'pg'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SCHEMA = path.resolve(__dirname, '..', 'prisma', 'schema.prisma')

function getDbUrlOrThrow(): string {
  const url = process.env.EVENTS_CORE_DB_URL
  if (!url) {
    console.error(
      '[events-core-db-setup] EVENTS_CORE_DB_URL not set.\n' +
        'Source .env.events-core (or use `npx dotenv -e .env.events-core -- node dist/db-setup.js`).'
    )
    process.exit(1)
  }
  return url
}

const DB_URL = getDbUrlOrThrow()

const ADMIN_URL = DB_URL.replace(/\/[^/]+$/, '/postgres') // swap dbname to "postgres"

async function ensureDatabaseExists(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL })
  try {
    await admin.connect()
    const targetName = DB_URL.split('/').pop()!.split('?')[0]
    const result = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetName])
    if (result.rowCount === 0) {
      console.log(`[events-core-db-setup] creating database "${targetName}"…`)
      // Database names cannot be parameterized — we whitelist the sanitized value.
      if (!/^[a-zA-Z0-9_]+$/.test(targetName)) {
        throw new Error(`Refusing to create db with non-identifier name: ${targetName}`)
      }
      await admin.query(`CREATE DATABASE "${targetName}"`)
      console.log('[events-core-db-setup] database created.')
    } else {
      console.log(`[events-core-db-setup] database "${targetName}" already exists.`)
    }
  } finally {
    await admin.end()
  }
}

function runPrismaMigrateDeploy(): void {
  console.log('[events-core-db-setup] running `prisma migrate deploy`…')
  const r = spawnSync('prisma', ['migrate', 'deploy', `--schema=${SCHEMA}`], {
    stdio: 'inherit',
    env: { ...process.env },
  })
  if (r.status !== 0) {
    throw new Error('prisma migrate deploy failed.')
  }
}

async function main(): Promise<void> {
  await ensureDatabaseExists()
  runPrismaMigrateDeploy()
  console.log('[events-core-db-setup] done.')
}

main().catch((e) => {
  console.error('[events-core-db-setup] error:', e.message)
  process.exit(1)
})
