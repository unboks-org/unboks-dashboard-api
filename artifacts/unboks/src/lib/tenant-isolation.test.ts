import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchConversations } from "@/lib/api";
import { tenantKey, tenantKeyFor, tenantPrefix } from "@/lib/query-keys";
import {
  captureTenantRequestScope,
  getClientSlug,
  setClientSlug,
  tenantStorageKey,
} from "@/lib/tenant";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class TabStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe("tenant isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    localStorage.setItem("wtyj_token_ali-car-rental", "ali-token");
    localStorage.setItem("wtyj_token_consulta-despertares", "clinic-token");
  });

  it("keeps the active tenant tab-local and ignores the retired global key", () => {
    localStorage.setItem("wtyj_client", "consulta-despertares");
    setClientSlug("ali-car-rental");
    expect(getClientSlug()).toBe("ali-car-rental");
    expect(localStorage.getItem("wtyj_client")).toBeNull();

    localStorage.setItem("wtyj_client", "consulta-despertares");
    expect(getClientSlug()).toBe("ali-car-rental");
  });

  it("allows Ali and Despertares tabs to remain active concurrently", () => {
    const originalSession = globalThis.sessionStorage;
    const aliTab = new TabStorage();
    const clinicTab = new TabStorage();
    try {
      Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: aliTab });
      setClientSlug("ali-car-rental");
      expect(captureTenantRequestScope()).toEqual({
        tenantSlug: "ali-car-rental",
        token: "ali-token",
      });

      Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: clinicTab });
      setClientSlug("consulta-despertares");
      expect(captureTenantRequestScope()).toEqual({
        tenantSlug: "consulta-despertares",
        token: "clinic-token",
      });

      Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: aliTab });
      expect(getClientSlug()).toBe("ali-car-rental");
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: originalSession,
      });
    }
  });

  it("captures an immutable tenant and token before an in-flight request", async () => {
    setClientSlug("ali-car-rental");
    const response = deferred<Response>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchConversations();
    setClientSlug("consulta-despertares");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/ali-car-rental/dashboard/api/");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ali-token");

    response.resolve(new Response("[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Unboks-Tenant": "ali-car-rental",
      },
    }));
    await expect(request).resolves.toEqual([]);
  });

  it("rejects a mismatched response before it can be cached", async () => {
    setClientSlug("ali-car-rental");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Unboks-Tenant": "consulta-despertares",
      },
    })));

    await expect(fetchConversations()).rejects.toThrow("Workspace response rejected");
  });

  it("does not let a late old-tenant 401 clear the active tenant", async () => {
    setClientSlug("ali-car-rental");
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));

    const request = fetchConversations();
    setClientSlug("consulta-despertares");
    response.resolve(new Response(JSON.stringify({ detail: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(request).rejects.toThrow("Unauthorized");
    expect(localStorage.getItem("wtyj_token_ali-car-rental")).toBe("ali-token");
    expect(localStorage.getItem("wtyj_token_consulta-despertares")).toBe("clinic-token");
    expect(getClientSlug()).toBe("consulta-despertares");
  });

  it("keeps late query results in the old namespace", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setClientSlug("ali-car-rental");
    const old = deferred<string[]>();
    const oldRequest = client.fetchQuery({
      queryKey: tenantKey("conversations"),
      queryFn: () => old.promise,
    });

    setClientSlug("consulta-despertares");
    await client.fetchQuery({
      queryKey: tenantKey("conversations"),
      queryFn: async () => ["clinic-row"],
    });
    old.resolve(["ali-row"]);
    await oldRequest;

    expect(client.getQueryData(tenantKeyFor("ali-car-rental", "conversations")))
      .toEqual(["ali-row"]);
    expect(client.getQueryData(tenantKeyFor("consulta-despertares", "conversations")))
      .toEqual(["clinic-row"]);

    client.removeQueries({ queryKey: tenantPrefix("ali-car-rental") });
    expect(client.getQueryData(tenantKeyFor("ali-car-rental", "conversations")))
      .toBeUndefined();
    expect(client.getQueryData(tenantKeyFor("consulta-despertares", "conversations")))
      .toEqual(["clinic-row"]);
  });

  it("tenant-scopes browser overlays and fails closed on corrupt active state", () => {
    expect(tenantStorageKey("hidden-conversations", "ali-car-rental"))
      .toBe("unboks:ali-car-rental:hidden-conversations");
    expect(tenantStorageKey("hidden-conversations", "consulta-despertares"))
      .not.toBe(tenantStorageKey("hidden-conversations", "ali-car-rental"));

    sessionStorage.setItem("unboks_active_tenant", "../not-valid");
    expect(getClientSlug()).toBe("");
    expect(captureTenantRequestScope()).toEqual({ tenantSlug: "", token: null });
  });
});
