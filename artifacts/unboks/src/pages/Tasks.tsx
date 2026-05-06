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
    setLocalStatus,
    removeLocal,
    markSyncStatus,
  } = useLocalPendingTasks();

  const { data: backendTasks, isLoading, isError, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: listTasks,
    refetchInterval: 30_000,
    retry: (failureCount, err) => {
      // Don't keep retrying when the backend route simply isn't there yet.
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

  /** Build LocalAttachment[] from picked files, skipping anything too large. */
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
        // Skip the backend round-trip entirely if we already know it's unavailable.
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
      // Local pending tasks: update in localStorage only.
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

  /** Push every pending local task to the backend. Keeps the local copy on failure. */
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

  const visibleTasks = useMemo(() => {
    const merged: Task[] = [...(backendTasks ?? []), ...localTasks.map(localToTask)];
    const filtered = filter === "all" ? merged : merged.filter((t) => t.status === filter);
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return tb - ta;
    });
  }, [backendTasks, localTasks, filter]);

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

  const noticeBanner = backendUnavailable ? (
    <div className="rounded-lg border border-[#fde293] bg-[#fef7e0] px-4 py-3 text-[13px] text-[#8a6d00]">
      Tasks backend isn’t connected yet. You can add tasks now — they’ll be saved
      in this browser and synced when the backend is ready. Jr will see them
      after sync.
    </div>
  ) : otherError ? (
    <div className="rounded-lg border border-[#fad2cf] bg-[#fce8e6] px-4 py-3 text-[13px] text-[#a50e0e]">
      Couldn’t load tasks: {error instanceof ApiError ? error.message : "Unknown error"}
    </div>
  ) : null;

  const syncBanner = showSyncButton ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e8eaed] bg-[#f6f8fc] px-4 py-3 text-[13px] text-[#3c4043]">
      <span>
        {pendingCount} task{pendingCount === 1 ? "" : "s"} saved locally
        {failedCount > 0 ? ` · ${failedCount} failed last time` : ""}.
      </span>
      <button
        type="button"
        onClick={syncPendingTasks}
        disabled={syncing}
        className="inline-flex items-center gap-2 rounded-full bg-[#1a73e8] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#1664c1] disabled:opacity-60"
      >
        {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Sync pending tasks
      </button>
    </div>
  ) : null;

  const emptyCopy = filter === "done" ? "No completed tasks yet." : "No open tasks.";

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-[#e8eaed] bg-white px-5 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-[20px] font-medium text-[#202124]">Tasks</h1>
            <p className="text-[13px] text-[#5f6368]">
              Shared task board for Calvin and Jr.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-[#e8eaed] px-3 py-1.5 text-[13px] text-[#5f6368] hover:bg-[#f1f3f4]"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-5 space-y-5">
        <TaskComposer submitting={submitting} onSubmit={handleSubmit} />

        <div className="flex items-center gap-1 border-b border-[#e8eaed]">
          {FILTERS.map((f) => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={
                  "px-3 py-2 text-[13px] -mb-px border-b-2 transition-colors " +
                  (isActive
                    ? "border-[#1a73e8] text-[#1a73e8] font-medium"
                    : "border-transparent text-[#5f6368] hover:text-[#3c4043]")
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {noticeBanner}
        {syncBanner}

        {isLoading && !backendTasks && !backendUnavailable && (
          <div className="text-[13px] text-[#5f6368]">Loading…</div>
        )}

        {!isLoading && visibleTasks.length === 0 && !otherError && (
          <div className="rounded-xl border border-dashed border-[#e8eaed] bg-[#f6f8fc] px-4 py-8 text-center text-[13px] text-[#5f6368]">
            {emptyCopy}
          </div>
        )}

        <div className="space-y-3">
          {visibleTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              busy={busyId === t.id}
              onMarkDone={(task) => setStatus(task, "done")}
              onReopen={(task) => setStatus(task, "open")}
              onOpenImage={(url) => setLightboxUrl(url)}
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
