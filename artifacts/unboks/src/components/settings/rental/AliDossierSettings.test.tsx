import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AliDossierTenantSettings } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  updateActivation: vi.fn(),
  updateSettings: vi.fn(),
  uploadTemplate: vi.fn(),
  fetchV2Settings: vi.fn(),
  updateV2Settings: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchAliDossierSettings: mocks.fetchSettings,
    updateAliDossierActivation: mocks.updateActivation,
    updateAliDossierSettings: mocks.updateSettings,
    uploadAliContractTemplate: mocks.uploadTemplate,
    fetchAliReservationV2Settings: mocks.fetchV2Settings,
    updateAliReservationV2Settings: mocks.updateV2Settings,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  AliDossierRetentionSettings,
  AliDossierSettings,
} from "./AliDossierSettings";

function settings(
  overrides: Partial<AliDossierTenantSettings> = {},
): AliDossierTenantSettings {
  return {
    status: {
      enabled: false,
      ready: false,
      configurationReady: false,
      blockers: ["feature_disabled", "approved_contract_template_missing"],
    },
    contractTemplate: null,
    payment: {
      mode: "per_reservation",
      providerName: "",
      defaultLinkConfigured: false,
      defaultDomain: null,
      allowedDomains: [],
    },
    retention: {
      documentRetentionDays: 90,
      paperShreddingPolicy:
        "Securely shred paper copies after the 90-day retention period.",
    },
    ...overrides,
  };
}

function renderSettings(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("Ali tenant-owned dossier settings", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    localStorage.setItem("wtyj_token_ali-car-rental", "test-token");
    mocks.fetchSettings.mockReset().mockResolvedValue(settings());
    mocks.updateActivation.mockReset();
    mocks.updateSettings.mockReset();
    mocks.uploadTemplate.mockReset();
    mocks.fetchV2Settings.mockReset().mockResolvedValue({
      holdActiveClientHours: 24,
      reminderActiveClientHours: [3, 12, 21],
      quietHoursStart: "20:30",
      quietHoursEnd: "08:30",
      defaultTimezone: "America/Curacao",
      reminderSendEnabled: false,
    });
    mocks.updateV2Settings.mockReset().mockResolvedValue({
      holdActiveClientHours: 26,
      reminderActiveClientHours: [4, 13, 22],
      quietHoursStart: "21:00",
      quietHoursEnd: "07:30",
      defaultTimezone: "Europe/Lisbon",
      reminderSendEnabled: false,
    });
  });

  it("uploads an immutable tenant contract template with its version", async () => {
    const activated = settings({
      contractTemplate: {
        publicId: "template-1",
        version: "Ali terms v1",
        sourceFilename: "ali-contract.pdf",
        sha256: "abc123",
        uploadedAt: "2099-01-01T00:00:00Z",
      },
    });
    mocks.uploadTemplate.mockResolvedValue(activated);
    renderSettings(<AliDossierSettings />);

    fireEvent.change(await screen.findByLabelText(/version name/i), {
      target: { value: "Ali terms v1" },
    });
    const file = new File(["Approved rental terms"], "ali-contract.md", {
      type: "text/markdown",
    });
    fireEvent.change(screen.getByLabelText(/approved template/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload version/i }));

    await waitFor(() =>
      expect(mocks.uploadTemplate).toHaveBeenCalledWith("Ali terms v1", file),
    );
  });

  it("keeps activation unavailable until every required setting is complete", async () => {
    renderSettings(<AliDossierSettings />);

    const toggle = await screen.findByRole("switch", {
      name: /activate secure customer file/i,
    });

    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(/approved contract template missing/i),
    ).toBeTruthy();
    fireEvent.click(toggle);
    expect(mocks.updateActivation).not.toHaveBeenCalled();
  });

  it("lets the tenant activate a fully configured customer file", async () => {
    const ready = settings({
      status: {
        enabled: false,
        ready: false,
        configurationReady: true,
        blockers: ["feature_disabled"],
      },
    });
    mocks.fetchSettings.mockResolvedValue(ready);
    mocks.updateActivation.mockResolvedValue(
      settings({
        ...ready,
        status: {
          enabled: true,
          ready: true,
          configurationReady: true,
          blockers: [],
        },
      }),
    );
    renderSettings(<AliDossierSettings />);

    fireEvent.click(
      await screen.findByRole("switch", {
        name: /activate secure customer file/i,
      }),
    );

    await waitFor(() =>
      expect(mocks.updateActivation).toHaveBeenCalledWith(true),
    );
  });

  it("supports a server-only fixed tenant payment link", async () => {
    const configured = settings({
      payment: {
        mode: "fixed_link",
        providerName: "Synthetic Pay",
        defaultLinkConfigured: true,
        defaultDomain: "pay.example.test",
        allowedDomains: ["pay.example.test"],
      },
    });
    mocks.fetchSettings.mockResolvedValue(configured);
    mocks.updateSettings.mockResolvedValue(configured);
    renderSettings(<AliDossierSettings />);

    await screen.findByText(/deposit payment method/i);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Synthetic Pay")).toBeTruthy(),
    );
    expect(screen.queryByText(/active version/i)).toBeNull();
    expect(screen.queryByDisplayValue(/https:\/\//i)).toBeNull();
    expect(
      screen.getByPlaceholderText(/configured for pay\.example\.test/i),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /save payment settings/i }),
    );

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMode: "fixed_link",
          paymentProviderName: "Synthetic Pay",
          paymentAllowedDomains: ["pay.example.test"],
          clearPaymentUrl: false,
        }),
      ),
    );
    expect(mocks.updateSettings.mock.calls[0][0]).not.toHaveProperty(
      "paymentUrl",
    );
  });

  it("saves the 90-day tenant retention and shredding policy", async () => {
    const current = settings();
    const changed = settings({
      retention: {
        documentRetentionDays: 120,
        paperShreddingPolicy: "Securely shred paper copies after 120 days.",
      },
    });
    mocks.fetchSettings.mockResolvedValue(current);
    mocks.updateSettings.mockResolvedValue(changed);
    renderSettings(<AliDossierRetentionSettings />);

    fireEvent.change(await screen.findByLabelText(/keep private copies for/i), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByLabelText(/paper-copy shredding policy/i), {
      target: { value: "Securely shred paper copies after 120 days." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /save rental retention/i }),
    );

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          documentRetentionDays: 120,
          paperShreddingPolicy: "Securely shred paper copies after 120 days.",
        }),
      ),
    );
  });

  it("saves active-client hold, reminder and quiet-hour settings", async () => {
    renderSettings(<AliDossierSettings />);
    fireEvent.change(await screen.findByLabelText(/hold duration/i), {
      target: { value: "26" },
    });
    fireEvent.change(screen.getByLabelText(/reminder hours/i), {
      target: { value: "4, 13, 22" },
    });
    fireEvent.change(screen.getByLabelText(/quiet hours start/i), {
      target: { value: "21:00" },
    });
    fireEvent.change(screen.getByLabelText(/quiet hours end/i), {
      target: { value: "07:30" },
    });
    fireEvent.change(screen.getByLabelText(/client timezone fallback/i), {
      target: { value: "Europe/Lisbon" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save timing/i }));

    await waitFor(() =>
      expect(mocks.updateV2Settings).toHaveBeenCalledWith({
        holdActiveClientHours: 26,
        reminderActiveClientHours: [4, 13, 22],
        quietHoursStart: "21:00",
        quietHoursEnd: "07:30",
        defaultTimezone: "Europe/Lisbon",
      }),
    );
    expect(screen.getByText(/safety gate:/i).textContent).toContain("disabled");
  });
});
