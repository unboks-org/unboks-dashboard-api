import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, RotateCcw, Loader2, Pencil, X, Copy, Pause, Play } from "lucide-react";
import type { Task, TaskUser } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";

/** Convert HTML to plain text while preserving paragraph/line breaks.
 *  Used as a fallback when a task only carries `bodyHtml`. */
function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") {
    // SSR-safe stripping: drop tags, decode a few common entities.
    return html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n");
  return (tmp.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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

function Avatar({
  name,
  dim = false,
  size = "sm",
}: {
  name: string;
  dim?: boolean;
  /** "sm" = 5x5 (legacy compact); "md" = 7x7 (header assignee). */
  size?: "sm" | "md";
}) {
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
        "inline-grid place-items-center rounded-full font-semibold",
        size === "md" ? "h-7 w-7 text-[11px]" : "h-5 w-5 text-[10px]",
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
  onPark: (task: Task) => void;
  onUnpark: (task: Task) => void;
  onOpenImage: (url: string) => void;
  onEdit?: (task: Task, patch: { bodyText: string; assignedTo: TaskUser }) => void;
}

export function TaskCard({
  task,
  busy,
  canEdit = false,
  onMarkDone,
  onReopen,
  onPark,
  onUnpark,
  onOpenImage,
  onEdit,
}: TaskCardProps) {
  const body = useMemo(() => renderBody(task.bodyText || ""), [task.bodyText]);
  const isDone = task.status === "done";
  const isParked = task.status === "parked";
  // "Muted" = visually softer card surface for non-active states.
  const muted = isDone || isParked;

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(task.bodyText || "");
  const [draftAssignee, setDraftAssignee] = useState<TaskUser>(task.assignedTo);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    const text = (task.bodyText && task.bodyText.trim().length > 0
      ? task.bodyText
      : htmlToPlainText(task.bodyHtml || "")
    ).replace(/\r\n/g, "\n");
    if (!text) {
      toast.error("Nothing to copy.");
      return;
    }
    const ok = await copyTextToClipboard(text);
    if (!ok) {
      toast.error("Could not copy");
      return;
    }
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 1500);
  };

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
        "group rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors",
        isDone && "border-[#dfe3ea] bg-[#f8fafc]",
        isParked && "border-[#dbe3ec] bg-[#f5f7fa]",
        !muted && "border-[#d9dee7] hover:border-[#cfd6e3]",
      )}
    >
      <div className="px-4 py-4 sm:px-5">
        <header className="mb-3 flex items-start justify-between gap-3">
          {/* Left: clear, human-readable assignment metadata.
              Pattern modeled on Linear / Google Classroom / Notion task
              cards — single prominent assignee avatar, primary "Assigned to"
              label, muted secondary "Created by … · <time>" underneath. */}
          <div className="flex min-w-0 items-start gap-2.5">
            <Avatar name={task.assignedTo} dim={muted} size="md" />
            <div className="min-w-0 leading-tight">
              <div
                className={cn(
                  "truncate text-[13px] font-medium sm:text-[13.5px]",
                  muted ? "text-[#4b5563]" : "text-[#1f2937]",
                )}
              >
                Assigned to {task.assignedTo}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-[#6b7280] sm:text-[12px]">
                Created by {task.createdBy} · {formatTaskDate(task.createdAt)}
              </div>
            </div>
          </div>

          {/* Right: status pills (sync / done). */}
          <div className="flex flex-shrink-0 items-center gap-2 pt-0.5">
            {task.syncStatus === "pending" && (
              <span
                title="Saved locally — will sync when backend is connected."
                className="inline-flex items-center gap-1 rounded-full border border-[#f5cf6c] bg-[#fff4d1] px-2 py-0.5 text-[11px] font-medium text-[#6b4f00]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#d97706]" aria-hidden />
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
            {isParked && (
              <span
                title="Parked — set aside, not urgent."
                className="inline-flex items-center gap-1 rounded-full border border-[#cfd8e3] bg-[#eef2f7] px-2 py-0.5 text-[11px] font-medium text-[#475569]"
              >
                <Pause className="h-3 w-3" /> Parked
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
              isDone
                ? "text-[#6b7280] line-through decoration-[#cbd5e1]"
                : isParked
                  ? "text-[#4b5563]"
                  : "text-[#1f2937]",
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
                  muted && "opacity-70",
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

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5 sm:px-5">
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
              onClick={handleCopy}
              title="Copy task text"
              aria-label="Copy task text"
              aria-live="polite"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                copied
                  ? "border-[#a6d8b9] bg-[#e6f4ea] text-[#137333]"
                  : "border-[#d9dee7] bg-white text-[#1f2937] hover:bg-[#eef1f6]",
              )}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy text"}
            </button>
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
                  ? "border-[#d9dee7] bg-white text-[#1f2937] hover:bg-[#eef1f6]"
                  : "border-transparent bg-transparent text-[#9aa0a6] cursor-not-allowed",
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            {isDone && (
              <button
                type="button"
                onClick={() => onReopen(task)}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-[#d9dee7] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f2937] transition-colors hover:bg-[#eef1f6] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Reopen
              </button>
            )}
            {isParked && (
              <>
                <button
                  type="button"
                  onClick={() => onUnpark(task)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d9dee7] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f2937] transition-colors hover:bg-[#eef1f6] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Move to open
                </button>
                <button
                  type="button"
                  onClick={() => onMarkDone(task)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-[#137333] px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0f5d29] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Mark done
                </button>
              </>
            )}
            {!isDone && !isParked && (
              <>
                <button
                  type="button"
                  onClick={() => onPark(task)}
                  disabled={busy}
                  title="Set aside — keeps the task without marking it done."
                  className="inline-flex items-center gap-2 rounded-full border border-[#d9dee7] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f2937] transition-colors hover:bg-[#eef1f6] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                  Park
                </button>
                <button
                  type="button"
                  onClick={() => onMarkDone(task)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-[#137333] px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0f5d29] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Mark done
                </button>
              </>
            )}
          </>
        )}
      </footer>
    </article>
  );
}
