import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMermaidCatalog,
  fetchMermaidCustomers,
  fetchMermaidCustomer,
  fetchMermaidCustomerHistory,
  fetchMermaidReservation,
  fetchMermaidReservations,
} from "@/lib/api";

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
    },
  );
});
