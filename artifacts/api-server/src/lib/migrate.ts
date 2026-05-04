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
  `);
  logger.info("Database migrations complete");
}
