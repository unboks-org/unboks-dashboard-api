/**
 * RefreshButton — manual "pull latest data now" control for the dashboard.
 *
 * Why this exists
 * ===============
 * Conversations, escalations, the open conversation detail, appointments
 * and tasks all poll on heartbeats (10s / 30s). When the operator wants
 * to confirm "is there anything new this second?" without waiting for the
 * next tick, this button refetches every dashboard query through React
 * Query — preserving the current page, the open conversation, the active
 * channel/escalation filter, the search box, and any settings drafts.
 *
 * Behaviour
 * =========
 *  - Click → invalidates every dashboard-related query key in parallel.
 *  - Disabled + spinner while in flight; re-enabled on success or error.
 *  - Success → "Updated just now", then transitions to "Last updated HH:MM"
 *    after one minute via a 60s ticker (only mounted when a timestamp exists).
 *  - Failure → calm "Could not refresh. Try again." inline message.
 *  - Mobile: collapses to icon-only with the accessible label preserved
 *    via aria-label so it never causes horizontal overflow.
 *  - No em dashes in user-facing strings.
 *
 * Refreshed query keys
 * ====================
 * Mirrors every fetching hook in `use-client-api.ts`, `use-appointments.ts`
 * and `pages/Tasks.tsx`. `invalidateQueries` is preferred over
 * `refetchQueries` because it also re-runs any active subscription that
 * may have been disabled (e.g. the conversation detail when the drawer
 * was closed and reopened).
 */

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const REFRESHED_KEYS: ReadonlyArray<readonly string[]> = [
  ["conversations"],
  ["conversation"],
  ["escalations"],
  ["appointments"],
  ["tasks"],
  ["status"],
  ["schedule-slots"],
  ["learning"],
];

function formatClock(d: Date): string {
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function RefreshButton({ className }: { className?: string }) {
  const qc = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [errored, setErrored] = useState(false);
  // Re-render every 30s so "Updated just now" → "Last updated HH:MM" flips
  // without a click. Only mount the ticker when we actually have a
  // timestamp to display, so an idle dashboard doesn't burn timers.
  const [, setNowTick] = useState(0);

  useEffect(() => {
    if (lastUpdatedMs === null) return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [lastUpdatedMs]);

  const handleClick = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setErrored(false);
    const results = await Promise.allSettled(
      REFRESHED_KEYS.map((key) =>
        qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] }),
      ),
    );
    setIsRefreshing(false);
    const anyFailed = results.some((r) => r.status === "rejected");
    if (anyFailed) {
      setErrored(true);
    } else {
      setLastUpdatedMs(Date.now());
    }
  }, [isRefreshing, qc]);

  // Status text — error wins; otherwise show "Updated just now" when the
  // refresh happened in the last minute, then switch to a clock label.
  let statusText: string | null = null;
  if (errored) {
    statusText = "Could not refresh. Try again.";
  } else if (lastUpdatedMs !== null) {
    const ageMs = Date.now() - lastUpdatedMs;
    statusText =
      ageMs < 60_000
        ? "Updated just now"
        : `Last updated ${formatClock(new Date(lastUpdatedMs))}`;
  }

  return (
    <div className={cn("flex items-center gap-2 flex-shrink-0", className)}>
      {/* Status text — desktop only so we never push the search box off
          on tight mobile widths. The button alone carries the state on
          mobile (spinner + aria-label). */}
      {statusText && (
        <span
          className={cn(
            "hidden lg:inline text-[12px] truncate max-w-[180px]",
            errored ? "text-[#b3261e]" : "text-[#6b7280]",
          )}
          aria-live="polite"
        >
          {statusText}
        </span>
      )}
      <motion.button
        type="button"
        onClick={handleClick}
        disabled={isRefreshing}
        whileTap={{ scale: 0.97, opacity: 0.8 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        aria-label={
          isRefreshing
            ? "Refreshing dashboard data"
            : statusText && !errored
              ? `Refresh dashboard. ${statusText}.`
              : "Refresh dashboard"
        }
        title={statusText ?? "Refresh dashboard"}
        className={cn(
          "inline-flex items-center justify-center h-11 w-11 md:h-9 md:w-9 rounded-lg border border-[#e2e6ec] bg-white text-[#1f2937] transition-colors",
          "hover:border-[#1a73e8] hover:text-[#1a73e8]",
          "focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/20",
          "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-[#e2e6ec] disabled:hover:text-[#1f2937]",
        )}
      >
        <RefreshCw
          className={cn(
            "w-4 h-4 flex-shrink-0",
            isRefreshing && "animate-spin",
          )}
          aria-hidden="true"
        />
      </motion.button>
    </div>
  );
}
