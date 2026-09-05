import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EscalationModeToggle } from "@/pages/Inbox";

const api = vi.hoisted(() => ({ setMode: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  setEscalationMode: api.setMode,
}));

function Harness() {
  const [mode, setMode] = useState<"soft" | "hard">("soft");
  return (
    <EscalationModeToggle
      conversationDbId="esc-42"
      contentRevision={4}
      selectedMode={mode}
      onChange={setMode}
    />
  );
}

describe("Escalation mode revision guard", () => {
  beforeEach(() => {
    api.setMode.mockReset();
    vi.stubGlobal("scrollTo", vi.fn());
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    localStorage.setItem("wtyj_token_mermaid", "synthetic-test-token");
  });

  it("rolls back an optimistic pause when the exact revision is rejected", async () => {
    api.setMode.mockRejectedValueOnce(new Error("Stale escalation revision"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Human takeover" }));
    await screen.findByText(/mode change was not saved/i);
    expect(api.setMode).toHaveBeenCalledWith("esc-42", "hard", 4);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "TRACY needs the crew" }).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true"),
    );
    expect(
      screen.getByRole("button", { name: "Human takeover" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });
});
