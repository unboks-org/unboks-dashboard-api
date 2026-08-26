import { beforeEach, describe, expect, it, vi } from "vitest";

import { replyToWhatsAppConversation } from "@/lib/api";

describe("replyToWhatsAppConversation", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("wtyj_client", "ali-car-rental");
    localStorage.setItem("wtyj_token_ali-car-rental", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      reply: "  exact\noperator text  ",
      channel: "whatsapp",
      role: "operator",
      delivery_mode: "free_text",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
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
    await expect(replyToWhatsAppConversation("zernio-123", "  \n ")).rejects.toThrow(
      "Message is required.",
    );
    await expect(replyToWhatsAppConversation("zernio-123", "x".repeat(4097))).rejects.toThrow(
      "WhatsApp messages cannot exceed 4096 characters.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
