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
  isBackendUnavailable,
  listTasks,
  updateTaskStatus,
  uploadTaskAttachments,
} from "@/lib/tasks-api";
import {
  LOCAL_ATTACHMENT_MAX_BYTES,
  LocalAttachment,
  LocalPendingTask,
  fileToDataUrl,
  useLocalPendingTasks,
} from "@/hooks/use-local-pending-tasks";
import { ApiError } from "@/lib/error";
import { cn } from "@/lib/utils";

type Filter = "open" | "done" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

/** Adapt a localStorage pending task into the shared Task shape used by the UI. */
function localToTask(local: LocalPendingTask): Task {
  return {
    id: `local:${local.localId}`,
    localId: local.localId,
    bodyHtml: local.bodyHtml,
    bodyText: local.bodyText,
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
  } = useLocalPendingTasks();

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
        if (backendUnavailable) {
          await saveLocally(assignedTo, text, files);
          return;
        }
        try {
          const attachments = files.length > 0 ? await uploadTaskAttachments(files) : [];
          await createTask({
            assignedTo,
            bodyText: text,
            bodyHtml: "",
            attachmentIds: attachments.map((a) => a.id),
          });
          await queryClient.invalidateQueries({ queryKey: ["tasks"] });
          toast.success("Task added.");
        } catch (err) {
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
    [backendUnavailable, queryClient, saveLocally],
  );

  const setStatus = useCallback(
    async (task: Task, status: TaskStatus) => {
      if (task.localId) {
        setBusyId(task.id);
        try {
          setLocalStatus(task.localId, status);
        } finally {
          setBusyId(null);
        }
        return;
      }
      setBusyId(task.id);
      try {
        await updateMutation.mutateAsync({ id: task.id, status });
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Failed to update task.";
        toast.error(msg);
      } finally {
        setBusyId(null);
      }
    },
    [setLocalStatus, updateMutation],
  );

  const syncPendingTasks = useCallback(async () => {
    const queue = localTasks.filter(
      (t) => t.syncStatus === "pending" || t.syncStatus === "failed",
    );
    if (queue.length === 0) return;
    setSyncing(true);
    let okCount = 0;
    let failCount = 0;
    for (const local of queue) {
      markSyncStatus(local.localId, "syncing");
      try {
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
        if (local.status === "done") {
          try {
            await updateTaskStatus(created.id, "done");
          } catch {
            // Mirror best-effort; the task itself is already on the server.
          }
        }
        removeLocal(local.localId);
        okCount += 1;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Sync failed";
        markSyncStatus(local.localId, "failed", msg);
        failCount += 1;
      }
    }
    setSyncing(false);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    if (okCount > 0) toast.success(`Synced ${okCount} task${okCount === 1 ? "" : "s"}.`);
    if (failCount > 0) toast.error(`${failCount} task${failCount === 1 ? "" : "s"} failed to sync — try again.`);
  }, [localTasks, markSyncStatus, queryClient, removeLocal]);

  const allTasks = useMemo<Task[]>(
    () => [...(backendTasks ?? []), ...localTasks.map(localToTask)],
    [backendTasks, localTasks],
  );

  const counts = useMemo(
    () => ({
      open: allTasks.filter((t) => t.status === "open").length,
      done: allTasks.filter((t) => t.status === "done").length,
      all: allTasks.length,
    }),
    [allTasks],
  );

  const visibleTasks = useMemo(() => {
    const filtered =
      filter === "all" ? allTasks : allTasks.filter((t) => t.status === filter);
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
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
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-[#d9dee7] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4b5563] transition-colors hover:bg-[#eef1f6]"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <TaskComposer
          submitting={submitting}
          backendUnavailable={backendUnavailable}
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
              canEdit={Boolean(t.localId)}
              onMarkDone={(task) => setStatus(task, "done")}
              onReopen={(task) => setStatus(task, "open")}
              onOpenImage={(url) => setLightboxUrl(url)}
              onEdit={(task, patch) => {
                if (!task.localId) return;
                updateLocal(task.localId, patch);
                toast.success("Task updated.");
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
