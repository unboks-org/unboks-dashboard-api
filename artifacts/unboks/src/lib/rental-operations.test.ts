import { describe, expect, it } from "vitest";
import type { FollowUp } from "@/lib/api";
import {
  projectRentalLead,
  rentalStage,
  type RentalOperationsContract,
} from "@/lib/rental-operations";

function lead(
  operations?: Partial<RentalOperationsContract>,
  overrides: Partial<FollowUp> = {},
): FollowUp {
  const contract: RentalOperationsContract = {
    contractVersion: 1,
    lifecycle: "pre_quote",
    stage: "quote",
    responsibleParty: "agent",
    operatorAction: "none",
    actionLabel: "",
    actionTarget: "none",
    actionPriority: "none",
    clientTimeRemainingSeconds: null,
    exception: null,
    progress: {
      currentIndex: 0,
      total: 7,
      completed: [],
      stages: [
        "quote",
        "reserved",
        "documents",
        "agreement",
        "payment",
        "dossier",
        "confirmed",
      ],
      percent: 0,
    },
    capabilities: { printDossier: false },
    workflowState: "missing_information",
    workflowRevision: null,
    ...operations,
  };
  return {
    id: 1,
    conversation_id: "conversation-1",
    channel: "WhatsApp",
    first_name: "Maria",
    surnames: "Martina",
    phone_raw: "+5999000000",
    callback_preference: "",
    visit_reason: "",
    status: "active",
    handoff_reason: "",
    created_at: "2026-08-30T10:00:00Z",
    updated_at: "2026-08-30T10:00:00Z",
    operations: contract,
    ...overrides,
  } as FollowUp;
}

describe("rental operations projection", () => {
  it("uses the server stage without reading legacy status copy", () => {
    expect(
      rentalStage(
        lead(
          { stage: "documents", lifecycle: "post_quote" },
          { next_action: "This English copy can change freely" },
        ),
      ),
    ).toBe("documents");
  });

  it("renders a server-authorized staff action", () => {
    const projection = projectRentalLead(
      lead({
        lifecycle: "post_quote",
        stage: "payment",
        responsibleParty: "staff",
        operatorAction: "verify_payment",
        actionLabel: "Verify payment",
        actionTarget: "agreement_payment",
        actionPriority: "high",
      }),
    );

    expect(projection.responsibleParty).toBe("Staff");
    expect(projection.operatorAction).toBe("verify_payment");
    expect(projection.priority).toBe(2);
  });

  it("keeps client and system waits out of staff work", () => {
    expect(
      projectRentalLead(
        lead({
          lifecycle: "post_quote",
          stage: "documents",
          responsibleParty: "client",
        }),
      ).responsibleParty,
    ).toBe("Customer");
    expect(
      projectRentalLead(
        lead({
          lifecycle: "post_quote",
          stage: "agreement",
          responsibleParty: "system",
        }),
      ).operatorAction,
    ).toBe("none");
  });

  it("carries technical exception and dossier capability explicitly", () => {
    const projection = projectRentalLead(
      lead({
        lifecycle: "post_quote",
        stage: "dossier",
        responsibleParty: "staff",
        operatorAction: "resolve_technical",
        actionLabel: "Resolve technical issue",
        actionTarget: "customer",
        actionPriority: "critical",
        exception: { kind: "technical_attention", code: "provider_failure" },
        capabilities: { printDossier: true },
      }),
    );

    expect(projection.exception).toBe(true);
    expect(projection.exceptionCode).toBe("provider_failure");
    expect(projection.canPrintDossier).toBe(true);
  });

  it("fails closed when an older backend omits the contract", () => {
    const withoutContract = lead(undefined);
    delete (withoutContract as FollowUp & { operations?: unknown }).operations;

    const projection = projectRentalLead(withoutContract);

    expect(projection.contractAvailable).toBe(false);
    expect(projection.operatorAction).toBe("resolve_technical");
    expect(projection.exceptionCode).toBe("operations_contract_missing");
  });
});
