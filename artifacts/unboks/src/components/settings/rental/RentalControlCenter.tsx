import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CarFront,
  CircleDollarSign,
  FileCheck2,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useRentalCatalogDraft } from "@/hooks/use-rental-catalog";
import { ApiError } from "@/lib/error";
import {
  cloneRentalDocument,
  fetchRentalPreviewPdf,
  previewRentalDraft,
  publishRentalDraft,
  rentalFieldErrors,
  rollbackRentalCatalog,
  saveRentalDraft,
  validateRentalDraft,
  type RentalCatalogDocument,
  type RentalDraftEnvelope,
  type RentalFieldError,
  type RentalPreviewResult,
  type RentalPreviewScenario,
} from "@/lib/rental-catalog";
import { cn } from "@/lib/utils";
import { getClientSlug } from "@/lib/tenant";
import { RentalChargesView } from "./RentalChargesView";
import { RentalFleetView } from "./RentalFleetView";
import { RentalPreviewPublishView } from "./RentalPreviewPublishView";
import { RentalQuoteSettingsView } from "./RentalQuoteSettingsView";

type RentalView = "fleet" | "charges" | "quote" | "preview";
type RentalAction = "save" | "validate" | "preview" | "publish" | "rollback";

const VIEWS: Array<{
  id: RentalView;
  label: string;
  description: string;
  icon: typeof CarFront;
}> = [
  {
    id: "fleet",
    label: "Fleet",
    description: "Categories, cars and images",
    icon: CarFront,
  },
  {
    id: "charges",
    label: "Charges",
    description: "Deposit and supplements",
    icon: CircleDollarSign,
  },
  {
    id: "quote",
    label: "Quote settings",
    description: "Timing, email and copy",
    icon: Settings2,
  },
  {
    id: "preview",
    label: "Preview & publish",
    description: "Validate, preview and release",
    icon: FileCheck2,
  },
];

function isoDateOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function initialScenario(
  document: RentalCatalogDocument,
): RentalPreviewScenario {
  const car = document.cars.find((item) => item.active && !item.archivedAt);
  const category = document.categories.find(
    (item) => item.active && !item.archivedAt,
  );
  return {
    rentalStart: isoDateOffset(7),
    rentalEnd: isoDateOffset(10),
    carId: car?.id ?? null,
    categoryId: car ? null : (category?.id ?? null),
    supplements: [],
    locale: "en",
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 409) {
    return "This draft changed in another session. Your local edits were preserved; reload the latest revision when you are ready.";
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function RentalControlCenter() {
  const activeTenant = getClientSlug();
  const draftQuery = useRentalCatalogDraft();
  const [activeView, setActiveView] = useState<RentalView>("fleet");
  const [document, setDocument] = useState<RentalCatalogDocument | null>(null);
  const [savedDocument, setSavedDocument] =
    useState<RentalCatalogDocument | null>(null);
  const [revision, setRevision] = useState(0);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [scenario, setScenario] = useState<RentalPreviewScenario | null>(null);
  const [validationErrors, setValidationErrors] = useState<RentalFieldError[]>(
    [],
  );
  const [validationWarnings, setValidationWarnings] = useState<
    RentalFieldError[]
  >([]);
  const [preview, setPreview] = useState<RentalPreviewResult | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<RentalAction | null>(null);
  const [conflict, setConflict] = useState(false);
  const [hydratedTenant, setHydratedTenant] = useState(activeTenant);
  const publishKeyRef = useRef<string | null>(null);
  const rollbackKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedTenant === activeTenant) return;
    setDocument(null);
    setSavedDocument(null);
    setRevision(0);
    setCurrentVersion(null);
    setScenario(null);
    setPreview(null);
    setPdfUrl(null);
    setValidationErrors([]);
    setValidationWarnings([]);
    setConflict(false);
    setPendingAction(null);
    publishKeyRef.current = null;
    rollbackKeyRef.current = null;
    setHydratedTenant(activeTenant);
  }, [activeTenant, hydratedTenant]);

  const dirty = useMemo(
    () =>
      document !== null &&
      savedDocument !== null &&
      JSON.stringify(document) !== JSON.stringify(savedDocument),
    [document, savedDocument],
  );

  const clearPreview = () => {
    setPreview(null);
    setPdfUrl(null);
  };

  useEffect(() => {
    if (!dirty) return undefined;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const guardNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (
        !window.confirm(
          "Leave Rental settings and discard the unsaved draft changes shown here?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.document.addEventListener("click", guardNavigation, true);
    return () =>
      window.document.removeEventListener("click", guardNavigation, true);
  }, [dirty]);

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  useEffect(() => {
    const envelope = draftQuery.data;
    if (
      !envelope ||
      envelope.tenantSlug !== activeTenant ||
      hydratedTenant !== activeTenant ||
      dirty
    )
      return;
    const nextDocument = cloneRentalDocument(envelope.document);
    setDocument(nextDocument);
    setSavedDocument(cloneRentalDocument(envelope.document));
    setRevision(envelope.revision);
    setCurrentVersion(envelope.currentPublishedVersion);
    setScenario((current) => current ?? initialScenario(nextDocument));
  }, [activeTenant, draftQuery.data, dirty, hydratedTenant]);

  const reloadLatest = async () => {
    const requestTenant = activeTenant;
    const result = await draftQuery.refetch();
    if (
      !result.data ||
      getClientSlug() !== requestTenant ||
      result.data.tenantSlug !== requestTenant
    )
      return;
    const latest = cloneRentalDocument(result.data.document);
    setDocument(latest);
    setSavedDocument(cloneRentalDocument(result.data.document));
    setRevision(result.data.revision);
    setCurrentVersion(result.data.currentPublishedVersion);
    clearPreview();
    setValidationErrors([]);
    setValidationWarnings([]);
    setConflict(false);
  };

  const adoptSavedEnvelope = (envelope: RentalDraftEnvelope) => {
    const saved = cloneRentalDocument(envelope.document);
    setDocument(saved);
    setSavedDocument(cloneRentalDocument(envelope.document));
    setRevision(envelope.revision);
    setCurrentVersion(envelope.currentPublishedVersion);
  };

  const save = async (): Promise<RentalDraftEnvelope | null> => {
    if (!document) return null;
    const requestTenant = activeTenant;
    setPendingAction("save");
    try {
      const saved = await saveRentalDraft(revision, document);
      if (getClientSlug() !== requestTenant) return null;
      adoptSavedEnvelope(saved);
      setConflict(false);
      setValidationErrors([]);
      toast.success("Rental draft saved.");
      return saved;
    } catch (error) {
      const fieldErrors = rentalFieldErrors(error);
      if (fieldErrors.length) setValidationErrors(fieldErrors);
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      toast.error(errorMessage(error, "Could not save the rental draft."));
      return null;
    } finally {
      setPendingAction(null);
    }
  };

  const validate = async (candidate = document) => {
    if (!candidate) return null;
    const requestTenant = activeTenant;
    setPendingAction("validate");
    try {
      const result = await validateRentalDraft(candidate);
      if (getClientSlug() !== requestTenant) return null;
      setValidationErrors(result.errors);
      setValidationWarnings(result.warnings);
      if (result.valid) toast.success("Draft is valid and ready to preview.");
      else
        toast.error(
          `Fix ${result.errors.length} validation issue${result.errors.length === 1 ? "" : "s"} before publishing.`,
        );
      return result;
    } catch (error) {
      const fieldErrors = rentalFieldErrors(error);
      if (fieldErrors.length) setValidationErrors(fieldErrors);
      toast.error(errorMessage(error, "Could not validate the rental draft."));
      return null;
    } finally {
      setPendingAction(null);
    }
  };

  const createPreview = async () => {
    if (!document || !scenario) return;
    const requestTenant = activeTenant;
    setPendingAction("preview");
    try {
      const result = await previewRentalDraft(document, scenario);
      if (getClientSlug() !== requestTenant) return;
      const blob = await fetchRentalPreviewPdf(result.pdfPreviewId);
      if (getClientSlug() !== requestTenant) return;
      const nextUrl = URL.createObjectURL(blob);
      setPdfUrl(nextUrl);
      setPreview(result);
      setValidationErrors([]);
      toast.success("Exact no-send preview generated.");
    } catch (error) {
      const fieldErrors = rentalFieldErrors(error);
      if (fieldErrors.length) setValidationErrors(fieldErrors);
      toast.error(errorMessage(error, "Could not generate the quote preview."));
    } finally {
      setPendingAction(null);
    }
  };

  const publish = async () => {
    if (!document || pendingAction) return;
    const requestTenant = activeTenant;
    if (
      !window.confirm(
        `Publish this rental catalog for ${activeTenant} for new customer conversations and quotes?`,
      )
    )
      return;
    setPendingAction("publish");
    try {
      let expectedRevision = revision;
      let candidate = document;
      if (dirty) {
        const saved = await saveRentalDraft(revision, document);
        if (getClientSlug() !== requestTenant) return;
        adoptSavedEnvelope(saved);
        expectedRevision = saved.revision;
        candidate = saved.document;
      }
      const validation = await validateRentalDraft(candidate);
      if (getClientSlug() !== requestTenant) return;
      setValidationErrors(validation.errors);
      setValidationWarnings(validation.warnings);
      if (!validation.valid) {
        toast.error("Publishing stopped. Fix the validation issues first.");
        return;
      }
      publishKeyRef.current ??= crypto.randomUUID();
      const published = await publishRentalDraft(
        expectedRevision,
        publishKeyRef.current,
      );
      if (getClientSlug() !== requestTenant) return;
      publishKeyRef.current = null;
      setCurrentVersion(published.version);
      setSavedDocument(cloneRentalDocument(published.document));
      setDocument(cloneRentalDocument(published.document));
      clearPreview();
      setConflict(false);
      toast.success(`Rental catalog version ${published.version} is live.`);
      await draftQuery.refetch();
    } catch (error) {
      const fieldErrors = rentalFieldErrors(error);
      if (fieldErrors.length) setValidationErrors(fieldErrors);
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      toast.error(errorMessage(error, "Could not publish the rental catalog."));
    } finally {
      setPendingAction(null);
    }
  };

  const rollback = async () => {
    if (!currentVersion || currentVersion < 2 || pendingAction) return;
    const requestTenant = activeTenant;
    if (
      !window.confirm(
        `Restore ${activeTenant} from before version ${currentVersion}? This creates a new immutable version.`,
      )
    )
      return;
    setPendingAction("rollback");
    try {
      rollbackKeyRef.current ??= crypto.randomUUID();
      const rolledBack = await rollbackRentalCatalog(
        currentVersion,
        rollbackKeyRef.current,
      );
      if (getClientSlug() !== requestTenant) return;
      rollbackKeyRef.current = null;
      setCurrentVersion(rolledBack.version);
      setDocument(cloneRentalDocument(rolledBack.document));
      setSavedDocument(cloneRentalDocument(rolledBack.document));
      clearPreview();
      setConflict(false);
      toast.success(`Rollback published as version ${rolledBack.version}.`);
      await draftQuery.refetch();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      toast.error(
        errorMessage(error, "Could not roll back the rental catalog."),
      );
    } finally {
      setPendingAction(null);
    }
  };

  if (draftQuery.isError) {
    return (
      <div className="rounded-2xl border border-[#f0cfcb] bg-[#fff8f7] p-5 text-[13px] text-[#8c1d18]">
        Rental controls could not be loaded. No changes were made.
      </div>
    );
  }

  if (
    hydratedTenant !== activeTenant ||
    draftQuery.isLoading ||
    !document ||
    !scenario
  ) {
    return (
      <div className="grid min-h-[280px] place-items-center rounded-2xl border border-[#e4e7ec] bg-white">
        <div className="flex items-center gap-2 text-[13px] text-[#5f6368]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading rental catalog…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {conflict ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[#f1d28a] bg-[#fff8e1] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-[12px] leading-5 text-[#7a5a00]">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <span>
              A newer draft exists on the server. Your local edits are still
              here and have not overwritten it.
            </span>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[#d8b75f] bg-white px-3 py-2 text-[12px] font-semibold text-[#6b5200]"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Discard these local edits and load the latest server draft?",
                )
              ) {
                void reloadLatest();
              }
            }}
          >
            Reload latest draft
          </button>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#dce4ef] bg-gradient-to-r from-[#f7faff] to-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1a73e8]">
            Rental control center
          </p>
          <p className="mt-1 text-[13px] text-[#3c4043]">
            {currentVersion
              ? `Published version ${currentVersion}`
              : "Not published"}{" "}
            · draft revision {revision}
          </p>
        </div>
        <span
          className={cn(
            "w-fit rounded-full px-3 py-1 text-[11px] font-semibold",
            dirty
              ? "bg-[#fef7e0] text-[#7a5a00]"
              : "bg-[#e6f4ea] text-[#137333]",
          )}
        >
          {dirty ? "Unsaved draft changes" : "Draft saved"}
        </span>
      </div>

      <nav
        aria-label="Rental settings"
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {VIEWS.map((view) => {
          const Icon = view.icon;
          const selected = activeView === view.id;
          return (
            <button
              key={view.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setActiveView(view.id)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                selected
                  ? "border-[#1a73e8] bg-[#eef5ff] shadow-sm"
                  : "border-[#e4e7ec] bg-white hover:border-[#b7c9e2] hover:bg-[#fbfcff]",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 flex-none",
                  selected ? "text-[#1a73e8]" : "text-[#7a7f87]",
                )}
              />
              <span>
                <span className="block text-[13px] font-semibold text-[#202124]">
                  {view.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-[#6f747b]">
                  {view.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {activeView === "fleet" ? (
        <RentalFleetView
          document={document}
          onChange={setDocument}
          errors={validationErrors}
        />
      ) : null}
      {activeView === "charges" ? (
        <RentalChargesView
          document={document}
          onChange={setDocument}
          errors={validationErrors}
        />
      ) : null}
      {activeView === "quote" ? (
        <RentalQuoteSettingsView
          document={document}
          onChange={setDocument}
          errors={validationErrors}
        />
      ) : null}
      {activeView === "preview" ? (
        <RentalPreviewPublishView
          document={document}
          revision={revision}
          currentVersion={currentVersion}
          dirty={dirty}
          scenario={scenario}
          onScenario={setScenario}
          preview={preview}
          pdfUrl={pdfUrl}
          errors={validationErrors}
          warnings={validationWarnings}
          pendingAction={pendingAction}
          onSave={() => {
            void save();
          }}
          onValidate={() => {
            void validate();
          }}
          onPreview={() => {
            void createPreview();
          }}
          onPublish={() => {
            void publish();
          }}
          onRollback={() => {
            void rollback();
          }}
        />
      ) : null}
    </div>
  );
}
