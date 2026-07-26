// =============================================================================
// events-core — test bootstrap
// =============================================================================
// Deterministic FastCheck seed + global vitest setup. Importing this file at
// the top of tests/contract/* keeps property-based tests reproducible.
// =============================================================================

import { fc } from 'fast-check'

fc.configureGlobal({
  seed: 1784952000000, // 2026-07-25 arbitrary fixed seed
  numRuns: 100,
  endOnFailure: false,
  verbose: false,
})
