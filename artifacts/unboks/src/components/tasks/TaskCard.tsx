import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, Loader2, ArrowRight, Pencil, X } from "lucide-react";
import type { Task, TaskUser } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";

/** Render plain text safely with line breaks and auto-linked URLs. */
function renderBody(text: string) {
  if (!text) return null;
  const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
  return text.split("\n").map((line, lineIdx) => {
    const parts: Array<string | { url: string }> = [];
    let last = 0;
    line.replace(URL_RE, (match, _url, offset) => {
      if (offset > last) parts.push(line.slice(last, offset));
      parts.push({ url: match });
      last = offset + match.length;
      return match;
    });
    if (last < line.length) parts.push(line.slice(last));
    return (
      <span key={lineIdx}>
        {parts.map((p, i) =>
          typeof p === "string" ? (
            <span key={i}>{p}</span>
          ) : (
            <a
              key={i}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a73e8] underline break-all"
            >
              {p.url}
            </a>
          ),
        )}
        {lineIdx < text.split("\n").length - 1 && <br />}
      </span>
    );
  });
}

function formatTaskDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function Avatar({ name, dim = false }: { name: string; dim?: boolean }) {
  const initials = name.slice(0, 2).toUpperCase();
  // Stable hue per name
  const hues: Record<string, string> = {
    Jr: "bg-[#e8f0fe] text-[#1a73e8]",
    Calvin: "bg-[#fce8e6] text-[#a50e0e]",
  };
  const cls = hues[name] ?? "bg-[#f1f3f4] text-[#3c4043]";
  return (
    <span
      title={name}
      className={cn(
        "inline-grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold",
        cls,
        dim && "opacity-70",
      )}
    >
      {initials}
    </span>
  );
}

interface TaskCardProps {
  task: Task;
  busy: boolean;
  /** When true, the Edit action is enabled (local-pending tasks only for now). */
  canEdit?: boolean;
  onMarkDone: (task: Task) => void;
  onReopen: (task: Task) => void;
  onOpenImage: (url: string) => void;
  onEdit?: (task: Task, patch: { bodyText: string; assignedTo: TaskUser }) => void;
}

export function TaskCard({
  task,
  busy,
  canEdit = false,
  onMarkDone,
  onReopen,
  onOpenImage,
  onEdit,
}: TaskCardProps) {
  const body = useMemo(() => renderBody(task.bodyText || ""), [task.bodyText]);
  const isDone = task.status === "done";

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.bodyText || "");
  const [draftAssignee, setDraftAssignee] = useState<TaskUser>(task.assignedTo);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset draft whenever the underlying task changes (e.g. after save) or
  // edit mode is toggled.
  useEffect(() => {
    if (!editing) {
      setDraftText(task.bodyText || "");
      setDraftAssignee(task.assignedTo);
    }
  }, [editing, task.bodyText, task.assignedTo]);

  useEffect(() => {
    if (editing) {
      // Focus the textarea and place caret at the end.
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    }
  }, [editing]);

  const dirty =
    draftText !== (task.bodyText || "") || draftAssignee !== task.assignedTo;
  const canSave = dirty && draftText.trim().length > 0 && !busy;

  const handleSave = () => {
    if (!onEdit || !canSave) return;
    onEdit(task, { bodyText: draftText.trim(), assignedTo: draftAssignee });
    setEditing(false);
  };

  const handleCancel = () => {
    setDraftText(task.bodyText || "");
    setDraftAssignee(task.assignedTo);
    setEditing(false);
  };

  return (
    <article
      className={cn(
        "group rounded-2xl border bg-white transition-colors",
        isDone ? "border-[#eef0f2] bg-[#fafbfc]" : "border-[#e8eaed] hover:border-[#dadce0]",
      )}
    >
      <div className="px-4 py-4 sm:px-5">
        <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#5f6368]">
          <Avatar name={task.createdBy} dim={isDone} />
          <span className={cn("font-medium", isDone ? "text-[#5f6368]" : "text-[#3c4043]")}>
            {task.createdBy}
          </span>
          <ArrowRight className="h-3 w-3 text-[#9aa0a6]" />
          <Avatar name={task.assignedTo} dim={isDone} />
          <span className={cn("font-medium", isDone ? "text-[#5f6368]" : "text-[#3c4043]")}>
            {task.assignedTo}
          </span>
          <span className="text-[#dadce0]" aria-hidden>
            ·
          </span>
          <span>{formatTaskDate(task.createdAt)}</span>

          <div className="ml-auto flex items-center gap-2">
            {task.syncStatus === "pending" && (
              <span
                title="Saved locally — will sync when backend is connected."
                className="inline-flex items-center gap-1 rounded-full bg-[#fef7e0] px-2 py-0.5 text-[11px] font-medium text-[#8a6d00]"
              >
                Pending sync
              </span>
            )}
            {task.syncStatus === "syncing" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[11px] font-medium text-[#1a73e8]">
                <Loader2 className="h-3 w-3 animate-spin" /> Syncing
              </span>
            )}
            {task.syncStatus === "failed" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fce8e6] px-2 py-0.5 text-[11px] font-medium text-[#a50e0e]">
                Sync failed
              </span>
            )}
            {isDone && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[11px] font-medium text-[#137333]">
                <Check className="h-3 w-3" /> Done
              </span>
            )}
          </div>
        </header>

        {editing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[12px] text-[#5f6368]">
              <span>To</span>
              <div className="inline-flex rounded-full border border-[#e8eaed] p-0.5">
                {(["Jr", "Calvin"] as TaskUser[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setDraftAssignee(u)}
                    className={cn(
                      "rounded-full px-3 py-0.5 text-[11px] font-medium transition-colors",
                      draftAssignee === u
                        ? "bg-[#1a73e8] text-white"
                        : "text-[#3c4043] hover:bg-[#f1f3f4]",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={Math.max(3, Math.min(10, draftText.split("\n").length + 1))}
              className="w-full resize-y rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[14px] leading-relaxed text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              placeholder="Update task…"
            />
          </div>
        ) : (
          <div
            className={cn(
              "whitespace-pre-wrap break-words text-[14px] leading-relaxed",
              isDone ? "text-[#5f6368] line-through decoration-[#dadce0]" : "text-[#202124]",
            )}
          >
            {body || <span className="text-[#9aa0a6]">(no description)</span>}
          </div>
        )}

        {task.attachments.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {task.attachments.map((att) => (
              <button
                key={att.id}
                type="button"
                onClick={() => onOpenImage(att.url)}
                className={cn(
                  "aspect-square overflow-hidden rounded-lg border border-[#e8eaed] bg-[#f6f8fc] transition-opacity hover:opacity-90",
                  isDone && "opacity-70",
                )}
                aria-label={`Open ${att.fileName}`}
              >
                <img
                  src={att.url}
                  alt={att.fileName}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#f1f3f4] bg-[#fafbfc] px-4 py-2.5 sm:px-5">
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3c4043] transition-colors hover:bg-[#f1f3f4]"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1a73e8] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1664c1] disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              Save changes
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => canEdit && setEditing(true)}
              disabled={!canEdit}
              title={
                canEdit
                  ? "Edit task"
                  : "Editing shared tasks will be available when the backend supports it."
              }
              aria-label={canEdit ? "Edit task" : "Editing shared tasks not yet supported"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                canEdit
                  ? "border-[#dadce0] bg-white text-[#3c4043] hover:bg-[#f1f3f4]"
                  : "border-transparent bg-transparent text-[#9aa0a6] cursor-not-allowed",
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            {isDone ? (
              <button
                type="button"
                onClick={() => onReopen(task)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[#dadce0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3c4043] transition-colors hover:bg-[#f1f3f4] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Reopen
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onMarkDone(task)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#137333] px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0f5d29] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Mark done
              </button>
            )}
          </>
        )}
      </footer>
    </article>
  );
}
