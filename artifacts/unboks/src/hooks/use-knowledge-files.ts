import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "unboks_knowledge_files";
const EVENT_NAME = "unboks_knowledge_files_changed";

// Mirrors the backend data shape so the local-only v1 swap-out for the
// real API will be a one-spot edit:
//   POST /api/{client}/dashboard/api/knowledge/files
//   GET  /api/{client}/dashboard/api/knowledge/files
//   DELETE /api/{client}/dashboard/api/knowledge/files/{id}
export type KnowledgeFileStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export interface KnowledgeFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KnowledgeFileStatus;
  uploadedAt: string;
  lastUsedAt?: string;
}

// File types the UI accepts. The MIME list is permissive (some browsers
// emit empty type for some uploads, especially CSV/TXT) so we also fall
// back to extension matching.
export const KNOWLEDGE_FILE_ACCEPT = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".csv",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];

export const MAX_KNOWLEDGE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export function isAllowedKnowledgeFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function readFromStorage(): KnowledgeFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (f) =>
              f && typeof f.id === "string" && typeof f.filename === "string",
          )
          // Pre-backend safety net: until the upload endpoint exists,
          // every locally registered file MUST surface as `pending`. We
          // coerce here so a stale localStorage entry from a future
          // preview build can never falsely show "Ready" / "Processing"
          // / "Failed" to the customer.
          .map((f) => ({ ...f, status: "pending" as KnowledgeFileStatus }));
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function persist(list: KnowledgeFile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

/**
 * Local-only knowledge file registry for v1. Files are stored as
 * filename + size metadata (NOT the binary) so we never blow the
 * localStorage quota and never claim the file is available to the AI.
 *
 * Status stays `"pending"` until the backend upload endpoint
 * (`POST /api/{client}/dashboard/api/knowledge/files`) is wired up. The
 * UI surfaces this calmly — the customer sees the file is queued, not
 * a fake "Ready".
 *
 * To swap to the real backend later: replace `add` with a real upload
 * call that returns `{id, status}`, and wire `remove` to the DELETE
 * endpoint. The hook signature can stay identical.
 */
export function useKnowledgeFiles() {
  const [files, setFiles] = useState<KnowledgeFile[]>(readFromStorage);

  useEffect(() => {
    const sync = () => setFiles(readFromStorage());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const add = useCallback((picked: File[]): KnowledgeFile[] => {
    const accepted: KnowledgeFile[] = [];
    for (const f of picked) {
      if (!isAllowedKnowledgeFile(f)) continue;
      if (f.size > MAX_KNOWLEDGE_FILE_BYTES) continue;
      accepted.push({
        id:
          crypto.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filename: f.name,
        mimeType: f.type || "application/octet-stream",
        sizeBytes: f.size,
        // We have NOT uploaded anywhere — keep status honest.
        status: "pending",
        uploadedAt: new Date().toISOString(),
      });
    }
    if (accepted.length === 0) return [];
    setFiles((current) => {
      const list = [...accepted, ...current];
      persist(list);
      return list;
    });
    return accepted;
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((current) => {
      const list = current.filter((f) => f.id !== id);
      persist(list);
      return list;
    });
  }, []);

  return { files, add, remove };
}
