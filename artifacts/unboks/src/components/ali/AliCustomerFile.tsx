import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCheck2,
  FileKey2,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  approveAliPrepaymentFile,
  confirmAliReservation,
  decideAliReservationAvailability,
  deleteAliDocument,
  fetchAliCustomerFile,
  fetchAliDocumentBlob,
  fetchAliDossierBlob,
  fetchAliSignedContractBlob,
  markAliLicenseBackNotRequired,
  reclassifyAliDocument,
  recordAliPickupInspection,
  requestAliDocumentReplacement,
  requestAliDocuments,
  reviewAliDocument,
  reviewAliPayment,
  sendAliContract,
  sendAliPaymentLink,
  setAliPaymentLink,
  updateAliFinalNotes,
  type AliDocumentSlot,
  type AliReservationDocument,
} from "@/lib/api";
import { ApiError } from "@/lib/error";
import { tenantKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

interface AliCustomerFileProps {
  publicId: string;
  enabled: boolean;
}

type DossierAction =
  | { kind: "availability"; decision: "approve" | "decline" }
  | { kind: "request-documents" }
  | {
      kind: "review-document";
      documentId: string;
      decision: "verified" | "rejected";
      reason?: string;
    }
  | { kind: "replace-document"; documentId: string; reason: string }
  | {
      kind: "reclassify-document";
      documentId: string;
      slot:
        | "license_front"
        | "license_back"
        | "passport"
        | "identity_front"
        | "identity_back";
    }
  | { kind: "delete-document"; documentId: string }
  | { kind: "license-back-not-required" }
  | { kind: "send-contract" }
  | { kind: "save-payment"; url: string; reference: string }
  | { kind: "approve-prepayment" }
  | { kind: "send-payment" }
  | {
      kind: "review-payment";
      decision: "verified" | "rejected" | "not_required";
      reason?: string;
    }
  | { kind: "save-notes"; notes: string }
  | { kind: "confirm" }
  | { kind: "pickup"; item: "license" | "identity" };

const slotLabels = {
  license_front: "Driver’s licence — front",
  license_back: "Driver’s licence — back",
  identity: "Passport or national ID",
  passport: "Passport",
  identity_front: "ID card — front",
  identity_back: "ID card — back",
  unclassified: "Unclassified WhatsApp document",
} as const;

const statusTone: Record<string, string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  signed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  received: "border-sky-200 bg-sky-50 text-sky-700",
  unclassified: "border-violet-200 bg-violet-50 text-violet-700",
  quarantined: "border-rose-200 bg-rose-50 text-rose-700",
  viewed: "border-sky-200 bg-sky-50 text-sky-700",
  sent: "border-sky-200 bg-sky-50 text-sky-700",
  link_sent: "border-sky-200 bg-sky-50 text-sky-700",
  customer_reports_paid: "border-amber-200 bg-amber-50 text-amber-800",
  replacement_requested: "border-amber-200 bg-amber-50 text-amber-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  deleted: "border-slate-200 bg-slate-100 text-slate-500",
  replaced: "border-slate-200 bg-slate-100 text-slate-500",
  not_required: "border-slate-200 bg-slate-50 text-slate-600",
};

function readableStatus(value: string | null | undefined): string {
  return (value || "missing").replaceAll("_", " ");
}

function Status({ value }: { value: string | null | undefined }) {
  const normalized = value || "missing";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
        statusTone[normalized] || "border-slate-200 bg-white text-slate-600",
      )}
    >
      {readableStatus(normalized)}
    </span>
  );
}

function openPrivateBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function safeAmount(value: unknown): string {
  if (!value || typeof value !== "object") return "Not available";
  const price = value as { amount?: unknown; currency?: unknown };
  return typeof price.amount === "string"
    ? `${typeof price.currency === "string" ? price.currency : "USD"} ${price.amount}`
    : "Not available";
}

function latestDocuments(documents: AliReservationDocument[]) {
  const latest = new Map<string, AliReservationDocument>();
  for (const document of documents) {
    const current = latest.get(document.slot);
    if (!current || document.version > current.version)
      latest.set(document.slot, document);
  }
  const order = [
    "license_front",
    "license_back",
    "passport",
    "identity_front",
    "identity_back",
    "identity",
    "unclassified",
  ];
  return [...latest.values()].sort(
    (a, b) => order.indexOf(a.slot) - order.indexOf(b.slot),
  );
}

function eventLabel(eventType: string): string {
  return eventType.replaceAll("_", " ");
}

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function AliCustomerFile({ publicId, enabled }: AliCustomerFileProps) {
  const client = useQueryClient();
  const [paymentUrl, setPaymentUrl] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReviewReason, setPaymentReviewReason] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const actionLock = useRef(false);
  const lastActionRef = useRef<string | null>(null);

  useEffect(() => {
    setPaymentUrl("");
    setPaymentReference("");
    setPaymentReviewReason("");
    setNotes(null);
  }, [publicId]);

  const query = useQuery({
    queryKey: tenantKey("ali-customer-file", publicId),
    queryFn: () => fetchAliCustomerFile(publicId),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    lastActionRef.current = null;
  }, [publicId, query.data?.revision]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({
        queryKey: tenantKey("ali-customer-file", publicId),
      }),
      client.invalidateQueries({ queryKey: tenantKey("quote-leads") }),
    ]);
  };

  const action = useMutation({
    mutationFn: async (request: DossierAction) => {
      const file = query.data;
      if (!file) throw new ApiError(409, "Customer file is not loaded.");
      const revision = file.revision;
      switch (request.kind) {
        case "availability":
          return decideAliReservationAvailability(
            publicId,
            request.decision,
            revision,
          );
        case "request-documents":
          return requestAliDocuments(publicId, revision);
        case "review-document":
          return reviewAliDocument(
            publicId,
            request.documentId,
            request.decision,
            revision,
            request.reason || "",
          );
        case "replace-document":
          return requestAliDocumentReplacement(
            publicId,
            request.documentId,
            revision,
            request.reason,
          );
        case "reclassify-document":
          return reclassifyAliDocument(
            publicId,
            request.documentId,
            request.slot,
            revision,
          );
        case "delete-document":
          return deleteAliDocument(publicId, request.documentId, revision);
        case "license-back-not-required":
          return markAliLicenseBackNotRequired(publicId, revision);
        case "send-contract":
          return sendAliContract(publicId, revision);
        case "save-payment":
          return setAliPaymentLink(
            publicId,
            request.url,
            request.reference,
            revision,
          );
        case "approve-prepayment":
          if (!file.workflow_v2)
            throw new ApiError(409, "Reservation V2 is not loaded.");
          return approveAliPrepaymentFile(publicId, file.workflow_v2.revision);
        case "send-payment":
          return sendAliPaymentLink(publicId);
        case "review-payment":
          return reviewAliPayment(
            publicId,
            request.decision,
            revision,
            request.reason || "",
          );
        case "save-notes":
          return updateAliFinalNotes(publicId, request.notes, revision);
        case "confirm":
          return confirmAliReservation(publicId, revision);
        case "pickup":
          return recordAliPickupInspection(publicId, request.item, revision);
      }
    },
    onSuccess: async (result, request) => {
      if (request.kind === "save-payment") {
        setPaymentUrl("");
        setPaymentReference("");
      }
      if (request.kind === "save-notes") setNotes(request.notes);
      if (request.kind === "review-payment") setPaymentReviewReason("");
      await refresh();
      if (
        request.kind === "approve-prepayment" &&
        typeof result === "object" &&
        result !== null &&
        "delivered" in result &&
        result.delivered === false
      ) {
        toast.error(
          "File approved, but payment delivery failed. Retry the payment link below.",
        );
      } else {
        toast.success(
          request.kind === "confirm"
            ? "Reservation approved and confirmation prepared."
            : request.kind === "approve-prepayment"
              ? "File approved and payment link sent."
              : request.kind === "send-payment"
                ? "Payment link sent."
                : "Customer file updated.",
        );
      }
    },
    onError: (error) => {
      lastActionRef.current = null;
      toast.error(
        error instanceof ApiError && error.message === "dossier_review_required"
          ? "Print the ready-for-review dossier before final human approval."
          : error instanceof ApiError && error.status === 409
            ? "This file changed. Review the latest status and try again."
            : "The customer file could not be updated.",
      );
      void refresh();
    },
  });

  const runAction = (request: DossierAction) => {
    const actionKey = JSON.stringify({
      request,
      revision: query.data?.revision,
    });
    if (actionLock.current || lastActionRef.current === actionKey) return;
    actionLock.current = true;
    lastActionRef.current = actionKey;
    action.mutate(request, {
      onSettled: () => {
        actionLock.current = false;
      },
    });
  };

  const printDossier = useMutation({
    mutationFn: async ({ incomplete }: { incomplete: boolean }) => {
      if (!query.data) throw new ApiError(409, "Customer file is not loaded.");
      return fetchAliDossierBlob(publicId, query.data.revision, incomplete);
    },
    onSuccess: async (blob) => {
      openPrivateBlob(blob, `Ali-customer-dossier-${publicId}.pdf`);
      await refresh();
      toast.success("Print-ready dossier generated.");
    },
    onError: () =>
      toast.error("The print-ready dossier could not be generated."),
  });

  const preview = useMutation({
    mutationFn: async (
      request: { kind: "document"; documentId: string } | { kind: "contract" },
    ) =>
      request.kind === "contract"
        ? fetchAliSignedContractBlob(publicId)
        : fetchAliDocumentBlob(publicId, request.documentId),
    onSuccess: (blob, request) =>
      openPrivateBlob(
        blob,
        request.kind === "contract"
          ? "Ali-signed-pre-contract.pdf"
          : "Ali-customer-document",
      ),
    onError: () => toast.error("The private file could not be opened."),
  });

  const file = query.data;
  const documents = useMemo(
    () => latestDocuments(file?.documents || []),
    [file?.documents],
  );

  if (!enabled) return null;
  if (query.isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Loading secure customer file…
      </div>
    );
  }
  if (query.isError || !file) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        The secure customer file could not be loaded.
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="ml-2 font-semibold underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const pricing = file.pricing as {
    rentalTotal?: unknown;
    refundableSecurityDeposit?: unknown;
    total?: unknown;
  };
  const rental = file.rental as {
    vehicle_name?: string;
    vehicle_class_name?: string;
    rental_start?: string;
    rental_end?: string;
  };
  const lastPrint = file.events.find(
    (event) => event.event_type === "dossier_generated",
  );
  const finalNotes = notes ?? file.final_notes;
  const busy = action.isPending || printDossier.isPending || preview.isPending;
  const workflowV2 = file.workflow_v2;
  const dossierReadyForApproval = file.dossier_ready_for_approval;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-testid="ali-customer-file"
    >
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
              Secure customer file
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              Reservation {file.confirmation_reference || file.quote_reference}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              One complete-file review releases payment. Final approval stays
              locked until payment and dossier review are complete.
            </p>
          </div>
          <Status value={file.dossier_status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <HeaderFact
            label="Vehicle"
            value={
              rental.vehicle_name || rental.vehicle_class_name || "Not selected"
            }
          />
          <HeaderFact
            label="Rental total"
            value={safeAmount(pricing.rentalTotal)}
          />
          <HeaderFact
            label="Refundable deposit"
            value={safeAmount(pricing.refundableSecurityDeposit)}
          />
          <HeaderFact label="Grand total" value={safeAmount(pricing.total)} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        {workflowV2 && (
          <div
            className="rounded-xl border border-sky-200 bg-sky-50/70 p-4"
            data-testid="ali-reservation-v2-progress"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-700">
                  Current reservation step
                </p>
                <p className="mt-1 text-base font-semibold capitalize text-slate-950">
                  {readableStatus(workflowV2.state)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Responsible now: {workflowV2.responsibleParty} · Next:{" "}
                  {readableStatus(workflowV2.nextAction)}
                </p>
              </div>
              <Status value={workflowV2.clock.state} />
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg bg-white p-3">
                <span className="block text-slate-500">
                  Active-client time left
                </span>
                <strong className="mt-1 block text-slate-900">
                  {formatRemaining(workflowV2.clock.remainingSeconds)}
                </strong>
              </div>
              <div className="rounded-lg bg-white p-3">
                <span className="block text-slate-500">Clock</span>
                <strong className="mt-1 block capitalize text-slate-900">
                  {workflowV2.clock.state}
                  {workflowV2.clock.pauseReason
                    ? ` · ${readableStatus(workflowV2.clock.pauseReason)}`
                    : ""}
                </strong>
              </div>
              <div className="rounded-lg bg-white p-3">
                <span className="block text-slate-500">Client timezone</span>
                <strong className="mt-1 block text-slate-900">
                  {workflowV2.clock.clientTimezone}
                </strong>
              </div>
            </div>
          </div>
        )}
        {file.availability_status === "pending" && !workflowV2 && (
          <ControlBlock
            title="1. Confirm vehicle availability"
            icon={<BadgeCheck />}
          >
            <p className="text-sm text-slate-600">
              Documents are never requested before staff approves availability.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <PrimaryButton
                disabled={busy}
                onClick={() =>
                  runAction({ kind: "availability", decision: "approve" })
                }
              >
                Approve availability
              </PrimaryButton>
              <SecondaryButton
                disabled={busy}
                onClick={() =>
                  runAction({ kind: "availability", decision: "decline" })
                }
              >
                Decline
              </SecondaryButton>
            </div>
          </ControlBlock>
        )}

        {file.availability_status === "approved" && (
          <>
            <ControlBlock
              title={
                workflowV2
                  ? "1. Secure documents — automatic collection"
                  : "2. Identity documents"
              }
              icon={<ShieldCheck />}
              status={file.identity_status}
            >
              {workflowV2 ? (
                <p className="mb-3 text-sm text-slate-600">
                  Nick collects each upload in sequence. Individual verification
                  is not required; review the complete bundle once after the
                  pre-contract is signed.
                </p>
              ) : null}
              {!documents.length && (
                <p className="text-sm text-slate-600">
                  No document copies received yet.
                </p>
              )}
              <div className="space-y-2">
                {documents.map((document) => (
                  <DocumentRow
                    key={document.public_id}
                    document={document}
                    busy={busy}
                    individualReview={!workflowV2}
                    onPreview={() =>
                      preview.mutate({
                        kind: "document",
                        documentId: document.public_id,
                      })
                    }
                    onVerify={() =>
                      runAction({
                        kind: "review-document",
                        documentId: document.public_id,
                        decision: "verified",
                      })
                    }
                    onRejectWithReason={(reason) =>
                      runAction({
                        kind: "review-document",
                        documentId: document.public_id,
                        decision: "rejected",
                        reason,
                      })
                    }
                    onReplace={(reason) =>
                      runAction({
                        kind: "replace-document",
                        documentId: document.public_id,
                        reason,
                      })
                    }
                    reclassifySlot={
                      document.slot === "unclassified"
                        ? workflowV2?.expectedDocumentSlot || null
                        : null
                    }
                    onReclassify={(slot) =>
                      runAction({
                        kind: "reclassify-document",
                        documentId: document.public_id,
                        slot,
                      })
                    }
                    onDelete={() => {
                      if (
                        window.confirm(
                          "Delete this stored copy? This action is audited.",
                        )
                      ) {
                        runAction({
                          kind: "delete-document",
                          documentId: document.public_id,
                        });
                      }
                    }}
                  />
                ))}
              </div>
              {!workflowV2 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <PrimaryButton
                    disabled={busy}
                    onClick={() => runAction({ kind: "request-documents" })}
                  >
                    <Send className="h-4 w-4" /> Request secure uploads
                  </PrimaryButton>
                  {!documents.some(
                    (document) => document.slot === "license_back",
                  ) && (
                    <SecondaryButton
                      disabled={busy}
                      onClick={() =>
                        runAction({ kind: "license-back-not-required" })
                      }
                    >
                      Back not required
                    </SecondaryButton>
                  )}
                </div>
              )}
            </ControlBlock>

            <ControlBlock
              title={workflowV2 ? "2. Pre-contract" : "3. Pre-contract"}
              icon={<FileKey2 />}
              status={file.contract?.status || "missing"}
            >
              <p className="text-sm text-slate-600">
                {file.contract
                  ? `Template ${file.contract.template_version} · version ${file.contract.version}`
                  : "No pre-contract issued."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {file.contract?.status === "signed" ? (
                  <SecondaryButton
                    disabled={busy}
                    onClick={() => preview.mutate({ kind: "contract" })}
                  >
                    <ExternalLink className="h-4 w-4" /> View signed PDF
                  </SecondaryButton>
                ) : !workflowV2 ? (
                  <PrimaryButton
                    disabled={busy}
                    onClick={() => runAction({ kind: "send-contract" })}
                  >
                    <Send className="h-4 w-4" /> Send pre-contract
                  </PrimaryButton>
                ) : null}
              </div>
            </ControlBlock>

            <ControlBlock
              title={workflowV2 ? "3. Payment setup" : "4. Payment setup"}
              icon={<FileCheck2 />}
              status={file.payment_status}
            >
              <p className="text-sm text-slate-600">
                {file.payment.domain
                  ? `Configured provider: ${file.payment.domain}`
                  : file.payment.tenantDefaultAvailable
                    ? `Tenant payment link ready${file.payment.tenantDefaultDomain ? ` · ${file.payment.tenantDefaultDomain}` : ""}.`
                    : "No reservation-specific payment link configured."}
                {file.payment.reference
                  ? ` · Reference ${file.payment.reference}`
                  : ""}
              </p>
              {(!file.payment.domain || file.payment_status === "rejected") &&
              file.payment.mode === "per_reservation" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
                  <input
                    type="url"
                    autoComplete="off"
                    value={paymentUrl}
                    onChange={(event) => setPaymentUrl(event.target.value)}
                    placeholder="Approved HTTPS payment URL"
                    aria-label="Payment URL"
                    className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    autoComplete="off"
                    value={paymentReference}
                    onChange={(event) =>
                      setPaymentReference(event.target.value)
                    }
                    placeholder="Reference"
                    aria-label="Payment reference"
                    className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary"
                  />
                  <PrimaryButton
                    disabled={busy || !paymentUrl.startsWith("https://")}
                    onClick={() =>
                      runAction({
                        kind: "save-payment",
                        url: paymentUrl,
                        reference: paymentReference,
                      })
                    }
                  >
                    Save link
                  </PrimaryButton>
                </div>
              ) : null}
              {(!file.payment.domain || file.payment_status === "rejected") &&
              file.payment.mode === "fixed_link" &&
              file.payment.tenantDefaultAvailable ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end">
                  <p className="text-xs leading-relaxed text-slate-500">
                    Use the tenant-approved payment page. The saved URL stays
                    server-side.
                  </p>
                  <input
                    type="text"
                    autoComplete="off"
                    value={paymentReference}
                    onChange={(event) =>
                      setPaymentReference(event.target.value)
                    }
                    placeholder="Reference"
                    aria-label="Payment reference"
                    className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-primary"
                  />
                  <PrimaryButton
                    disabled={busy}
                    onClick={() =>
                      runAction({
                        kind: "save-payment",
                        url: "",
                        reference: paymentReference,
                      })
                    }
                  >
                    Use tenant link
                  </PrimaryButton>
                </div>
              ) : null}
              {workflowV2 &&
              ["link_sent", "customer_reports_paid"].includes(
                file.payment_status,
              ) ? (
                <div className="mt-3 space-y-1.5">
                  <label
                    htmlFor={`payment-review-reason-${publicId}`}
                    className="text-xs font-semibold text-slate-700"
                  >
                    Review reason
                    {file.payment_status === "link_sent"
                      ? " (required for early override)"
                      : " (required to reject)"}
                  </label>
                  <textarea
                    id={`payment-review-reason-${publicId}`}
                    value={paymentReviewReason}
                    onChange={(event) =>
                      setPaymentReviewReason(event.target.value)
                    }
                    rows={2}
                    maxLength={500}
                    placeholder="Record the reason for an override or rejection"
                    className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-primary"
                  />
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {!workflowV2 &&
                  file.payment.domain &&
                  file.payment_status === "not_sent" && (
                    <PrimaryButton
                      disabled={busy}
                      onClick={() => runAction({ kind: "send-payment" })}
                    >
                      <Send className="h-4 w-4" /> Send link
                    </PrimaryButton>
                  )}
                {["link_sent", "customer_reports_paid"].includes(
                  file.payment_status,
                ) && (
                  <PrimaryButton
                    disabled={
                      busy ||
                      (Boolean(workflowV2) &&
                        file.payment_status === "link_sent" &&
                        !paymentReviewReason.trim())
                    }
                    onClick={() =>
                      runAction({
                        kind: "review-payment",
                        decision: "verified",
                        reason: paymentReviewReason,
                      })
                    }
                  >
                    Verify payment
                  </PrimaryButton>
                )}
                {(!workflowV2
                  ? !["verified", "not_required"].includes(file.payment_status)
                  : file.payment_status === "customer_reports_paid") && (
                  <SecondaryButton
                    disabled={
                      busy ||
                      (Boolean(workflowV2) && !paymentReviewReason.trim())
                    }
                    onClick={() =>
                      runAction({
                        kind: "review-payment",
                        decision: "rejected",
                        reason: paymentReviewReason,
                      })
                    }
                  >
                    Reject
                  </SecondaryButton>
                )}
              </div>
            </ControlBlock>

            {workflowV2 && file.prepayment_review ? (
              <ControlBlock
                title="4. Complete file review"
                icon={<ClipboardCheck />}
                status={
                  file.prepayment_review.approved
                    ? "approved"
                    : file.prepayment_review.approvalRequired
                      ? "ready_for_review"
                      : file.prepayment_review.status
                }
              >
                <p className="text-sm leading-6 text-slate-600">
                  Review all received identity documents and the signed
                  pre-contract together. This is the only approval before
                  payment; approving releases Nick’s payment-link message.
                </p>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
                    <span className="block text-slate-500">
                      Documents received
                    </span>
                    <strong className="mt-1 block text-slate-950">
                      {file.prepayment_review.receivedDocumentCount} of{" "}
                      {file.prepayment_review.requiredDocumentCount}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
                    <span className="block text-slate-500">Payment route</span>
                    <strong className="mt-1 block text-slate-950">
                      {file.prepayment_review.paymentReady
                        ? "Ready"
                        : "Payment link required"}
                    </strong>
                  </div>
                </div>
                {file.prepayment_review.missingRequirements.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-amber-800">
                    {file.prepayment_review.missingRequirements.map(
                      (requirement) => (
                        <li key={requirement}>
                          •{" "}
                          {readableStatus(requirement.replace("document:", ""))}
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
                {file.prepayment_review.approvalRequired &&
                !file.prepayment_review.paymentReady ? (
                  <p className="mt-3 text-sm font-medium text-amber-800">
                    Save the approved payment link above before releasing it.
                  </p>
                ) : null}
                {file.prepayment_review.approvalRequired ? (
                  <PrimaryButton
                    disabled={busy || !file.prepayment_review.canApproveAndSend}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Approve the complete pre-payment file and send the payment link now?",
                        )
                      ) {
                        runAction({ kind: "approve-prepayment" });
                      }
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve File &amp; Send
                    Payment Link
                  </PrimaryButton>
                ) : file.prepayment_review.approved &&
                  !["link_sent", "customer_reports_paid", "verified"].includes(
                    file.payment_status,
                  ) ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm font-semibold text-amber-800">
                      File approved. The payment-link message still needs to be
                      delivered.
                    </p>
                    <PrimaryButton
                      disabled={busy}
                      onClick={() => runAction({ kind: "send-payment" })}
                    >
                      <RefreshCw className="h-4 w-4" /> Retry Sending Payment
                      Link
                    </PrimaryButton>
                  </div>
                ) : file.prepayment_review.approved ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-700">
                    Approved. The payment link has been sent.
                  </p>
                ) : null}
              </ControlBlock>
            ) : null}
          </>
        )}

        <ControlBlock
          title="Missing requirements"
          icon={<ClipboardCheck />}
          status={file.can_confirm ? "ready_for_review" : "incomplete"}
        >
          {file.missing_requirements.length ? (
            <ul className="space-y-1 text-sm text-amber-800">
              {file.missing_requirements.map((requirement) => (
                <li key={requirement}>• {readableStatus(requirement)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-700">
              Every required customer step is complete.
            </p>
          )}
        </ControlBlock>

        <ControlBlock title="Final notes" icon={<FileText />}>
          <textarea
            value={finalNotes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={2000}
            aria-label="Final staff notes"
            className="w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-primary"
          />
          <SecondaryButton
            disabled={busy || finalNotes === file.final_notes}
            onClick={() => runAction({ kind: "save-notes", notes: finalNotes })}
          >
            Save notes
          </SecondaryButton>
        </ControlBlock>

        <ControlBlock
          title="Printable dossier"
          icon={<Download />}
          status={file.dossier_review_status}
        >
          <p className="text-sm text-slate-600">
            Version {file.dossier_version || "not generated"}
            {lastPrint
              ? ` · last generated ${new Date(lastPrint.created_at).toLocaleString()}`
              : ""}
          </p>
          {!dossierReadyForApproval &&
          file.can_confirm === false &&
          !file.missing_requirements.length ? (
            <p className="mt-2 text-sm font-medium text-amber-800">
              Print the ready-for-review dossier before final human approval.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {file.missing_requirements.length ? (
              <SecondaryButton
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Print an incomplete dossier? Missing: ${file.missing_requirements.join(", ")}. The PDF will be watermarked.`,
                    )
                  ) {
                    printDossier.mutate({ incomplete: true });
                  }
                }}
              >
                Print incomplete dossier
              </SecondaryButton>
            ) : (
              <PrimaryButton
                disabled={busy}
                onClick={() => printDossier.mutate({ incomplete: false })}
              >
                Print full dossier
              </PrimaryButton>
            )}
          </div>
        </ControlBlock>

        {file.status !== "confirmed" ? (
          <button
            type="button"
            disabled={busy || !file.can_confirm || !dossierReadyForApproval}
            onClick={() => {
              if (
                window.confirm(
                  "Approve this complete customer file and send the final confirmation?",
                )
              )
                runAction({ kind: "confirm" });
            }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <CheckCircle2 className="h-4 w-4" /> Final human approval
          </button>
        ) : (
          <ControlBlock
            title="Pickup: inspect original documents"
            icon={<BadgeCheck />}
            status="confirmed"
          >
            <p className="text-sm text-slate-600">
              Uploaded copies do not replace checking the originals at vehicle
              pickup.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <PickupButton
                label="Original licence inspected"
                complete={file.pickup_checklist.original_license_inspected}
                disabled={busy}
                onClick={() => runAction({ kind: "pickup", item: "license" })}
              />
              <PickupButton
                label="Original ID inspected"
                complete={file.pickup_checklist.original_identity_inspected}
                disabled={busy}
                onClick={() => runAction({ kind: "pickup", item: "identity" })}
              />
            </div>
          </ControlBlock>
        )}

        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Audit timeline · {file.events.length} events
          </summary>
          <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
            {file.events.slice(0, 30).map((event) => (
              <li
                key={event.event_public_id}
                className="text-xs text-slate-600"
              >
                <span className="font-semibold capitalize text-slate-800">
                  {eventLabel(event.event_type)}
                </span>
                <span className="block">
                  {new Date(event.created_at).toLocaleString()} ·{" "}
                  {event.actor_type}
                </span>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.07] p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words font-semibold text-white">{value}</p>
    </div>
  );
}

function ControlBlock({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: ReactNode;
  status?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="text-slate-500 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          {title}
        </p>
        {status && <Status value={status} />}
      </div>
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function DocumentRow({
  document,
  busy,
  individualReview,
  onPreview,
  onVerify,
  onRejectWithReason,
  onReplace,
  reclassifySlot,
  onReclassify,
  onDelete,
}: {
  document: AliReservationDocument;
  busy: boolean;
  individualReview: boolean;
  onPreview: () => void;
  onVerify: () => void;
  onRejectWithReason: (reason: string) => void;
  onReplace: (reason: string) => void;
  reclassifySlot: AliDocumentSlot | null;
  onReclassify: (
    slot:
      | "license_front"
      | "license_back"
      | "passport"
      | "identity_front"
      | "identity_back",
  ) => void;
  onDelete: () => void;
}) {
  const [reason, setReason] = useState("");
  const hasContent = !["deleted", "not_required"].includes(document.status);
  const canReview = individualReview && document.status === "received";
  const canReplace = ![
    "deleted",
    "replaced",
    "not_required",
    "replacement_requested",
    "unclassified",
    "quarantined",
  ].includes(document.status);
  const canReclassify =
    document.status === "unclassified" &&
    reclassifySlot !== null &&
    reclassifySlot !== "identity" &&
    reclassifySlot !== "unclassified";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="block text-sm font-medium text-slate-800">
            {slotLabels[document.slot]}
          </span>
          <span className="text-xs text-slate-500">
            Version {document.version}
          </span>
        </span>
        <Status value={document.status} />
      </div>
      {(canReview || canReplace) && (
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          placeholder="Reason required for rejection or replacement"
          aria-label={`Review reason for ${slotLabels[document.slot]}`}
          className="mt-3 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-primary"
        />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {hasContent && (
          <SecondaryButton disabled={busy} onClick={onPreview}>
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </SecondaryButton>
        )}
        {canReview && (
          <PrimaryButton disabled={busy} onClick={onVerify}>
            Verify
          </PrimaryButton>
        )}
        {canReview && (
          <SecondaryButton
            disabled={busy || !reason.trim()}
            onClick={() => onRejectWithReason(reason.trim())}
          >
            Reject
          </SecondaryButton>
        )}
        {canReplace && (
          <SecondaryButton
            disabled={busy || !reason.trim()}
            onClick={() => onReplace(reason.trim())}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Request replacement
          </SecondaryButton>
        )}
        {canReclassify && (
          <PrimaryButton
            disabled={busy}
            onClick={() => onReclassify(reclassifySlot)}
          >
            Classify as {slotLabels[reclassifySlot]}
          </PrimaryButton>
        )}
        {hasContent && (
          <SecondaryButton disabled={busy} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}

function PickupButton({
  label,
  complete,
  disabled,
  onClick,
}: {
  label: string;
  complete: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || complete}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold",
        complete
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      {disabled && !complete ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : complete ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <ShieldCheck className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}
