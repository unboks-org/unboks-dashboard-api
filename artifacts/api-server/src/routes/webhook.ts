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

  // Detect AI/Jr handoff or escalation flags from any of the supported field names.
  const shouldEscalate =
    data["escalated"] === true ||
    data["requires_human"] === true ||
    data["requiresHuman"] === true ||
    data["handoff_required"] === true ||
    data["handoffRequired"] === true ||
    data["escalation"] === true ||
    event["escalated"] === true ||
    event["requires_human"] === true ||
    event["requiresHuman"] === true;

  // --- Normalize escalation mode (soft / hard / null) ---
  const rawMode =
    data["escalation_mode"] ?? data["escalationMode"] ??
    data["escalation_type"] ?? data["escalationType"] ??
    data["handoff_type"]    ?? data["handoffType"] ??
    event["escalation_mode"] ?? event["escalationMode"];

  let escalationMode: "soft" | "hard" | null = null;
  const m = String(rawMode ?? "").toLowerCase();
  if (m === "soft" || m === "ai_help") escalationMode = "soft";
  else if (m === "hard" || m === "human_takeover") escalationMode = "hard";

  // Defaulting when only boolean flags are present:
  if (escalationMode === null && shouldEscalate) {
    if (data["handoff_required"] === true || data["handoffRequired"] === true) {
      escalationMode = "hard";
    } else {
      // requires_human / escalated / escalation → soft (per v1 spec)
      escalationMode = "soft";
    }
  }

  // If a mode was explicitly supplied (without any boolean flag), treat it as escalation.
  const escalateFinal = shouldEscalate || escalationMode !== null;

  const trimmedOrNull = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  const escalationReason = trimmedOrNull(
    data["escalation_reason"] ?? data["escalationReason"],
  );
  const escalationSummary = trimmedOrNull(
    data["escalation_summary"] ?? data["escalationSummary"],
  );

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
          last_message, last_message_at, unread, escalated,
          escalation_mode, escalation_reason, escalation_summary, escalation_created_at,
          updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, $12,
               CASE WHEN $9 THEN NOW() ELSE NULL END,
               NOW())
       ON CONFLICT ON CONSTRAINT conversations_client_external_unique DO UPDATE
         SET last_message     = EXCLUDED.last_message,
             last_message_at  = EXCLUDED.last_message_at,
             contact_name     = COALESCE(EXCLUDED.contact_name, conversations.contact_name),
             unread           = CASE WHEN $8 THEN true ELSE conversations.unread END,
             escalated        = CASE WHEN $9 THEN true ELSE conversations.escalated END,
             -- Monotonic mode: hard wins; soft only sets when prior mode is not hard.
             escalation_mode  = CASE
               WHEN $10::text = 'hard' THEN 'hard'
               WHEN $10::text = 'soft' AND conversations.escalation_mode IS DISTINCT FROM 'hard' THEN 'soft'
               ELSE conversations.escalation_mode
             END,
             escalation_reason     = COALESCE($11, conversations.escalation_reason),
             escalation_summary    = COALESCE($12, conversations.escalation_summary),
             escalation_created_at = COALESCE(
               conversations.escalation_created_at,
               CASE WHEN $9 THEN NOW() ELSE NULL END
             ),
             updated_at            = NOW()
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
        escalateFinal,
        escalationMode,
        escalationReason,
        escalationSummary,
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
