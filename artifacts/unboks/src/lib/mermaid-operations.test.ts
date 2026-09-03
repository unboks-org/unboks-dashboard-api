import { describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/data/conversations";
import type { MermaidReservationSummary } from "@/lib/api";
import {
  countMermaidActions,
  formatMermaidActivity,
  formatMermaidTripDate,
  mermaidConversationHref,
  mermaidGuestCount,
  mermaidTodayKey,
  summarizeMermaidOperations,
} from "./mermaid-operations";

function reservation(
  patch: Partial<MermaidReservationSummary> = {},
): MermaidReservationSummary {
  return {
    publicId: "reservation-1",
    conversationId: "59991234567",
    customerName: "Guest",
    language: "en",
    tripDate: "2026-09-08",
    adults: 2,
    children: 1,
    infants: 0,
    pickupPreference: "pier",
    catalogVersion: "2026-09-03",
    currency: "USD",
    total: 375,
    items: [],
    state: "awaiting_payment",
    stage: "payment",
    availabilitySource: "demo_assumed",
    humanTakeover: false,
    revision: 1,
    createdAt: "2026-09-03T12:00:00Z",
    updatedAt: "2026-09-03T12:00:00Z",
    primaryAction: null,
    demo: true,
    ...patch,
  };
}

function conversation(patch: Partial<Conversation> = {}): Conversation {
  return {
    id: "59997654321",
    conversationKey: "59997654321",
    channel: "WhatsApp",
    sender: "Guest",
    subject: "Trip question",
    preview: "Can you help?",
    timestamp: "Now",
    unread: true,
    escalated: false,
    hasAttachment: false,
    ...patch,
  };
}

describe("Mermaid operations model", () => {
  it("summarizes the server-authoritative reservation and chat queues", () => {
    const result = summarizeMermaidOperations(
      [
        reservation(),
        reservation({
          publicId: "reservation-2",
          conversationId: "2",
          stage: "booked",
          adults: 3,
          children: 0,
          infants: 1,
        }),
        reservation({
          publicId: "reservation-3",
          conversationId: "3",
          stage: "details",
          humanTakeover: true,
        }),
      ],
      [conversation(), conversation({ id: "read", unread: false })],
    );

    expect(result).toEqual({
      activeReservations: 2,
      bookedReservations: 1,
      bookedGuests: 4,
      needsCrew: 1,
      awaitingGuest: 1,
      unreadConversations: 1,
    });
  });

  it("deduplicates one guest journey across reservation and chat attention", () => {
    expect(
      countMermaidActions(
        [reservation({ humanTakeover: true })],
        [conversation({ id: "59991234567", conversationKey: "59991234567" })],
      ),
    ).toBe(1);
  });

  it("formats guest totals, deep links and dates without timezone drift", () => {
    expect(mermaidGuestCount(reservation())).toBe(3);
    expect(mermaidConversationHref("+599 9/12")).toBe(
      "/conversations?c=%2B599%209%2F12",
    );
    expect(formatMermaidTripDate("2026-09-08")).toMatch(
      /Tue.*(?:Sep.*8|8.*Sep)/,
    );
  });

  it("uses concise activity ages", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T15:00:00Z"));
    expect(formatMermaidActivity("2026-09-03T14:42:00Z")).toBe("18m ago");
    vi.useRealTimers();
  });

  it("uses Curaçao's calendar day for departure filtering", () => {
    expect(mermaidTodayKey(new Date("2026-09-03T01:00:00Z"))).toBe(
      "2026-09-02",
    );
  });
});
