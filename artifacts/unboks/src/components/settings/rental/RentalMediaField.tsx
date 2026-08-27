import { useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageIcon, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { fetchRentalMedia, uploadRentalMedia } from "@/lib/rental-catalog";
import { tenantKey } from "@/lib/query-keys";
import { secondaryButton } from "./RentalFields";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function RentalMediaField({
  ownerId,
  assetId,
  onAssetId,
  caption = "Rental catalog image",
  alt = "Rental image preview",
}: {
  ownerId: string;
  assetId: string | null;
  onAssetId: (assetId: string | null) => void;
  caption?: string;
  alt?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const media = useQuery({
    queryKey: tenantKey("rental-catalog", "media", assetId ?? "none"),
    queryFn: () => fetchRentalMedia(assetId ?? ""),
    enabled: Boolean(assetId),
    staleTime: 30_000,
    retry: false,
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadRentalMedia(ownerId, file, caption),
    onSuccess: (asset) => {
      onAssetId(asset.id);
      toast.success("Vehicle image uploaded to this workspace.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Vehicle image upload failed.",
      );
    },
  });

  return (
    <div className="flex min-w-[150px] items-center gap-2">
      <div className="grid h-14 w-20 flex-none place-items-center overflow-hidden rounded-lg border border-[#e1e4e8] bg-[#f8f9fb]">
        {media.data?.url ? (
          <img
            src={media.data.url}
            alt={alt}
            className="h-full w-full object-cover"
          />
        ) : media.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#5f6368]" />
        ) : (
          <ImageIcon className="h-5 w-5 text-[#9aa0a6]" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!ALLOWED.has(file.type)) {
              toast.error("Use a JPG, PNG, or WebP image.");
              return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
              toast.error("Image is over 10 MB.");
              return;
            }
            upload.mutate(file);
          }}
        />
        <button
          type="button"
          className={secondaryButton}
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UploadCloud className="h-3.5 w-3.5" />
          )}
          {assetId ? "Replace" : "Upload"}
        </button>
        {assetId ? (
          <button
            type="button"
            onClick={() => onAssetId(null)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#b3261e] hover:underline"
          >
            <X className="h-3 w-3" /> Remove from draft
          </button>
        ) : null}
      </div>
    </div>
  );
}
