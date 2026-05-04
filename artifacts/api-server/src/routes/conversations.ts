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
    }>(
      `SELECT external_id, contact_name, contact_id, last_message, last_message_at,
              unread, platform, escalated
         FROM conversations
        WHERE client_slug = $1
        ORDER BY COALESCE(last_message_at, created_at) DESC`,
      [client],
    );

    const conversations = result.rows.map((row) => ({
      phone: row.external_id,
      name: row.contact_name ?? row.contact_id ?? "Unknown contact",
      lastMessage: row.last_message ?? "",
      timestamp: formatTimestamp(row.last_message_at),
      unread: row.unread,
      platform: row.platform,
      escalated: row.escalated,
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
    }>(
      `SELECT id, external_id, contact_name, contact_id, platform
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
      platform: conv.platform,
      messages: msgResult.rows.map((m) => ({
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
    }>(
      `SELECT id, external_id, contact_name, contact_id, last_message,
              platform, created_at, escalation_resolved
         FROM conversations
        WHERE client_slug = $1 AND escalated = true
        ORDER BY created_at DESC`,
      [client],
    );

    const escalations = result.rows.map((row) => ({
      id: row.id,
      customerName: row.contact_name ?? row.contact_id ?? "Unknown",
      issue: row.last_message ?? "Escalated",
      platform: row.platform,
      createdAt: row.created_at.toISOString(),
      resolved: row.escalation_resolved,
      phone: row.external_id,
    }));

    res.json(escalations);
  } catch (err) {
    req.log.error({ err, client }, "Failed to fetch escalations");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/escalations/:id/resolve
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/escalations/:id/resolve", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE conversations SET escalation_resolved = true, updated_at = NOW()
        WHERE id = $1`,
      [id],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, id }, "Failed to resolve escalation");
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/:client/dashboard/api/escalations/:id/reply (stub)
// ---------------------------------------------------------------------------

router.post("/:client/dashboard/api/escalations/:id/reply", requireAuth, (req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/:client/dashboard/api/escalations/:id
// ---------------------------------------------------------------------------

router.delete("/:client/dashboard/api/escalations/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE conversations SET escalated = false, updated_at = NOW()
        WHERE id = $1`,
      [id],
    );
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, id }, "Failed to delete escalation");
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
    const platforms = result.rows.map((r) => r.platform).filter(Boolean);
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
    const result = await pool.query<{ active: string; escalations: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE unread = true)  AS active,
         COUNT(*) FILTER (WHERE escalated = true AND escalation_resolved = false) AS escalations
       FROM conversations
       WHERE client_slug = $1`,
      [client],
    );
    const row = result.rows[0];
    res.json({
      status: "ok",
      activeConversations: parseInt(row?.active ?? "0", 10),
      openEscalations: parseInt(row?.escalations ?? "0", 10),
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
