import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeMermaidCrewAssistance,
  fetchMermaidCatalog,
  fetchMermaidCrewAssistance,
  fetchMermaidCustomers,
  fetchMermaidCustomer,
  fetchMermaidCustomerHistory,
  fetchMermaidReservation,
  fetchMermaidReservations,
  publishMermaidCatalog,
  type MermaidCatalogChanges,
} from "@/lib/api";

const crewAssistance = {
  id: "assist-1",
  kind: "wheelchair" as const,
  note: "Guest's mother uses a wheelchair.",
  relationship: "Guest's mother",
  tripDate: "2026-09-12",
  reservationPublicId: "mer-1",
  status: "unacknowledged" as const,
  revision: 3,
  createdAt: "2026-09-04T12:00:00Z",
  updatedAt: "2026-09-04T12:00:00Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
};

describe("Mermaid reservation API", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    localStorage.setItem("wtyj_token_mermaid", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [],
              catalog: {},
              demo: true,
              remindersEnabled: false,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Unboks-Tenant": "mermaid",
              },
            },
          ),
        ),
      ),
    );
  });

  it("keeps list, detail and catalog requests in the Mermaid tenant scope", async () => {
    await fetchMermaidReservations("Ana Silva");
    await fetchMermaidReservation("mer/demo 1");
    await fetchMermaidCatalog();
    await fetchMermaidCustomers("2025550123", 50);
    await fetchMermaidCustomer("12");
    await fetchMermaidCustomerHistory("12", 87);
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain(
      "/api/mermaid/dashboard/api/mermaid-reservations?",
    );
    expect(urls[0]).toContain("query=Ana+Silva");
    expect(urls[1]).toContain("/mermaid-reservations/mer%2Fdemo%201");
    expect(urls[2]).toContain("/mermaid-reservations/catalog");
    expect(urls[3]).toContain("/mermaid-customers?query=2025550123&offset=50");
    expect(urls[4]).toContain("/mermaid-customers/12");
    expect(urls[5]).toContain(
      "/mermaid-customers/12/history?changes=false&before=87",
    );
    for (const [, request] of vi.mocked(fetch).mock.calls) {
      expect(request?.cache).toBe("no-store");
    }
  });

  it.each([null, "ali-car-rental", "mermaid, consulta-despertares"])(
    "rejects unproven or conflicting workspace identity: %s",
    async (tenant) => {
      vi.mocked(fetch).mockImplementation(
        async () =>
          new Response(JSON.stringify({ items: [], catalog: {} }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...(tenant ? { "X-Unboks-Tenant": tenant } : {}),
            },
          }),
      );
      await expect(fetchMermaidReservations()).rejects.toThrow(
        "Workspace response rejected",
      );
      await expect(fetchMermaidReservation("mer-1")).rejects.toThrow(
        "Workspace response rejected",
      );
      await expect(fetchMermaidCustomers()).rejects.toThrow(
        "Workspace response rejected",
      );
      await expect(fetchMermaidCustomer("1")).rejects.toThrow(
        "Workspace response rejected",
      );
      await expect(fetchMermaidCustomerHistory("1", null)).rejects.toThrow(
        "Workspace response rejected",
      );
      await expect(fetchMermaidCatalog()).rejects.toThrow(
        "Workspace response rejected",
      );
      await expect(fetchMermaidCrewAssistance()).rejects.toThrow(
        "Workspace response rejected",
      );
      await expect(publishMermaidCatalog("a".repeat(64), {} as MermaidCatalogChanges)).rejects.toThrow("Workspace response rejected");
    },
  );

  it("publishes with tenant authentication, JSON and a mandatory revision", async () => {
    const changes = { included: ["Breakfast"] } as MermaidCatalogChanges;
    await publishMermaidCatalog("a".repeat(64), changes);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/api/mermaid/dashboard/api/mermaid-reservations/catalog");
    expect(request?.method).toBe("PUT");
    expect(request?.headers).toMatchObject({ Authorization: "Bearer test-token", "Content-Type": "application/json" });
    expect(JSON.parse(request?.body as string)).toEqual({ expected_revision: "a".repeat(64), changes });
  });

  it("keeps only the newest repeated assistance event and retains corrections", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              ...crewAssistance,
              conversationId: "guest-1",
              customerName: "Alex Guest",
            },
            {
              ...crewAssistance,
              note: "Guest's mother uses a folding wheelchair.",
              tripDate: "2026-09-19",
              revision: 4,
              updatedAt: "2026-09-04T12:05:00Z",
              conversationId: "guest-1",
              customerName: "Alex Guest",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Unboks-Tenant": "mermaid",
          },
        },
      ),
    );

    const items = await fetchMermaidCrewAssistance();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "assist-1",
      note: "Guest's mother uses a folding wheelchair.",
      tripDate: "2026-09-19",
      revision: 4,
      conversationId: "guest-1",
      customerName: "Alex Guest",
    });
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/mermaid-crew-assistance?status=unacknowledged",
    );
    expect(request?.cache).toBe("no-store");
  });

  it("acknowledges an exact revision as the selected operator", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          item: {
            ...crewAssistance,
            status: "acknowledged",
            acknowledgedAt: "2026-09-04T12:10:00Z",
            acknowledgedBy: "Jr",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Unboks-Tenant": "mermaid",
          },
        },
      ),
    );

    const item = await acknowledgeMermaidCrewAssistance("assist/1", 3, "Jr");
    expect(item).toMatchObject({
      id: "assist-1",
      status: "acknowledged",
      acknowledgedBy: "Jr",
    });
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/mermaid-crew-assistance/assist%2F1/acknowledge",
    );
    expect(request?.method).toBe("POST");
    expect(JSON.parse(request?.body as string)).toEqual({
      expectedRevision: 3,
      acknowledgedBy: "Jr",
    });
  });
});
