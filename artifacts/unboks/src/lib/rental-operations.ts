import type { FollowUp } from "@/lib/api";

export type RentalStage =
  | "quote"
  | "reserved"
  | "documents"
  | "agreement"
  | "payment"
  | "dossier"
  | "confirmed"
  | "closed";

export type RentalResponsibleParty = "Staff" | "Customer" | "System" | "Nick";

export type RentalOperatorAction =
  | "answer_customer"
  | "open_customer"
  | "review_file"
  | "verify_payment"
  | "review_dossier"
  | "final_approval"
  | "inspect_pickup"
  | "resolve_technical"
  | "none";

export interface RentalLeadProjection {
  stage: RentalStage;
  responsibleParty: RentalResponsibleParty;
  operatorAction: RentalOperatorAction;
  actionLabel: string;
  priority: 0 | 1 | 2 | 3;
  exception: boolean;
  progress: number;
  isClosed: boolean;
}

const STAGE_PROGRESS: Record<RentalStage, number> = {
  quote: 10,
  reserved: 24,
  documents: 40,
  agreement: 56,
  payment: 72,
  dossier: 88,
  confirmed: 100,
  closed: 100,
};

function contains(value: string | null | undefined, pattern: RegExp): boolean {
  return pattern.test(value || "");
}

export function rentalStage(lead: FollowUp): RentalStage {
  if (
    lead.status === "closed" ||
    contains(lead.post_quote_status, /cancelled|declined|superseded/)
  ) {
    return "closed";
  }
  if (lead.post_quote_status === "confirmed") return "confirmed";
  if (lead.payment_status === "verified") return "dossier";
  if (lead.agreement_status === "verified") return "payment";
  if (contains(lead.agreement_status, /sent|awaiting/)) return "agreement";
  if (lead.identity_status === "verified") return "agreement";
  if (lead.reservation_public_id) {
    return lead.availability_status === "approved" ? "documents" : "reserved";
  }
  return "quote";
}

export function projectRentalLead(lead: FollowUp): RentalLeadProjection {
  const stage = rentalStage(lead);
  const next = (lead.next_action || "").toLowerCase();
  const unread = (lead.unread_count || 0) > 0;
  const needsAnswer = unread || contains(lead.status, /needs.*answer/);
  const technical =
    lead.quote_delivery_state === "failed" ||
    contains(next, /technical|failed|failure|retry|delivery/);

  let responsibleParty: RentalResponsibleParty = "Customer";
  let operatorAction: RentalOperatorAction = "none";
  let actionLabel = "Open customer";
  let priority: 0 | 1 | 2 | 3 = 0;

  if (technical) {
    responsibleParty = "Staff";
    operatorAction = "resolve_technical";
    actionLabel = "Resolve issue";
    priority = 3;
  } else if (needsAnswer) {
    responsibleParty = "Staff";
    operatorAction = "answer_customer";
    actionLabel = "Answer customer";
    priority = 3;
  } else if (
    stage === "payment" &&
    contains(next, /verify|paid|payment review/)
  ) {
    responsibleParty = "Staff";
    operatorAction = "verify_payment";
    actionLabel = "Verify payment";
    priority = 2;
  } else if (
    stage === "dossier" &&
    contains(next, /final|approve|dossier|review/)
  ) {
    responsibleParty = "Staff";
    operatorAction = contains(next, /final|approve/)
      ? "final_approval"
      : "review_dossier";
    actionLabel =
      operatorAction === "final_approval"
        ? "Give final approval"
        : "Review dossier";
    priority = 2;
  } else if (stage === "agreement" && contains(next, /review|approve|file/)) {
    responsibleParty = "Staff";
    operatorAction = "review_file";
    actionLabel = "Review signed file";
    priority = 2;
  } else if (stage === "confirmed" && contains(next, /pickup|original/)) {
    responsibleParty = "Staff";
    operatorAction = "inspect_pickup";
    actionLabel = "Inspect pickup documents";
    priority = 1;
  } else if (contains(next, /nick|agent|prepare|send quote|generate/)) {
    responsibleParty = "Nick";
  } else if (lead.quote_delivery_state === "pending") {
    responsibleParty = "System";
  }

  if (operatorAction === "none" && responsibleParty === "Staff") {
    operatorAction = "open_customer";
    priority = Math.max(priority, 1) as 1 | 2 | 3;
  }

  return {
    stage,
    responsibleParty,
    operatorAction,
    actionLabel,
    priority,
    exception: technical,
    progress: STAGE_PROGRESS[stage],
    isClosed: stage === "closed",
  };
}

export const RENTAL_PROGRESS_STAGES: Array<{
  key: RentalStage;
  label: string;
}> = [
  { key: "quote", label: "Quote" },
  { key: "reserved", label: "Reserved" },
  { key: "documents", label: "Documents" },
  { key: "agreement", label: "Agreement" },
  { key: "payment", label: "Payment" },
  { key: "dossier", label: "Dossier" },
  { key: "confirmed", label: "Confirmed" },
];

export function customerDisplayName(lead: FollowUp): string {
  return (
    lead.customer_name?.trim() ||
    [lead.first_name, lead.surnames].filter(Boolean).join(" ").trim() ||
    lead.phone_normalized ||
    lead.phone_raw ||
    "Unknown customer"
  );
}

export function customerWorkspacePath(lead: FollowUp): string {
  return `/customers/${encodeURIComponent(lead.reservation_public_id || `lead-${lead.id}`)}`;
}

export function rentalStageLabel(stage: RentalStage): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}
