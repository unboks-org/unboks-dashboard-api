import { useState, useEffect, useCallback } from "react";
import {
  getCurrentTaskUser,
  type TaskUser,
  type TaskStatus,
  type TaskImageMime,
} from "@/lib/tasks-api";

const STORAGE_KEY = "unboks_pending_tasks";
const EVENT_NAME = "unboks_pending_tasks_changed";
/** Counter for the next human-friendly task number ("TASK-007").
 *  Persisted in localStorage so refreshing the page keeps numbering stable
 *  and so deleting a task does not "free up" its number for reuse. */
const NEXT_NUMBER_KEY = "unboks_next_task_number";

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
  /** Human-friendly per-board number, e.g. 7 → "TASK-007". Stable across
   *  refresh, edit, park, done and reopen. Assigned at creation; backfilled
   *  for older tasks by the migration in `readFromStorage`. */
  taskNumber: number;
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

/** Repair a stored task that's missing fields the UI now expects. Specifically:
 *  - createdBy may be missing on very old entries → fall back to the current
 *    operator identity (best guess; the user can edit the task to fix it).
 *  We deliberately do NOT rewrite a non-empty `createdBy` to the current
 *  identity — Calvin and Jr now share this browser, and force-rewriting
 *  would erase Jr's authorship every time Calvin opens the dashboard. */
function backfillAuthor(task: LocalPendingTask): { task: LocalPendingTask; changed: boolean } {
  if (task.createdBy === "Calvin" || task.createdBy === "Jr") {
    return { task, changed: false };
  }
  return { task: { ...task, createdBy: getCurrentTaskUser() }, changed: true };
}

function readNextNumber(): number {
  try {
    const raw = localStorage.getItem(NEXT_NUMBER_KEY);
    if (!raw) return 1;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  } catch {
    return 1;
  }
}

function writeNextNumber(n: number) {
  try {
    localStorage.setItem(NEXT_NUMBER_KEY, String(n));
  } catch {
    // Quota / privacy mode — non-fatal.
  }
}

/** Backfill `taskNumber` for stored tasks created before this feature shipped.
 *  Order rule: oldest task (by `createdAt`) gets the lowest number, so the
 *  visible numbering reflects creation order even though the in-memory list
 *  is sorted newest-first. Tasks that already have a `taskNumber` are never
 *  renumbered. The persisted next-number counter is bumped past every
 *  assigned number so future creates stay unique. */
function backfillTaskNumbers(list: LocalPendingTask[]): {
  list: LocalPendingTask[];
  changed: boolean;
} {
  const needs = list.filter(
    (t) => typeof t.taskNumber !== "number" || !Number.isFinite(t.taskNumber),
  );
  if (needs.length === 0) return { list, changed: false };

  const existingMax = list.reduce(
    (m, t) =>
      typeof t.taskNumber === "number" && Number.isFinite(t.taskNumber)
        ? Math.max(m, t.taskNumber)
        : m,
    0,
  );
  let next = Math.max(existingMax + 1, readNextNumber());
  // Sort the unnumbered tasks oldest-first by createdAt so TASK-001 is the
  // first task ever added on this device.
  const orderedUnnumberedIds = [...needs]
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt);
      const tb = Date.parse(b.createdAt);
      const sa = Number.isFinite(ta) ? ta : 0;
      const sb = Number.isFinite(tb) ? tb : 0;
      return sa - sb;
    })
    .map((t) => t.localId);

  const assigned = new Map<string, number>();
  for (const id of orderedUnnumberedIds) {
    assigned.set(id, next);
    next += 1;
  }
  writeNextNumber(next);

  const out = list.map((t) =>
    assigned.has(t.localId) ? { ...t, taskNumber: assigned.get(t.localId)! } : t,
  );
  return { list: out, changed: true };
}

/** Resolve duplicate task numbers that can arise from two tabs creating
 *  tasks at the same instant (each reads the counter before the other
 *  writes). Older record (by createdAt) keeps the contested number; the
 *  newer one is bumped to the next free number above the current max and
 *  the persisted counter is advanced past it. Idempotent. */
function dedupeTaskNumbers(list: LocalPendingTask[]): {
  list: LocalPendingTask[];
  changed: boolean;
} {
  const seen = new Map<number, LocalPendingTask>();
  // Pre-scan to find the existing max so we can allocate above it.
  let maxNumber = 0;
  for (const t of list) {
    if (typeof t.taskNumber === "number" && Number.isFinite(t.taskNumber)) {
      maxNumber = Math.max(maxNumber, t.taskNumber);
    }
  }
  let nextFree = Math.max(maxNumber + 1, readNextNumber());
  let changed = false;
  const out = list.map((t) => t);
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    if (typeof t.taskNumber !== "number" || !Number.isFinite(t.taskNumber)) continue;
    const prior = seen.get(t.taskNumber);
    if (!prior) {
      seen.set(t.taskNumber, t);
      continue;
    }
    // Conflict: keep the older record, reassign the newer one.
    const tCreated = Date.parse(t.createdAt) || 0;
    const pCreated = Date.parse(prior.createdAt) || 0;
    const loser = tCreated >= pCreated ? t : prior;
    const winner = loser === t ? prior : t;
    seen.set(winner.taskNumber, winner);
    const newNumber = nextFree;
    nextFree += 1;
    changed = true;
    const idx = out.findIndex((x) => x.localId === loser.localId);
    if (idx !== -1) out[idx] = { ...out[idx], taskNumber: newNumber };
    seen.set(newNumber, out[idx]);
  }
  if (changed) writeNextNumber(nextFree);
  return { list: out, changed };
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
    const authored = valid.map((t) => {
      const m = backfillAuthor(t);
      if (m.changed) migrated = true;
      return m.task;
    });
    const numbered = backfillTaskNumbers(authored);
    if (numbered.changed) migrated = true;
    const deduped = dedupeTaskNumbers(numbered.list);
    if (deduped.changed) migrated = true;
    if (migrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.list));
      } catch {
        // Quota or privacy mode — non-fatal; the in-memory copy is still fixed
        // for this session.
      }
    }
    return deduped.list;
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
    // Allocate the next task number. Read fresh from storage to stay correct
    // across tabs (another tab may have created a task since we mounted), and
    // never reuse a number already present in the in-memory list. We build
    // the record outside the setter so its `localId` is stable for the
    // returned reference — Tasks.tsx threads that id through sync.
    const baseList = readFromStorage();
    const existingMax = baseList.reduce(
      (m, t) =>
        typeof t.taskNumber === "number" && Number.isFinite(t.taskNumber)
          ? Math.max(m, t.taskNumber)
          : m,
      0,
    );
    const candidate = Math.max(readNextNumber(), existingMax + 1);
    writeNextNumber(candidate + 1);
    const next: LocalPendingTask = {
      localId: newId(),
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      createdBy: getCurrentTaskUser(),
      assignedTo: input.assignedTo,
      status: "open",
      attachments: input.attachments,
      taskNumber: candidate,
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
              completedBy: status === "done" ? getCurrentTaskUser() : undefined,
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
