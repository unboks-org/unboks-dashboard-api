import { useState, useEffect, useCallback } from "react";
import {
  CURRENT_TASK_USER,
  type TaskUser,
  type TaskStatus,
  type TaskImageMime,
} from "@/lib/tasks-api";

const STORAGE_KEY = "unboks_pending_tasks";
const EVENT_NAME = "unboks_pending_tasks_changed";

/** Per-attachment cap for localStorage-backed tasks. base64 inflates by ~37%, so
 *  500 KB on disk ≈ ~685 KB serialized; with up to 5 images per task we stay
 *  well under typical 5 MB localStorage quotas. */
export const LOCAL_ATTACHMENT_MAX_BYTES = 500 * 1024;

export interface LocalAttachment {
  id: string;
  fileName: string;
  mimeType: TaskImageMime;
  sizeBytes: number;
  /** data: URL — used both as preview and as the source for sync uploads. */
  dataUrl: string;
}

export interface LocalPendingTask {
  localId: string;
  bodyHtml: string;
  bodyText: string;
  createdBy: TaskUser;
  assignedTo: TaskUser;
  status: TaskStatus;
  attachments: LocalAttachment[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completedBy?: TaskUser;
  syncStatus: "pending" | "syncing" | "failed";
  syncError?: string;
  /** Set after a successful POST /tasks during sync. On subsequent sync
   *  retries (e.g. when the parked-status mirror fails), we use this to
   *  skip re-creating the task and avoid duplicate server entries. */
  serverId?: string;
}

/** One-time migration for the historical "Jr-as-author" bug. Local-pending
 *  tasks that live in *this* browser were authored by the current user
 *  (Calvin) by definition — there's no way for Jr to reach into Calvin's
 *  localStorage. Rewrite stale `createdBy: "Jr"` entries (and matching
 *  `completedBy`) so cards display "Created by Calvin" correctly after the
 *  fix lands. Other fields (assignedTo, body, attachments) are untouched.
 *  Runs on every read but only writes when something actually changed —
 *  stable across refreshes once migrated. */
function migrateAuthor(task: LocalPendingTask): { task: LocalPendingTask; changed: boolean } {
  let changed = false;
  let next = task;
  if (task.createdBy !== CURRENT_TASK_USER) {
    next = { ...next, createdBy: CURRENT_TASK_USER };
    changed = true;
  }
  // completedBy is only meaningful when the task is done; if present and
  // wrong, the same logic applies (the local user marked it done).
  if (task.status === "done" && task.completedBy && task.completedBy !== CURRENT_TASK_USER) {
    next = { ...next, completedBy: CURRENT_TASK_USER };
    changed = true;
  }
  return { task: next, changed };
}

function readFromStorage(): LocalPendingTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: LocalPendingTask[] = parsed.filter(
      (t): t is LocalPendingTask => t && typeof t.localId === "string",
    );
    let migrated = false;
    const next = valid.map((t) => {
      const m = migrateAuthor(t);
      if (m.changed) migrated = true;
      return m.task;
    });
    if (migrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Quota or privacy mode — non-fatal; the in-memory copy is still fixed
        // for this session.
      }
    }
    return next;
  } catch {
    return [];
  }
}

function persist(list: LocalPendingTask[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch (err) {
    // Quota exceeded or similar — surface so caller can warn the user.
    throw err;
  }
}

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AddLocalTaskInput {
  assignedTo: TaskUser;
  bodyText: string;
  bodyHtml: string;
  attachments: LocalAttachment[];
}

/**
 * Local pending tasks — saved in localStorage so Calvin can keep adding tasks
 * when the backend (`/api/unboks/tasks`) is not yet wired up. Each task carries
 * a `syncStatus` so the UI can label them honestly as "Pending sync".
 */
export function useLocalPendingTasks() {
  const [tasks, setTasks] = useState<LocalPendingTask[]>(readFromStorage);

  useEffect(() => {
    const sync = () => setTasks(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const addLocal = useCallback((input: AddLocalTaskInput): LocalPendingTask => {
    const now = new Date().toISOString();
    const next: LocalPendingTask = {
      localId: newId(),
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      createdBy: CURRENT_TASK_USER,
      assignedTo: input.assignedTo,
      status: "open",
      attachments: input.attachments,
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
    };
    setTasks((current) => {
      const list = [next, ...current];
      persist(list);
      return list;
    });
    return next;
  }, []);

  const updateLocal = useCallback(
    (
      localId: string,
      patch: { bodyText?: string; bodyHtml?: string; assignedTo?: TaskUser },
    ) => {
      setTasks((current) => {
        const now = new Date().toISOString();
        const list = current.map((t) =>
          t.localId === localId
            ? {
                ...t,
                bodyText: patch.bodyText ?? t.bodyText,
                bodyHtml: patch.bodyHtml ?? t.bodyHtml,
                assignedTo: patch.assignedTo ?? t.assignedTo,
                updatedAt: now,
                // Edited content needs to be re-uploaded once the backend is
                // available — drop "failed" back to "pending" so it gets retried.
                syncStatus: (t.syncStatus === "syncing" ? "syncing" : "pending") as LocalPendingTask["syncStatus"],
                syncError: undefined,
              }
            : t,
        );
        persist(list);
        return list;
      });
    },
    [],
  );

  const setLocalStatus = useCallback((localId: string, status: TaskStatus) => {
    setTasks((current) => {
      const now = new Date().toISOString();
      const list = current.map((t) =>
        t.localId === localId
          ? {
              ...t,
              status,
              updatedAt: now,
              completedAt: status === "done" ? now : undefined,
              completedBy: status === "done" ? CURRENT_TASK_USER : undefined,
            }
          : t,
      );
      persist(list);
      return list;
    });
  }, []);

  const removeLocal = useCallback((localId: string) => {
    setTasks((current) => {
      const list = current.filter((t) => t.localId !== localId);
      persist(list);
      return list;
    });
  }, []);

  const markSyncStatus = useCallback(
    (localId: string, syncStatus: LocalPendingTask["syncStatus"], syncError?: string) => {
      setTasks((current) => {
        const list = current.map((t) =>
          t.localId === localId ? { ...t, syncStatus, syncError } : t,
        );
        persist(list);
        return list;
      });
    },
    [],
  );

  /** Record the server-side task id after a successful create, so retries
   *  of a partially-synced task skip re-creating it. */
  const setServerId = useCallback((localId: string, serverId: string) => {
    setTasks((current) => {
      const list = current.map((t) =>
        t.localId === localId ? { ...t, serverId } : t,
      );
      persist(list);
      return list;
    });
  }, []);

  return {
    tasks,
    addLocal,
    updateLocal,
    setLocalStatus,
    removeLocal,
    markSyncStatus,
    setServerId,
  };
}

/** Read a File as data URL. Used to persist pasted/picked images for offline. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unexpected reader result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}
