-- =============================================================================
-- events-core: initial schema migration
-- =============================================================================
-- Creates: Severity/SuppressReason/PolicyAction/NotifyChannel enums,
--          system_events table + indexes + dedupe UNIQUE,
--          notification_policy table + indexes,
--          and seeds 4 wildcard notification_policy rows for the 4 critical
--          event_kinds per HANDOFF D14.
-- =============================================================================

-- Enums
CREATE TYPE "Severity" AS ENUM ('critical', 'warning', 'info');

CREATE TYPE "SuppressReason" AS ENUM (
  'muted',
  'cooldown',
  'no_recipient',
  'no_policy'
);

CREATE TYPE "PolicyAction" AS ENUM (
  'notify_immediate',
  'digest_daily',
  'mute'
);

CREATE TYPE "NotifyChannel" AS ENUM (
  'email',
  'whatsapp',
  'sms',
  'slack'
);

-- system_events
CREATE TABLE "system_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_slug" TEXT NOT NULL,
  "event_kind" TEXT NOT NULL,
  "natural_key" TEXT NOT NULL,
  "severity" "Severity" NOT NULL DEFAULT 'critical',
  "context" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notified_at" TIMESTAMP(3),
  "suppressed_reason" "SuppressReason",
  "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- Dedupe: a single (org_slug, event_kind, natural_key) is allowed
CREATE UNIQUE INDEX "system_events_org_slug_event_kind_natural_key_key"
  ON "system_events"("org_slug", "event_kind", "natural_key");

-- Drill-down index
CREATE INDEX "system_events_org_slug_event_kind_created_at_idx"
  ON "system_events"("org_slug", "event_kind", "created_at" DESC);

-- Cross-org queries (super-admin drill)
CREATE INDEX "system_events_event_kind_created_at_idx"
  ON "system_events"("event_kind", "created_at" DESC);

-- notification_policy
CREATE TABLE "notification_policy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_slug" TEXT,
  "event_kind" TEXT NOT NULL,
  "action" "PolicyAction" NOT NULL,
  "channel" "NotifyChannel",
  "cooldown_ms" INTEGER,
  "daily_digest_at_hour" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "notification_policy_pkey" PRIMARY KEY ("id")
);

-- Wildcard + override uniqueness
CREATE UNIQUE INDEX "notification_policy_org_slug_event_kind_key"
  ON "notification_policy"("org_slug", "event_kind");

CREATE INDEX "notification_policy_event_kind_idx"
  ON "notification_policy"("event_kind");

-- Seed: 4 wildcard rows for the critical event_kinds (HANDOFF D14)
INSERT INTO "notification_policy"
  ("id", "org_slug", "event_kind", "action", "channel", "cooldown_ms", "enabled")
VALUES
  (gen_random_uuid(), NULL, 'public_key_missing',         'notify_immediate', 'email', 3600000, true),
  (gen_random_uuid(), NULL, 'oauth_refresh_failed',       'notify_immediate', 'email', 3600000, true),
  (gen_random_uuid(), NULL, 'webhook_signature_invalid',  'notify_immediate', 'email', 3600000, true),
  (gen_random_uuid(), NULL, 'subscription_dunning_locked','notify_immediate', 'email', 3600000, true);
