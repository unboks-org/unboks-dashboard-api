import { Router } from "express";
import { pool } from "@workspace/db";
import {
  verifyZernioSignature,
  extractSignatureHeader,
  whichSignatureHeader,
} from "../lib/zernio.js";

const router = Router();

/**
 * POST /api/:client/webhooks/zernio
 *
 * Receives Zernio (WhatsApp/multi-channel) webhook events.
 * Verified via HMAC-SHA256 in the x-zernio-signature header.
 * Upserts conversations and inserts messages into the database.
 */
router.post("/:client/webhooks/zernio", async (req, res) => {
  const { client } = req.params;

  // --- Signature verification ---
  const rawBody = (req as Record<string, unknown>)["rawBody"] as Buffer | undefined;
  if (!rawBody) {
    req.log.error({ client }, "rawBody not available — cannot verify signature");
    res.status(400).send("Bad Request");
    return;
  }

  const sigHeader = extractSignatureHeader(req.headers);
  const sigHeaderName = whichSignatureHeader(req.headers);
  const verified = verifyZernioSignature(rawBody, sigHeader);

  req.log.info(
    { client, sigHeaderName, verified },
    "Zernio webhook signature check",
  );

  if (!verified) {
    req.log.warn({ client, sigHeaderName }, "Zernio signature verification FAILED — rejecting");
    res.status(403).send("Forbidden");
    return;
  }

  // --- Parse event ---
  const event = req.body as Record<string, unknown>;
  const eventType = String(event["event"] ?? event["type"] ?? "unknown");

  req.log.info({ client, eventType }, "Zernio event received");

  // Log full payload in non-production for debugging
  if (process.env.NODE_ENV !== "production") {
    req.log.debug({ payload: event }, "Zernio full payload");
  }

  // Acknowledge non-message events immediately
  if (eventType !== "message.received" && eventType !== "message.sent" && eventType !== "message.created") {
    res.json({ ok: true, event: eventType });
    return;
  }

  // --- Extract message data (handle various Zernio payload shapes) ---
  const data = (event["data"] as Record<string, unknown> | undefined) ?? event;

  const externalId = String(
    data["conversation_id"] ?? data["conversationId"] ?? data["thread_id"] ?? event["conversation_id"] ?? "unknown",
  );
  const rawPlatform = String(data["channel"] ?? data["platform"] ?? data["type"] ?? "whatsapp");
  const platform = rawPlatform.toLowerCase().includes("whatsapp") ? "whatsapp" : rawPlatform.toLowerCase();

  const contactId = String(data["from"] ?? data["sender"] ?? data["phone"] ?? data["from_number"] ?? "");
  const contactName = String(data["from_name"] ?? data["senderName"] ?? data["contact_name"] ?? data["name"] ?? "") || null;
  const messageText = String(data["body"] ?? data["text"] ?? data["content"] ?? data["message"] ?? "");
  const direction = String(data["direction"] ?? "inbound").toLowerCase();
  const role = direction === "outbound" ? "assistant" : "user";
  const messageExternalId = String(data["id"] ?? data["message_id"] ?? "") || null;

  let messageTimestamp = new Date();
  const rawTs = data["timestamp"] ?? data["created_at"] ?? data["createdAt"];
  if (rawTs) {
    const parsed = new Date(typeof rawTs === "number" ? rawTs * 1000 : String(rawTs));
    if (!isNaN(parsed.getTime())) messageTimestamp = parsed;
  }

  // --- Upsert conversation ---
  let conversationId: string | null = null;
  try {
    const upsertResult = await pool.query<{ id: string }>(
      `INSERT INTO conversations
         (client_slug, external_id, platform, contact_id, contact_name,
          last_message, last_message_at, unread, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT ON CONSTRAINT conversations_client_external_unique DO UPDATE
         SET last_message     = EXCLUDED.last_message,
             last_message_at  = EXCLUDED.last_message_at,
             contact_name     = COALESCE(EXCLUDED.contact_name, conversations.contact_name),
             unread           = CASE WHEN $8 THEN true ELSE conversations.unread END,
             updated_at       = NOW()
       RETURNING id`,
      [
        client,
        externalId,
        platform,
        contactId || null,
        contactName,
        messageText || null,
        messageTimestamp,
        direction === "inbound",
      ],
    );
    conversationId = upsertResult.rows[0]?.id ?? null;
  } catch (err) {
    req.log.error({ err, client, externalId }, "Failed to upsert conversation");
    res.status(500).json({ error: "Database error" });
    return;
  }

  // --- Insert message ---
  if (messageText && conversationId) {
    try {
      await pool.query(
        `INSERT INTO messages (conversation_id, external_id, role, content, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [conversationId, messageExternalId, role, messageText, messageTimestamp],
      );
    } catch (err) {
      req.log.error({ err, conversationId }, "Failed to insert message");
    }
  }

  req.log.info(
    { client, externalId, platform, role, conversationId },
    "Zernio message.received processed successfully",
  );

  res.json({ ok: true });
});

export default router;
