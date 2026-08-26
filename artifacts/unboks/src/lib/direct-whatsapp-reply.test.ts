import { beforeEach, describe, expect, it } from "vitest";

import {
  canShowDirectWhatsAppReply,
  directReplyCopy,
  quoteLeadConversationUrl,
} from "@/lib/direct-whatsapp-reply";

describe("direct WhatsApp reply tenant boundary", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("enables active WhatsApp replies for Ali and Clínica only", () => {
    const activeWhatsApp = {
      channel: "WhatsApp",
      archived: false,
      resolved: false,
    };

    expect(canShowDirectWhatsAppReply(activeWhatsApp, "ali-car-rental")).toBe(true);
    expect(canShowDirectWhatsAppReply(activeWhatsApp, "consulta-despertares")).toBe(true);
    expect(canShowDirectWhatsAppReply(activeWhatsApp, "unboks")).toBe(false);
  });

  it("never enables replies for email, archived, or resolved conversations", () => {
    expect(canShowDirectWhatsAppReply({
      channel: "email",
      archived: false,
      resolved: false,
    }, "ali-car-rental")).toBe(false);
    expect(canShowDirectWhatsAppReply({
      channel: "whatsapp",
      archived: true,
      resolved: false,
    }, "ali-car-rental")).toBe(false);
    expect(canShowDirectWhatsAppReply({
      channel: "whatsapp",
      archived: false,
      resolved: true,
    }, "ali-car-rental")).toBe(false);
  });

  it("keeps the approved Ali English and Clínica Spanish copy", () => {
    expect(directReplyCopy("ali-car-rental")).toMatchObject({
      placeholder: "Type a message…",
      send: "Send",
      sending: "Sending…",
      hint: "Enter to send · Shift+Enter for a new line",
      delivered: "Message delivered on WhatsApp.",
    });
    expect(directReplyCopy("consulta-despertares")).toMatchObject({
      placeholder: "Escribe un mensaje…",
      send: "Enviar",
      sending: "Enviando…",
      hint: "Enter para enviar · Mayús+Enter para una nueva línea",
      delivered: "Mensaje entregado a WhatsApp.",
    });
  });

  it("deep-links Quote Leads using the exact conversation id", () => {
    expect(quoteLeadConversationUrl("zernio/conversation + 42")).toBe(
      "/?c=zernio%2Fconversation%20%2B%2042&from=follow-ups",
    );
  });
});
