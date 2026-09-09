import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IslunoCatalogGate } from "./IslunoCatalogSettings";
import { ApiError } from "@/lib/error";
import { setClientSlug, setToken } from "@/lib/tenant";
import type { CatalogResponse } from "@/lib/isluno-catalog";
const data: CatalogResponse = {
  revision: "a".repeat(64),
  editable: true,
  catalog: {
    version: "fixture",
    tenant_slug: "mermaid",
    products: [
      {
        id: "trip",
        name: "Fixture trip",
        category: "Boat",
        summary: "Source description",
        enabled: true,
        inclusions: ["Lunch"],
        source: {
          url: "https://example.invalid/trip",
          observed_at: "2026-09-08",
        },
        readiness: {
          quotable: false,
          source_unresolved: ["exact_prices_unverified"],
          unresolved: ["exact_prices_unverified"],
          pricing_mode: "verified_catalog",
        },
        guest_rules: null,
        price_rules: null,
        schedule: null,
        options: null,
        pickup: null,
        policies: null,
        gallery: [0, 1].map((i) => ({
          id: `image-${i}`,
          order: i,
          caption: `Image ${i}`,
          source_url: "https://example.invalid/image",
          validation_status: "missing",
        })),
      },
    ],
  },
};
let requests: { url: string; init: RequestInit }[] = [];
const json = (value: unknown, status = 200, tenant = "mermaid") =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "X-Unboks-Tenant": tenant },
  });
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <IslunoCatalogGate legacy={<p>Original Mermaid editor</p>} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  setClientSlug("mermaid");
  setToken("fixture-token");
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith("/capabilities"))
        return json({
          enabled: true,
          tenant_slug: "mermaid",
          capabilities: { catalog_editor: true },
        });
      if (url.endsWith("/catalog") && init.method !== "PUT") return json(data);
      throw new Error("Unexpected external request");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("uses authenticated actual client callers, searches, edits and preserves source identity", async () => {
  mount();
  await screen.findByText("Fixture trip");
  fireEvent.change(screen.getByLabelText("Search products"), {
    target: { value: "nothing" },
  });
  expect(screen.getByText(/No products match/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search products"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByText("Fixture trip"));
  fireEvent.change(screen.getByLabelText("Product name"), {
    target: { value: "Edited trip" },
  });
  vi.mocked(fetch).mockImplementationOnce(async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return json({
      ...data,
      revision: "b".repeat(64),
      catalog: {
        ...data.catalog,
        products: [{ ...data.catalog.products[0], name: "Edited trip" }],
      },
    });
  });
  fireEvent.click(screen.getByText("Publish changes"));
  await screen.findByText(/Published. New recommendations/);
  const request = requests.find((r) => r.init.method === "PUT")!;
  expect(request.url).toContain("/api/mermaid/dashboard/api/isluno/catalog");
  expect(request.init.headers).toMatchObject({
    Authorization: "Bearer fixture-token",
  });
  const body = JSON.parse(String(request.init.body));
  expect(body.expected_revision).toBe(data.revision);
  expect(body.changes[0].changes.name).toBe("Edited trip");
  expect(body.changes[0].changes.source).toBeUndefined();
});
it("keeps drafts on conflict and blocks repeated stale publication", async () => {
  mount();
  fireEvent.click(await screen.findByText("Fixture trip"));
  fireEvent.change(screen.getByLabelText("Product name"), {
    target: { value: "My draft" },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    json({ detail: { code: "catalog_conflict" } }, 409),
  );
  fireEvent.click(screen.getByText("Publish changes"));
  await screen.findByText(/Another operator published/);
  expect(
    (screen.getByLabelText("Product name") as HTMLInputElement).value,
  ).toBe("My draft");
  expect(
    (screen.getByText("Publish changes") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByText("Load latest catalog")).toBeTruthy();
});
it("reorders and captions complete gallery records without changing imported identity", async () => {
  mount();
  fireEvent.click(await screen.findByText("Fixture trip"));
  fireEvent.click(screen.getByText("Gallery"));
  fireEvent.click(screen.getByLabelText("Move photo 2 up"));
  expect(
    (screen.getByLabelText("Photo 1 caption") as HTMLInputElement).value,
  ).toBe("Image 1");
  fireEvent.change(screen.getByLabelText("Photo 1 caption"), {
    target: { value: "New caption" },
  });
  let sent: unknown;
  vi.mocked(fetch).mockImplementationOnce(async (_, init) => {
    sent = JSON.parse(String(init?.body));
    return json(data);
  });
  fireEvent.click(screen.getByText("Publish changes"));
  await screen.findByText(/Published./);
  expect(sent).toMatchObject({
    changes: [
      {
        changes: {
          gallery: [
            {
              id: "image-1",
              order: 0,
              caption: "New caption",
              source_url: "https://example.invalid/image",
            },
            { id: "image-0", order: 1 },
          ],
        },
      },
    ],
  });
});
it("shows server validation detail and retains unsaved fields", async () => {
  mount();
  fireEvent.click(await screen.findByText("Fixture trip"));
  fireEvent.change(screen.getByLabelText("Product name"), {
    target: { value: "" },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    json({ detail: { code: "invalid_catalog", message: "product name" } }, 422),
  );
  fireEvent.click(screen.getByText("Publish changes"));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "product name",
  );
});
it("exposes loading and retryable error states", async () => {
  let resolve!: (r: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  mount();
  expect(screen.getByRole("status").textContent).toContain("Loading");
  await act(async () => resolve(json({}, 503)));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});
it("retains legacy editor when capability is disabled without reading Isluno products", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    json({
      enabled: false,
      tenant_slug: "mermaid",
      capabilities: { catalog_editor: false },
    }),
  );
  mount();
  expect(await screen.findByText("Original Mermaid editor")).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects a response from a different tenant", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    json(
      {
        enabled: true,
        tenant_slug: "other",
        capabilities: { catalog_editor: true },
      },
      200,
      "other",
    ),
  );
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Fixture trip")).toBeNull();
});
