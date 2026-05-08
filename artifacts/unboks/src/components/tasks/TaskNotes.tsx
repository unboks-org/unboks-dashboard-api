import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  blobToDataUrl,
  isAcceptedNoteImage,
  makeNoteImage,
  NOTE_IMAGE_MAX_BYTES,
  type NoteImage,
  type TaskNote,
} from "@/hooks/use-task-notes";

interface TaskNotesProps {
  /** Existing note record from the hook, or undefined if none yet. */
  note: TaskNote | undefined;
  /** Persists the note. Returns false on quota failure. */
  onSave: (next: { text: string; images: NoteImage[] }) => boolean;
  /** Click handler so pasted images can open in the existing lightbox. */
  onOpenImage: (url: string) => void;
  /** Disabled state (e.g. while a parent operation is in flight). */
  disabled?: boolean;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Apple-Notes-style notes editor for a single task.
 *
 *  - Plain text, autosaved 600ms after the last keystroke.
 *  - Pasted images are stored inline as data URLs (same 500 KB cap as
 *    task attachments). Pasting also works from screenshot tools.
 *  - All persistence is local-only — the Python backend doesn't yet
 *    expose a notes endpoint. Surface this honestly with a small
 *    "Saved on this device" note so the operator isn't surprised.
 */
export function TaskNotes({ note, onSave, onOpenImage, disabled = false }: TaskNotesProps) {
  const initialText = note?.text ?? "";
  const initialImages = useMemo(() => note?.images ?? [], [note?.images]);

  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<NoteImage[]>(initialImages);
  const [state, setState] = useState<SaveState>("idle");
  const lastSavedRef = useRef<{ text: string; imageIds: string }>({
    text: initialText,
    imageIds: initialImages.map((i) => i.id).join(","),
  });
  const debounceRef = useRef<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Latest state mirror for the unmount cleanup. Without this, the
  // cleanup closure would capture the mount-time `images`/`text`/`onSave`
  // and silently drop any image pasted between mount and unmount.
  const latestRef = useRef({ text, images, onSave });
  useEffect(() => {
    latestRef.current = { text, images, onSave };
  }, [text, images, onSave]);

  // External updates (e.g. cross-tab sync) overwrite local state only when
  // the editor isn't dirty — avoid clobbering an in-progress edit.
  useEffect(() => {
    const incomingText = note?.text ?? "";
    const incomingImages = note?.images ?? [];
    const incomingKey = incomingImages.map((i) => i.id).join(",");
    if (state === "saving" || state === "dirty") return;
    if (incomingText === lastSavedRef.current.text && incomingKey === lastSavedRef.current.imageIds) {
      return;
    }
    setText(incomingText);
    setImages(incomingImages);
    lastSavedRef.current = { text: incomingText, imageIds: incomingKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.text, note?.images]);

  // Auto-grow textarea to fit content (capped) so the editor feels native.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  }, [text]);

  const persist = useCallback(
    (nextText: string, nextImages: NoteImage[]) => {
      setState("saving");
      const ok = onSave({ text: nextText, images: nextImages });
      if (!ok) {
        setState("error");
        toast.error("Couldn't save notes — local storage is full.");
        return;
      }
      lastSavedRef.current = {
        text: nextText,
        imageIds: nextImages.map((i) => i.id).join(","),
      };
      setState("saved");
    },
    [onSave],
  );

  const scheduleSave = useCallback(
    (nextText: string, nextImages: NoteImage[]) => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      setState("dirty");
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        persist(nextText, nextImages);
      }, 600);
    },
    [persist],
  );

  // Flush any pending save on unmount so notes aren't silently dropped if
  // the user collapses the card mid-debounce. We pull the latest state
  // off `latestRef` (not the mount-time closure) so a recently pasted
  // image isn't lost.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
        const { text: curText, images: curImages, onSave: curSave } = latestRef.current;
        const lastText = lastSavedRef.current.text;
        const lastImagesKey = lastSavedRef.current.imageIds;
        const curImagesKey = curImages.map((i) => i.id).join(",");
        if (curText !== lastText || curImagesKey !== lastImagesKey) {
          curSave({ text: curText, images: curImages });
        }
      }
    };
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setText(next);
    scheduleSave(next, images);
  };

  const ingestFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const accepted: NoteImage[] = [];
      let rejected = 0;
      for (const file of files) {
        if (!isAcceptedNoteImage({ type: file.type, size: file.size })) {
          rejected += 1;
          continue;
        }
        try {
          const dataUrl = await blobToDataUrl(file);
          accepted.push(
            makeNoteImage({ dataUrl, mimeType: file.type, sizeBytes: file.size }),
          );
        } catch {
          rejected += 1;
        }
      }
      if (rejected > 0) {
        toast.warning(
          `${rejected} image${rejected === 1 ? "" : "s"} skipped — only PNG/JPEG/WebP/GIF under ${Math.round(NOTE_IMAGE_MAX_BYTES / 1024)} KB are supported.`,
        );
      }
      if (accepted.length === 0) return;
      const nextImages = [...images, ...accepted];
      setImages(nextImages);
      scheduleSave(text, nextImages);
    },
    [images, scheduleSave, text],
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files);
    }
    // Plain text paste falls through to default browser behavior.
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files);
    }
  };

  const removeImage = (id: string) => {
    const nextImages = images.filter((i) => i.id !== id);
    setImages(nextImages);
    scheduleSave(text, nextImages);
  };

  const stateLabel: Record<SaveState, { text: string; cls: string; spin?: boolean }> = {
    idle: { text: "Saved", cls: "text-[#6b7280]" },
    dirty: { text: "Unsaved", cls: "text-[#9aa0a6]" },
    saving: { text: "Saving…", cls: "text-[#1a73e8]", spin: true },
    saved: { text: "Saved", cls: "text-[#137333]" },
    error: { text: "Save failed", cls: "text-[#a50e0e]" },
  };
  const initialEmpty = initialText.length === 0 && initialImages.length === 0;
  const status = state === "idle" && initialEmpty ? null : stateLabel[state];

  return (
    <section className="mt-3 rounded-xl border border-[#e6eaf0] bg-[#fafbfd] px-3 pt-2.5 pb-2 sm:px-3.5">
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h3
          id="task-notes-label"
          className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]"
        >
          Notes
        </h3>
        {status && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px]",
              status.cls,
            )}
            aria-live="polite"
          >
            {status.spin && <Loader2 className="h-3 w-3 animate-spin" />}
            {status.text}
          </span>
        )}
      </header>

      <textarea
        ref={taRef}
        value={text}
        onChange={handleTextChange}
        onPaste={handlePaste}
        onDrop={handleDrop}
        disabled={disabled}
        rows={2}
        aria-labelledby="task-notes-label"
        placeholder="Add notes, screenshots, links, or extra context for this task…"
        className={cn(
          "block w-full resize-none border-0 bg-transparent p-0 text-[13.5px] leading-relaxed text-[#1f2937] outline-none placeholder:text-[#9aa0a6]",
          "min-h-[2.5em]",
          disabled && "opacity-60",
        )}
      />

      {images.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-[#e2e8f0] bg-white"
            >
              <button
                type="button"
                onClick={() => onOpenImage(img.dataUrl)}
                className="block h-full w-full"
                aria-label="Open note image"
              >
                <img
                  src={img.dataUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                aria-label="Remove image"
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-[#9aa0a6]">
        <Paperclip className="h-2.5 w-2.5" />
        Paste text or images. Saved on this device until shared notes ship.
      </p>
    </section>
  );
}
