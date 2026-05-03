import { useState, useCallback } from "react";
import type { Channel } from "@/data/conversations";

export type NavFilter = "inbox" | "escalations" | "bookings" | "settings" | `channel:${Channel}`;

export function usePlatformFilter() {
  const [activeNav, setActiveNavState] = useState<NavFilter>("inbox");

  const setActiveNav = useCallback((id: NavFilter) => {
    setActiveNavState(id);
  }, []);

  const activeChannel: Channel | null = activeNav.startsWith("channel:")
    ? (activeNav.split(":")[1] as Channel)
    : null;

  return { activeNav, setActiveNav, activeChannel };
}
