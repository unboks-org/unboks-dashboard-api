/**
 * Per-server-id task number overlay.
 *
 * Why this exists:
 *
 * Local pending tasks (created while the backend was unreachable, or as a
 * fallback when image upload was unsupported) carry a stable
 * `taskNumber` from the moment they're saved. As soon as those tasks sync
 * successfully, the local record is removed and the task is only visible
 * via `GET /tasks` on the Python backend — which doesn't store
 * `taskNumber`. Without this overlay, the visible TASK-### badge would
 * vanish the moment the operator clicks "Sync now".
 *
 * Same problem when a task is created directly on the backend (i.e. the
 * non-fallback path in Tasks.tsx#handleSubmit): the server-side row never
 * had a task number to begin with.
 *
 * Fix: mirror the authorship overlay pattern. Keep a
 * `Record<serverTaskId, number>` in localStorage. Two write paths set it:
 *   1. Successful direct backend create — `setNumber(created.id, allocateNextTaskNumber())`.
 *   2. Successful local→backend sync — `setNumber(serverId, local.taskNumber)`.
 *
 * Read path: Tasks.tsx merges this overlay onto every backend row via
 * `apply()`. Backend rows that have no overlay entry simply render
 * without a number, per spec ("Do not invent changing numbers for backend
 * tasks") — the spec explicitly allows this for pre-existing backend
 * data.
 *
 * Storage:
 *   localStorage key: `unboks_task_numbers`
 *   shape: Record<serverTaskId, number>
 *
 * Cross-tab sync via the `storage` event so two open tabs agree.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "unboks_task_numbers";
const COUNTER_KEY = "unboks_next_task_number";

type NumberMap = Record<string, number>;

/** Heal cross-tab races where two tabs allocated the same TASK-### for two
 *  different backend ids before either could persist. Strategy mirrors
 *  `dedupeTaskNumbers` in use-local-pending-tasks: walk entries in a stable
 *  order (by id string), keep the first sighting of each number, and bump
 *  every subsequent collision to the next free slot above the running max
 *  (and above the persisted counter). Idempotent. */
function dedupeNumberMap(map: NumberMap): { map: NumberMap; changed: boolean } {
  const ids = Object.keys(map).sort();
  if (ids.length < 2) return { map, changed: false };

  let maxNumber = 0;
  for (const id of ids) maxNumber = Math.max(maxNumber, map[id]);
  let nextFree = maxNumber + 1;
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (raw) {
      const c = parseInt(raw, 10);
      if (Number.isFinite(c) && c > nextFree) nextFree = c;
    }
  } catch {
    // Counter unreadable — local max is still a safe lower bound.
  }

  const seen = new Map<number, string>();
  const out: NumberMap = { ...map };
  let changed = false;
  for (const id of ids) {
    const n = out[id];
    const prior = seen.get(n);
    if (prior === undefined) {
      seen.set(n, id);
      continue;
    }
    // Conflict — keep the lexicographically-earlier id (stable, deterministic
    // across tabs) and reassign the other. Since `ids` is sorted, the prior
    // entry wins; we bump the current id.
    out[id] = nextFree;
    seen.set(nextFree, id);
    nextFree += 1;
    changed = true;
  }
  if (changed) {
    try {
      localStorage.setItem(COUNTER_KEY, String(nextFree));
    } catch {
      // Non-fatal — the in-memory dedupe is still correct for this session.
    }
  }
  return { map: out, changed };
}

function readFromStorage(): NumberMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: NumberMap = {};
    for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (!id) continue;
      if (typeof val === "number" && Number.isFinite(val) && val >= 1) {
        out[id] = val;
      }
    }
    const deduped = dedupeNumberMap(out);
    if (deduped.changed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.map));
      } catch {
        // Quota / privacy mode — the in-memory copy is still correct.
      }
    }
    return deduped.map;
  } catch {
    return {};
  }
}

function persist(map: NumberMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / privacy mode — non-fatal. The override is session-only in
    // that case but we never block the user's action.
  }
}

export interface UseTaskNumberOverlayApi {
  numbers: NumberMap;
  /** Record a number for a server task id. No-op if `n` is missing or the
   *  same as the existing entry. */
  setNumber: (serverId: string, n: number | undefined) => void;
  /** Drop the number for this server task id. */
  clearNumber: (serverId: string) => void;
  /** Merge the overlay number onto a backend task. Local tasks (which already
   *  carry `taskNumber`) are returned unchanged. */
  apply: <T extends { id: string; taskNumber?: number }>(task: T) => T;
}

export function useTaskNumberOverlay(): UseTaskNumberOverlayApi {
  const [numbers, setNumbers] = useState<NumberMap>(() => readFromStorage());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setNumbers(readFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setNumber = useCallback((serverId: string, n: number | undefined) => {
    if (!serverId) return;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return;
    setNumbers((current) => {
      if (current[serverId] === n) return current;
      const next = { ...current, [serverId]: n };
      persist(next);
      return next;
    });
  }, []);

  const clearNumber = useCallback((serverId: string) => {
    if (!serverId) return;
    setNumbers((current) => {
      if (!(serverId in current)) return current;
      const next = { ...current };
      delete next[serverId];
      persist(next);
      return next;
    });
  }, []);

  const apply = useCallback(
    <T extends { id: string; taskNumber?: number }>(task: T): T => {
      // Don't override an explicit number (e.g. on local-pending rows that
      // are mapped through localToTask before the sync removes them).
      if (typeof task.taskNumber === "number") return task;
      const n = numbers[task.id];
      if (typeof n !== "number") return task;
      return { ...task, taskNumber: n };
    },
    [numbers],
  );

  return { numbers, setNumber, clearNumber, apply };
}
