import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMermaidCatalog,
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
              headers: { "Content-Type": "application/json" },
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
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain(
      "/api/mermaid/dashboard/api/mermaid-reservations?",
    );
    expect(urls[0]).toContain("query=Ana+Silva");
    expect(urls[1]).toContain("/mermaid-reservations/mer%2Fdemo%201");
    expect(urls[2]).toContain("/mermaid-reservations/catalog");
    for (const [, request] of vi.mocked(fetch).mock.calls) {
      expect(request?.cache).toBe("no-store");
    }
  });
});
