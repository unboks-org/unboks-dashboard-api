import { useCallback, useEffect, useState } from "react";

/**
 * Local "hide" fallback for email/escalation rows whose backend
 * delete endpoint is not deployed (404 / 405 / 501) or whose row is
 * synthesized client-side (e.g. an escalation with no resolvable
 * conversation key). The set of hidden keys is persisted in
 * localStorage and surfaced to every list that needs to filter
 * deleted rows out of view (Inbox list, Email channel list,
 * Escalations list, sidebar counts).
 *
 * Storage format: a JSON array of strings under
 *   localStorage["unboks_hidden_conversations"]
 *
 * The set holds *every* identifier we have for a row — the routable
 * `conversationKey`, the display `id`, and (for escalation rows) the
 * escalation id. Hiding by any one of those keys is enough to drop
 * the row, so we don't have to worry about which identifier surfaces
 * when the backend re-emits the row in a slightly different shape.
 *
 * Cross-tab sync mirrors `useAccountSettings`: a `storage` event
 * (other tabs) plus a custom in-tab event so the hide is reflected
 * everywhere on the same render tick.
 */

const STORAGE_KEY = "unboks_hidden_conversations";
const EVENT_NAME = "unboks_hidden_conversations_changed";

function readFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const v of parsed) {
      if (typeof v === "string") {
        const t = v.trim();
        if (t.length > 0) out.add(t);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

function writeToStorage(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Quota / privacy mode: non-fatal, the in-memory set still works
    // for the lifetime of this tab.
  }
}

/** Normalise a list of candidate keys: trim, drop empty / "null" /
 *  "undefined" / display-name-ish placeholders ("Unknown" / "Unknown
 *  contact"). The brief is explicit: never use display name as the
 *  hide key. */
function sanitizeKeys(keys: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (t === "null" || t === "undefined") continue;
    // Defensive: "Unknown" / "Unknown contact" are display fallbacks
    // from `safeDisplayName`, never stable identifiers.
    if (/^unknown( contact)?$/i.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export interface HiddenConversationsApi {
  /** Reactive read-only Set. New reference on every change so React
   *  components that depend on it re-render. */
  hidden: Set<string>;
  /** True if any of the supplied keys are currently hidden. */
  isHidden: (keys: ReadonlyArray<string | null | undefined>) => boolean;
  /** Add the supplied keys to the hidden set. Returns the keys that
   *  were actually persisted (after sanitisation). */
  hide: (keys: ReadonlyArray<string | null | undefined>) => string[];
  /** Remove the supplied keys from the hidden set. Mainly for tests
   *  / future "Restore" UI; not used by the current bugfix. */
  unhide: (keys: ReadonlyArray<string | null | undefined>) => void;
}

export function useHiddenConversations(): HiddenConversationsApi {
  const [hidden, setHidden] = useState<Set<string>>(readFromStorage);

  useEffect(() => {
    const sync = () => setHidden(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const isHidden = useCallback(
    (keys: ReadonlyArray<string | null | undefined>) => {
      const safe = sanitizeKeys(keys);
      for (const k of safe) {
        if (hidden.has(k)) return true;
      }
      return false;
    },
    [hidden],
  );

  const hide = useCallback(
    (keys: ReadonlyArray<string | null | undefined>): string[] => {
      const safe = sanitizeKeys(keys);
      if (safe.length === 0) return [];
      const current = readFromStorage();
      let changed = false;
      for (const k of safe) {
        if (!current.has(k)) {
          current.add(k);
          changed = true;
        }
      }
      if (changed) {
        writeToStorage(current);
        setHidden(new Set(current));
      }
      return safe;
    },
    [],
  );

  const unhide = useCallback(
    (keys: ReadonlyArray<string | null | undefined>) => {
      const safe = sanitizeKeys(keys);
      if (safe.length === 0) return;
      const current = readFromStorage();
      let changed = false;
      for (const k of safe) {
        if (current.delete(k)) changed = true;
      }
      if (changed) {
        writeToStorage(current);
        setHidden(new Set(current));
      }
    },
    [],
  );

  return { hidden, isHidden, hide, unhide };
}

/** Pull every stable identifier we know about for a conversation /
 *  escalation row. Used by both the modal (to write hide keys on
 *  delete) and the list filters (to read them on render). Display
 *  names like "Unknown" / "Calvin" are NEVER returned here — only
 *  routable identifiers. */
export function collectConversationHideKeys(row: {
  id?: string | null;
  conversationKey?: string | null;
  escalationId?: string | null;
}): string[] {
  return sanitizeKeys([row.conversationKey, row.id, row.escalationId]);
}
