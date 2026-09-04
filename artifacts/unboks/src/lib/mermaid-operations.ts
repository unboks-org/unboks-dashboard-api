import type { Conversation } from "@/data/conversations";
import type {
  MermaidReservationStage,
  MermaidReservationSummary,
} from "@/lib/api";

export const MERMAID_STAGE_META: Record<
  MermaidReservationStage,
  { label: string; shortLabel: string; tone: string }
> = {
  details: {
    label: "Collecting trip details",
    shortLabel: "Details",
    tone: "bg-sky-50 text-sky-800 ring-sky-200",
  },
  quote: {
    label: "Quote ready",
    shortLabel: "Quote",
    tone: "bg-violet-50 text-violet-800 ring-violet-200",
  },
  payment: {
    label: "Awaiting demo checkout",
    shortLabel: "Checkout",
    tone: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  booked: {
    label: "Booked",
    shortLabel: "Booked",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    shortLabel: "Cancelled",
    tone: "bg-slate-100 text-slate-600 ring-slate-200",
  },
};

export interface MermaidOperationsSummary {
  activeReservations: number;
  bookedReservations: number;
  bookedGuests: number;
  needsCrew: number;
  awaitingGuest: number;
  unreadConversations: number;
}

export function mermaidGuestCount(
  reservation: Pick<
    MermaidReservationSummary,
    "adults" | "children" | "infants"
  >,
): number {
  return reservation.adults + reservation.children + reservation.infants;
}

export function summarizeMermaidOperations(
  reservations: MermaidReservationSummary[],
  conversations: Conversation[],
): MermaidOperationsSummary {
  const active = reservations.filter(
    (row) => row.stage !== "booked" && row.stage !== "cancelled",
  );
  const booked = reservations.filter((row) => row.stage === "booked");
  return {
    activeReservations: active.length,
    bookedReservations: booked.length,
    bookedGuests: booked.reduce(
      (total, row) => total + mermaidGuestCount(row),
      0,
    ),
    needsCrew: reservations.filter(
      (row) =>
        row.humanTakeover ||
        row.crewAssistance?.status === "unacknowledged",
    ).length,
    awaitingGuest: active.filter((row) => !row.humanTakeover).length,
    unreadConversations: conversations.filter(
      (conversation) => conversation.unread,
    ).length,
  };
}

export function countMermaidActions(
  reservations: MermaidReservationSummary[],
  conversations: Conversation[],
): number {
  const actionConversationIds = new Set(
    reservations
      .filter(
        (row) =>
          row.humanTakeover ||
          row.crewAssistance?.status === "unacknowledged",
      )
      .map((row) => row.conversationId),
  );
  for (const conversation of conversations) {
    if (conversation.unread || conversation.escalated) {
      actionConversationIds.add(
        conversation.conversationKey ?? conversation.id,
      );
    }
  }
  return actionConversationIds.size;
}

export function mermaidConversationHref(conversationId: string): string {
  return `/conversations?c=${encodeURIComponent(conversationId)}`;
}

export function mermaidTodayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Curacao",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatMermaidTripDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || "Date pending";
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function formatMermaidActivity(
  value: string | number | undefined,
): string {
  if (!value) return "Activity time unavailable";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return String(value);
  const elapsed = Date.now() - time;
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 60 * 60_000)
    return `${Math.max(1, Math.floor(elapsed / 60_000))}m ago`;
  if (elapsed < 24 * 60 * 60_000)
    return `${Math.floor(elapsed / (60 * 60_000))}h ago`;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(new Date(time));
}
