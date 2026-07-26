#!/usr/bin/env bash
# =============================================================================
# events-core — install-consumers.sh
# =============================================================================
# Runs the events-core-db-setup CLI after `pnpm install` of the package, so
# any consumer installing `@onlemary/events-core` automatically bootstraps
# its own Postgres. Mirrors `packages/payment-core/scripts/install-consumers.sh`
# pattern.
#
# Requirements:
#   - EVENTS_CORE_DB_URL must be sourced from .env.events-core or equivalent
#     before this script is invoked (no inline export to keep secrets safe).
# =============================================================================

set -e

if [ -z "${EVENTS_CORE_DB_URL:-}" ]; then
  echo "[events-core install-consumers] EVENTS_CORE_DB_URL not set.\n" \
       "Source your .env.events-core (or equivalent) before running this script."
  exit 1
fi

# Resolve dist path relative to this script (works both inside a workspace and
# after publish — we look up one level from git-tracked location).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$PACKAGE_ROOT/dist/db-setup.js" ]; then
  echo "[events-core install-consumers] dist/db-setup.js missing.\n" \
       "Run \`pnpm --filter @onlemary/events-core build\` before installing consumers."
  exit 1
fi

echo "[events-core install-consumers] running db-setup…"
node "$PACKAGE_ROOT/dist/db-setup.js"
echo "[events-core install-consumers] done."
