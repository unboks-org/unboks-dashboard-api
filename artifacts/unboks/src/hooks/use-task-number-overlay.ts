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
import { allocateNextTaskNumber } from "./use-local-pending-tasks";

const STORAGE_KEY = "unboks_task_numbers";
const COUNTER_KEY = "unboks_next_task_number";

type NumberMap = Record<string, number>;

/** Module-scoped cache of `serverTaskId → number`. The render-time
 *  `ensureAllocated()` writes here BEFORE it touches React state so that
 *  React StrictMode's double-invoke (and any rapid re-render) cannot
 *  allocate the same task twice. The cache is the synchronous source of
 *  truth; React state + localStorage trail it for cross-tab sync. */
const ALLOC_CACHE = new Map<string, number>();

/** Render-time allocator: guarantees a stable number for any task id, so
 *  cards can render the TASK-### badge unconditionally on first paint —
 *  no flash of "no number" while a useEffect catches up. Idempotent per
 *  id and safe to call from `useMemo`. The localStorage write is the
 *  single source of truth; the React state update happens lazily on the
 *  next storage tick or via the explicit setters. */
function ensureAllocated(taskId: string): number {
  if (!taskId) return 0;
  const cached = ALLOC_CACHE.get(taskId);
  if (cached !== undefined) return cached;

  // Check persistent storage first — another tab (or a previous mount of
  // this tab) may have already allocated for this id.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const existing = (parsed as Record<string, unknown>)[taskId];
        if (typeof existing === "number" && Number.isFinite(existing) && existing >= 1) {
          ALLOC_CACHE.set(taskId, existing);
          return existing;
        }
      }
    }
  } catch {
    // Storage unreadable — fall through to allocation.
  }

  // Allocate fresh from the shared counter and persist immediately so a
  // refresh (or another tab) sees the same number for this id.
  const n = allocateNextTaskNumber();
  ALLOC_CACHE.set(taskId, n);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed =
      raw && typeof raw === "string" ? JSON.parse(raw) : {};
    const map =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    map[taskId] = n;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / privacy mode — the in-memory cache still gives a stable
    // number for this session.
  }
  return n;
}

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
    // Hydrate the module cache so subsequent ensureAllocated() calls hit
    // the cache before allocating.
    for (const [id, n] of Object.entries(deduped.map)) ALLOC_CACHE.set(id, n);
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
      // Render-time guarantee: every task gets a stable, persisted number.
      // ensureAllocated() is idempotent per id and safe to call from a
      // useMemo; it writes to localStorage + the module cache so a refresh
      // returns the same value. We don't read `numbers` here because the
      // module cache already mirrors it.
      const n = numbers[task.id] ?? ensureAllocated(task.id);
      return { ...task, taskNumber: n };
    },
    [numbers],
  );

  return { numbers, setNumber, clearNumber, apply };
}
