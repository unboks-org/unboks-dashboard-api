import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AliCustomerFile as AliCustomerFileRecord,
  AliReservationWorkflowV2,
} from "@/lib/api";

const mocks = vi.hoisted(() => ({
  fetchFile: vi.fn(),
  approvePrepayment: vi.fn(),
  sendPayment: vi.fn(),
  confirm: vi.fn(),
  requestDocuments: vi.fn(),
  pickup: vi.fn(),
  setPayment: vi.fn(),
  reviewDocument: vi.fn(),
  replaceDocument: vi.fn(),
  reclassifyDocument: vi.fn(),
  reviewPayment: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchAliCustomerFile: mocks.fetchFile,
    approveAliPrepaymentFile: mocks.approvePrepayment,
    sendAliPaymentLink: mocks.sendPayment,
    confirmAliReservation: mocks.confirm,
    requestAliDocuments: mocks.requestDocuments,
    recordAliPickupInspection: mocks.pickup,
    setAliPaymentLink: mocks.setPayment,
    reviewAliDocument: mocks.reviewDocument,
    requestAliDocumentReplacement: mocks.replaceDocument,
    reclassifyAliDocument: mocks.reclassifyDocument,
    reviewAliPayment: mocks.reviewPayment,
  };
});

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { AliCustomerFile } from "./AliCustomerFile";

function customerFile(
  overrides: Partial<AliCustomerFileRecord> = {},
): AliCustomerFileRecord {
  return {
    public_id: "reservation-120",
    revision: 7,
    status: "requirements_pending",
    availability_status: "approved",
    identity_status: "requested",
    agreement_status: "not_sent",
    payment_status: "not_sent",
    dossier_status: "incomplete",
    dossier_version: 0,
    dossier_review_status: "not_generated",
    dossier_ready_for_approval: false,
    checklist_complete: false,
    can_confirm: false,
    pickup_checklist: {
      original_license_inspected: false,
      original_license_inspected_at: null,
      original_license_inspected_by: null,
      original_identity_inspected: false,
      original_identity_inspected_at: null,
      original_identity_inspected_by: null,
    },
    missing_requirements: [
      "documents",
      "signed_contract",
      "payment_verification",
    ],
    quote_reference: "ALI-SYNTHETIC-120",
    confirmation_reference: null,
    customer: { name: "Synthetic Customer" },
    rental: {
      vehicle_name: "Synthetic Economy",
      rental_start: "2099-01-01",
      rental_end: "2099-01-04",
    },
    pricing: {
      rentalTotal: { currency: "USD", amount: "105.00" },
      refundableSecurityDeposit: { currency: "USD", amount: "200.00" },
      total: { currency: "USD", amount: "305.00" },
    },
    documents: [],
    contract: null,
    payment: {
      status: "not_sent",
      mode: "per_reservation",
      providerName: "",
      tenantDefaultAvailable: false,
      tenantDefaultDomain: null,
      domain: null,
      reference: null,
      linkSentAt: null,
      customerReportedAt: null,
      verifiedAt: null,
      verifiedBy: null,
      reviewReason: null,
    },
    events: [],
    final_notes: "",
    ...overrides,
  };
}

function renderFile(file: AliCustomerFileRecord) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mocks.fetchFile.mockResolvedValue(file);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <AliCustomerFile publicId={file.public_id} enabled />
      </QueryClientProvider>,
    ),
  };
}

function workflowV2(
  overrides: Partial<AliReservationWorkflowV2> = {},
): AliReservationWorkflowV2 {
  return {
    reservationPublicId: "reservation-120",
    workflowVersion: 2,
    state: "prepayment_approval_pending",
    responsibleParty: "Staff",
    clock: {
      state: "paused",
      pauseReason: "prepayment_file_review",
      activeClientSeconds: 0,
      remainingSeconds: 86_400,
      holdSeconds: 86_400,
      clientTimezone: "America/Curacao",
    },
    reminders: {
      milestonesSeconds: [10_800, 43_200, 75_600],
      nextMilestoneSeconds: null,
      sendEnabled: false,
    },
    nextAction: "approve_complete_file",
    doNotContact: false,
    cancellationReason: null,
    negativeIntentPending: false,
    identityType: "passport",
    expectedDocumentSlot: null,
    revision: 8,
    lastClientActivityAt: null,
    lastOutboundAt: null,
    createdAt: "2099-01-01T00:00:00Z",
    updatedAt: "2099-01-01T01:00:00Z",
    ...overrides,
  };
}

describe("AliCustomerFile", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    localStorage.setItem("wtyj_token_ali-car-rental", "test-token");
    mocks.fetchFile.mockReset();
    mocks.approvePrepayment.mockReset().mockResolvedValue({ delivered: true });
    mocks.sendPayment.mockReset().mockResolvedValue({ delivered: true });
    mocks.confirm.mockReset().mockResolvedValue({ status: "confirmed" });
    mocks.requestDocuments.mockReset().mockResolvedValue({ delivered: true });
    mocks.pickup.mockReset().mockResolvedValue({ status: "confirmed" });
    mocks.setPayment.mockReset().mockResolvedValue({ status: "not_sent" });
    mocks.reviewDocument.mockReset().mockResolvedValue({ status: "rejected" });
    mocks.replaceDocument.mockReset().mockResolvedValue({
      status: "replacement_requested",
    });
    mocks.reclassifyDocument.mockReset().mockResolvedValue({
      status: "received",
    });
    mocks.reviewPayment.mockReset().mockResolvedValue({
      payment_status: "verified",
    });
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("shows missing requirements and keeps final approval locked", async () => {
    renderFile(customerFile());

    expect(await screen.findByText("Secure customer file")).toBeTruthy();
    expect(screen.getAllByText(/documents$/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/signed contract$/i)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /final human approval/i })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("requires printing the completed dossier before final approval", async () => {
    renderFile(
      customerFile({
        status: "ready_to_confirm",
        identity_status: "verified",
        agreement_status: "signed",
        payment_status: "verified",
        dossier_status: "ready_for_review",
        dossier_version: 0,
        dossier_review_status: "not_generated",
        dossier_ready_for_approval: false,
        checklist_complete: true,
        can_confirm: false,
        missing_requirements: [],
      }),
    );

    expect(
      await screen.findByText(
        /print the ready-for-review dossier before final human approval/i,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /final human approval/i })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("requests secure document links only after availability is approved", async () => {
    renderFile(customerFile());

    fireEvent.click(
      await screen.findByRole("button", { name: /request secure uploads/i }),
    );

    await waitFor(() =>
      expect(mocks.requestDocuments).toHaveBeenCalledWith("reservation-120", 7),
    );
  });

  it("allows exactly one explicit final approval after a reviewed dossier", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderFile(
      customerFile({
        status: "ready_to_confirm",
        identity_status: "verified",
        agreement_status: "signed",
        payment_status: "verified",
        dossier_status: "ready_for_review",
        dossier_version: 2,
        dossier_review_status: "ready_for_review",
        dossier_ready_for_approval: true,
        checklist_complete: true,
        can_confirm: true,
        missing_requirements: [],
      }),
    );

    const button = await screen.findByRole("button", {
      name: /final human approval/i,
    });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm).toHaveBeenCalledWith("reservation-120", 7);
  });

  it("explains the dossier gate instead of calling it a stale file", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.confirm.mockRejectedValueOnce(
      new (await import("@/lib/error")).ApiError(
        409,
        "dossier_review_required",
      ),
    );
    renderFile(
      customerFile({
        status: "ready_to_confirm",
        identity_status: "verified",
        agreement_status: "signed",
        payment_status: "verified",
        dossier_status: "ready_for_review",
        dossier_version: 1,
        dossier_review_status: "ready_for_review",
        dossier_ready_for_approval: true,
        checklist_complete: true,
        can_confirm: true,
        missing_requirements: [],
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /final human approval/i }),
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Print the ready-for-review dossier before final human approval.",
      ),
    );
  });

  it("keeps original-document inspection as a post-confirmation staff action", async () => {
    renderFile(
      customerFile({
        status: "confirmed",
        dossier_status: "approved",
        missing_requirements: [],
        confirmation_reference: "AR-2099-SYNTH",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /original licence inspected/i,
      }),
    );

    await waitFor(() =>
      expect(mocks.pickup).toHaveBeenCalledWith(
        "reservation-120",
        "license",
        7,
      ),
    );
  });

  it("applies a tenant payment link without exposing the stored URL", async () => {
    renderFile(
      customerFile({
        payment: {
          status: "not_sent",
          mode: "fixed_link",
          providerName: "Synthetic Pay",
          tenantDefaultAvailable: true,
          tenantDefaultDomain: "pay.example.test",
          domain: null,
          reference: null,
          linkSentAt: null,
          customerReportedAt: null,
          verifiedAt: null,
          verifiedBy: null,
          reviewReason: null,
        },
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /use tenant link/i }),
    );

    await waitFor(() =>
      expect(mocks.setPayment).toHaveBeenCalledWith(
        "reservation-120",
        "",
        "",
        7,
      ),
    );
    expect(screen.queryByDisplayValue(/https:\/\//i)).toBeNull();
  });

  it("renders the server-owned V2 step, clock and responsibility", async () => {
    renderFile(
      customerFile({
        workflow_v2: {
          reservationPublicId: "reservation-120",
          workflowVersion: 2,
          state: "documents_collecting",
          responsibleParty: "Client",
          clock: {
            state: "running",
            pauseReason: null,
            activeClientSeconds: 3600,
            remainingSeconds: 82_800,
            holdSeconds: 86_400,
            clientTimezone: "America/Curacao",
          },
          reminders: {
            milestonesSeconds: [10_800, 43_200, 75_600],
            nextMilestoneSeconds: 10_800,
            sendEnabled: false,
          },
          nextAction: "send_next_document",
          doNotContact: false,
          cancellationReason: null,
          negativeIntentPending: false,
          identityType: "passport",
          expectedDocumentSlot: "license_front",
          revision: 3,
          lastClientActivityAt: null,
          lastOutboundAt: null,
          createdAt: "2099-01-01T00:00:00Z",
          updatedAt: "2099-01-01T01:00:00Z",
        },
      }),
    );

    expect(await screen.findByText("Current reservation step")).toBeTruthy();
    expect(screen.getByText(/Responsible now: Client/i)).toBeTruthy();
    expect(screen.getByText("23h 0m")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /request secure uploads/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /send pre-contract/i }),
    ).toBeNull();
  });

  it("uses one complete-file approval instead of per-document verification", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderFile(
      customerFile({
        identity_status: "received",
        agreement_status: "signed",
        documents: [
          {
            public_id: "doc-120",
            slot: "passport",
            version: 1,
            mime_type: "image/png",
            size_bytes: 100,
            sha256: "synthetic",
            status: "received",
            previous_document_public_id: null,
            created_at: "2099-01-01T00:00:00Z",
            updated_at: "2099-01-01T00:00:00Z",
            verified_at: null,
            verified_by: null,
            deleted_at: null,
            deleted_by: null,
          },
        ],
        workflow_v2: workflowV2(),
        prepayment_review: {
          status: "prepayment_approval_pending",
          approvalRequired: true,
          approved: false,
          readyForApproval: true,
          paymentReady: true,
          canApproveAndSend: true,
          requiredDocumentCount: 3,
          receivedDocumentCount: 3,
          missingRequirements: [],
        },
      }),
    );

    expect(
      await screen.findByText(/individual verification is not required/i),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^verify$/i })).toBeNull();
    const approval = screen.getByRole("button", {
      name: /approve file & send payment link/i,
    });
    fireEvent.click(approval);

    await waitFor(() =>
      expect(mocks.approvePrepayment).toHaveBeenCalledWith(
        "reservation-120",
        8,
      ),
    );
  });

  it("retries payment delivery without asking for a second approval", async () => {
    renderFile(
      customerFile({
        payment_status: "not_sent",
        workflow_v2: workflowV2({
          state: "prepayment_approved",
          responsibleParty: "System",
          nextAction: "send_payment_link",
          revision: 9,
        }),
        prepayment_review: {
          status: "prepayment_approved",
          approvalRequired: false,
          approved: true,
          readyForApproval: true,
          paymentReady: true,
          canApproveAndSend: true,
          requiredDocumentCount: 3,
          receivedDocumentCount: 3,
          missingRequirements: [],
        },
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /retry sending payment link/i,
      }),
    );

    await waitFor(() =>
      expect(mocks.sendPayment).toHaveBeenCalledWith("reservation-120"),
    );
    expect(
      screen.queryByRole("button", {
        name: /approve file & send payment link/i,
      }),
    ).toBeNull();
  });

  it("requires an audited reason for an early V2 payment override", async () => {
    renderFile(
      customerFile({
        payment_status: "link_sent",
        payment: {
          status: "link_sent",
          mode: "fixed_link",
          providerName: "Synthetic Pay",
          tenantDefaultAvailable: true,
          tenantDefaultDomain: "pay.example.test",
          domain: "pay.example.test",
          reference: "SYNTH-120",
          linkSentAt: "2099-01-01T01:00:00Z",
          customerReportedAt: null,
          verifiedAt: null,
          verifiedBy: null,
          reviewReason: null,
        },
        workflow_v2: {
          reservationPublicId: "reservation-120",
          workflowVersion: 2,
          state: "payment_link_sent",
          responsibleParty: "Client",
          clock: {
            state: "running",
            pauseReason: null,
            activeClientSeconds: 0,
            remainingSeconds: 86_400,
            holdSeconds: 86_400,
            clientTimezone: "America/Curacao",
          },
          reminders: {
            milestonesSeconds: [10_800, 43_200, 75_600],
            nextMilestoneSeconds: 10_800,
            sendEnabled: false,
          },
          nextAction: "report_payment",
          doNotContact: false,
          cancellationReason: null,
          negativeIntentPending: false,
          identityType: "passport",
          expectedDocumentSlot: null,
          revision: 9,
          lastClientActivityAt: null,
          lastOutboundAt: null,
          createdAt: "2099-01-01T00:00:00Z",
          updatedAt: "2099-01-01T01:00:00Z",
        },
      }),
    );

    const verify = await screen.findByRole("button", {
      name: /verify payment/i,
    });
    expect(verify.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/review reason/i), {
      target: { value: "Owner checked the bank receipt directly." },
    });
    fireEvent.click(verify);

    await waitFor(() =>
      expect(mocks.reviewPayment).toHaveBeenCalledWith(
        "reservation-120",
        "verified",
        7,
        "Owner checked the bank receipt directly.",
      ),
    );
  });

  it("requires a staff reason before requesting a replacement", async () => {
    renderFile(
      customerFile({
        documents: [
          {
            public_id: "doc-120",
            slot: "license_front",
            version: 1,
            mime_type: "image/png",
            size_bytes: 100,
            sha256: "synthetic",
            status: "received",
            previous_document_public_id: null,
            created_at: "2099-01-01T00:00:00Z",
            updated_at: "2099-01-01T00:00:00Z",
            verified_at: null,
            verified_by: null,
            deleted_at: null,
            deleted_by: null,
          },
        ],
      }),
    );
    const replacement = await screen.findByRole("button", {
      name: /request replacement/i,
    });
    expect(replacement.hasAttribute("disabled")).toBe(true);
    fireEvent.change(
      screen.getByLabelText(/review reason for driver’s licence/i),
      { target: { value: "The image is too dark" } },
    );
    fireEvent.click(replacement);
    await waitFor(() =>
      expect(mocks.replaceDocument).toHaveBeenCalledWith(
        "reservation-120",
        "doc-120",
        7,
        "The image is too dark",
      ),
    );
  });

  it("reclassifies an extra WhatsApp file only to the expected V2 slot", async () => {
    const base = customerFile();
    renderFile(
      customerFile({
        documents: [
          {
            public_id: "doc-extra-120",
            slot: "unclassified",
            version: 1,
            mime_type: "image/png",
            size_bytes: 100,
            sha256: "synthetic-extra",
            status: "unclassified",
            previous_document_public_id: null,
            created_at: "2099-01-01T00:00:00Z",
            updated_at: "2099-01-01T00:00:00Z",
            verified_at: null,
            verified_by: null,
            deleted_at: null,
            deleted_by: null,
          },
        ],
        workflow_v2: {
          reservationPublicId: "reservation-120",
          workflowVersion: 2,
          state: "documents_collecting",
          responsibleParty: "Client",
          clock: {
            state: "running",
            pauseReason: null,
            activeClientSeconds: 0,
            remainingSeconds: 86_400,
            holdSeconds: 86_400,
            clientTimezone: "America/Curacao",
          },
          reminders: {
            milestonesSeconds: [10_800],
            nextMilestoneSeconds: 10_800,
            sendEnabled: false,
          },
          nextAction: "send_next_document",
          doNotContact: false,
          cancellationReason: null,
          negativeIntentPending: false,
          identityType: "passport",
          expectedDocumentSlot: "license_front",
          revision: 2,
          lastClientActivityAt: null,
          lastOutboundAt: null,
          createdAt: base.events[0]?.created_at || "2099-01-01T00:00:00Z",
          updatedAt: "2099-01-01T00:00:00Z",
        },
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /classify as driver’s licence — front/i,
      }),
    );
    await waitFor(() =>
      expect(mocks.reclassifyDocument).toHaveBeenCalledWith(
        "reservation-120",
        "doc-extra-120",
        "license_front",
        7,
      ),
    );
  });
});
