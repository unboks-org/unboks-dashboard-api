import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/error";
import {
  deleteEscalation,
  handbackEscalation,
  replyEscalation,
  replyToWhatsAppConversation,
  resolveEscalation,
  setEscalationMode,
  submitGuidance,
  takeoverEscalation,
  unresolveEscalation,
} from "@/lib/api";

function tenant(slug: string) {
  sessionStorage.setItem("unboks_active_tenant", slug);
  localStorage.setItem(`wtyj_token_${slug}`, "test-token");
}
const ok = () =>
  new Response(JSON.stringify({ ok: true, delivery_mode: "free_text" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const bodyAt = (index: number) =>
  JSON.parse(String(vi.mocked(fetch).mock.calls[index][1]?.body));
const sends = [
  [
    "inbox reply",
    () => replyToWhatsAppConversation("guest-1", "  Hello\nexact  "),
    { conversation_id: "guest-1", message: "  Hello\nexact  " },
  ],
  [
    "escalation reply with image",
    () => replyEscalation("esc-1", "Hello", "image-1"),
    { message: "Hello", mediaId: "image-1", content_revision: 1 },
  ],
  [
    "guidance with image",
    () =>
      submitGuidance("esc-1", {
        guidance: "Confirm pickup",
        mediaId: "image-1",
      }),
    { guidance: "Confirm pickup", mediaId: "image-1" },
  ],
] as const;

describe("durable operator request identities", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    tenant("mermaid");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ok()),
    );
  });

  it.each(sends)(
    "retains %s across a lost response, then resets only after success",
    async (_label, send, payload) => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Load failed"));
      await expect(send()).rejects.toBeInstanceOf(ApiError);
      const first = bodyAt(0);
      expect(first).toMatchObject(payload);
      expect(first.request_id).toMatch(/^[\da-f-]{36}$/i);
      await send();
      expect(bodyAt(1)).toEqual(first);
      await send();
      expect(bodyAt(2).request_id).not.toBe(first.request_id);
    },
  );

  it("rehydrates the wire identity even if a remounted composer proposes a new ID", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Lost response"));
    await expect(
      replyToWhatsAppConversation("guest", "hello", "first-id"),
    ).rejects.toThrow();
    await replyToWhatsAppConversation("guest", "hello", "new-component-id");
    expect(bodyAt(1).request_id).toBe("first-id");
  });

  it("sends the exact escalation content revision shown to the operator", async () => {
    await replyEscalation("esc-9", "Current answer", undefined, undefined, 9);
    expect(bodyAt(0)).toMatchObject({
      message: "Current answer",
      content_revision: 9,
    });
  });

  it("versions every escalation state mutation", async () => {
    await resolveEscalation("esc", { content_revision: 9 });
    await takeoverEscalation("esc", "Crew handling", 9);
    await handbackEscalation("esc", 9);
    await setEscalationMode("esc", "hard", 9);
    await unresolveEscalation("esc", 9);
    await deleteEscalation("esc", 9);
    expect(bodyAt(0)).toMatchObject({ content_revision: 9 });
    expect(bodyAt(1)).toMatchObject({
      note: "Crew handling",
      content_revision: 9,
    });
    expect(bodyAt(2)).toEqual({ content_revision: 9 });
    expect(bodyAt(3)).toEqual({ mode: "hard", content_revision: 9 });
    expect(bodyAt(4)).toEqual({ content_revision: 9 });
    expect(bodyAt(5)).toEqual({ content_revision: 9 });
  });

  it("retains the pending identity through a 401 and operator re-login", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Session expired" }), {
        status: 401,
      }),
    );
    await expect(replyEscalation("1", "hello")).rejects.toThrow();
    expect(localStorage.getItem("wtyj_token_mermaid")).toBeNull();
    tenant("mermaid");
    await replyEscalation("1", "hello");
    expect(bodyAt(1)).toEqual(bodyAt(0));
  });

  it.each([409, 502])(
    "retains the original request after HTTP %s",
    async (status) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Unconfirmed" }), { status }),
      );
      await expect(replyEscalation("1", "hello")).rejects.toThrow();
      await replyEscalation("1", "hello");
      expect(bodyAt(1)).toEqual(bodyAt(0));
    },
  );

  it("keeps failures separate by tenant, action, conversation, image and exact text", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Lost"));
    const calls = [
      () => replyEscalation("1", "hello", "image-1"),
      () => replyEscalation("2", "hello", "image-1"),
      () => replyEscalation("1", "hello!", "image-1"),
      () => replyEscalation("1", "hello", "image-2"),
      () => submitGuidance("1", { guidance: "hello", mediaId: "image-1" }),
    ];
    for (const send of calls) await expect(send()).rejects.toThrow();
    tenant("ali-car-rental");
    await expect(calls[0]()).rejects.toThrow();
    expect(
      new Set(vi.mocked(fetch).mock.calls.map((_, i) => bodyAt(i).request_id))
        .size,
    ).toBe(6);
    tenant("mermaid");
    await expect(calls[0]()).rejects.toThrow();
    expect(bodyAt(6).request_id).toBe(bodyAt(0).request_id);
  });

  it("stores no message text or conversation identifier in the retry record", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Lost"));
    await expect(
      replyEscalation("private-guest", "Private allergy message"),
    ).rejects.toThrow();
    const keys = Array.from(
      { length: sessionStorage.length },
      (_, i) => sessionStorage.key(i)!,
    ).filter((k) => k.startsWith("unboks:operator-request:"));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^unboks:operator-request:v1:[a-f0-9]{64}$/);
    expect(sessionStorage.getItem(keys[0])).toBe(bodyAt(0).request_id);
  });

  it("deduplicates concurrent submissions in the same tab", async () => {
    await Promise.all([
      replyEscalation("1", "hello"),
      replyEscalation("1", "hello"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not send if the retry identity cannot be persisted", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    await expect(replyEscalation("1", "hello")).rejects.toThrow(
      "Safe retry storage",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send into a different workspace after asynchronous preparation", async () => {
    const pending = replyEscalation("1", "hello");
    tenant("ali-car-rental");
    await expect(pending).rejects.toThrow("Workspace changed before sending");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains identity when a successful HTTP response has unreadable JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("lost JSON", { status: 200 }),
    );
    await expect(replyEscalation("1", "hello")).rejects.toThrow();
    await replyEscalation("1", "hello");
    expect(bodyAt(1)).toEqual(bodyAt(0));
  });

  it("does not treat an empty HTTP 204 as provider confirmation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(replyEscalation("1", "hello")).rejects.toThrow(
      "not confirmed",
    );
    await replyEscalation("1", "hello");
    expect(bodyAt(1)).toEqual(bodyAt(0));
  });

  it.each([{ ok: false }, {}, null])(
    "does not reset an identity for an unconfirmed HTTP 200 body: %s",
    async (body) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status: 200 }),
      );
      await expect(replyEscalation("1", "hello")).rejects.toThrow(
        "not confirmed",
      );
      await replyEscalation("1", "hello");
      expect(bodyAt(1)).toEqual(bodyAt(0));
    },
  );
});
