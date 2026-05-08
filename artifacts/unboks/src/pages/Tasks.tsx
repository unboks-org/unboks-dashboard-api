import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { TaskComposer } from "@/components/tasks/TaskComposer";
import { TaskCard } from "@/components/tasks/TaskCard";
import {
  Task,
  TaskStatus,
  TaskUser,
  createTask,
  dataUrlToFile,
  isAuthError,
  isBackendUnavailable,
  isUploadUnsupported,
  listTasks,
  updateTaskStatus,
  uploadTaskAttachments,
} from "@/lib/tasks-api";
import { useDashboardIdentity } from "@/hooks/use-dashboard-identity";
import {
  LOCAL_ATTACHMENT_MAX_BYTES,
  LocalAttachment,
  LocalPendingTask,
  allocateNextTaskNumber,
  fileToDataUrl,
  useLocalPendingTasks,
} from "@/hooks/use-local-pending-tasks";
import { useParkedTasks } from "@/hooks/use-parked-tasks";
import { useTaskAuthorOverlay } from "@/hooks/use-task-author-overlay";
import { useTaskNumberOverlay } from "@/hooks/use-task-number-overlay";
import { useLocalTaskEdits } from "@/hooks/use-local-task-edits";
import { ApiError } from "@/lib/error";
import { cn } from "@/lib/utils";

type Filter = "open" | "parked" | "done" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "parked", label: "Parked" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

/** Status sort priority for the All view — open first, parked middle, done last. */
const STATUS_ORDER: Record<TaskStatus, number> = { open: 0, parked: 1, done: 2 };

/** Adapt a localStorage pending task into the shared Task shape used by the UI.
 *
 *  Authorship: Calvin and Jr share this browser via the "Acting as" toggle
 *  (`useDashboardIdentity`). The author was captured when the task was
 *  created (`addLocal`) and must NOT be re-derived from the current
 *  identity at display time — doing so would erase Jr's authorship the
 *  moment Calvin opens the dashboard, and vice versa. */
function localToTask(local: LocalPendingTask): Task {
  return {
    id: `local:${local.localId}`,
    localId: local.localId,
    bodyHtml: local.bodyHtml,
    bodyText: local.bodyText,
    // Trust the value stored at creation time. Calvin and Jr now share this
    // browser via the "Acting as" toggle, so we must NOT force-rewrite the
    // author on every read — that would erase Jr's authorship as soon as
    // Calvin opens the dashboard, and vice versa.
    createdBy: local.createdBy,
    assignedTo: local.assignedTo,
    status: local.status,
    attachments: local.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      url: a.dataUrl,
      createdAt: local.createdAt,
    })),
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    completedAt: local.completedAt,
    completedBy: local.completedBy,
    syncStatus: local.syncStatus,
    taskNumber: local.taskNumber,
  };
}

type SyncStatus = "loading" | "online" | "local" | "error";

function StatusPill({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { dot: string; text: string; bg: string; fg: string; label: string }> = {
    loading: {
      dot: "bg-[#9aa0a6]",
      text: "Connecting",
      bg: "bg-[#f1f3f4]",
      fg: "text-[#5f6368]",
      label: "Connecting",
    },
    online: {
      dot: "bg-[#137333]",
      text: "Synced",
      bg: "bg-[#e6f4ea]",
      fg: "text-[#137333]",
      label: "Synced",
    },
    local: {
      dot: "bg-[#f29900]",
      text: "Local only",
      bg: "bg-[#fef7e0]",
      fg: "text-[#8a6d00]",
      label: "Local only",
    },
    error: {
      dot: "bg-[#a50e0e]",
      text: "Offline",
      bg: "bg-[#fce8e6]",
      fg: "text-[#a50e0e]",
      label: "Offline",
    },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        s.bg,
        s.fg,
      )}
      aria-label={`Backend status: ${s.label}`}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          s.dot,
          status === "loading" && "animate-pulse",
        )}
      />
      {s.text}
    </span>
  );
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const { identity, otherIdentity, setIdentity } = useDashboardIdentity();
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const {
    tasks: localTasks,
    addLocal,
    updateLocal,
    setLocalStatus,
    removeLocal,
    markSyncStatus,
    setServerId,
  } = useLocalPendingTasks();

  // Per-user "parked" overlay for backend/shared tasks. Parking is a
  // personal action — Calvin parking a task should not affect Jr's view.
  const { parkedIds, addParked, removeParked } = useParkedTasks();
  // Per-user authorship overlay. Calvin and Jr share one bearer token, so
  // backend `GET /tasks` always returns the same default `createdBy`. We
  // record who actually clicked Add (or Done) here, keyed by server task id,
  // and apply it on top of every backend row at render time.
  const { setOverride: setAuthorOverride, apply: applyAuthorOverlay } =
    useTaskAuthorOverlay();
  // Per-server-id task number overlay. Every backend/shared task gets a
  // visible TASK-### badge: explicit overlay writes happen at create
  // (handleSubmit) and at sync (syncPendingTasks); pre-existing rows that
  // pre-date this feature are auto-allocated at render time inside
  // `applyTaskNumber()`'s ensureAllocated() — same shared counter, same
  // persistence, so the number is stable across refresh.
  const { setNumber: setTaskNumber, apply: applyTaskNumber } =
    useTaskNumberOverlay();
  // Per-task local edit overrides for backend/synced rows. Local-pending
  // tasks already mutate their canonical record via `updateLocal`, so this
  // overlay only kicks in for backend tasks that lack a `localId`. The
  // override body is applied at render time and the card surfaces an
  // "Edited locally" badge so the operator can see the change isn't yet
  // persisted server-side.
  const { edits: localTaskEdits, setEdit: setLocalTaskEdit } =
    useLocalTaskEdits();

  const { data: backendTasks, isLoading, isError, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: listTasks,
    refetchInterval: 30_000,
    retry: (failureCount, err) => {
      if (isBackendUnavailable(err)) return false;
      return failureCount < 2;
    },
  });

  const backendUnavailable = isError && isBackendUnavailable(error);
  const otherError = isError && !backendUnavailable;

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      updateTaskStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const buildLocalAttachments = useCallback(async (files: File[]): Promise<LocalAttachment[]> => {
    const out: LocalAttachment[] = [];
    let skipped = 0;
    for (const file of files) {
      if (file.size > LOCAL_ATTACHMENT_MAX_BYTES) {
        skipped += 1;
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      out.push({
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        mimeType: file.type as LocalAttachment["mimeType"],
        sizeBytes: file.size,
        dataUrl,
      });
    }
    if (skipped > 0) {
      toast.warning(
        `${skipped} image${skipped === 1 ? "" : "s"} skipped — only images under 500 KB can be saved offline. Add them again after backend sync.`,
      );
    }
    return out;
  }, []);

  const saveLocally = useCallback(
    async (assignedTo: TaskUser, text: string, files: File[]) => {
      let attachments: LocalAttachment[] = [];
      try {
        attachments = await buildLocalAttachments(files);
      } catch {
        toast.error("Could not read one of the images.");
        return;
      }
      try {
        addLocal({ assignedTo, bodyText: text, bodyHtml: "", attachments });
        toast.success("Saved locally — will sync when backend is connected.");
      } catch {
        toast.error("Local storage is full. Remove some pending tasks and try again.");
      }
    },
    [addLocal, buildLocalAttachments],
  );

  const handleSubmit = useCallback(
    async ({ assignedTo, text, files }: { assignedTo: TaskUser; text: string; files: File[] }) => {
      setSubmitting(true);
      try {
        // Backend already known to be down for /tasks → straight to local.
        if (backendUnavailable) {
          await saveLocally(assignedTo, text, files);
          return;
        }

        // --- Step 1: try uploading attachments (if any) -------------------
        // Image upload is the most fragile part of this flow because the
        // Python backend hasn't shipped multipart upload support yet. We
        // isolate it so a 422/404 only triggers the local fallback for
        // *uploads*; a 422 from createTask later is treated as a real
        // validation error and surfaced to the user.
        let attachmentIds: string[] = [];
        if (files.length > 0) {
          try {
            const uploaded = await uploadTaskAttachments(files);
            attachmentIds = uploaded.map((a) => a.id);
          } catch (uploadErr) {
            if (isAuthError(uploadErr)) {
              toast.error("Session expired. Please sign in again.");
              // Re-throw so the composer keeps the unsaved draft + previews.
              throw uploadErr;
            }
            if (isUploadUnsupported(uploadErr) || isBackendUnavailable(uploadErr)) {
              // Uploads aren't supported yet — keep the task locally so the
              // typed text and image previews aren't lost.
              await saveLocally(assignedTo, text, files);
              return;
            }
            const msg =
              uploadErr instanceof ApiError
                ? `Couldn't upload image: ${uploadErr.message}`
                : "Couldn't upload image.";
            toast.error(msg);
            throw uploadErr;
          }
        }

        // --- Step 2: create the task --------------------------------------
        try {
          const created = await createTask({
            assignedTo,
            bodyText: text,
            bodyHtml: "",
            attachmentIds,
          });
          // Record the acting identity so the next refetch (which will
          // overwrite createdBy with the backend's default for our shared
          // token) still displays the right author. See use-task-author-overlay.
          if (created?.id) {
            setAuthorOverride(created.id, { createdBy: identity });
            // Also assign a stable TASK-### so the new backend card renders
            // a number immediately. Uses the same shared counter as local
            // pending tasks, so numbering stays globally unique.
            setTaskNumber(created.id, allocateNextTaskNumber());
          }
          await queryClient.invalidateQueries({ queryKey: ["tasks"] });
          toast.success("Task added.");
        } catch (err) {
          if (isAuthError(err)) {
            toast.error("Session expired. Please sign in again.");
            throw err;
          }
          if (isBackendUnavailable(err)) {
            await saveLocally(assignedTo, text, files);
            return;
          }
          const msg = err instanceof ApiError ? err.message : "Failed to add task.";
          toast.error(msg);
          throw err;
        }
      } finally {
        setSubmitting(false);
      }
    },
    [backendUnavailable, identity, queryClient, saveLocally, setAuthorOverride],
  );

  const setStatus = useCallback(
    async (task: Task, status: TaskStatus) => {
      // Local-pending tasks: parked / open / done all live on the local
      // record. The backend is not involved at all here.
      if (task.localId) {
        setBusyId(task.id);
        try {
          setLocalStatus(task.localId, status);
        } finally {
          setBusyId(null);
        }
        return;
      }

      // ------------------------------------------------------------------
      // Backend/shared tasks. Parking is a PER-USER local overlay — we
      // never send `status: "parked"` to the API. Only `open` and `done`
      // round-trip to the backend.
      // ------------------------------------------------------------------

      // Park: store override locally and we're done. Instant, no error.
      if (status === "parked") {
        addParked(task.id);
        return;
      }

      // Move-to-open from a locally-parked backend task: just remove the
      // overlay. The backend already considers the task open, so we don't
      // need (and should not send) a PATCH.
      if (status === "open" && parkedIds.has(task.id) && task.status !== "done") {
        removeParked(task.id);
        return;
      }

      // Real backend status change (mark done, or reopen from done).
      // Marking done also clears any lingering parked overlay so the task
      // doesn't pop back into Parked if it's later reopened.
      if (status === "done" || status === "open") {
        if (parkedIds.has(task.id)) removeParked(task.id);
      }

      setBusyId(task.id);
      try {
        await updateMutation.mutateAsync({ id: task.id, status });
        // Record who actually closed/reopened it. Same rationale as the
        // create-time overlay: the backend can't distinguish Calvin from Jr.
        if (status === "done") {
          setAuthorOverride(task.id, { completedBy: identity });
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Failed to update task.";
        toast.error(msg);
      } finally {
        setBusyId(null);
      }
    },
    [addParked, identity, parkedIds, removeParked, setAuthorOverride, setLocalStatus, updateMutation],
  );

  const syncPendingTasks = useCallback(async () => {
    const queue = localTasks.filter(
      (t) => t.syncStatus === "pending" || t.syncStatus === "failed",
    );
    if (queue.length === 0) return;
    setSyncing(true);
    let okCount = 0;
    let failCount = 0;
    let authStopped = false;
    for (const local of queue) {
      if (authStopped) break;
      markSyncStatus(local.localId, "syncing");
      try {
        // If a previous sync already created the server task (e.g. the
        // "done" mirror PATCH failed afterwards), skip re-creating it.
        // Otherwise we'd duplicate the same task on every retry.
        let serverTaskId = local.serverId;
        if (!serverTaskId) {
          let attachmentIds: string[] = [];
          if (local.attachments.length > 0) {
            const files = await Promise.all(
              local.attachments.map((a) => dataUrlToFile(a.dataUrl, a.fileName)),
            );
            const uploaded = await uploadTaskAttachments(files);
            attachmentIds = uploaded.map((a) => a.id);
          }
          const created = await createTask({
            assignedTo: local.assignedTo,
            bodyText: local.bodyText,
            bodyHtml: local.bodyHtml,
            attachmentIds,
          });
          serverTaskId = created.id;
          // Persist the server id immediately so any subsequent failure in
          // this iteration still leaves a recoverable retry-only state.
          setServerId(local.localId, serverTaskId);
          // Carry the local authorship forward onto the server row. The
          // backend strips it (shared token), so without this overlay the
          // refetch would overwrite e.g. "Calvin" with "Jr".
          setAuthorOverride(serverTaskId, {
            createdBy: local.createdBy,
            completedBy: local.completedBy,
          });
          // Carry the local TASK-### forward onto the server row so the
          // visible badge survives sync. Without this, removeLocal() below
          // would drop the only place the number lives.
          setTaskNumber(serverTaskId, local.taskNumber);
        }

        if (local.status === "parked") {
          // Parked is a per-user local overlay — do NOT send to backend.
          // Carry the parked state forward by attaching the overlay to the
          // newly-created server id, so the user keeps seeing the task as
          // parked after sync.
          addParked(serverTaskId);
        } else if (local.status === "done") {
          // Done IS a real backend status — mirror it. Best-effort: if the
          // mirror fails we still treat the sync as successful (the task
          // is on the server as "open" and the user can mark done again).
          try {
            await updateTaskStatus(serverTaskId, "done");
          } catch (mirrorErr) {
            if (isAuthError(mirrorErr)) throw mirrorErr;
            // Non-auth errors are intentionally swallowed — see comment above.
          }
        }

        removeLocal(local.localId);
        okCount += 1;
      } catch (err) {
        // Auth failure: stop the whole sync — every subsequent call would
        // also 401. Reset this task back to "pending" so the user can retry
        // after re-auth without a permanent "failed" badge.
        if (isAuthError(err)) {
          markSyncStatus(local.localId, "pending");
          authStopped = true;
          continue;
        }
        const msg = err instanceof ApiError ? err.message : "Sync failed";
        markSyncStatus(local.localId, "failed", msg);
        failCount += 1;
      }
    }
    setSyncing(false);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    if (authStopped) {
      toast.error("Session expired. Please sign in again to finish syncing.");
    }
    if (okCount > 0) toast.success(`Synced ${okCount} task${okCount === 1 ? "" : "s"}.`);
    if (failCount > 0) toast.error(`${failCount} task${failCount === 1 ? "" : "s"} failed to sync — try again.`);
  }, [addParked, localTasks, markSyncStatus, queryClient, removeLocal, setAuthorOverride, setServerId]);

  const allTasks = useMemo<Task[]>(() => {
    // Apply two per-user overlays to every backend task:
    //   1. Authorship — Calvin and Jr share one bearer token, so the API
    //      always returns the same default `createdBy`. The overlay restores
    //      the operator who actually clicked Add (or Done).
    //   2. Parked — personal action, never sent to the backend. We only
    //      override `open` → `parked`; if the backend says the task is `done`,
    //      that wins (a parked task that gets completed should appear in Done,
    //      not Parked).
    const backend = (backendTasks ?? []).map((raw) => {
      const withAuthor = applyAuthorOverlay(raw);
      const withNumber = applyTaskNumber(withAuthor);
      // Apply the per-task local edit override on top of the backend body.
      // We only swap `bodyText` (and clear `bodyHtml` so the plain-text
      // edit isn't overridden by stale HTML) — every other field stays
      // canonical so task number, author, status, attachments and dates
      // remain correct.
      const override = localTaskEdits[withNumber.id];
      const withEdit = override
        ? { ...withNumber, bodyText: override.body, bodyHtml: "" }
        : withNumber;
      if (withEdit.status === "open" && parkedIds.has(withEdit.id)) {
        return { ...withEdit, status: "parked" as const };
      }
      return withEdit;
    });
    return [...backend, ...localTasks.map(localToTask)];
  }, [applyAuthorOverlay, applyTaskNumber, backendTasks, localTaskEdits, localTasks, parkedIds]);

  const counts = useMemo(
    () => ({
      open: allTasks.filter((t) => t.status === "open").length,
      parked: allTasks.filter((t) => t.status === "parked").length,
      done: allTasks.filter((t) => t.status === "done").length,
      all: allTasks.length,
    }),
    [allTasks],
  );

  const visibleTasks = useMemo(() => {
    const filtered =
      filter === "all" ? allTasks : allTasks.filter((t) => t.status === filter);
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) {
        return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      }
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return tb - ta;
    });
  }, [allTasks, filter]);

  const pendingCount = localTasks.length;
  const failedCount = localTasks.filter((t) => t.syncStatus === "failed").length;
  const showSyncButton = !backendUnavailable && !isError && pendingCount > 0;

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  const status: SyncStatus = isLoading
    ? "loading"
    : backendUnavailable
      ? "local"
      : otherError
        ? "error"
        : "online";

  const emptyCopy =
    filter === "done"
      ? "No completed tasks yet."
      : filter === "parked"
        ? "No parked tasks."
        : filter === "all"
          ? "No tasks yet."
          : "No open tasks.";

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <header className="sticky top-0 z-10 border-b border-[#dfe3ea] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-semibold tracking-tight text-[#1f2937] sm:text-[20px]">
                Tasks
              </h1>
              <StatusPill status={status} />
            </div>
            <p className="mt-0.5 text-[12px] text-[#4b5563] sm:text-[13px]">
              Shared task board for Calvin and Jr.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Acting-as toggle. Calvin and Jr share one login, so the
                dashboard cannot infer who is at the keyboard. The active
                identity drives `createdBy` on newly created local tasks and
                the default recipient in the composer (always the other
                person). Persisted in localStorage by useDashboardIdentity. */}
            <div
              role="group"
              aria-label="Acting as"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d9dee7] bg-white p-0.5 pl-2.5 text-[11.5px] text-[#4b5563]"
            >
              <span className="hidden font-medium sm:inline">Acting as</span>
              <div className="inline-flex rounded-full bg-[#f1f3f4] p-0.5">
                {(["Calvin", "Jr"] as TaskUser[]).map((u) => {
                  const active = identity === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Act as ${u}`}
                      title={`Act as ${u}`}
                      onClick={() => setIdentity(u)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                        active
                          ? "bg-[#1a73e8] text-white shadow-sm"
                          : "text-[#3c4043] hover:bg-white",
                      )}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-[#d9dee7] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4b5563] transition-colors hover:bg-[#eef1f6]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <TaskComposer
          submitting={submitting}
          backendUnavailable={backendUnavailable}
          defaultAssignee={otherIdentity}
          onSubmit={handleSubmit}
        />

        {backendUnavailable && (
          <div className="rounded-xl border border-[#f5cf6c] bg-[#fff4d1] px-4 py-3 text-[12px] text-[#6b4f00] sm:text-[13px]">
            Shared tasks aren't connected yet. You can still create local pending
            tasks — they'll sync when the backend is ready.
          </div>
        )}
        {otherError && (
          <div className="rounded-xl border border-[#d9dee7] bg-white px-4 py-3 text-[12px] text-[#4b5563] sm:text-[13px]">
            Couldn't load shared tasks right now. Your local tasks are still safe.
          </div>
        )}

        {showSyncButton && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cfd6e3] bg-white px-4 py-3 text-[12px] text-[#1f2937] shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:text-[13px]">
            <span>
              <span className="font-medium">
                {pendingCount} task{pendingCount === 1 ? "" : "s"} saved locally
              </span>
              {failedCount > 0 ? (
                <span className="text-[#a50e0e]"> · {failedCount} failed last time</span>
              ) : null}
              .
            </span>
            <button
              type="button"
              onClick={syncPendingTasks}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-full bg-[#1a73e8] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1664c1] disabled:opacity-60"
            >
              {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sync pending
            </button>
          </div>
        )}

        <div
          role="group"
          aria-label="Filter tasks"
          className="inline-flex rounded-full border border-[#cfd6e3] bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        >
          {FILTERS.map((f) => {
            const isActive = filter === f.id;
            const count = counts[f.id];
            return (
              <button
                key={f.id}
                aria-pressed={isActive}
                aria-label={`Show ${f.label.toLowerCase()} tasks (${count})`}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors sm:text-[13px]",
                  isActive
                    ? "bg-[#1a73e8] text-white shadow-sm"
                    : "text-[#4b5563] hover:bg-[#eef1f6] hover:text-[#1f2937]",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-semibold",
                    isActive ? "bg-white/25 text-white" : "bg-[#eef1f6] text-[#4b5563]",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {isLoading && !backendTasks && !backendUnavailable && (
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d9dee7] bg-white px-3 py-1.5 text-[12px] text-[#4b5563]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading tasks…
          </div>
        )}

        {!isLoading && visibleTasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#cfd6e3] bg-white px-4 py-8 text-center text-[13px] text-[#6b7280]">
            {emptyCopy}
          </div>
        )}

        <div className="space-y-3">
          {visibleTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              busy={busyId === t.id}
              canEdit
              editedLocally={!t.localId && Boolean(localTaskEdits[t.id])}
              onMarkDone={(task) => setStatus(task, "done")}
              onReopen={(task) => setStatus(task, "open")}
              onPark={(task) => setStatus(task, "parked")}
              onUnpark={(task) => setStatus(task, "open")}
              onOpenImage={(url) => setLightboxUrl(url)}
              onEdit={(task, patch) => {
                if (task.localId) {
                  // Local-pending task: mutate the canonical record so the
                  // edit will be picked up by the next sync.
                  updateLocal(task.localId, patch);
                  toast.success("Task updated.");
                  return;
                }
                // Backend task: there is no PATCH-body endpoint yet, so
                // store an honest local override and badge it as "Edited
                // locally". Backend status / sync wiring will be added when
                // the API ships.
                setLocalTaskEdit(task.id, patch.bodyText);
                toast.success("Edited locally. Will sync when the backend supports it.");
              }}
            />
          ))}
        </div>
      </main>

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close preview"
            className="absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Attachment preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}
