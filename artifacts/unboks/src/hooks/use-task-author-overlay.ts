/**
 * Local authorship overlay for backend/shared tasks.
 *
 * Why this exists:
 *
 * Calvin and Jr share a single dashboard login (one bearer token), so the
 * Python backend at api.unboks.org cannot tell them apart. When either user
 * creates a task, the backend stores authorship as whatever default it has
 * for that token, then returns the task with that fixed `createdBy` value
 * on every subsequent `GET /tasks`.
 *
 * That breaks the "Acting as" toggle the operator just clicked — they were
 * acting as Calvin but the synced task displays "Created by Jr".
 *
 * Fix: mirror the per-user "parked" overlay pattern (`use-parked-tasks`).
 * When the dashboard creates or completes a backend task, we record the
 * acting identity here, keyed by the server task id. The Tasks page then
 * applies this overlay on top of every backend row at render time, so the
 * UI always shows the operator who actually performed the action — even
 * after a refetch wipes out the optimistic local copy.
 *
 * Storage:
 *   localStorage key: `unboks_task_author_overrides`
 *   shape: Record<serverTaskId, { createdBy?: "Calvin"|"Jr"; completedBy?: "Calvin"|"Jr" }>
 *
 * Cross-tab sync via the `storage` event so two open tabs agree.
 */
import { useCallback, useEffect, useState } from "react";
import type { TaskUser } from "@/lib/tasks-api";

const STORAGE_KEY = "unboks_task_author_overrides";

export interface TaskAuthorOverride {
  createdBy?: TaskUser;
  completedBy?: TaskUser;
}

type OverrideMap = Record<string, TaskAuthorOverride>;

const VALID: TaskUser[] = ["Calvin", "Jr"];

function isValidUser(v: unknown): v is TaskUser {
  return typeof v === "string" && (VALID as string[]).includes(v);
}

function readFromStorage(): OverrideMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: OverrideMap = {};
    for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (!id || typeof val !== "object" || val === null) continue;
      const v = val as Record<string, unknown>;
      const entry: TaskAuthorOverride = {};
      if (isValidUser(v.createdBy)) entry.createdBy = v.createdBy;
      if (isValidUser(v.completedBy)) entry.completedBy = v.completedBy;
      if (entry.createdBy || entry.completedBy) out[id] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(map: OverrideMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / privacy mode — silently drop. Worst case the override is
    // session-only, but we never block the user's action.
  }
}

export interface UseTaskAuthorOverlayApi {
  /** Snapshot — safe to read in render. */
  overrides: OverrideMap;
  /** Apply (merge) an override for a server task id. Empty patches are no-ops. */
  setOverride: (serverId: string, patch: TaskAuthorOverride) => void;
  /** Drop any overlay for this server task id (e.g. when the task is removed). */
  clearOverride: (serverId: string) => void;
  /** Convenience: return the effective createdBy/completedBy for a task,
   *  preferring overlay values when present. */
  apply: <T extends { id: string; createdBy: TaskUser; completedBy?: TaskUser }>(
    task: T,
  ) => T;
}

export function useTaskAuthorOverlay(): UseTaskAuthorOverlayApi {
  const [overrides, setOverrides] = useState<OverrideMap>(() => readFromStorage());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setOverrides(readFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setOverride = useCallback((serverId: string, patch: TaskAuthorOverride) => {
    if (!serverId) return;
    if (!patch.createdBy && !patch.completedBy) return;
    setOverrides((current) => {
      const prev = current[serverId] ?? {};
      const merged: TaskAuthorOverride = {
        createdBy: patch.createdBy ?? prev.createdBy,
        completedBy: patch.completedBy ?? prev.completedBy,
      };
      // Skip the state churn (and storage write) if nothing actually changed.
      if (
        merged.createdBy === prev.createdBy &&
        merged.completedBy === prev.completedBy
      ) {
        return current;
      }
      const next = { ...current, [serverId]: merged };
      persist(next);
      return next;
    });
  }, []);

  const clearOverride = useCallback((serverId: string) => {
    if (!serverId) return;
    setOverrides((current) => {
      if (!(serverId in current)) return current;
      const next = { ...current };
      delete next[serverId];
      persist(next);
      return next;
    });
  }, []);

  const apply = useCallback(
    <T extends { id: string; createdBy: TaskUser; completedBy?: TaskUser }>(
      task: T,
    ): T => {
      const o = overrides[task.id];
      if (!o) return task;
      if (!o.createdBy && !o.completedBy) return task;
      return {
        ...task,
        createdBy: o.createdBy ?? task.createdBy,
        completedBy: o.completedBy ?? task.completedBy,
      };
    },
    [overrides],
  );

  return { overrides, setOverride, clearOverride, apply };
}
