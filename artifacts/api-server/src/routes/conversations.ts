import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(date: Date | null | undefined): string {
  if (!date) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 24) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (diffH < 48) return "Yesterday";
  if (diffH < 168) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function normalizeMode(v: unknown): "soft" | "hard" | null {
  const s = String(v ?? "").toLowerCase();
  if (s === "soft" || s === "ai_help") return "soft";
  if (s === "hard" || s === "human_takeover") return "hard";
  return null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// GET /api/:client/dashboard/api/messages/conversations
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/messages/conversations", requireAuth, async (req, res) => {
  const { client } = req.params;
  try {
    const result = await pool.query<{
      external_id: string;
      contact_name: string | null;
      contact_id: string | null;
      last_message: string | null;
      last_message_at: Date | null;
      unread: boolean;
      platform: string;
      escalated: boolean;
      escalation_mode: string | null;
      escalation_summary: string | null;
      learning_status: string;
    }>(
      `SELECT external_id, contact_name, contact_id, last_message, last_message_at,
              unread, platform, escalated,
              escalation_mode, escalation_summary, learning_status
         FROM conversations
        WHERE client_slug = $1
        ORDER BY COALESCE(last_message_at, created_at) DESC`,
      [client],
    );

    const conversations = result.rows.map((row: any) => ({
      phone: row.external_id,
      name: row.contact_name ?? row.contact_id ?? "Unknown contact",
      lastMessage: row.last_message ?? "",
      timestamp: formatTimestamp(row.last_message_at),
      unread: row.unread,
      platform: row.platform,
      escalated: row.escalated,
      escalationMode: row.escalation_mode,
      escalationSummary: row.escalation_summary,
      learningStatus: row.learning_status,
      hasAttachment: false,
    }));

    res.json(conversations);
  } catch (err) {
    req.log.error({ err, client }, "Failed to fetch conversations");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/:client/dashboard/api/messages/conversations/:id
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/messages/conversations/:id", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  const externalId = decodeURIComponent(id);

  try {
    const convResult = await pool.query<{
      id: string;
      external_id: string;
      contact_name: string | null;
      contact_id: string | null;
      platform: string;
      escalated: boolean;
      escalation_resolved: boolean;
      escalation_mode: string | null;
      escalation_reason: string | null;
      escalation_summary: string | null;
      human_guidance: string | null;
      human_responder: string | null;
      human_responded_at: Date | null;
      learning_status: string;
    }>(
      `SELECT id, external_id, contact_name, contact_id, platform,
              escalated, escalation_resolved,
              escalation_mode, escalation_reason, escalation_summary,
              human_guidance, human_responder, human_responded_at,
              learning_status
         FROM conversations
        WHERE client_slug = $1 AND external_id = $2
        LIMIT 1`,
      [client, externalId],
    );

    if (convResult.rows.length === 0) {
      res.status(404).json({ detail: "Conversation not found" });
      return;
    }

    const conv = convResult.rows[0]!;

    const msgResult = await pool.query<{
      id: string;
      role: string;
      content: string;
      created_at: Date;
    }>(
      `SELECT id, role, content, created_at
         FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC`,
      [conv.id],
    );

    res.json({
      phone: conv.external_id,
      name: conv.contact_name ?? conv.contact_id ?? "Unknown contact",
      contactId: conv.contact_id,
      platform: conv.platform,
      escalated: conv.escalated,
      escalationResolved: conv.escalation_resolved,
      escalationMode: conv.escalation_mode,
      escalationReason: conv.escalation_reason,
      escalationSummary: conv.escalation_summary,
      humanGuidance: conv.human_guidance,
      humanResponder: conv.human_responder,
      humanRespondedAt: conv.human_responded_at?.toISOString() ?? null,
      learningStatus: conv.learning_status,
      messages: msgResult.rows.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.created_at.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err, client, id }, "Failed to fetch conversation detail");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/:client/dashboard/api/messages/conversations/:id
// ---------------------------------------------------------------------------

router.delete("/:client/dashboard/api/messages/conversations/:id", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  const externalId = decodeURIComponent(id);
  try {
    await pool.query(
      `DELETE FROM conversations WHERE client_slug = $1 AND external_id = $2`,
      [client, externalId],
    );
    res.status(204).send();
  } catch (err) {
    req.log.error({ err, client, id }, "Failed to delete conversation");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/messages/suggest-reply (stub)
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/messages/suggest-reply", requireAuth, (req, res) => {
  res.json({ suggestion: "Thank you for your message! We will get back to you shortly." });
});

// ---------------------------------------------------------------------------
// GET /api/:client/dashboard/api/escalations
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/escalations", requireAuth, async (req, res) => {
  const { client } = req.params;
  const modeFilter = String((req.query.mode as string | undefined) ?? "").toLowerCase();
  const filterMode =
    modeFilter === "soft" || modeFilter === "hard" ? modeFilter : null;
  try {
    const result = await pool.query<{
      id: string;
      external_id: string;
      contact_name: string | null;
      contact_id: string | null;
      last_message: string | null;
      platform: string;
      created_at: Date;
      escalation_resolved: boolean;
      escalation_mode: string | null;
      escalation_reason: string | null;
      escalation_summary: string | null;
      learning_status: string;
    }>(
      `SELECT id, external_id, contact_name, contact_id, last_message,
              platform, created_at, escalation_resolved,
              escalation_mode, escalation_reason, escalation_summary, learning_status
         FROM conversations
        WHERE client_slug = $1 AND escalated = true
          AND ($2::text IS NULL OR escalation_mode = $2::text)
        ORDER BY created_at DESC`,
      [client, filterMode],
    );

    const escalations = result.rows.map((row: any) => ({
      id: row.id,
      customerName: row.contact_name ?? row.contact_id ?? "Unknown",
      issue: row.escalation_summary ?? row.last_message ?? "Escalated",
      platform: row.platform,
      createdAt: row.created_at.toISOString(),
      resolved: row.escalation_resolved,
      phone: row.external_id,
      mode: row.escalation_mode,
      reason: row.escalation_reason,
      summary: row.escalation_summary,
      learningStatus: row.learning_status,
    }));

    res.json(escalations);
  } catch (err) {
    req.log.error({ err, client }, "Failed to fetch escalations");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/escalations/:id/guidance
// Soft-escalation: save guidance to conversation, optionally create learning entry.
// Does NOT auto-resolve.
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/escalations/:id/guidance", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const guidance = strOrNull(body.guidance);
  if (!guidance) {
    res.status(400).json({ error: "guidance is required" });
    return;
  }
  const saveToYourInfo = body.saveToYourInfo === true;
  const autoUseNextTime = body.autoUseNextTime === true;
  const category = strOrNull(body.category);

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    const convRes = await dbClient.query<{
      id: string;
      escalation_summary: string | null;
      escalation_reason: string | null;
      last_message: string | null;
    }>(
      `UPDATE conversations
          SET human_guidance         = $3,
              human_responder        = $4,
              human_responded_at     = NOW(),
              learn_from_resolution  = CASE WHEN $5 THEN true ELSE learn_from_resolution END,
              ai_may_use_automatically = CASE WHEN $6 THEN true ELSE ai_may_use_automatically END,
              learning_status        = CASE
                WHEN $5 AND $6 THEN 'approved'
                WHEN $5 THEN 'suggested'
                ELSE learning_status
              END,
              updated_at             = NOW()
        WHERE client_slug = $1 AND id = $2
        RETURNING id, escalation_summary, escalation_reason, last_message`,
      [client, id, guidance, client, saveToYourInfo, autoUseNextTime],
    );

    if (convRes.rows.length === 0) {
      await dbClient.query("ROLLBACK");
      res.status(404).json({ error: "Escalation not found" });
      return;
    }

    let learningEntryId: string | null = null;
    if (saveToYourInfo) {
      const c = convRes.rows[0]!;
      const sourceQuestion = c.escalation_summary ?? c.last_message ?? "(no question recorded)";
      // Idempotent upsert keyed by (client, conversation).
      const learnRes = await dbClient.query<{ id: string }>(
        `INSERT INTO learning_entries
           (client_slug, conversation_id, source_question, ai_uncertainty,
            human_answer, category, ai_may_use_automatically, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (client_slug, conversation_id) WHERE conversation_id IS NOT NULL
           DO UPDATE SET
             source_question          = EXCLUDED.source_question,
             ai_uncertainty           = EXCLUDED.ai_uncertainty,
             human_answer             = EXCLUDED.human_answer,
             category                 = COALESCE(EXCLUDED.category, learning_entries.category),
             ai_may_use_automatically = EXCLUDED.ai_may_use_automatically,
             status                   = EXCLUDED.status,
             updated_at               = NOW()
         RETURNING id`,
        [
          client,
          c.id,
          sourceQuestion,
          c.escalation_reason,
          guidance,
          category,
          autoUseNextTime,
          autoUseNextTime ? "approved" : "suggested",
          client,
        ],
      );
      learningEntryId = learnRes.rows[0]?.id ?? null;
    }

    await dbClient.query("COMMIT");
    res.json({ ok: true, learningEntryId });
  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    req.log.error({ err, client, id }, "Failed to save guidance");
    res.status(500).json({ error: "Database error" });
  } finally {
    dbClient.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/escalations/:id/takeover
// Hard-escalation: mark mode='hard'. Does NOT auto-resolve.
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/escalations/:id/takeover", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const note = strOrNull(body.note);
  try {
    const r = await pool.query(
      `UPDATE conversations
          SET escalation_mode       = 'hard',
              escalation_created_at = COALESCE(escalation_created_at, NOW()),
              human_responder       = $3,
              human_responded_at    = NOW(),
              human_guidance        = COALESCE($4, human_guidance),
              updated_at            = NOW()
        WHERE client_slug = $1 AND id = $2`,
      [client, id, client, note],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: "Escalation not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, client, id }, "Failed to takeover");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/escalations/:id/mode
// Operator manually sets mode (soft|hard).
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/escalations/:id/mode", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode = normalizeMode(body.mode);
  if (!mode) {
    res.status(400).json({ error: "mode must be 'soft' or 'hard'" });
    return;
  }
  try {
    const r = await pool.query(
      `UPDATE conversations
          SET escalation_mode       = $3,
              escalation_created_at = COALESCE(escalation_created_at, NOW()),
              updated_at            = NOW()
        WHERE client_slug = $1 AND id = $2`,
      [client, id, mode],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: "Escalation not found" });
      return;
    }
    res.json({ ok: true, mode });
  } catch (err) {
    req.log.error({ err, client, id }, "Failed to set mode");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/escalations/:id/resolve
// Extended: optionally accept resolution notes + create learning entry.
// Backwards compatible with no-body call.
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/escalations/:id/resolve", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const resolutionNote = strOrNull(body.resolutionNote);
  const saveAsLearning = body.saveAsLearning === true;
  const autoUseNextTime = body.autoUseNextTime === true;
  const category = strOrNull(body.category);

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    const convRes = await dbClient.query<{
      id: string;
      escalation_summary: string | null;
      escalation_reason: string | null;
      last_message: string | null;
    }>(
      `UPDATE conversations
          SET escalation_resolved = true,
              human_guidance      = COALESCE($3, human_guidance),
              human_responder     = COALESCE(human_responder, $4),
              human_responded_at  = COALESCE(human_responded_at, NOW()),
              learn_from_resolution    = CASE WHEN $5 THEN true ELSE learn_from_resolution END,
              ai_may_use_automatically = CASE WHEN $6 THEN true ELSE ai_may_use_automatically END,
              learning_status     = CASE
                WHEN $5 AND $6 THEN 'approved'
                WHEN $5 THEN 'suggested'
                ELSE learning_status
              END,
              updated_at          = NOW()
        WHERE client_slug = $1 AND id = $2
        RETURNING id, escalation_summary, escalation_reason, last_message`,
      [client, id, resolutionNote, client, saveAsLearning, autoUseNextTime],
    );

    if (convRes.rows.length === 0) {
      await dbClient.query("ROLLBACK");
      res.status(404).json({ error: "Escalation not found" });
      return;
    }

    let learningEntryId: string | null = null;
    if (saveAsLearning && resolutionNote) {
      const c = convRes.rows[0]!;
      const sourceQuestion = c.escalation_summary ?? c.last_message ?? "(no question recorded)";
      // Idempotent upsert keyed by (client, conversation).
      const learnRes = await dbClient.query<{ id: string }>(
        `INSERT INTO learning_entries
           (client_slug, conversation_id, source_question, ai_uncertainty,
            human_answer, category, ai_may_use_automatically, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (client_slug, conversation_id) WHERE conversation_id IS NOT NULL
           DO UPDATE SET
             source_question          = EXCLUDED.source_question,
             ai_uncertainty           = EXCLUDED.ai_uncertainty,
             human_answer             = EXCLUDED.human_answer,
             category                 = COALESCE(EXCLUDED.category, learning_entries.category),
             ai_may_use_automatically = EXCLUDED.ai_may_use_automatically,
             status                   = EXCLUDED.status,
             updated_at               = NOW()
         RETURNING id`,
        [
          client,
          c.id,
          sourceQuestion,
          c.escalation_reason,
          resolutionNote,
          category,
          autoUseNextTime,
          autoUseNextTime ? "approved" : "suggested",
          client,
        ],
      );
      learningEntryId = learnRes.rows[0]?.id ?? null;
    }

    await dbClient.query("COMMIT");
    res.json({ ok: true, learningEntryId });
  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    req.log.error({ err, client, id }, "Failed to resolve escalation");
    res.status(500).json({ error: "Database error" });
  } finally {
    dbClient.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/escalations/:id/reply (stub)
// Kept for backwards compatibility — outbound delivery is out of scope for v1.
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/escalations/:id/reply", requireAuth, (req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/:client/dashboard/api/escalations/:id
// ---------------------------------------------------------------------------

router.delete("/:client/dashboard/api/escalations/:id", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  try {
    await pool.query(
      `UPDATE conversations SET escalated = false, updated_at = NOW()
        WHERE client_slug = $1 AND id = $2`,
      [client, id],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, client, id }, "Failed to delete escalation");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// Learning entries (basic)
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/learning", requireAuth, async (req, res) => {
  const { client } = req.params;
  const status = strOrNull(req.query.status as string | undefined);
  try {
    const result = await pool.query(
      `SELECT id, conversation_id, source_question, ai_uncertainty, human_answer,
              category, ai_may_use_automatically, status, created_by, created_at, updated_at
         FROM learning_entries
        WHERE client_slug = $1
          AND ($2::text IS NULL OR status = $2::text)
        ORDER BY created_at DESC
        LIMIT 200`,
      [client, status],
    );
    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        conversationId: r.conversation_id,
        sourceQuestion: r.source_question,
        aiUncertainty: r.ai_uncertainty,
        humanAnswer: r.human_answer,
        category: r.category,
        aiMayUseAutomatically: r.ai_may_use_automatically,
        status: r.status,
        createdBy: r.created_by,
        createdAt: r.created_at?.toISOString?.() ?? null,
        updatedAt: r.updated_at?.toISOString?.() ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err, client }, "Failed to list learning entries");
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/:client/dashboard/api/learning/:id/approve", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE learning_entries SET status = 'approved', updated_at = NOW()
        WHERE client_slug = $1 AND id = $2`,
      [client, id],
    );
    if (r.rowCount === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, client, id }, "approve failed");
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/:client/dashboard/api/learning/:id/save", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  try {
    const r = await pool.query(
      `UPDATE learning_entries SET status = 'saved', updated_at = NOW()
        WHERE client_slug = $1 AND id = $2`,
      [client, id],
    );
    if (r.rowCount === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, client, id }, "save failed");
    res.status(500).json({ error: "Database error" });
  }
});

router.delete("/:client/dashboard/api/learning/:id", requireAuth, async (req, res) => {
  const { client, id } = req.params;
  try {
    const r = await pool.query(
      `DELETE FROM learning_entries WHERE client_slug = $1 AND id = $2`,
      [client, id],
    );
    if (r.rowCount === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, client, id }, "delete learning failed");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/:client/dashboard/api/availability (stub)
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/availability", requireAuth, (_req, res) => {
  res.json([]);
});

// ---------------------------------------------------------------------------
// GET /api/:client/dashboard/api/config
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/config", requireAuth, async (req, res) => {
  const { client } = req.params;
  try {
    const result = await pool.query<{ platform: string }>(
      `SELECT DISTINCT platform FROM conversations WHERE client_slug = $1`,
      [client],
    );
    const platforms = result.rows.map((r: any) => r.platform).filter(Boolean);
    res.json({
      clientName: client,
      connectedPlatforms: platforms.length > 0 ? platforms : ["whatsapp"],
      features: { dryRun: false },
    });
  } catch {
    res.json({
      clientName: client,
      connectedPlatforms: ["whatsapp"],
      features: { dryRun: false },
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/:client/dashboard/api/status
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/status", requireAuth, async (req, res) => {
  const { client } = req.params;
  try {
    const result = await pool.query<{
      active: string;
      escalations: string;
      soft_escalations: string;
      hard_escalations: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE unread = true)  AS active,
         COUNT(*) FILTER (WHERE escalated = true AND escalation_resolved = false) AS escalations,
         COUNT(*) FILTER (WHERE escalated = true AND escalation_resolved = false AND escalation_mode = 'soft') AS soft_escalations,
         COUNT(*) FILTER (WHERE escalated = true AND escalation_resolved = false AND escalation_mode = 'hard') AS hard_escalations
       FROM conversations
       WHERE client_slug = $1`,
      [client],
    );
    const row = result.rows[0];
    res.json({
      status: "ok",
      activeConversations: parseInt(row?.active ?? "0", 10),
      openEscalations: parseInt(row?.escalations ?? "0", 10),
      openSoftEscalations: parseInt(row?.soft_escalations ?? "0", 10),
      openHardEscalations: parseInt(row?.hard_escalations ?? "0", 10),
      uptime: process.uptime().toFixed(0) + "s",
    });
  } catch {
    res.json({ status: "ok", activeConversations: 0, openEscalations: 0, uptime: "0s" });
  }
});

// ---------------------------------------------------------------------------
// GET/POST /api/:client/dashboard/api/settings/dry-run (stub)
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/settings/dry-run", requireAuth, (_req, res) => {
  res.json({ enabled: false });
});

router.post("/:client/dashboard/api/settings/dry-run", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET/PUT /api/:client/dashboard/api/schedule/slots (stub)
// ---------------------------------------------------------------------------

router.get("/:client/dashboard/api/schedule/slots", requireAuth, (_req, res) => {
  res.json([
    { day: "Monday", startTime: "09:00", endTime: "17:00", enabled: true },
    { day: "Tuesday", startTime: "09:00", endTime: "17:00", enabled: true },
    { day: "Wednesday", startTime: "09:00", endTime: "17:00", enabled: true },
    { day: "Thursday", startTime: "09:00", endTime: "17:00", enabled: true },
    { day: "Friday", startTime: "09:00", endTime: "17:00", enabled: true },
    { day: "Saturday", startTime: "09:00", endTime: "13:00", enabled: false },
    { day: "Sunday", startTime: "09:00", endTime: "13:00", enabled: false },
  ]);
});

router.put("/:client/dashboard/api/schedule/slots", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

export default router;
