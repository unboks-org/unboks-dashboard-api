import { useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  presentation = "compact",
}: {
  ownerId: string;
  assetId: string | null;
  onAssetId: (assetId: string | null) => void;
  caption?: string;
  alt?: string;
  presentation?: "compact" | "vehicle";
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

  const chooseImage = () => inputRef.current?.click();
  const fileInput = (
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
  );

  if (presentation === "vehicle") {
    return (
      <div className="min-w-0">
        {fileInput}
        <div
          className={cn(
            "group relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-xl border border-[#dfe3e8] bg-[#f5f7fa]",
            !media.data?.url && "border-dashed",
          )}
        >
          {media.data?.url ? (
            <img
              src={media.data.url}
              alt={alt}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : media.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#5f6368]" />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#7a7f87] shadow-sm ring-1 ring-[#e1e4e8]">
                <ImageIcon className="h-5 w-5" />
              </span>
              <span className="text-[12px] font-medium text-[#5f6368]">
                Add a customer-facing photo
              </span>
            </div>
          )}
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11 flex-1 border-white/70 bg-white/95 text-[#172033] shadow-sm backdrop-blur hover:bg-white"
              onClick={chooseImage}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              {assetId ? "Replace photo" : "Upload photo"}
            </Button>
            {assetId ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Remove vehicle photo"
                title="Remove vehicle photo"
                className="min-h-11 min-w-11 border-white/70 bg-white/95 text-[#7a2530] shadow-sm backdrop-blur hover:bg-white"
                onClick={() => onAssetId(null)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[#7a7f87]">
          JPG, PNG or WebP · shown in WhatsApp and quotes
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-[150px] items-center gap-2">
      {fileInput}
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
        <button
          type="button"
          className={secondaryButton}
          onClick={chooseImage}
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
            <Trash2 className="h-3 w-3" /> Remove from draft
          </button>
        ) : null}
      </div>
    </div>
  );
}
