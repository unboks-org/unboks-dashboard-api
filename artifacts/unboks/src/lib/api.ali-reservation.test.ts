import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmAliReservation,
  decideAliReservationAvailability,
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
});
