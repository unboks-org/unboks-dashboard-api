import { isAliRentalTenant, isSpainSpanishTenant } from "@/lib/tenant-ui";

export interface DirectReplyContext {
  channel: string;
  archived: boolean;
  resolved: boolean;
}

export interface DirectReplyCopy {
  formLabel: string;
  messageLabel: string;
  placeholder: string;
  send: string;
  sending: string;
  hint: string;
  delivered: string;
  genericError: string;
  windowClosedError: string;
  templateDelivered: string;
}

const ENGLISH_COPY: DirectReplyCopy = {
  formLabel: "Reply on WhatsApp",
  messageLabel: "Message for the customer",
  placeholder: "Type a message…",
  send: "Send",
  sending: "Sending…",
  hint: "Enter to send · Shift+Enter for a new line",
  delivered: "Message delivered on WhatsApp.",
  genericError: "The message could not be sent. Please try again.",
  windowClosedError:
    "No message was sent. More than 24 hours have passed since the customer's " +
    "last message, so WhatsApp does not allow this free-text reply.",
  templateDelivered:
    "A follow-up template was sent. The free-text message was not sent; you can " +
    "write when the customer replies.",
};

const SPANISH_COPY: DirectReplyCopy = {
  formLabel: "Responder por WhatsApp",
  messageLabel: "Mensaje para el prospecto",
  placeholder: "Escribe un mensaje…",
  send: "Enviar",
  sending: "Enviando…",
  hint: "Enter para enviar · Mayús+Enter para una nueva línea",
  delivered: "Mensaje entregado a WhatsApp.",
  genericError: "No se pudo enviar el mensaje. Inténtalo de nuevo.",
  windowClosedError:
    "No se ha enviado ningún mensaje. Han pasado más de 24 horas desde el " +
    "último mensaje del contacto y WhatsApp no permite enviar este texto libre.",
  templateDelivered:
    "Plantilla de seguimiento enviada. El texto libre no se envió; podrás " +
    "escribir cuando el contacto responda.",
};

export function directReplyCopy(slug?: string): DirectReplyCopy {
  return isSpainSpanishTenant(slug) ? SPANISH_COPY : ENGLISH_COPY;
}

export function canShowDirectWhatsAppReply(
  context: DirectReplyContext,
  slug?: string,
): boolean {
  return (
    (isSpainSpanishTenant(slug) || isAliRentalTenant(slug)) &&
    context.channel.toLowerCase() === "whatsapp" &&
    !context.archived &&
    !context.resolved
  );
}

export function quoteLeadConversationUrl(conversationId: string): string {
  const base = isAliRentalTenant() ? "/conversations" : "/";
  return `${base}?c=${encodeURIComponent(conversationId)}&from=follow-ups`;
}
