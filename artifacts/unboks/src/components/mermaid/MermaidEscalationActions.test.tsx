import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MermaidAttentionIssue } from "@/lib/mermaid-attention";
import { MermaidEscalationActions } from "./MermaidEscalationActions";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  guidance: vi.fn(),
  reply: vi.fn(),
  takeover: vi.fn(),
  handback: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchEscalations: api.list,
  submitGuidance: api.guidance,
  replyEscalation: api.reply,
  takeoverEscalation: api.takeover,
  handbackEscalation: api.handback,
  resolveEscalation: api.resolve,
}));
vi.mock("@/lib/tenant", () => ({
  getClientSlug: () => "mermaid",
  getApiBase: () => "",
}));

const issue: MermaidAttentionIssue = {
  id: "42",
  mode: "soft",
  reason: "Pickup",
  context: "",
  decision: "",
  createdAt: null,
};
const row = {
  id: "42",
  mode: "soft",
  phone: "synthetic-guest",
  status: "sent",
};
function setup(mode: "soft" | "hard" | null = "soft") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ui = (value: typeof mode) => (
    <QueryClientProvider client={client}>
      <MermaidEscalationActions
        issue={{ ...issue, mode: value }}
        channel="WhatsApp"
      />
    </QueryClientProvider>
  );
  const view = render(ui(mode));
  return { ...view, mode: (value: typeof mode) => view.rerender(ui(value)) };
}
const type = (value: string) =>
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });

describe("Mermaid HO actions", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.list.mockResolvedValue([row]);
    api.guidance.mockResolvedValue({ ok: true });
    api.reply.mockResolvedValue({ ok: true });
    api.takeover.mockResolvedValue({ mode: "hard" });
    api.handback.mockResolvedValue({ mode: "soft" });
    api.resolve.mockResolvedValue({ ok: true });
  });
  it("routes internal guidance to TRACY, never direct reply, and does not auto-resolve", async () => {
    setup();
    type("Confirm pickup at 07:00");
    fireEvent.click(
      screen.getByRole("button", { name: "Send guidance to TRACY" }),
    );
    await screen.findByText(/TRACY’s reply was sent/);
    expect(api.guidance).toHaveBeenCalledWith("42", {
      guidance: "Confirm pickup at 07:00",
    });
    expect(api.reply).not.toHaveBeenCalled();
    expect(api.resolve).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });
  it("requires confirmed hard mode before a verbatim guest reply and keeps drafts separate", async () => {
    const view = setup();
    type("Internal note: ask the driver first");
    fireEvent.click(
      screen.getByRole("button", { name: "Take over & reply myself" }),
    );
    await waitFor(() =>
      expect(api.takeover).toHaveBeenCalledWith("42", undefined),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("textbox") as HTMLTextAreaElement).disabled,
      ).toBe(false),
    );
    expect(
      screen.queryByRole("button", { name: "Send reply to guest" }),
    ).toBeNull();
    api.list.mockResolvedValue([{ ...row, mode: "hard" }]);
    view.mode("hard");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    type("We will collect you at 07:00.");
    fireEvent.click(
      screen.getByRole("button", { name: "Send reply to guest" }),
    );
    await screen.findByText(/Your reply was sent/);
    expect(api.reply).toHaveBeenCalledWith(
      "42",
      "We will collect you at 07:00.",
      undefined,
    );
    expect(api.guidance).not.toHaveBeenCalled();
    view.mode("soft");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Internal note: ask the driver first",
    );
  });
  it.each(["resolved", "mode-changed"])(
    "prevents a send after another HO changed the case (%s)",
    async (change) => {
      setup();
      type("Do not send stale guidance");
      api.list.mockResolvedValue([
        {
          ...row,
          ...(change === "resolved"
            ? { status: "resolved" }
            : { mode: "hard" }),
        },
      ]);
      fireEvent.click(
        screen.getByRole("button", { name: "Send guidance to TRACY" }),
      );
      await screen.findByRole("alert");
      expect(api.guidance).not.toHaveBeenCalled();
      expect(api.reply).not.toHaveBeenCalled();
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
        "Do not send stale guidance",
      );
    },
  );
  it("keeps a failed draft and retry payload identical without resolving", async () => {
    api.guidance.mockRejectedValueOnce(new Error("Delivery not confirmed"));
    setup();
    type("Keep this answer");
    fireEvent.click(
      screen.getByRole("button", { name: "Send guidance to TRACY" }),
    );
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(
        (screen.getByRole("textbox") as HTMLTextAreaElement).disabled,
      ).toBe(false),
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Keep this answer",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send guidance to TRACY" }),
    );
    await screen.findByText(/TRACY’s reply was sent/);
    expect(api.guidance.mock.calls[0]).toEqual(api.guidance.mock.calls[1]);
    expect(api.resolve).not.toHaveBeenCalled();
  });
  it("blocks duplicate clicks while the first send is pending", async () => {
    let done!: (result: { ok: boolean }) => void;
    api.guidance.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    setup();
    type("Only send once");
    const button = screen.getByRole("button", {
      name: "Send guidance to TRACY",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(api.guidance).toHaveBeenCalledTimes(1));
    await act(async () => done({ ok: true }));
  });
  it("resolves only on explicit action and does not send a message", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
    await screen.findByText("Escalation resolved.");
    expect(api.resolve).toHaveBeenCalledWith("42", {});
    expect(api.guidance).not.toHaveBeenCalled();
    expect(api.reply).not.toHaveBeenCalled();
  });
  it("does not resolve with unsent advice and does not send with unknown mode", () => {
    const view = setup();
    type("Unsent internal note");
    expect(
      (
        screen.getByRole("button", {
          name: "Mark resolved",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    view.mode(null);
    expect(
      (
        screen.getByRole("button", {
          name: "Send guidance to TRACY",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
