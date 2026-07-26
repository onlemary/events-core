// =============================================================================
// @onlemary/events-core — Prisma 7 config (canonical URL declaration)
// =============================================================================
// Connection URL lives HERE (in `prisma.config.ts`), NOT in the schema file —
// this is the canonical Prisma 7 placement (matches the @onlemary/notifier-core
// and @gym-platform/extensions conventions). Resolves from
// `process.env.EVENTS_CORE_DB_URL` at config-resolution time.
//
// Failure mode (by design, NO fallback):
//   `EVENTS_CORE_DB_URL` unset → `prisma generate` fails explicitly with
//   `PrismaConfigEnvError`. The caller is responsible for sourcing env.
// =============================================================================

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('EVENTS_CORE_DB_URL'),
  },
});
