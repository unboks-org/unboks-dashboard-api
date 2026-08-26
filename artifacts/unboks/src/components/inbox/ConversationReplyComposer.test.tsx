import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationReplyComposer } from "@/components/inbox/ConversationReplyComposer";
import { replyToWhatsAppConversation } from "@/lib/api";
import { ApiError } from "@/lib/error";

vi.mock("@/lib/api", () => ({
  replyToWhatsAppConversation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function useTenant(slug: string) {
  localStorage.clear();
  localStorage.setItem("wtyj_client", slug);
  localStorage.setItem(`wtyj_token_${slug}`, "test-token");
}

function successfulReply() {
  return {
    ok: true,
    reply: "sent",
    channel: "whatsapp" as const,
    role: "operator" as const,
    delivery_mode: "free_text" as const,
  };
}

describe("ConversationReplyComposer", () => {
  beforeEach(() => {
    vi.mocked(replyToWhatsAppConversation).mockReset();
    useTenant("ali-car-rental");
  });

  it("renders approved English for Ali and unchanged Spanish for Clínica", () => {
    const { unmount } = render(<ConversationReplyComposer conversationId="ali-1" />);
    expect(screen.getByPlaceholderText("Type a message…")).toBeTruthy();
    expect(screen.getByText("Enter to send · Shift+Enter for a new line")).toBeTruthy();
    unmount();

    useTenant("consulta-despertares");
    render(<ConversationReplyComposer conversationId="clinic-1" />);
    expect(screen.getByPlaceholderText("Escribe un mensaje…")).toBeTruthy();
    expect(screen.getByText("Enter para enviar · Mayús+Enter para una nueva línea")).toBeTruthy();
  });

  it("sends exact text once, clears after success, and refreshes the thread", async () => {
    const onSent = vi.fn();
    vi.mocked(replyToWhatsAppConversation).mockResolvedValue(successfulReply());
    render(<ConversationReplyComposer conversationId="zernio-42" onSent={onSent} />);
    const textarea = screen.getByLabelText("Message for the customer");
    const exactText = "  Hello Carlos\nSecond line  ";
    fireEvent.change(textarea, { target: { value: exactText } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(replyToWhatsAppConversation).toHaveBeenCalledTimes(1);
      expect(replyToWhatsAppConversation).toHaveBeenCalledWith("zernio-42", exactText);
      expect(onSent).toHaveBeenCalledTimes(1);
      expect((textarea as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("retains the draft and explains Ali's closed 24-hour window", async () => {
    vi.mocked(replyToWhatsAppConversation).mockRejectedValue(
      new ApiError(409, "Backend-localized message"),
    );
    render(<ConversationReplyComposer conversationId="zernio-42" />);
    const textarea = screen.getByLabelText("Message for the customer");
    fireEvent.change(textarea, { target: { value: "Please call us" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No message was sent. More than 24 hours have passed",
    );
    expect((textarea as HTMLTextAreaElement).value).toBe("Please call us");
    expect(replyToWhatsAppConversation).toHaveBeenCalledTimes(1);
  });

  it("keeps Clínica's provider error experience unchanged", async () => {
    useTenant("consulta-despertares");
    vi.mocked(replyToWhatsAppConversation).mockRejectedValue(
      new ApiError(409, "La ventana de 24 horas está cerrada."),
    );
    render(<ConversationReplyComposer conversationId="clinic-1" />);
    const textarea = screen.getByLabelText("Mensaje para el prospecto");
    fireEvent.change(textarea, { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "La ventana de 24 horas está cerrada.",
    );
    expect((textarea as HTMLTextAreaElement).value).toBe("Hola");
  });

  it("prevents rapid duplicate sends before React commits the pending state", async () => {
    let resolveDelivery: ((value: ReturnType<typeof successfulReply>) => void) | undefined;
    vi.mocked(replyToWhatsAppConversation).mockImplementation(() => new Promise((resolve) => {
      resolveDelivery = resolve;
    }));
    render(<ConversationReplyComposer conversationId="zernio-42" />);
    const textarea = screen.getByLabelText("Message for the customer");
    fireEvent.change(textarea, { target: { value: "One message" } });

    fireEvent.submit(screen.getByRole("form", { name: "Reply on WhatsApp" }));
    fireEvent.submit(screen.getByRole("form", { name: "Reply on WhatsApp" }));
    expect(replyToWhatsAppConversation).toHaveBeenCalledTimes(1);

    resolveDelivery?.(successfulReply());
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe(""));
  });

  it("uses Enter to send and Shift+Enter to keep composing", async () => {
    vi.mocked(replyToWhatsAppConversation).mockResolvedValue(successfulReply());
    render(<ConversationReplyComposer conversationId="zernio-42" />);
    const textarea = screen.getByLabelText("Message for the customer");
    fireEvent.change(textarea, { target: { value: "First line" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(replyToWhatsAppConversation).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(replyToWhatsAppConversation).toHaveBeenCalledTimes(1));
  });
});
