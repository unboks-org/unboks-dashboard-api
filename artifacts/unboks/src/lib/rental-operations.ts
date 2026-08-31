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
  | "approve_availability"
  | "review_documents"
  | "review_file"
  | "verify_payment"
  | "review_dossier"
  | "final_approval"
  | "inspect_pickup"
  | "resolve_technical"
  | "none";

export interface RentalOperationsContract {
  contractVersion: 1;
  lifecycle: "pre_quote" | "post_quote" | "confirmed" | "closed";
  stage: RentalStage;
  responsibleParty: "staff" | "client" | "system" | "agent";
  operatorAction: RentalOperatorAction;
  actionLabel: string;
  actionTarget:
    | "conversation"
    | "customer"
    | "documents"
    | "agreement_payment"
    | "dossier"
    | "none";
  actionPriority: "critical" | "high" | "normal" | "none";
  clientTimeRemainingSeconds: number | null;
  exception: { kind: string; code: string } | null;
  progress: {
    currentIndex: number;
    total: number;
    completed: string[];
    stages: string[];
    percent: number;
  };
  capabilities: {
    printDossier: boolean;
  };
  workflowState: string | null;
  workflowRevision: number | null;
}

type RentalLeadWithOperations = FollowUp & {
  operations?: RentalOperationsContract;
};

export interface RentalLeadProjection {
  stage: RentalStage;
  responsibleParty: RentalResponsibleParty;
  operatorAction: RentalOperatorAction;
  actionLabel: string;
  actionTarget: RentalOperationsContract["actionTarget"];
  priority: 0 | 1 | 2 | 3;
  exception: boolean;
  exceptionCode: string | null;
  progress: number;
  clientTimeRemainingSeconds: number | null;
  canPrintDossier: boolean;
  workflowState: string | null;
  isClosed: boolean;
  contractAvailable: boolean;
}

const PRIORITY: Record<
  RentalOperationsContract["actionPriority"],
  0 | 1 | 2 | 3
> = {
  none: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

const RESPONSIBLE: Record<
  RentalOperationsContract["responsibleParty"],
  RentalResponsibleParty
> = {
  staff: "Staff",
  client: "Customer",
  system: "System",
  agent: "Nick",
};

const STAGE_PROGRESS: Record<RentalStage, number> = {
  quote: 0,
  reserved: 17,
  documents: 33,
  agreement: 50,
  payment: 67,
  dossier: 83,
  confirmed: 100,
  closed: 100,
};

function serverOperations(lead: FollowUp): RentalOperationsContract | null {
  const value = (lead as RentalLeadWithOperations).operations;
  if (
    !value ||
    value.contractVersion !== 1 ||
    !(value.stage in STAGE_PROGRESS) ||
    !(value.responsibleParty in RESPONSIBLE) ||
    !(value.actionPriority in PRIORITY)
  ) {
    return null;
  }
  return value;
}

export function rentalStage(lead: FollowUp): RentalStage {
  return serverOperations(lead)?.stage || "quote";
}

export function projectRentalLead(lead: FollowUp): RentalLeadProjection {
  const operations = serverOperations(lead);

  // Fail closed during a staggered deployment. Missing workflow authority is
  // technical attention, never permission for the browser to invent an action.
  if (!operations) {
    return {
      stage: "quote",
      responsibleParty: "Staff",
      operatorAction: "resolve_technical",
      actionLabel: "Refresh workflow state",
      actionTarget: "customer",
      priority: 3,
      exception: true,
      exceptionCode: "operations_contract_missing",
      progress: 0,
      clientTimeRemainingSeconds: null,
      canPrintDossier: false,
      workflowState: null,
      isClosed: false,
      contractAvailable: false,
    };
  }

  return {
    stage: operations.stage,
    responsibleParty: RESPONSIBLE[operations.responsibleParty],
    operatorAction: operations.operatorAction,
    actionLabel: operations.actionLabel || "Open customer",
    actionTarget: operations.actionTarget,
    priority: PRIORITY[operations.actionPriority],
    exception: Boolean(operations.exception),
    exceptionCode: operations.exception?.code || null,
    progress: Number.isFinite(operations.progress?.percent)
      ? operations.progress.percent
      : STAGE_PROGRESS[operations.stage],
    clientTimeRemainingSeconds: operations.clientTimeRemainingSeconds,
    canPrintDossier: Boolean(operations.capabilities?.printDossier),
    workflowState: operations.workflowState,
    isClosed:
      operations.lifecycle === "closed" || operations.stage === "closed",
    contractAvailable: true,
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

export function rentalLeadNeedsStaffAction(lead: FollowUp): boolean {
  const operation = projectRentalLead(lead);
  return operation.responsibleParty === "Staff" && !operation.isClosed;
}

export function rentalActionPath(
  lead: FollowUp,
  actionTarget: RentalOperationsContract["actionTarget"],
  source = "today",
): string {
  if (actionTarget === "conversation") {
    return `/conversations?c=${encodeURIComponent(lead.conversation_id)}&from=${encodeURIComponent(source)}`;
  }
  return customerWorkspacePath(lead);
}

export function rentalStageLabel(stage: RentalStage): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}
