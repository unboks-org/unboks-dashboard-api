import { useRef, useState, ChangeEvent, DragEvent } from "react";
import { FileText, Image as ImageIcon, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_FILE_ACCEPT,
  MAX_KNOWLEDGE_FILE_BYTES,
  isAllowedKnowledgeFile,
  useKnowledgeFiles,
  type KnowledgeFile,
  type KnowledgeFileStatus,
} from "@/hooks/use-knowledge-files";

// Pre-backend phase: every locally registered file is forced to
// `pending` by the hook, so only the "Queued" pill renders today. The
// other branches stay defined so the UI lights up cleanly the moment
// the upload endpoint is wired (status will then arrive from the
// server, not from us).
const STATUS_LABEL: Record<KnowledgeFileStatus, string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Upload failed",
};

const STATUS_PILL: Record<KnowledgeFileStatus, string> = {
  pending: "bg-[#fef7e0] text-[#a56300]",
  processing: "bg-[#e8f0fe] text-[#1a73e8]",
  ready: "bg-[#e6f4ea] text-[#137333]",
  failed: "bg-[#fce8e6] text-[#c5221f]",
};

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

function fileTypeLabel(f: KnowledgeFile): string {
  const lower = f.filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "Word";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "Spreadsheet";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".txt")) return "Text";
  if (IMAGE_EXTS.some((e) => lower.endsWith(e))) return "Image";
  return "File";
}

function isImage(f: KnowledgeFile): boolean {
  const lower = f.filename.toLowerCase();
  return IMAGE_EXTS.some((e) => lower.endsWith(e));
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
 * Knowledge file uploader. Frontend-only v1: file picker / drag-drop
 * surface accepts the spec'd file types and registers them locally with
 * status `"pending"`. We never claim a file is `"Ready"` to the AI on
 * our own — that flips only when the backend upload endpoint replies.
 *
 * When the user actually drops a file, we surface a calm one-liner
 * explaining the upload itself isn't wired yet, so they aren't misled
 * into thinking the AI can already read the file.
 */
export function KnowledgeFileUploader() {
  const { files, add, remove } = useKnowledgeFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handlePicked(picked: FileList | File[] | null) {
    if (!picked) return;
    const arr = Array.from(picked);
    if (arr.length === 0) return;

    const rejectedType = arr.filter((f) => !isAllowedKnowledgeFile(f));
    const rejectedSize = arr.filter(
      (f) => isAllowedKnowledgeFile(f) && f.size > MAX_KNOWLEDGE_FILE_BYTES,
    );

    const accepted = add(arr);

    if (accepted.length > 0) {
      toast.success(
        accepted.length === 1
          ? `${accepted[0].filename} added.`
          : `${accepted.length} files added.`,
        {
          description:
            "File upload will be connected by the Unboks team. Files stay queued until then.",
        },
      );
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
          Upload documents, menus, price lists, FAQs, screenshots, and policies.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white",
              "hover:bg-[#1765c1]",
            )}
          >
            Upload files
          </button>
        </div>
        <p className="mt-3 text-[11px] text-[#9aa0a6]">
          PDF, Word, TXT, CSV, Excel, PNG, JPG, WebP. Up to 25 MB each.
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
      {files.length === 0 ? (
        <p className="text-[12px] text-[#9aa0a6]">No files added yet.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => {
            const Icon = isImage(f) ? ImageIcon : FileText;
            return (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-[#e8eaed] bg-white px-3 py-2.5"
              >
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#f1f3f4] text-[#5f6368]">
                  <Icon className="h-4 w-4" />
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
                  onClick={() => remove(f.id)}
                  aria-label={`Remove ${f.filename}`}
                  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
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
