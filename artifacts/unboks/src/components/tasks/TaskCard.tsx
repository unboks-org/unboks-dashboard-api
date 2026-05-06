import { useMemo } from "react";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import type { Task } from "@/lib/tasks-api";

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
      className={
        "rounded-xl border bg-white p-4 shadow-sm transition-colors " +
        (isDone ? "border-[#e8eaed] opacity-80" : "border-[#e8eaed]")
      }
    >
      <header className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-[#5f6368]">
        <span className="font-medium text-[#3c4043]">{task.createdBy}</span>
        <span>→</span>
        <span className="font-medium text-[#3c4043]">{task.assignedTo}</span>
        <span aria-hidden>·</span>
        <span>{formatTaskDate(task.createdAt)}</span>
        {isDone && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[11px] font-medium text-[#137333]">
            <Check className="h-3 w-3" /> Done
          </span>
        )}
      </header>

      <div className="text-[14px] leading-relaxed text-[#202124] whitespace-pre-wrap break-words">
        {body || <span className="text-[#9aa0a6]">(no description)</span>}
      </div>

      {task.attachments.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {task.attachments.map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => onOpenImage(att.url)}
              className="aspect-square overflow-hidden rounded-lg border border-[#e8eaed] bg-[#f6f8fc] hover:opacity-90"
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

      <footer className="mt-4 flex items-center justify-end">
        {isDone ? (
          <button
            type="button"
            onClick={() => onReopen(task)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-[#e8eaed] px-3 py-1.5 text-[13px] text-[#3c4043] hover:bg-[#f1f3f4] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Reopen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onMarkDone(task)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-[#137333] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#0f5d29] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Mark done
          </button>
        )}
      </footer>
    </article>
  );
}
