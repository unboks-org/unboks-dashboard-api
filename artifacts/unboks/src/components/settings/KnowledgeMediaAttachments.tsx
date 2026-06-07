import { ChangeEvent, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteKnowledgeMedia,
  fetchKnowledgeMedia,
  uploadKnowledgeMedia,
  type KnowledgeMedia,
} from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function mediaQueryKey(slug: string, knowledgeId: string) {
  return ["knowledge", "media", slug, knowledgeId] as const;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function KnowledgeMediaAttachments({ knowledgeId }: { knowledgeId: string }) {
  const slug = getClientSlug();
  const queryKey = useMemo(() => mediaQueryKey(slug, knowledgeId), [slug, knowledgeId]);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");

  const query = useQuery({
    queryKey,
    queryFn: () => fetchKnowledgeMedia(knowledgeId),
    staleTime: 15_000,
    retry: 1,
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadKnowledgeMedia({
        knowledgeId,
        caption,
        file,
      }),
    onSuccess: (media) => {
      setCaption("");
      qc.setQueryData<KnowledgeMedia[]>(queryKey, (current = []) => [media, ...current]);
      void qc.invalidateQueries({ queryKey });
      toast.success("Image added to this knowledge item.");
    },
    onError: (err) => {
      const message = err instanceof Error && err.message ? err.message : "Image upload failed.";
      toast.error(message);
    },
  });

  const remove = useMutation({
    mutationFn: deleteKnowledgeMedia,
    onSuccess: (_unused, mediaId) => {
      qc.setQueryData<KnowledgeMedia[]>(queryKey, (current = []) =>
        current.filter((m) => m.id !== mediaId),
      );
      void qc.invalidateQueries({ queryKey });
      toast.success("Image removed.");
    },
    onError: (err) => {
      const message = err instanceof Error && err.message ? err.message : "Could not remove image.";
      toast.error(message);
    },
  });

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const hasAllowedType = ALLOWED_IMAGE_TYPES.includes(file.type);
    const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasAllowedType && !hasAllowedExtension) {
      toast.error("Use a JPG, JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image is over 10 MB.");
      return;
    }
    upload.mutate(file);
  }

  const media = query.data ?? [];

  return (
    <div className="mt-3 rounded-xl border border-[#eef0f3] bg-[#fbfcff] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5f6368]">
            Images for customers
          </span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optional caption, e.g. Oceanview balcony or Chocolate cupcake box"
            className="mt-1 w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[12px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
          />
        </label>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={onPick}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-lg border border-[#d6dbe3] bg-white px-3 py-2 text-[12px] font-medium text-[#202124] transition hover:bg-[#f6f8fc]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {upload.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UploadCloud className="h-3.5 w-3.5" />
          )}
          Add image
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-[#5f6368]">
        Attach product, property, menu, service, or example photos. If a customer asks
        for pictures, your Agent can share the matching image link.
      </p>

      {query.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[#5f6368]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading images
        </div>
      ) : media.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[#9aa0a6]">
          <ImageIcon className="h-3.5 w-3.5" />
          No images attached.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <div
              key={m.id}
              className="overflow-hidden rounded-lg border border-[#e8eaed] bg-white"
            >
              <a href={m.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={m.url}
                  alt={m.caption || m.originalFilename || "Knowledge image"}
                  className="h-28 w-full bg-[#f1f3f4] object-cover"
                  loading="lazy"
                />
              </a>
              <div className="flex items-start gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[#202124]">
                    {m.caption || m.originalFilename || "Image"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#5f6368]">
                    {formatBytes(m.sizeBytes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate(m.id)}
                  disabled={remove.isPending}
                  aria-label="Remove image"
                  className="grid h-7 w-7 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
