import { useCallback, useEffect, useState } from "react";

/**
 * Local edit overrides for backend/synced tasks.
 *
 * Background: the Tasks UI must let the operator edit any task body
 * immediately, even when the backend doesn't yet expose a PATCH/text
 * endpoint. For local-only tasks this is handled by `useLocalPendingTasks`
 * (which mutates the canonical local record). For backend-issued tasks we
 * cannot pretend the server saved the change, so we layer a per-task
 * override on top of the rendered task and badge it as "Edited locally".
 *
 * Storage shape (single localStorage key, JSON):
 *   {
 *     [taskId]: {
 *       body: "edited task text",
 *       editedAt: "ISO timestamp",
 *       pendingSync: true
 *     }
 *   }
 *
 * `taskId` is the display id used by the Tasks page (i.e. `Task.id`), which
 * for backend rows is the server uuid. We deliberately do NOT key on
 * `local:<localId>` style ids — local tasks own their own record and route
 * through `useLocalPendingTasks.updateLocal` instead.
 *
 * Cross-tab sync mirrors the pattern in `useLocalPendingTasks`: native
 * `storage` event for other tabs, plus a custom event for the same tab.
 */

const STORAGE_KEY = "unboks_task_local_edits";
const EVENT_NAME = "unboks_task_local_edits_changed";

export interface LocalTaskEdit {
  body: string;
  editedAt: string;
  pendingSync: boolean;
}

export type LocalTaskEditMap = Record<string, LocalTaskEdit>;

function readFromStorage(): LocalTaskEditMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: LocalTaskEditMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const rec = v as Partial<LocalTaskEdit>;
      if (typeof rec.body !== "string") continue;
      out[k] = {
        body: rec.body,
        editedAt: typeof rec.editedAt === "string" ? rec.editedAt : new Date().toISOString(),
        pendingSync: rec.pendingSync !== false,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persist(map: LocalTaskEditMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Quota or privacy mode, non-fatal. The in-memory copy still reflects
    // the edit for this session.
  }
}

export function useLocalTaskEdits() {
  const [edits, setEdits] = useState<LocalTaskEditMap>(readFromStorage);

  useEffect(() => {
    const sync = () => setEdits(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  /** Write or update the local override for a backend task. Trims whitespace
   *  and refuses to store an empty body (callers should validate before
   *  invoking). */
  const setEdit = useCallback((taskId: string, body: string) => {
    const trimmed = body.trim();
    if (!taskId || trimmed.length === 0) return;
    setEdits((current) => {
      const next: LocalTaskEditMap = {
        ...current,
        [taskId]: {
          body: trimmed,
          editedAt: new Date().toISOString(),
          pendingSync: true,
        },
      };
      persist(next);
      return next;
    });
  }, []);

  /** Remove an override, e.g. once the backend confirms a sync. */
  const clearEdit = useCallback((taskId: string) => {
    setEdits((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      persist(next);
      return next;
    });
  }, []);

  /** Lookup helper, returns undefined when no override exists. */
  const getEdit = useCallback(
    (taskId: string): LocalTaskEdit | undefined => edits[taskId],
    [edits],
  );

  return { edits, setEdit, clearEdit, getEdit };
}
