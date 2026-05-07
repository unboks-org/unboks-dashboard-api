/**
 * dedupeEscalations — collapse multiple escalation rows that point at the
 * same active conversation into a single row.
 *
 * Why this exists
 * ===============
 * The Python backend has historically emitted more than one /escalations
 * row for the same conversation (one per AI re-flag, one per mode change,
 * etc.). The dashboard rendered them all, so e.g. Calvin appeared three
 * times in the Escalations list while there was really just one active
 * thread to handle. Sidebar count was inflated identically.
 *
 * Both the sidebar count and the Escalations list MUST consume this helper
 * so they always agree.
 *
 * Dedup key
 * =========
 *   - `phone` when present (covers WhatsApp wa_id, generic external_id,
 *     conversation_id — whichever the normalizer found first).
 *   - When `phone` is missing we DO NOT collapse the row against any other
 *     row. Keying by name+platform was tempting but risks merging two real
 *     conversations that happen to share a name (or, worst case, two
 *     "Unknown contact" rows). Each row keeps its own escalation `id` as
 *     the group key in that case, so it remains a separate row.
 *
 * Distinct conversations from the same customer keep their stable ids
 * (different phone) and therefore stay as separate rows. ✓ spec rule 6.
 *
 * Merge rules
 * ===========
 * Within a group:
 *   - Sort newest-first by `createdAt` (ms-parsed; missing → 0).
 *   - Keep the newest unresolved row as the base.
 *   - Mode: hard wins over soft wins over null.
 *   - Summary: prefer the first non-empty in newest-first order.
 *   - Phone: prefer the first non-empty in newest-first order so a row that
 *     does have a real phone wins over one that doesn't.
 *   - id / customerName / platform / createdAt: from the newest row.
 *
 * Resolved rows
 * =============
 * Callers should already drop resolved rows BEFORE calling this; we don't
 * filter here so the helper stays neutral about what counts as "active".
 */

import type { NormalizedEscalation } from "./conversation-mapper";

function parseMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function groupKey(n: NormalizedEscalation): string {
  if (n.phone && n.phone.trim().length > 0) return `phone:${n.phone}`;
  // No stable conversation id — keep this row in its own group. Merging
  // by name/platform would risk collapsing genuinely-distinct
  // conversations (especially the "Unknown contact" case).
  return `id:${n.id}`;
}

function modeRank(mode: NormalizedEscalation["mode"]): number {
  if (mode === "hard") return 2;
  if (mode === "soft") return 1;
  return 0;
}

export function dedupeEscalations(
  rows: NormalizedEscalation[],
): NormalizedEscalation[] {
  const groups = new Map<string, NormalizedEscalation[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  const out: NormalizedEscalation[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    // Newest first so "first non-empty" prefers the freshest data.
    const sorted = [...group].sort(
      (a, b) => parseMs(b.createdAt) - parseMs(a.createdAt),
    );
    const base = sorted[0];

    // Mode: highest rank across the group (hard > soft > null).
    let mergedMode = base.mode;
    for (const r of sorted) {
      if (modeRank(r.mode) > modeRank(mergedMode)) mergedMode = r.mode;
    }

    // First non-empty summary in newest-first order.
    let mergedSummary = base.summary;
    if (!mergedSummary || mergedSummary.trim().length === 0) {
      for (const r of sorted) {
        if (r.summary && r.summary.trim().length > 0) {
          mergedSummary = r.summary;
          break;
        }
      }
    }

    // First non-empty phone in newest-first order.
    let mergedPhone = base.phone;
    if (!mergedPhone || mergedPhone.trim().length === 0) {
      for (const r of sorted) {
        if (r.phone && r.phone.trim().length > 0) {
          mergedPhone = r.phone;
          break;
        }
      }
    }

    out.push({
      ...base,
      phone: mergedPhone,
      mode: mergedMode,
      summary: mergedSummary,
    });
  }

  return out;
}
