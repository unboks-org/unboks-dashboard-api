import { useMemo } from "react";
import { Check, RotateCcw, Loader2, ArrowRight } from "lucide-react";
import type { Task } from "@/lib/tasks-api";
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
  onMarkDone: (task: Task) => void;
  onReopen: (task: Task) => void;
  onOpenImage: (url: string) => void;
}

export function TaskCard({ task, busy, onMarkDone, onReopen, onOpenImage }: TaskCardProps) {
  const body = useMemo(() => renderBody(task.bodyText || ""), [task.bodyText]);
  const isDone = task.status === "done";

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

        <div
          className={cn(
            "whitespace-pre-wrap break-words text-[14px] leading-relaxed",
            isDone ? "text-[#5f6368] line-through decoration-[#dadce0]" : "text-[#202124]",
          )}
        >
          {body || <span className="text-[#9aa0a6]">(no description)</span>}
        </div>

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

      <footer className="flex items-center justify-end gap-2 border-t border-[#f1f3f4] bg-[#fafbfc] px-4 py-2.5 sm:px-5">
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
      </footer>
    </article>
  );
}
