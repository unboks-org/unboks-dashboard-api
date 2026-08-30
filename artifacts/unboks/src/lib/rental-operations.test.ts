import { describe, expect, it } from "vitest";
import type { FollowUp } from "@/lib/api";
import { projectRentalLead, rentalStage } from "@/lib/rental-operations";

function lead(overrides: Partial<FollowUp> = {}): FollowUp {
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
    ...overrides,
  };
}

describe("rental operations projection", () => {
  it("keeps pre-quote customers in the quote stage", () => {
    expect(rentalStage(lead())).toBe("quote");
  });

  it("maps an approved reservation to document collection", () => {
    expect(
      rentalStage(
        lead({
          reservation_public_id: "res-1",
          availability_status: "approved",
        }),
      ),
    ).toBe("documents");
  });

  it("surfaces unanswered messages as staff-owned work", () => {
    expect(projectRentalLead(lead({ unread_count: 1 })).operatorAction).toBe(
      "answer_customer",
    );
    expect(projectRentalLead(lead({ unread_count: 1 })).responsibleParty).toBe(
      "Staff",
    );
  });

  it("surfaces delivery failures as technical attention", () => {
    const projection = projectRentalLead(
      lead({ quote_delivery_state: "failed" }),
    );
    expect(projection.operatorAction).toBe("resolve_technical");
    expect(projection.exception).toBe(true);
  });

  it("does not make customer waiting states staff-owned", () => {
    expect(
      projectRentalLead(lead({ next_action: "Waiting for customer documents" }))
        .responsibleParty,
    ).toBe("Customer");
  });
});
