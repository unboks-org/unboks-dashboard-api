import { pool } from "@workspace/db";
import { logger } from "./logger.js";

export async function runMigrations(): Promise<void> {
  logger.info("Running database migrations");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
      client_slug   TEXT        NOT NULL,
      external_id   TEXT        NOT NULL,
      platform      TEXT        NOT NULL DEFAULT 'unknown',
      contact_id    TEXT,
      contact_name  TEXT,
      last_message  TEXT,
      last_message_at TIMESTAMPTZ,
      unread        BOOLEAN     NOT NULL DEFAULT true,
      escalated     BOOLEAN     NOT NULL DEFAULT false,
      escalation_resolved BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT conversations_client_external_unique UNIQUE (client_slug, external_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
      conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      external_id     TEXT,
      role            TEXT        NOT NULL DEFAULT 'user',
      content         TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Soft/Hard escalation v1: additive columns on conversations.
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS escalation_mode          TEXT,
      ADD COLUMN IF NOT EXISTS escalation_reason        TEXT,
      ADD COLUMN IF NOT EXISTS escalation_summary       TEXT,
      ADD COLUMN IF NOT EXISTS escalation_created_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS human_guidance           TEXT,
      ADD COLUMN IF NOT EXISTS human_responder          TEXT,
      ADD COLUMN IF NOT EXISTS human_responded_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS human_takeover_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ai_muted                 BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS learn_from_resolution    BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ai_may_use_automatically BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS learning_status          TEXT    NOT NULL DEFAULT 'none';

    CREATE TABLE IF NOT EXISTS learning_entries (
      id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
      client_slug              TEXT        NOT NULL,
      conversation_id          UUID        REFERENCES conversations(id) ON DELETE SET NULL,
      source_question          TEXT        NOT NULL,
      ai_uncertainty           TEXT,
      human_answer             TEXT        NOT NULL,
      category                 TEXT,
      expires_at               TIMESTAMPTZ,
      ai_may_use_automatically BOOLEAN     NOT NULL DEFAULT false,
      status                   TEXT        NOT NULL DEFAULT 'suggested',
      created_by               TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS learning_entries_client_status_idx
      ON learning_entries (client_slug, status);

    -- Idempotency: at most one learning entry per (client, conversation).
    CREATE UNIQUE INDEX IF NOT EXISTS learning_entries_client_conv_unique
      ON learning_entries (client_slug, conversation_id)
      WHERE conversation_id IS NOT NULL;
  `);
  logger.info("Database migrations complete");
}
