import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Local-only "archive" overlay for inbox conversations.
 *
 * Why local-only:
 * The canonical backend (api.unboks.org) does not yet expose
 * `archived_at` on the conversations table or a POST/DELETE archive
 * endpoint, and the brief is explicit: "Do not use local-only storage
 * for archive state unless explicitly marked temporary and reported."
 * So this overlay is wired with two compensating controls:
 *
 *   1. Honest UI badging — every place that surfaces an archive state
 *      labels it "Archived locally" so operators never assume the
 *      decision synced to the backend or to a teammate's browser.
 *   2. Auto-restore on new inbound — `isArchived(keys, lastMessageMs)`
 *      treats a row as un-archived when a fresh inbound message has
 *      arrived after the archive timestamp. That mirrors the spec
 *      ("Archived conversation reopens when a new incoming message
 *      arrives") even without backend cooperation, since the list
 *      response already carries `last_message_at`.
 *
 * Storage shape: a `Record<key, archivedAtIso>` under
 * `localStorage["unboks_archived_conversations"]`. Keys mirror the
 * sanitised identifier set used by `useHiddenConversations`
 * (conversationKey, id, escalationId — never display name) so a
 * single archive call covers every row shape we might see.
 *
 * Cross-tab sync: same pattern as `useHiddenConversations` —
 * `storage` event for other tabs + a custom in-tab event so the
 * inbox list, detail pane, and sidebar counts all re-render on the
 * same tick.
 */

const STORAGE_KEY = "unboks_archived_conversations";
const EVENT_NAME = "unboks_archived_conversations_changed";

type ArchiveMap = Record<string, string>;

function readFromStorage(): ArchiveMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ArchiveMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (typeof v !== "string" || !v.trim()) continue;
      // Validate the ISO timestamp — drop entries we can't parse so the
      // overlay never traps a row in archive forever because of corrupt
      // data.
      const ms = Date.parse(v);
      if (!Number.isFinite(ms)) continue;
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeToStorage(map: ArchiveMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Quota / privacy mode: non-fatal, the in-memory map keeps working
    // for the lifetime of this tab.
  }
}

/** Same sanitisation contract as `useHiddenConversations.sanitizeKeys` —
 *  keep the two overlays in lockstep so a row is never archived under
 *  one identifier but visible under another. */
function sanitizeKeys(keys: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (t === "null" || t === "undefined") continue;
    if (/^unknown( contact)?$/i.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export interface ArchivedConversationsApi {
  /** Reactive snapshot — a fresh object on every change so React
   *  components depending on it re-render. */
  archived: ArchiveMap;
  /**
   * True when at least one supplied key was archived AND no fresher
   * inbound message has arrived since. `lastMessageMs` is the row's
   * raw last_message_at epoch — pass `0` / `undefined` to skip the
   * auto-restore comparison (e.g. when filtering a row that genuinely
   * has no last-message timestamp).
   */
  isArchived: (
    keys: ReadonlyArray<string | null | undefined>,
    lastMessageMs?: number,
  ) => boolean;
  /** Earliest `archivedAt` timestamp across the supplied keys (ISO),
   *  or `null` when none are archived. Useful for surface labels like
   *  "Archived 2 days ago". */
  getArchivedAt: (keys: ReadonlyArray<string | null | undefined>) => string | null;
  /** Mark the supplied keys as archived (now). Returns the keys that
   *  were actually persisted (after sanitisation). */
  archive: (keys: ReadonlyArray<string | null | undefined>) => string[];
  /** Remove the supplied keys from the archive overlay. */
  unarchive: (keys: ReadonlyArray<string | null | undefined>) => void;
}

export function useArchivedConversations(): ArchivedConversationsApi {
  const [archived, setArchived] = useState<ArchiveMap>(readFromStorage);

  useEffect(() => {
    const sync = () => setArchived(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const isArchived = useCallback(
    (
      keys: ReadonlyArray<string | null | undefined>,
      lastMessageMs?: number,
    ): boolean => {
      const safe = sanitizeKeys(keys);
      if (safe.length === 0) return false;
      // Use the LATEST archive timestamp across keys for the auto-
      // restore comparison. A row can carry multiple identifiers
      // (conversationKey / id / escalationId) and the same row may be
      // re-archived after being restored — taking the max means we
      // never prematurely un-archive based on a stale earlier
      // timestamp belonging to a different archive event.
      let latest = Number.NEGATIVE_INFINITY;
      for (const k of safe) {
        const iso = archived[k];
        if (!iso) continue;
        const ms = Date.parse(iso);
        if (Number.isFinite(ms) && ms > latest) latest = ms;
      }
      if (!Number.isFinite(latest)) return false;
      // Auto-restore: a fresh inbound message strictly after the most
      // recent archive moment returns the row to the active inbox
      // without operator action.
      if (
        typeof lastMessageMs === "number" &&
        lastMessageMs > 0 &&
        lastMessageMs > latest
      ) {
        return false;
      }
      return true;
    },
    [archived],
  );

  const getArchivedAt = useCallback(
    (keys: ReadonlyArray<string | null | undefined>): string | null => {
      const safe = sanitizeKeys(keys);
      // Mirror `isArchived`: report the LATEST archive moment across
      // keys, since that's the one auto-restore is measured against.
      let bestIso: string | null = null;
      let bestMs = Number.NEGATIVE_INFINITY;
      for (const k of safe) {
        const iso = archived[k];
        if (!iso) continue;
        const ms = Date.parse(iso);
        if (Number.isFinite(ms) && ms > bestMs) {
          bestMs = ms;
          bestIso = iso;
        }
      }
      return bestIso;
    },
    [archived],
  );

  const archive = useCallback(
    (keys: ReadonlyArray<string | null | undefined>): string[] => {
      const safe = sanitizeKeys(keys);
      if (safe.length === 0) return [];
      const current = readFromStorage();
      const nowIso = new Date().toISOString();
      let changed = false;
      for (const k of safe) {
        if (current[k] !== nowIso) {
          current[k] = nowIso;
          changed = true;
        }
      }
      if (changed) {
        writeToStorage(current);
        setArchived({ ...current });
      }
      return safe;
    },
    [],
  );

  const unarchive = useCallback(
    (keys: ReadonlyArray<string | null | undefined>) => {
      const safe = sanitizeKeys(keys);
      if (safe.length === 0) return;
      const current = readFromStorage();
      let changed = false;
      for (const k of safe) {
        if (k in current) {
          delete current[k];
          changed = true;
        }
      }
      if (changed) {
        writeToStorage(current);
        setArchived({ ...current });
      }
    },
    [],
  );

  return useMemo(
    () => ({ archived, isArchived, getArchivedAt, archive, unarchive }),
    [archived, isArchived, getArchivedAt, archive, unarchive],
  );
}
