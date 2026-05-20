import { useRef, useState, ChangeEvent, DragEvent } from "react";
import { FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/error";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_FILE_ACCEPT,
  MAX_KNOWLEDGE_FILE_BYTES,
  isAllowedKnowledgeFile,
  useKnowledgeFiles,
  type KnowledgeFile,
  type KnowledgeFileStatus,
} from "@/hooks/use-knowledge-files";

const STATUS_LABEL: Record<KnowledgeFileStatus, string> = {
  pending: "Uploading",
  processing: "Reading",
  ready: "In Agent knowledge",
  failed: "Could not read",
};

const STATUS_PILL: Record<KnowledgeFileStatus, string> = {
  pending: "bg-[#f1f3f4] text-[#5f6368]",
  processing: "bg-[#e8f0fe] text-[#1a73e8]",
  ready: "bg-[#e6f4ea] text-[#137333]",
  failed: "bg-[#fce8e6] text-[#c5221f]",
};

function fileTypeLabel(f: KnowledgeFile): string {
  const lower = f.filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".docx")) return "Word";
  if (lower.endsWith(".xlsx")) return "Spreadsheet";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".txt")) return "Text";
  return "File";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Knowledge file uploader. Files go to the backend, text is extracted
 * there, and `ready` files become source-of-truth context for Marina.
 */
export function KnowledgeFileUploader() {
  const { files, add, remove, isLoading, loadError, isUploading, isRemoving } = useKnowledgeFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handlePicked(picked: FileList | File[] | null) {
    if (!picked) return;
    const arr = Array.from(picked);
    if (arr.length === 0) return;

    const rejectedType = arr.filter((f) => !isAllowedKnowledgeFile(f));
    const rejectedSize = arr.filter(
      (f) => isAllowedKnowledgeFile(f) && f.size > MAX_KNOWLEDGE_FILE_BYTES,
    );

    const uploadable = arr.filter(
      (f) => isAllowedKnowledgeFile(f) && f.size <= MAX_KNOWLEDGE_FILE_BYTES,
    );

    if (uploadable.length > 0) {
      try {
        const uploaded = await add(uploadable);
        const ready = uploaded.filter((f) => f.status === "ready");
        const failed = uploaded.filter((f) => f.status === "failed");
        if (ready.length > 0) {
          toast.success(
            ready.length === 1
              ? `${ready[0].filename} added to Agent knowledge.`
              : `${ready.length} files added to Agent knowledge.`,
          );
        }
        if (failed.length > 0) {
          toast.error(
            failed.length === 1
              ? `${failed[0].filename} uploaded, but text could not be read.`
              : `${failed.length} files uploaded, but text could not be read.`,
          );
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Upload failed.";
        toast.error(message || "Upload failed.");
      }
    }
    if (rejectedType.length > 0) {
      toast.error(
        rejectedType.length === 1
          ? `${rejectedType[0].name} isn't a supported file type.`
          : `${rejectedType.length} files were skipped, unsupported type.`,
      );
    }
    if (rejectedSize.length > 0) {
      toast.error(
        rejectedSize.length === 1
          ? `${rejectedSize[0].name} is over 25 MB.`
          : `${rejectedSize.length} files were skipped, over 25 MB.`,
      );
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    handlePicked(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handlePicked(e.dataTransfer?.files ?? null);
  }

  return (
    <div className="space-y-4">
      {/* Drop zone -------------------------------------------------- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors sm:px-6",
          dragOver
            ? "border-[#1a73e8] bg-[#e8f0fe]"
            : "border-[#dadce0] bg-[#fafbfc] hover:bg-[#f6f8fc]",
        )}
      >
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-[#5f6368] shadow-sm">
          <UploadCloud className="h-5 w-5" />
        </div>
        <p className="mt-3 text-[13px] font-medium text-[#202124]">
          Drag and drop files here
        </p>
        <p className="mt-1 text-[12px] text-[#5f6368]">
          Upload documents, menus, price lists, FAQs, and policies for your Agent to use.
        </p>
        <div className="mt-4">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white",
              "hover:bg-[#1765c1] disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {isUploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isUploading ? "Uploading..." : "Upload files"}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-[#9aa0a6]">
          PDF, DOCX, TXT, CSV, XLSX. Up to 25 MB each.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={KNOWLEDGE_FILE_ACCEPT}
          onChange={onChange}
          className="hidden"
        />
      </div>

      {/* File list ------------------------------------------------- */}
      {loadError ? (
        <p className="rounded-lg border border-[#f6caca] bg-[#fce8e6] px-3 py-2 text-[12px] text-[#a50e0e]">
          Could not load uploaded knowledge files: {loadError.message}
        </p>
      ) : isLoading ? (
        <p className="inline-flex items-center gap-2 text-[12px] text-[#9aa0a6]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading uploaded files...
        </p>
      ) : files.length === 0 ? (
        <p className="text-[12px] text-[#9aa0a6]">No files added yet.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => {
            return (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-[#e8eaed] bg-white px-3 py-2.5"
              >
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#f1f3f4] text-[#5f6368]">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#202124]">
                    {f.filename}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[#5f6368]">
                    {fileTypeLabel(f)} · {formatBytes(f.sizeBytes)} · Added{" "}
                    {formatDate(f.uploadedAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex",
                    STATUS_PILL[f.status],
                  )}
                >
                  {STATUS_LABEL[f.status]}
                </span>
                <button
                  type="button"
                  disabled={isRemoving}
                  onClick={() => {
                    remove(f.id).catch((err) => {
                      const message =
                        err instanceof ApiError
                          ? err.message
                          : err instanceof Error
                            ? err.message
                            : "Could not remove file.";
                      toast.error(message || "Could not remove file.");
                    });
                  }}
                  aria-label={`Remove ${f.filename}`}
                  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
