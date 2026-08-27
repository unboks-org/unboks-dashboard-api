import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AliCustomerFile as AliCustomerFileRecord } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  fetchFile: vi.fn(),
  confirm: vi.fn(),
  requestDocuments: vi.fn(),
  pickup: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchAliCustomerFile: mocks.fetchFile,
    confirmAliReservation: mocks.confirm,
    requestAliDocuments: mocks.requestDocuments,
    recordAliPickupInspection: mocks.pickup,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
      domain: null,
      reference: null,
      linkSentAt: null,
      customerReportedAt: null,
      verifiedAt: null,
      verifiedBy: null,
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

describe("AliCustomerFile", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    localStorage.setItem("wtyj_token_ali-car-rental", "test-token");
    mocks.fetchFile.mockReset();
    mocks.confirm.mockReset().mockResolvedValue({ status: "confirmed" });
    mocks.requestDocuments.mockReset().mockResolvedValue({ delivered: true });
    mocks.pickup.mockReset().mockResolvedValue({ status: "confirmed" });
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
});
