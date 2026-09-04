import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BottomNav } from "@/components/inbox/BottomNav";
import { EXTERNAL_ROUTES } from "@/components/inbox/DashboardShell";
import { Drawer } from "@/components/inbox/Drawer";

const { agentQuery, mutateAgent } = vi.hoisted(() => ({
  agentQuery: {
    data: { available: false, active: null } as {
      available: boolean;
      active: boolean | null;
    },
    isLoading: false,
    isError: false,
  },
  mutateAgent: vi.fn(),
}));

vi.mock("@/hooks/use-icp-channel-visibility", () => ({
  useIcpChannelVisibility: () => ({
    isChannelVisible: () => false,
    bridgeUnavailable: false,
    bridgeUnavailableReason: "",
    retry: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-bookings-label", () => ({
  useBookingsLabel: () => ({ label: "Bookings" }),
}));

vi.mock("@/hooks/use-client-profile", () => ({
  useClientProfile: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-agent-status", () => ({
  useAgentStatus: () => agentQuery,
  useSetAgentStatus: () => ({ isPending: false, mutate: mutateAgent }),
}));

const channelCounts = {
  All: 0,
  WhatsApp: 0,
  Email: 0,
  Instagram: 0,
  Facebook: 0,
  Messenger: 0,
  Telegram: 0,
  TikTok: 0,
  X: 0,
  Unknown: 0,
};

describe("Ali rental navigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    agentQuery.data = { available: false, active: null };
    agentQuery.isError = false;
    mutateAgent.mockReset();
  });

  it("shows a direct Rental entry in the desktop workspace navigation", () => {
    const onSelect = vi.fn();
    render(
      <Drawer
        open
        onClose={vi.fn()}
        active="settings"
        onSelect={onSelect}
        inboxCount={0}
        escalationsCount={0}
        channelCounts={channelCounts}
      />,
    );

    const rentalButtons = screen.getAllByRole("button", { name: "Rental" });
    expect(rentalButtons).toHaveLength(2);
    fireEvent.click(rentalButtons[0]);
    expect(onSelect).toHaveBeenCalledWith("rental");
  });

  it("shows a direct Rental entry in Ali mobile navigation", () => {
    const onChange = vi.fn();
    render(<BottomNav active="settings" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Rental" }));
    expect(onChange).toHaveBeenCalledWith("rental");
  });

  it("does not expose Ali rental navigation to another tenant", () => {
    sessionStorage.setItem("unboks_active_tenant", "consulta-despertares");
    render(<BottomNav active="settings" onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Rental" })).toBeNull();
  });

  it("routes Rental to a distinct protected page instead of Settings", () => {
    expect(EXTERNAL_ROUTES.rental).toBe("/rental");
    expect(EXTERNAL_ROUTES.rental).not.toContain("settings");
  });

  it.each([
    ["unknown nullable status", { available: true, active: null }, false],
    ["failed refetch", { available: true, active: true }, true],
  ])("keeps generic drawer controls disabled for %s", (_name, data, isError) => {
    agentQuery.data = data;
    agentQuery.isError = isError;
    render(
      <Drawer
        open
        onClose={vi.fn()}
        active="settings"
        onSelect={vi.fn()}
        inboxCount={0}
        escalationsCount={0}
        channelCounts={channelCounts}
      />,
    );

    expect(screen.getAllByText("Agent unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("Agent paused")).toBeNull();
    for (const control of screen.getAllByRole("button", { name: "Start agent" })) {
      expect((control as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(control);
    }
    expect(mutateAgent).not.toHaveBeenCalled();
  });
});
