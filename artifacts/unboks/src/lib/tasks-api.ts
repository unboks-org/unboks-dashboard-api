/**
 * Tasks API client — shared task board for Calvin & Jr.
 *
 * IMPORTANT — backend contract (NOT YET IMPLEMENTED on api.unboks.org):
 *
 *   GET    /api/unboks/tasks                → Task[]
 *   POST   /api/unboks/tasks/uploads        → { attachments: TaskAttachment[] }
 *                                              multipart/form-data, field name "files"
 *   POST   /api/unboks/tasks                → Task
 *                                              JSON body: CreateTaskPayload
 *   PATCH  /api/unboks/tasks/:id            → Task
 *                                              JSON body: { status: "open" | "done" }
 *
 * All requests must include `Authorization: Bearer <token>` from the existing
 * tenant login at `/api/unboks/dashboard/api/login`. The backend is responsible
 * for resolving the user identity (Calvin / Jr) from the bearer token; the
 * client only sends the *target* (`assignedTo`).
 *
 * Until the Python backend ships these routes the UI will surface a clear
 * "Tasks backend not available yet" error — no fake/local persistence.
 */
import { ApiError } from "@/lib/error";
import { getToken } from "@/lib/tenant";

export type TaskUser = "Calvin" | "Jr";

/**
 * Operator identity for task authorship.
 *
 * Calvin and Jr share the same dashboard login (one bearer token), so the
 * Python backend can't tell them apart. The dashboard exposes an "Acting as"
 * toggle (see `use-dashboard-identity`) and stores the choice in
 * localStorage. These helpers read the same storage key from non-React
 * modules so authorship stays consistent across the codebase.
 *
 * Do NOT infer the author from `assignedTo` — that's the recipient.
 */
const IDENTITY_STORAGE_KEY = "unboks_dashboard_identity";
const VALID_IDENTITIES: TaskUser[] = ["Calvin", "Jr"];

export function getCurrentTaskUser(): TaskUser {
  if (typeof localStorage === "undefined") return "Calvin";
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (raw && (VALID_IDENTITIES as string[]).includes(raw)) return raw as TaskUser;
  } catch {
    // ignore — fall through
  }
  return "Calvin";
}

/** The natural recipient when composing — always the *other* user. */
export function getDefaultTaskAssignee(): TaskUser {
  return getCurrentTaskUser() === "Calvin" ? "Jr" : "Calvin";
}
/** Task lifecycle:
 *   open    — needs action
 *   parked  — set aside, not urgent (per-user, local only — see below)
 *   done    — completed
 *
 * IMPORTANT — `parked` is a PER-USER local state, NOT a backend status.
 *
 * Parking is a personal action for the current user/browser. The Python
 * backend stores only `open` / `done`. The `parked` value here is used in
 * two places:
 *   1. Local-pending tasks (`use-local-pending-tasks`) carry it directly
 *      in their stored record.
 *   2. Backend/shared tasks get a `parked` overlay applied by the UI from
 *      the per-user localStorage set in `use-parked-tasks`.
 *
 * The client therefore NEVER sends `status: "parked"` to the backend —
 * `updateTaskStatus` is only ever called with `open` or `done`.
 */
export type TaskStatus = "open" | "parked" | "done";
export type TaskImageMime = "image/png" | "image/jpeg" | "image/webp";

export interface TaskAttachment {
  id: string;
  fileName: string;
  mimeType: TaskImageMime;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface Task {
  id: string;
  bodyHtml: string;
  bodyText: string;
  createdBy: TaskUser;
  assignedTo: TaskUser;
  status: TaskStatus;
  attachments: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completedBy?: TaskUser;
  /** Set when this Task is a local-only entry not yet synced to the backend. */
  localId?: string;
  /** Sync state for local-only tasks. Absent for backend tasks. */
  syncStatus?: "pending" | "syncing" | "failed";
  /** Per-board human-friendly number, e.g. 7 → "TASK-007". Required for
   *  local-pending tasks; optional for backend tasks until the API ships a
   *  real per-workspace `task_number`. The UI hides the badge when absent
   *  rather than inventing unstable numbers that change on refresh. */
  taskNumber?: number;
}

/** Format a task number for display, e.g. 7 → "TASK-007". Numbers above
 *  999 keep their natural width (e.g. 1234 → "TASK-1234") so the badge
 *  never silently truncates. */
export function formatTaskNumber(n: number): string {
  const safe = Math.max(0, Math.floor(n));
  return `TASK-${String(safe).padStart(3, "0")}`;
}

export interface CreateTaskPayload {
  assignedTo: TaskUser;
  bodyText: string;
  bodyHtml: string;
  attachmentIds: string[];
}

export const ALLOWED_IMAGE_TYPES: TaskImageMime[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const MAX_IMAGES_PER_TASK = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const API_HOST: string = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
const TASKS_BASE = `${API_HOST}/api/unboks/tasks`;

async function tasksFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Only set Content-Type for non-FormData JSON bodies.
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${TASKS_BASE}${path}`, { ...init, headers });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Network error");
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message ?? body.error ?? msg;
    } catch {
      // ignore
    }
    if (res.status === 404) {
      msg = "Tasks backend not available yet. Ask the API team to ship /api/unboks/tasks.";
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listTasks(): Promise<Task[]> {
  return tasksFetch<Task[]>("");
}

export async function uploadTaskAttachments(files: File[]): Promise<TaskAttachment[]> {
  if (files.length === 0) return [];
  const fd = new FormData();
  for (const f of files) fd.append("files", f, f.name);
  const result = await tasksFetch<{ attachments: TaskAttachment[] }>("/uploads", {
    method: "POST",
    body: fd,
  });
  return result.attachments ?? [];
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  return tasksFetch<Task>("", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  return tasksFetch<Task>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/** True when the backend `/api/unboks/tasks` route is not reachable yet
 *  (network failure, 404, or 501). Used to switch the UI into local-only mode. */
export function isBackendUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status === 0 || err.status === 404 || err.status === 501;
}

/** True when the upload endpoint exists but cannot accept the request — most
 *  commonly because the Python backend hasn't shipped image upload support
 *  yet (returns 422 for the multipart body, 404 for the route, or 501). In
 *  these cases we fall back to local-pending attachments rather than losing
 *  the task. Auth failures (401/403) are handled separately by `isAuthError`
 *  and do NOT trigger the local fallback — the user's session needs fixing. */
export function isUploadUnsupported(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status === 404 || err.status === 422 || err.status === 501;
}

/** True when the request was rejected by the API as unauthenticated /
 *  forbidden. The UI should surface a clear "session expired" message
 *  instead of dumping the user's draft or silently retrying. */
export function isAuthError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status === 401 || err.status === 403;
}

/** True when the API rejected the request body shape — typically because
 *  the backend doesn't yet recognize a new status value (e.g., `parked`).
 *  Distinct from `isUploadUnsupported` because we DO want to surface a
 *  targeted "feature not yet supported" message to the user instead of
 *  silently falling back. */
export function isStatusValueRejected(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status === 400 || err.status === 422;
}

/** Convert a stored data: URL back into a File for re-upload during sync. */
export async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type });
}

/** Validate a File against type & size limits. Returns null if OK. */
export function validateImageFile(f: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(f.type as TaskImageMime)) {
    return `${f.name}: only PNG, JPG and WebP images are allowed.`;
  }
  if (f.size > MAX_IMAGE_BYTES) {
    return `${f.name}: image is larger than 10 MB.`;
  }
  return null;
}
