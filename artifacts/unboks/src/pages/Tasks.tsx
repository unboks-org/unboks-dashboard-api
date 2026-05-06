import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useAuth } from "@/components/auth/useAuth";
import { TaskComposer } from "@/components/tasks/TaskComposer";
import { TaskCard } from "@/components/tasks/TaskCard";
import {
  Task,
  TaskStatus,
  TaskUser,
  createTask,
  listTasks,
  updateTaskStatus,
  uploadTaskAttachments,
} from "@/lib/tasks-api";
import { ApiError } from "@/lib/error";

type Filter = "open" | "done" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

export default function Tasks() {
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: tasks, isLoading, isError, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: listTasks,
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      updateTaskStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const handleSubmit = useCallback(
    async ({ assignedTo, text, files }: { assignedTo: TaskUser; text: string; files: File[] }) => {
      setSubmitting(true);
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
        const msg = err instanceof ApiError ? err.message : "Failed to add task.";
        toast.error(msg);
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [queryClient],
  );

  const setStatus = useCallback(
    async (task: Task, status: TaskStatus) => {
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
    [updateMutation],
  );

  const visibleTasks = useMemo(() => {
    const list = tasks ?? [];
    const filtered =
      filter === "all" ? list : list.filter((t) => t.status === filter);
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return tb - ta;
    });
  }, [tasks, filter]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  const errorBanner = isError ? (
    <div className="rounded-lg border border-[#fad2cf] bg-[#fce8e6] px-4 py-3 text-[13px] text-[#a50e0e]">
      Couldn’t load tasks: {error instanceof ApiError ? error.message : "Unknown error"}
    </div>
  ) : null;

  const emptyCopy =
    filter === "done" ? "No completed tasks yet." : "No open tasks.";

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

        {errorBanner}

        {isLoading && !tasks && (
          <div className="text-[13px] text-[#5f6368]">Loading…</div>
        )}

        {!isLoading && visibleTasks.length === 0 && !isError && (
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
