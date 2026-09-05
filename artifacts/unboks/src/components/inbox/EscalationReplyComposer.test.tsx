import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EscalationReplyComposer } from "./EscalationReplyComposer";

describe("escalation delivery confirmation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    localStorage.setItem("wtyj_token_mermaid", "synthetic-test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders Mermaid-specific guidance and examples in the actual conversation composer", () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><EscalationReplyComposer conversationDbId="test" conversationId="guest" mode="soft" channel="WhatsApp" onDone={vi.fn()} /></QueryClientProvider>);
    expect(screen.getByText("Guidance for TRACY")).toBeTruthy();
    expect(screen.getByText("Tell TRACY what the Mermaid crew has confirmed. TRACY uses your guidance to reply to the guest.")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).placeholder).toContain("crew");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).placeholder).not.toMatch(/Sunday|08:00|phone number/);
    expect(screen.getByRole("button", { name: "Send guidance to TRACY without resolving" })).toBeTruthy();
    expect(screen.getAllByText("Take over & reply to guest")).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  function composer(mode: "soft" | "hard", contentRevision = 1) {
    const onDone = vi.fn();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <EscalationReplyComposer
          conversationDbId="test"
          conversationId="guest"
          mode={mode}
          channel="WhatsApp"
          contentRevision={contentRevision}
          onDone={onDone}
        />
      </QueryClientProvider>,
    );
    const draft = screen.getByRole("textbox");
    fireEvent.change(draft, { target: { value: "Synthetic test message" } });
    fireEvent.click(
      screen.getByRole("button", {
        name:
          mode === "soft"
            ? "Send guidance and mark resolved"
            : "Reply to guest and mark resolved",
      }),
    );
    return { draft: draft as HTMLTextAreaElement, onDone };
  }

  it.each(["soft", "hard"] as const)(
    "keeps %s draft and never resolves after lost delivery confirmation",
    async (mode) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              { id: "test", mode, status: "sent", content_revision: 1 },
            ]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: "Lost confirmation" }), {
            status: 502,
          }),
        );
      const { draft, onDone } = composer(mode);
      await waitFor(() =>
        expect(screen.getByRole("status").textContent).toMatch(
          /delivery.*is not confirmed/,
        ),
      );
      expect(screen.getByRole("status").textContent).not.toContain(
        "was not delivered",
      );
      expect(draft.value).toBe("Synthetic test message");
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(onDone).not.toHaveBeenCalled();
    },
  );

  it.each(["soft", "hard"] as const)(
    "clears a confirmed %s send even if subsequent resolution loses its response",
    async (mode) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              { id: "test", mode, status: "sent", content_revision: 7 },
            ]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ detail: "Lost resolution confirmation" }),
            { status: 502 },
          ),
        );
      const { draft, onDone } = composer(mode, 7);
      await waitFor(() =>
        expect(screen.getByRole("status").textContent).toContain(
          "resolution is not confirmed",
        ),
      );
      expect(screen.getByRole("status").textContent).toContain(
        mode === "soft" ? "Guidance sent to TRACY" : "Message sent",
      );
      expect(draft.value).toBe("");
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(
        JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))
          .content_revision,
      ).toBe(7);
      expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain("/resolve");
      expect(onDone).not.toHaveBeenCalled();
    },
  );

  it("keeps the draft and sends nothing when the guest message revision changed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: "test", mode: "soft", status: "sent", content_revision: 8 },
        ]),
        { status: 200 },
      ),
    );
    const { draft, onDone } = composer("soft", 7);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "This case changed while you were writing",
      ),
    );
    expect(draft.value).toBe("Synthetic test message");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("restores the original revision when undo restores an older Agent edit", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "Edited at revision one" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: "test", mode: "hard", status: "sent", content_revision: 2 },
          ]),
          { status: 200 },
        ),
      );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onDone = vi.fn();
    const ui = (contentRevision: number) => (
      <QueryClientProvider client={client}>
        <EscalationReplyComposer
          conversationDbId="test"
          conversationId="guest"
          mode="hard"
          channel="WhatsApp"
          contentRevision={contentRevision}
          onDone={onDone}
        />
      </QueryClientProvider>
    );
    const view = render(ui(1));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Original revision-one answer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open TRACY Editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByText("Edited at revision one");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    view.rerender(ui(2));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "New revision-two draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Original revision-one answer",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reply to guest without resolving" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "This case changed while you were writing",
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("keeps an image-only draft pinned to the revision where the image was selected", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "media-one",
              knowledge_id: "knowledge-one",
              caption: "Deck photo",
              url: "https://example.invalid/deck.jpg",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: "test", mode: "hard", status: "sent", content_revision: 2 },
          ]),
          { status: 200 },
        ),
      );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onDone = vi.fn();
    const ui = (contentRevision: number) => (
      <QueryClientProvider client={client}>
        <EscalationReplyComposer
          conversationDbId="test"
          conversationId="guest"
          mode="hard"
          channel="WhatsApp"
          contentRevision={contentRevision}
          onDone={onDone}
        />
      </QueryClientProvider>
    );
    const view = render(ui(1));
    fireEvent.click(screen.getByRole("button", { name: "Attach image" }));
    fireEvent.click(await screen.findByRole("button", { name: /Deck photo/ }));
    const draft = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(draft, { target: { value: "Temporary caption" } });
    fireEvent.change(draft, { target: { value: "" } });

    view.rerender(ui(2));
    fireEvent.click(
      screen.getByRole("button", { name: "Reply to guest without resolving" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "This case changed while you were writing",
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onDone).not.toHaveBeenCalled();
  });
});
