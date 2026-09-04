import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiConversation, MermaidReservationSummary } from "@/lib/api";
import MermaidToday from "./MermaidToday";

const state = vi.hoisted(() => ({
  reservations: undefined as MermaidReservationSummary[] | undefined,
  conversations: undefined as ApiConversation[] | undefined,
  reservationError: false,
  conversationError: false,
}));

vi.mock("@/components/inbox/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: state.reservations,
    isLoading: false,
    isError: state.reservationError,
  }),
}));
vi.mock("@/hooks/use-client-api", () => ({
  useEscalations: () => ({ data: [], isLoading: false, isError: false }),
  useConversation: () => ({
    data: { messages: [] },
    isLoading: false,
    isError: false,
  }),
  useConversations: () => ({
    data: state.conversations,
    isLoading: false,
    isError: state.conversationError,
  }),
}));
vi.mock("@/hooks/use-hidden-conversations", () => ({
  collectConversationHideKeys: (row: { id: string }) => [row.id],
  useHiddenConversations: () => ({
    isHidden: (keys: string[]) => keys.includes("hidden-guest"),
  }),
}));
vi.mock("@/hooks/use-blocked-senders", () => ({
  useBlockedLookup: () => ({
    isBlocked: (keys: string[]) => keys.includes("blocked-guest"),
  }),
}));

describe("Mermaid Today", () => {
  beforeEach(() => {
    state.reservations = [];
    state.conversations = [];
    state.reservationError = false;
    state.conversationError = false;
  });

  it("shows a truthful empty state when both live sources return no rows", () => {
    render(<MermaidToday />);
    expect(
      screen.getByText(
        "No unacknowledged crew notes, escalations or reservation handovers.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Ready for the first journey")).toBeTruthy();
  });

  it("does not report a healthy empty queue or zero when services are unavailable", () => {
    state.reservations = undefined;
    state.conversations = undefined;
    state.reservationError = true;
    state.conversationError = true;
    render(<MermaidToday />);

    expect(screen.getByText(/Queue status is incomplete/)).toBeTruthy();
    expect(
      screen.queryByText(
        "No unacknowledged crew notes, escalations or reservation handovers.",
      ),
    ).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("respects the same hidden and blocked chat filters as the inbox", () => {
    state.conversations = [
      {
        phone: "visible-guest",
        name: "Visible guest",
        unread: true,
        escalated: true,
      },
      {
        phone: "hidden-guest",
        name: "Hidden guest",
        unread: true,
        escalated: true,
      },
      {
        phone: "blocked-guest",
        name: "Blocked guest",
        unread: true,
        escalated: true,
      },
    ];
    render(<MermaidToday />);

    expect(screen.getByText("Visible guest")).toBeTruthy();
    expect(screen.queryByText("Hidden guest")).toBeNull();
    expect(screen.queryByText("Blocked guest")).toBeNull();
  });
});
