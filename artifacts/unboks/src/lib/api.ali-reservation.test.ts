import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmAliReservation,
  decideAliReservationAvailability,
  fetchAliDocumentBlob,
  recordAliPickupInspection,
  requestAliDocumentReplacement,
  updateAliReservationChecklist,
} from "@/lib/api";

describe("Ali post-quote reservation API", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    localStorage.setItem("wtyj_token_ali-car-rental", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      public_id: "AR-TEST-1",
      revision: 4,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
  });

  it("sends availability decisions with optimistic concurrency", async () => {
    await decideAliReservationAvailability("AR test/1", "approve", 3);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/api/ali-car-rental/dashboard/api/ali-reservations/AR%20test%2F1/availability-decision",
    );
    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({ decision: "approve", expectedRevision: 3 }),
    });
  });

  it("updates one explicit checklist field", async () => {
    await updateAliReservationChecklist("AR-TEST-1", "payment", "verified", 4);

    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(request).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ payment: "verified", expectedRevision: 4 }),
    });
  });

  it("confirms only the selected revision", async () => {
    await confirmAliReservation("AR-TEST-1", 5);

    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/api/ali-car-rental/dashboard/api/ali-reservations/AR-TEST-1/confirm",
    );
    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({ expectedRevision: 5 }),
    });
  });
  it("requests a fresh replacement link with optimistic concurrency", async () => {
    await requestAliDocumentReplacement("AR-TEST-1", "doc/1", 6);

    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/ali-reservations/AR-TEST-1/documents/doc%2F1/request-replacement",
    );
    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({ expectedRevision: 6 }),
    });
  });

  it("records pickup inspections without a second workflow", async () => {
    await recordAliPickupInspection("AR-TEST-1", "identity", 8);

    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/ali-reservations/AR-TEST-1/pickup-inspection",
    );
    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({ item: "identity", expectedRevision: 8 }),
    });
  });

  it("loads image or PDF document bytes once and never retries private content", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );

    const blob = await fetchAliDocumentBlob("AR-TEST-1", "doc-1");

    expect(blob.type).toBe("application/pdf");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(request).toMatchObject({
      cache: "no-store",
      headers: expect.objectContaining({
        Authorization: "Bearer test-token",
        "Cache-Control": "no-cache",
      }),
    });
  });
});
