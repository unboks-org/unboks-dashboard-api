import { useRef, useState, useCallback, ChangeEvent, ClipboardEvent } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, X, Loader2, Paperclip } from "lucide-react";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_TASK,
  TaskUser,
  validateImageFile,
} from "@/lib/tasks-api";
import { cn } from "@/lib/utils";

interface PendingImage {
  file: File;
  previewUrl: string;
}

interface TaskComposerProps {
  submitting: boolean;
  backendUnavailable?: boolean;
  onSubmit: (payload: { assignedTo: TaskUser; text: string; files: File[] }) => Promise<void>;
}

export function TaskComposer({ submitting, backendUnavailable, onSubmit }: TaskComposerProps) {
  const [assignedTo, setAssignedTo] = useState<TaskUser>("Jr");
  const [text, setText] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [focused, setFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const errors: string[] = [];
      const accepted: File[] = [];
      for (const f of incoming) {
        const err = validateImageFile(f);
        if (err) errors.push(err);
        else accepted.push(f);
      }
      setImages((current) => {
        const room = MAX_IMAGES_PER_TASK - current.length;
        if (room <= 0) {
          toast.error(`You can attach at most ${MAX_IMAGES_PER_TASK} images per task.`);
          return current;
        }
        const taken = accepted.slice(0, room);
        if (accepted.length > room) {
          toast.error(`Only ${room} more image${room === 1 ? "" : "s"} can fit on this task.`);
        }
        const next = taken.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        return [...current, ...next];
      });
      if (errors.length > 0) toast.error(errors.join("\n"));
    },
    [],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles],
  );

  const handleFilePicker = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list) return;
      addFiles(Array.from(list));
      e.target.value = "";
    },
    [addFiles],
  );

  const removeImage = useCallback((idx: number) => {
    setImages((current) => {
      const removed = current[idx];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((_, i) => i !== idx);
    });
  }, []);

  const reset = useCallback(() => {
    setText("");
    setImages((current) => {
      current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) {
      toast.error("Write a task or attach a screenshot first.");
      return;
    }
    try {
      await onSubmit({
        assignedTo,
        text: trimmed,
        files: images.map((i) => i.file),
      });
      reset();
    } catch {
      // Parent already shows a toast.
    }
  }, [assignedTo, images, onSubmit, reset, text]);

  const canSubmit = !submitting && (text.trim().length > 0 || images.length > 0);

  return (
    <section
      className={cn(
        "rounded-2xl border bg-white transition-colors",
        focused ? "border-[#c6dafc]" : "border-[#e8eaed]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f3f4] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-[13px] text-[#5f6368]">
          <span>To</span>
          <div className="inline-flex rounded-full border border-[#e8eaed] p-0.5">
            {(["Jr", "Calvin"] as TaskUser[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setAssignedTo(u)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                  assignedTo === u
                    ? "bg-[#1a73e8] text-white"
                    : "text-[#3c4043] hover:bg-[#f1f3f4]",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[12px] text-[#9aa0a6]">
          Up to {MAX_IMAGES_PER_TASK} images · 10 MB each
        </span>
      </div>

      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Write a task…"
          rows={4}
          className="w-full resize-y border-0 bg-transparent p-0 text-[14px] leading-relaxed text-[#202124] placeholder:text-[#9aa0a6] focus:outline-none focus:ring-0"
        />

        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img, idx) => (
              <div
                key={img.previewUrl}
                className="relative aspect-square overflow-hidden rounded-lg border border-[#e8eaed] bg-[#f6f8fc]"
              >
                <img
                  src={img.previewUrl}
                  alt={img.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  aria-label={`Remove ${img.file.name}`}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f3f4] bg-[#fafbfc] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full border border-[#dadce0] bg-white px-3 py-1.5 text-[12px] text-[#3c4043] transition-colors hover:bg-[#f1f3f4]"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Attach
          </button>
          <span className="hidden items-center gap-1.5 text-[12px] text-[#9aa0a6] sm:inline-flex">
            <Paperclip className="h-3 w-3" />
            Paste screenshots or attach images
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            multiple
            onChange={handleFilePicker}
            className="hidden"
          />
        </div>

        <div className="flex items-center gap-3">
          {backendUnavailable && (
            <span className="hidden text-[12px] text-[#5f6368] sm:inline">
              Will save locally
            </span>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
              canSubmit
                ? "bg-[#1a73e8] text-white hover:bg-[#1664c1]"
                : "bg-[#c8d4e6] text-white",
            )}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add task
          </button>
        </div>
      </div>
    </section>
  );
}
