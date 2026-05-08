import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Per-task notes overlay.
 *
 * Each task gets its own free-form notes area: typed text plus optionally
 * pasted images. There is no backend endpoint for task notes yet (the
 * Python API at api.unboks.org only exposes GET/POST/PATCH on tasks
 * themselves), so notes are persisted locally per device and surfaced as
 * "Saved locally" in the UI. When backend support ships, the hook can be
 * swapped for a real `useNotesQuery(taskId)` without changing TaskCard.
 *
 * Key format mirrors the rest of the Tasks page:
 *   - backend tasks → server uuid (Task.id)
 *   - local-pending tasks → `local:<localId>` (Task.id while unsynced)
 * `migrateKey` is called from `syncPendingTasks` to move notes from the
 * `local:<localId>` slot onto the new server uuid so notes survive sync.
 *
 * Image storage: pasted images are stored as data URLs alongside the
 * text. Same 500 KB ceiling as task attachments (LOCAL_ATTACHMENT_MAX_BYTES)
 * so localStorage doesn't blow up. Larger images are rejected with a
 * caller-visible reason.
 *
 * Cross-tab sync: native `storage` event for other tabs, custom event for
 * the same tab. Same pattern as `useLocalTaskEdits`.
 */

const STORAGE_KEY = "unboks_task_notes";
const EVENT_NAME = "unboks_task_notes_changed";

export const NOTE_IMAGE_MAX_BYTES = 500 * 1024;
const NOTE_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface NoteImage {
  id: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TaskNote {
  text: string;
  images: NoteImage[];
  updatedAt: string;
}

export type TaskNotesMap = Record<string, TaskNote>;

function readFromStorage(): TaskNotesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: TaskNotesMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const rec = v as Partial<TaskNote>;
      const text = typeof rec.text === "string" ? rec.text : "";
      const images = Array.isArray(rec.images)
        ? rec.images
            .filter((img): img is NoteImage => {
              if (!img || typeof img !== "object") return false;
              const i = img as Partial<NoteImage>;
              return (
                typeof i.id === "string" &&
                typeof i.dataUrl === "string" &&
                typeof i.mimeType === "string" &&
                typeof i.sizeBytes === "number"
              );
            })
            .map((img) => ({
              id: img.id,
              dataUrl: img.dataUrl,
              mimeType: img.mimeType,
              sizeBytes: img.sizeBytes,
              createdAt:
                typeof img.createdAt === "string"
                  ? img.createdAt
                  : new Date().toISOString(),
            }))
        : [];
      if (text.length === 0 && images.length === 0) continue;
      out[k] = {
        text,
        images,
        updatedAt:
          typeof rec.updatedAt === "string" ? rec.updatedAt : new Date().toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persist(map: TaskNotesMap): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
    return true;
  } catch {
    return false;
  }
}

function genId(): string {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export function useTaskNotes() {
  const [notes, setNotes] = useState<TaskNotesMap>(readFromStorage);

  useEffect(() => {
    const sync = () => setNotes(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const get = useCallback(
    (taskId: string): TaskNote | undefined => notes[taskId],
    [notes],
  );

  /** Replace the entire note record for a task. Empty text + zero images
   *  removes the entry entirely so storage stays tidy. Returns whether
   *  persistence succeeded (false on quota errors). */
  const save = useCallback(
    (taskId: string, next: { text: string; images: NoteImage[] }): boolean => {
      if (!taskId) return false;
      let ok = true;
      setNotes((current) => {
        const map: TaskNotesMap = { ...current };
        const text = next.text;
        const images = next.images;
        if (text.trim().length === 0 && images.length === 0) {
          if (!(taskId in map)) return current;
          delete map[taskId];
        } else {
          map[taskId] = {
            text,
            images,
            updatedAt: new Date().toISOString(),
          };
        }
        ok = persist(map);
        return map;
      });
      return ok;
    },
    [],
  );

  /** Move a note from one key to another (used when a local task syncs and
   *  gains a server uuid). Silently no-ops if there is nothing to move. */
  const migrateKey = useCallback((oldKey: string, newKey: string) => {
    if (!oldKey || !newKey || oldKey === newKey) return;
    setNotes((current) => {
      if (!(oldKey in current)) return current;
      const map = { ...current };
      map[newKey] = current[oldKey];
      delete map[oldKey];
      persist(map);
      return map;
    });
  }, []);

  return { notes, get, save, migrateKey };
}

/** Convert a File or Blob to a data URL. Used by the Notes editor when the
 *  user pastes an image into the textarea. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(blob);
  });
}

/** True when a clipboard item should be saved as an inline image. */
export function isAcceptedNoteImage(item: { type: string; size: number }): boolean {
  return NOTE_IMAGE_MIMES.has(item.type) && item.size <= NOTE_IMAGE_MAX_BYTES;
}

export function makeNoteImage(opts: {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
}): NoteImage {
  return {
    id: genId(),
    dataUrl: opts.dataUrl,
    mimeType: opts.mimeType,
    sizeBytes: opts.sizeBytes,
    createdAt: new Date().toISOString(),
  };
}

/** Convenience: total bytes used by a note's images, for quota messaging. */
export function noteImagesByteSize(images: NoteImage[]): number {
  return images.reduce((acc, img) => acc + img.sizeBytes, 0);
}

export function useTaskNotesCountByKeys(keys: string[]) {
  const { notes } = useTaskNotes();
  return useMemo(() => {
    let n = 0;
    for (const k of keys) if (notes[k]) n += 1;
    return n;
  }, [notes, keys]);
}
