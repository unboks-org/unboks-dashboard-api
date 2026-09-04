import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidTripSettings } from "./MermaidTripSettings";
import {
  fetchMermaidCatalog,
  publishMermaidCatalog,
  type MermaidCatalogResponse,
} from "@/lib/api";
import { ApiError } from "@/lib/error";
import { tenantKey } from "@/lib/query-keys";
import { editableMermaidCatalog } from "@/lib/mermaid-catalog-settings";

vi.mock("@/lib/api", () => ({
  fetchMermaidCatalog: vi.fn(),
  publishMermaidCatalog: vi.fn(),
}));

export function catalogFixture(): MermaidCatalogResponse {
  return {
    revision: "a".repeat(64),
    editable: true,
    demo: true,
    remindersEnabled: false,
    catalog: {
      version: "test-version",
      service: {
        name: "Klein Curaçao Day Trip",
        meeting_point: "Fishermen’s Pier",
        arrival_time: "06:45",
        island_departure_time: "15:20",
        operating_weekdays: ["monday", "sunday"],
        pickup_minutes_before_arrival: 60,
      },
      pricing: {
        default_currency: "USD",
        currencies: Object.fromEntries(
          ["USD", "EUR", "XCG"].map((c) => [
            c,
            { adult: 150, child_4_12: 75, infant_0_3: 0, sedula: 110 },
          ]),
        ),
        pickup_currency: "USD",
        pickup_basis: "per_vehicle",
        pickup_coverage: "island_wide",
        pickup_vehicles: [
          { key: "car", capacity: 5, price: 75 },
          { key: "van", capacity: 9, price: 125 },
        ],
        pickup_overflow: "team_review",
      },
      included: ["Breakfast"],
      bring: ["Towel"],
      extras: ["Drinks", "Optional island-wide pickup: old generated prose"],
      policies: {
        cancellation: "DEMO POLICY - REPLACE BEFORE GO-LIVE: Cancellation",
        safety: "DEMO POLICY - REPLACE BEFORE GO-LIVE: Safety",
        insurance: "Insurance not verified",
      },
    },
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MermaidTripSettings />
    </QueryClientProvider>,
  );
  return client;
}
async function changeName(value = "Updated Mermaid trip") {
  fireEvent.change(await screen.findByLabelText("Trip name"), {
    target: { value },
  });
}
async function confirmPublish() {
  fireEvent.click(screen.getByRole("button", { name: "Review & publish" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Publish changes" }),
  );
}

describe("Mermaid editable trip settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    vi.mocked(fetchMermaidCatalog).mockResolvedValue(catalogFixture());
  });

  it("loads published values without writing, including live vehicle pricing", async () => {
    mount();
    expect(
      ((await screen.findByLabelText("Trip name")) as HTMLInputElement).value,
    ).toBe("Klein Curaçao Day Trip");
    expect(
      (screen.getByLabelText("Car price (USD)") as HTMLInputElement).value,
    ).toBe("75");
    expect(
      (screen.getByLabelText("Van capacity") as HTMLInputElement).value,
    ).toBe("9");
    expect(
      (screen.getByLabelText("Optional extras") as HTMLTextAreaElement).value,
    ).toBe("Drinks");
    expect(
      screen
        .getByRole("button", { name: "Review & publish" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(publishMermaidCatalog).not.toHaveBeenCalled();
  });

  it("publishes only after confirmation and adopts persisted server response", async () => {
    const result = catalogFixture();
    result.revision = "b".repeat(64);
    result.catalog.service.name = "Updated Mermaid trip";
    vi.mocked(publishMermaidCatalog).mockResolvedValue(result);
    mount();
    await changeName();
    fireEvent.click(screen.getByRole("button", { name: "Review & publish" }));
    const dialog = await screen.findByRole("dialog");
    expect(publishMermaidCatalog).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(/Existing reservation prices/),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Publish changes" }),
    );
    expect(await screen.findByText(/Published. TRACY will use/)).toBeTruthy();
    const [revision, changes] = vi.mocked(publishMermaidCatalog).mock.calls[0];
    expect(revision).toBe("a".repeat(64));
    expect(changes.service.name).toBe("Updated Mermaid trip");
    expect(changes.pricing).not.toHaveProperty("pickup_basis");
    expect(changes).not.toHaveProperty("version");
    expect(changes).not.toHaveProperty("links");
    expect(
      screen
        .getByRole("button", { name: "Review & publish" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("retains edits on failed save and never claims success", async () => {
    vi.mocked(publishMermaidCatalog).mockRejectedValue(
      new ApiError(503, "Storage unavailable"),
    );
    mount();
    await changeName();
    await confirmPublish();
    expect(await screen.findByText("Storage unavailable")).toBeTruthy();
    expect((screen.getByLabelText("Trip name") as HTMLInputElement).value).toBe(
      "Updated Mermaid trip",
    );
    expect(screen.queryByText(/Published. TRACY will use/)).toBeNull();
  });

  it("preserves a draft on background refresh and blocks overwriting a newer version", async () => {
    const client = mount();
    await changeName("My unsaved trip");
    const newer = catalogFixture();
    newer.revision = "b".repeat(64);
    newer.catalog.service.name = "Someone else’s update";
    act(() => client.setQueryData(tenantKey("mermaid-catalog"), newer));
    expect(
      await screen.findByText(/Another update was published/),
    ).toBeTruthy();
    expect((screen.getByLabelText("Trip name") as HTMLInputElement).value).toBe(
      "My unsaved trip",
    );
    expect(
      screen
        .getByRole("button", { name: "Review & publish" })
        .hasAttribute("disabled"),
    ).toBe(true);
    vi.mocked(fetchMermaidCatalog).mockResolvedValue(newer);
    fireEvent.click(
      screen.getByRole("button", { name: "Discard edits & reload" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Trip name") as HTMLInputElement).value,
      ).toBe("Someone else’s update"),
    );
  });

  it("shows an error and keeps input on a server revision conflict", async () => {
    vi.mocked(publishMermaidCatalog).mockRejectedValue(
      new ApiError(409, "Trip settings changed"),
    );
    mount();
    await changeName();
    await confirmPublish();
    expect(await screen.findByText("Trip settings changed")).toBeTruthy();
    expect((screen.getByLabelText("Trip name") as HTMLInputElement).value).toBe(
      "Updated Mermaid trip",
    );
  });

  it("validates weekday, timing, vehicle capacity and policy safeguards", async () => {
    mount();
    await changeName();
    fireEvent.change(screen.getByLabelText("Car capacity"), {
      target: { value: "10" },
    });
    expect(
      await screen.findByText(
        "Van capacity must be greater than car capacity.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Car capacity"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Arrival / check-in"), {
      target: { value: "16:00" },
    });
    expect(
      await screen.findByText(
        "Return boarding must be after arrival/check-in.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Arrival / check-in"), {
      target: { value: "06:45" },
    });
    fireEvent.click(screen.getByLabelText("mon"));
    fireEvent.click(screen.getByLabelText("sun"));
    expect(
      await screen.findByText("Select at least one operating day."),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("mon"));
    fireEvent.change(screen.getByLabelText("Insurance"), {
      target: { value: "Fully insured" },
    });
    expect(
      await screen.findByText(/Insurance must remain marked/),
    ).toBeTruthy();
    expect(publishMermaidCatalog).not.toHaveBeenCalled();
  });

  it("does not expose an editor to another tenant or pretend unsupported servers can save", async () => {
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    mount();
    expect(fetchMermaidCatalog).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("form", { name: "Mermaid trip settings" }),
    ).toBeNull();
  });

  it("disables editing if the server has not enabled publishing", async () => {
    const data = catalogFixture();
    delete data.revision;
    delete data.editable;
    vi.mocked(fetchMermaidCatalog).mockResolvedValue(data);
    mount();
    expect(
      await screen.findByText(/does not yet support editing/),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Trip name").closest("fieldset")?.disabled,
    ).toBe(true);
  });

  it("makes load failure explicit and offers retry", async () => {
    vi.mocked(fetchMermaidCatalog).mockRejectedValueOnce(new Error("Offline"));
    mount();
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Trip name")).toBeTruthy();
  });

  it("projects only editable fields even when the API includes protected fields", () => {
    const data = catalogFixture().catalog;
    const projected = editableMermaidCatalog({
      ...data,
      links: { checkout_base_url: "private" },
      guest_copy: {},
      tenant_slug: "mermaid",
    } as typeof data);
    expect(Object.keys(projected).sort()).toEqual([
      "bring",
      "extras",
      "included",
      "policies",
      "pricing",
      "service",
    ]);
  });
});
