/**
 * Local "parked" overrides for backend/shared tasks.
 *
 * Product decision (May 2026): parking is a personal action for the current
 * user, not a shared backend status. If Calvin parks a task, Jr should still
 * see it as Open in their own browser. Until the Python backend ships
 * per-user task states, we model "parked" as a per-device override stored in
 * localStorage as a set of task IDs.
 *
 * For locally-pending tasks (`task.localId` set) the parked state lives on
 * the local pending record itself (`use-local-pending-tasks`'s `status`
 * field), not here. This hook is for backend/shared tasks only — i.e., tasks
 * whose authoritative state lives on api.unboks.org.
 *
 * Storage:
 *   localStorage key: `unboks_parked_task_ids`
 *   shape: string[] (JSON-serialized; deduped)
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "unboks_parked_task_ids";

function readFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.length > 0));
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Quota / privacy mode — silently drop. Worst case the override is
    // session-only, but we never block the user's action.
  }
}

export interface UseParkedTasksApi {
  /** Snapshot Set — safe to use with `.has(id)` in render. */
  parkedIds: Set<string>;
  /** Mark a backend task id as locally parked. */
  addParked: (id: string) => void;
  /** Remove a backend task id from the local parked set. */
  removeParked: (id: string) => void;
  /** True if `id` is currently parked locally. */
  isParked: (id: string) => boolean;
}

export function useParkedTasks(): UseParkedTasksApi {
  const [ids, setIds] = useState<Set<string>>(() => readFromStorage());

  // Cross-tab sync: when another tab updates the parked set, mirror it here
  // so two open tabs don't drift (e.g., Calvin parks a task in one tab and
  // expects the other tab to also hide it from Open).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setIds(readFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addParked = useCallback((id: string) => {
    if (!id) return;
    setIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const removeParked = useCallback((id: string) => {
    if (!id) return;
    setIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      persist(next);
      return next;
    });
  }, []);

  const isParked = useCallback((id: string) => ids.has(id), [ids]);

  return { parkedIds: ids, addParked, removeParked, isParked };
}
