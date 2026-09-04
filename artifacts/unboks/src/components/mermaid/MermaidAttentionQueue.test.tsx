import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MermaidAttentionCase } from "@/lib/mermaid-attention";
import {
  MermaidAttentionQueue,
  MermaidReservationAttention,
} from "./MermaidAttentionQueue";

const state = vi.hoisted(() => ({
  items: [] as MermaidAttentionCase[],
  complete: true,
  isLoading: false,
  refresh: vi.fn(),
}));
vi.mock("@/hooks/use-mermaid-attention", () => ({
  useMermaidAttention: () => state,
}));
vi.mock("@/hooks/use-client-api", () => ({
  useConversation: () => ({
    data: {
      messages: [
        {
          id: "1",
          role: "user",
          content: "Can my wheelchair fit in the pickup?",
          timestampMs: 1,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("./MermaidEscalationActions", () => ({
  MermaidEscalationActions: () => (
    <textarea aria-label="Your guidance to TRACY" />
  ),
}));

const item = (id: string): MermaidAttentionCase => ({
  key: id,
  conversationId: id,
  customerName: `Guest ${id}`,
  channel: "whatsapp",
  issues: [
    {
      id,
      mode: "soft",
      reason: "Accessible pickup needs crew confirmation",
      context: "",
      decision: "",
      createdAt: null,
    },
  ],
  fallbackReason: "",
  createdAt: null,
});

describe("Mermaid attention workspace", () => {
  beforeEach(() => {
    state.items = [];
    state.complete = true;
    state.isLoading = false;
    state.refresh.mockClear();
  });
  it("prefers TRACY's recorded triggering message and concise request", () => {
    const entry = item("a");
    entry.issues[0].customerMessage =
      "My partner needs help boarding. Can the crew help?";
    entry.issues[0].customerRequest = "Boarding assistance assessment";
    state.items = [entry];
    render(<MermaidAttentionQueue />);
    expect(
      screen.getByRole("button", { name: /Boarding assistance assessment/ }),
    ).toBeTruthy();
    expect(
      screen.getByText("My partner needs help boarding. Can the crew help?"),
    ).toBeTruthy();
    expect(
      screen.queryByText("Can my wheelchair fit in the pickup?"),
    ).toBeNull();
  });
  it("shows every case and its problem before opening, then exposes the composer in one click", () => {
    state.items = Array.from({ length: 10 }, (_, i) => item(String(i)));
    render(<MermaidAttentionQueue />);
    expect(
      screen.getByRole("heading", { name: "Needs your attention 10" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", {
        name: /Accessible pickup needs crew confirmation/,
      }),
    ).toHaveLength(10);
    expect(
      screen.getAllByText("Can my wheelchair fit in the pickup?"),
    ).toHaveLength(10);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Guest 9 / }));
    expect(
      screen.getByRole("textbox", { name: "Your guidance to TRACY" }),
    ).toBeTruthy();
  });
  it.each([true, false])(
    "never claims clear or zero while a source is loading or failed (%s)",
    (loading) => {
      state.complete = false;
      state.isLoading = loading;
      render(<MermaidAttentionQueue />);
      expect(
        screen.queryByText(
          "No unresolved escalations or reservation handovers.",
        ),
      ).toBeNull();
      expect(
        screen.getByRole("heading", { name: "Needs your attention —" }),
      ).toBeTruthy();
      expect(screen.getByRole("status")).toBeTruthy();
    },
  );
  it("only claims clear after every source succeeds", () => {
    render(<MermaidAttentionQueue />);
    expect(
      screen.getByText("No unresolved escalations or reservation handovers."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh queue" }));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("keeps a partial count explicitly partial", () => {
    state.complete = false;
    state.items = [item("a")];
    render(<MermaidAttentionQueue />);
    expect(
      screen.getByRole("heading", { name: "Needs your attention 1+" }),
    ).toBeTruthy();
  });
  it("opens the matching reservation's problem and composer immediately", () => {
    state.items = [item("a"), item("b")];
    render(<MermaidReservationAttention conversationId="b" />);
    expect(screen.getByText("Guest b")).toBeTruthy();
    expect(screen.queryByText("Guest a")).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
  it("preserves a draft when the operator collapses and reopens the same case", () => {
    state.items = [item("a")];
    render(<MermaidAttentionQueue />);
    fireEvent.click(screen.getByRole("button", { name: /Guest a / }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Check vehicle 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Guest a / }));
    fireEvent.click(screen.getByRole("button", { name: /Guest a / }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Check vehicle 2",
    );
  });
});
