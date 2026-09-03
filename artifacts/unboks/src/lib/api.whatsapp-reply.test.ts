import { beforeEach, describe, expect, it, vi } from "vitest";

import { replyToWhatsAppConversation } from "@/lib/api";

describe("replyToWhatsAppConversation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    localStorage.setItem("wtyj_token_ali-car-rental", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            reply: "  exact\noperator text  ",
            channel: "whatsapp",
            role: "operator",
            delivery_mode: "free_text",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
  });

  it("posts once to the existing endpoint with the exact id and verbatim text", async () => {
    const exactText = "  exact\noperator text  ";

    await replyToWhatsAppConversation(" zernio-123 ", exactText);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain(
      "/api/ali-car-rental/dashboard/api/messages/whatsapp/reply",
    );
    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        conversation_id: "zernio-123",
        message: exactText,
      }),
    });
  });

  it("rejects empty and over-limit messages before any provider call", async () => {
    await expect(
      replyToWhatsAppConversation("zernio-123", "  \n "),
    ).rejects.toThrow("Message is required.");
    await expect(
      replyToWhatsAppConversation("zernio-123", "x".repeat(4097)),
    ).rejects.toThrow("WhatsApp messages cannot exceed 4096 characters.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes the caller's stable request_id without regenerating it", async () => {
    await replyToWhatsAppConversation(
      "zernio-123",
      "Hello",
      "send-attempt-123",
    );
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual(
      {
        conversation_id: "zernio-123",
        message: "Hello",
        request_id: "send-attempt-123",
      },
    );
  });
});
