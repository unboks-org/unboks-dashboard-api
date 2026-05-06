import { useState, useEffect, useCallback } from "react";
import type { TaskUser, TaskStatus, TaskImageMime } from "@/lib/tasks-api";

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
}

function readFromStorage(): LocalPendingTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && typeof t.localId === "string");
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
      createdBy: "Calvin",
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
              completedBy: status === "done" ? ("Calvin" as TaskUser) : undefined,
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

  return { tasks, addLocal, setLocalStatus, removeLocal, markSyncStatus };
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
