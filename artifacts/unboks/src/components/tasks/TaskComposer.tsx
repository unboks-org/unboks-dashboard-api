import { useRef, useState, useCallback, ChangeEvent, ClipboardEvent } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, X, Loader2 } from "lucide-react";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES_PER_TASK,
  TaskUser,
  validateImageFile,
} from "@/lib/tasks-api";

interface PendingImage {
  file: File;
  previewUrl: string;
}

interface TaskComposerProps {
  submitting: boolean;
  onSubmit: (payload: { assignedTo: TaskUser; text: string; files: File[] }) => Promise<void>;
}

export function TaskComposer({ submitting, onSubmit }: TaskComposerProps) {
  const [assignedTo, setAssignedTo] = useState<TaskUser>("Jr");
  const [text, setText] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
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

  return (
    <div className="rounded-xl border border-[#e8eaed] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-[#5f6368]">
        <span>To</span>
        <div className="inline-flex rounded-full border border-[#e8eaed] p-0.5">
          {(["Jr", "Calvin"] as TaskUser[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setAssignedTo(u)}
              className={
                "px-3 py-1 text-[13px] rounded-full transition-colors " +
                (assignedTo === u
                  ? "bg-[#1a73e8] text-white"
                  : "text-[#3c4043] hover:bg-[#f1f3f4]")
              }
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={handlePaste}
        placeholder="Write a task…"
        rows={4}
        className="w-full resize-y rounded-lg border border-[#e8eaed] bg-white px-3 py-2 text-[14px] text-[#202124] placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:outline-none focus:ring-1 focus:ring-[#1a73e8]"
      />

      <p className="mt-1 text-[12px] text-[#9aa0a6]">
        Paste screenshots here or attach images. Line breaks and links are preserved.
      </p>

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
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-[#e8eaed] px-3 py-1.5 text-[13px] text-[#3c4043] hover:bg-[#f1f3f4]"
        >
          <ImageIcon className="h-4 w-4" />
          Attach image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
          onChange={handleFilePicker}
          className="hidden"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1664c1] disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Add task
        </button>
      </div>
    </div>
  );
}
