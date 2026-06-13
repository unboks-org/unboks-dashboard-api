import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import {
  createInfoUpdate,
  deleteKnowledgeMedia,
  fetchProductSettings,
  saveProductSettings,
  uploadKnowledgeMedia,
  type ProductSettings,
  type KnowledgeMedia,
} from "@/lib/api";
import { useKnowledgeMediaLibrary } from "@/hooks/use-client-api";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileIsAllowed(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    ALLOWED_IMAGE_TYPES.includes(file.type) ||
    ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
  );
}

function fallbackTitle(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function Images() {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const mediaQuery = useKnowledgeMediaLibrary(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const productSettingsQuery = useQuery<ProductSettings>({
    queryKey: ["settings", "product"],
    queryFn: fetchProductSettings,
    staleTime: 30_000,
  });
  const [deliveryAmount, setDeliveryAmount] = useState("");
  const [deliveryCurrency, setDeliveryCurrency] = useState("XCG");
  const productSettings = productSettingsQuery.data;
  const saveDeliveryMutation = useMutation({
    mutationFn: saveProductSettings,
    onSuccess: async (next) => {
      setDeliveryAmount(next.deliveryCostAmount == null ? "" : String(next.deliveryCostAmount));
      setDeliveryCurrency(next.deliveryCostCurrency || "XCG");
      await qc.invalidateQueries({ queryKey: ["settings", "product"] });
      toast.success("Delivery cost saved.");
    },
    onError: (err) => {
      const message = err instanceof Error && err.message ? err.message : "Could not save delivery cost.";
      toast.error(message);
    },
  });

  useEffect(() => {
    if (!productSettings) return;
    setDeliveryAmount(productSettings.deliveryCostAmount == null ? "" : String(productSettings.deliveryCostAmount));
    setDeliveryCurrency(productSettings.deliveryCostCurrency || "XCG");
  }, [productSettings]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (!fileIsAllowed(file)) {
      toast.error("Use a JPG, JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image is over 10 MB.");
      return;
    }
    setPendingFile(file);
    if (!title.trim()) setTitle(fallbackTitle(file.name));
  }

  async function handleUpload() {
    if (!pendingFile) {
      toast.error("Choose an image first.");
      return;
    }
    const cleanTitle = title.trim() || fallbackTitle(pendingFile.name) || "Customer image";
    const cleanDescription = description.trim();
    const note = cleanDescription
      ? `${cleanTitle}\n\n${cleanDescription}`
      : cleanTitle;
    setBusy(true);
    try {
      const created = await createInfoUpdate({
        type: "product",
        text: note,
        active: true,
      });
      const knowledgeId = String(created.id ?? "").trim();
      if (!knowledgeId) {
        throw new Error("The server did not return a knowledge id for this image.");
      }
      await uploadKnowledgeMedia({
        knowledgeId,
        caption: cleanTitle,
        file: pendingFile,
      });
      setTitle("");
      setDescription("");
      setPendingFile(null);
      await qc.invalidateQueries({ queryKey: ["knowledge", "media", "library"] });
      toast.success("Image uploaded. Your Agent can now use it when customers ask.");
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Image upload failed.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(media: KnowledgeMedia) {
    if (!window.confirm(`Remove "${media.caption || media.originalFilename || "image"}"?`)) return;
    try {
      await deleteKnowledgeMedia(media.id);
      await qc.invalidateQueries({ queryKey: ["knowledge", "media", "library"] });
      toast.success("Image removed.");
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Could not remove image.";
      toast.error(message);
    }
  }

  function handleSaveDeliveryCost() {
    const trimmed = deliveryAmount.trim();
    const amount = trimmed === "" ? null : Number(trimmed);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("Enter a valid delivery amount.");
      return;
    }
    saveDeliveryMutation.mutate({
      deliveryCostAmount: amount,
      deliveryCostCurrency: deliveryCurrency.trim().toUpperCase() || "XCG",
    });
  }

  const media = mediaQuery.data ?? [];

  return (
    <DashboardShell
      activeNav="images"
      pageTitle="Images"
      pageSubtitle="Upload product, property, menu, or service photos your Agent can send to customers."
      hideRefresh
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-[#e6e8eb] bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold text-[#202124]">Delivery costs</h2>
            <p className="text-[13px] leading-5 text-[#5f6368]">
              Set the delivery amount your Agent adds to product order totals.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
            <label className="block">
              <span className="text-[12px] font-medium text-[#3c4043]">Delivery amount</span>
              <input
                value={deliveryAmount}
                onChange={(e) => setDeliveryAmount(e.target.value)}
                inputMode="decimal"
                placeholder="Example: 5"
                className="mt-1 w-full rounded-xl border border-[#d6dbe3] bg-white px-3 py-2.5 text-[14px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-[#3c4043]">Currency</span>
              <input
                value={deliveryCurrency}
                onChange={(e) => setDeliveryCurrency(e.target.value.toUpperCase())}
                placeholder="XCG"
                maxLength={8}
                className="mt-1 w-full rounded-xl border border-[#d6dbe3] bg-white px-3 py-2.5 text-[14px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveDeliveryCost}
              disabled={saveDeliveryMutation.isPending || productSettingsQuery.isLoading}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#1765cc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveDeliveryMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save delivery cost
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[#5f6368]">
            Leave the amount empty if delivery should be confirmed manually.
          </p>
        </section>

        <section className="rounded-2xl border border-[#e6e8eb] bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold text-[#202124]">Upload image</h2>
            <p className="text-[13px] leading-5 text-[#5f6368]">
              Add one image with a clear title. Customers can receive it through WhatsApp from the chat composer.
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <label className="block">
              <span className="text-[12px] font-medium text-[#3c4043]">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Chocolate chip cookie, Oceanview apartment..."
                className="mt-1 w-full rounded-xl border border-[#d6dbe3] bg-white px-3 py-2.5 text-[14px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-[#3c4043]">Notes / metadata</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Price, ingredients, location, details..."
                className="mt-1 w-full rounded-xl border border-[#d6dbe3] bg-white px-3 py-2.5 text-[14px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
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
                disabled={busy}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#d6dbe3] bg-white px-4 text-[14px] font-medium text-[#202124] transition hover:bg-[#f6f8fc] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ImageIcon className="h-4 w-4" />
                Choose image
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={busy || !pendingFile}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#1765cc] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Upload
              </button>
            </div>
          </div>

          {pendingFile && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#d7e3fc] bg-[#f8fbff] px-3 py-2 text-[12px] text-[#3c4043]">
              <ImageIcon className="h-4 w-4 text-[#1a73e8]" />
              <span className="min-w-0 flex-1 truncate">
                Selected: {pendingFile.name} · {formatBytes(pendingFile.size)}
              </span>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#e6e8eb] bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold text-[#202124]">Image library</h2>
              <p className="mt-1 text-[13px] text-[#5f6368]">
                These images appear in the chat image picker.
              </p>
            </div>
            <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-[12px] font-medium text-[#5f6368]">
              {media.length} image{media.length === 1 ? "" : "s"}
            </span>
          </div>

          {mediaQuery.isLoading ? (
            <div className="mt-5 flex items-center gap-2 text-[13px] text-[#5f6368]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading images
            </div>
          ) : mediaQuery.isError ? (
            <div className="mt-5 rounded-xl border border-[#f6caca] bg-[#fce8e6] px-3 py-2 text-[13px] text-[#a50e0e]">
              Could not load the image library.
            </div>
          ) : media.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-[#d6dbe3] bg-[#fbfcff] px-4 py-8 text-center">
              <ImageIcon className="mx-auto h-7 w-7 text-[#9aa0a6]" />
              <p className="mt-2 text-[14px] font-medium text-[#202124]">No images uploaded yet.</p>
              <p className="mt-1 text-[13px] text-[#5f6368]">
                Upload the first product or property image above.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {media.map((m) => (
                <article
                  key={m.id}
                  className="overflow-hidden rounded-xl border border-[#e6e8eb] bg-white shadow-sm"
                >
                  <a href={m.url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={m.url}
                      alt={m.caption || m.originalFilename || "Customer image"}
                      className="aspect-square w-full bg-[#f1f3f4] object-cover"
                      loading="lazy"
                    />
                  </a>
                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[#202124]">
                          {m.caption || m.originalFilename || "Image"}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-[#5f6368]">
                          {formatBytes(m.sizeBytes)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(m)}
                        aria-label="Remove image"
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-full text-[#5f6368] transition hover:bg-[#f1f3f4]",
                        )}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
