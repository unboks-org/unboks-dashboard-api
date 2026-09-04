import { describe, expect, it } from "vitest";
import {
  buildMermaidAttention,
  mermaidIssue,
  attentionGuestMessage,
} from "./mermaid-attention";
import { mapApiConversation } from "./conversation-mapper";
import { mermaidReceiptFixture } from "@/test/mermaid-receipt-fixture";

const escalation = (id: string, phone = id, patch = {}) => ({
  id,
  phone,
  channel: "whatsapp",
  customer_name: `Guest ${phone}`,
  subject: "Pickup needs confirmation",
  body: "Please confirm the pickup location.",
  mode: "soft",
  status: "sent",
  created_at: "2026-09-03T01:00:00Z",
  ...patch,
});

describe("Mermaid attention projection", () => {
  it("counts ten actual attention conversations among thirty unread chats, without a seven-item cap", () => {
    const chats = Array.from({ length: 30 }, (_, i) =>
      mapApiConversation({
        phone: String(i),
        unread: true,
        name: `Guest ${i}`,
      }),
    );
    const items = buildMermaidAttention(
      [],
      chats,
      Array.from({ length: 10 }, (_, i) => escalation(String(i))),
    );
    expect(items).toHaveLength(10);
    expect(
      items.every(
        (item) => item.issues[0].reason === "Pickup needs confirmation",
      ),
    ).toBe(true);
  });
  it("keeps all issues while counting a conversation once and joining its reservation", () => {
    const reservation = { ...mermaidReceiptFixture, humanTakeover: true };
    const items = buildMermaidAttention(
      [reservation],
      [],
      [
        escalation("1", reservation.conversationId),
        escalation("2", reservation.conversationId),
      ],
    );
    expect(items).toHaveLength(1);
    expect(items[0].issues.map((issue) => issue.id)).toEqual(["1", "2"]);
    expect(items[0].reservation?.publicId).toBe(reservation.publicId);
  });
  it("retains old unresolved cases and ignores resolved records and stale handover flags", () => {
    const reservation = { ...mermaidReceiptFixture, humanTakeover: true };
    const items = buildMermaidAttention(
      [reservation],
      [],
      [
        escalation("old", "other", { created_at: "2026-08-01T00:00:00Z" }),
        escalation("done", reservation.conversationId, { status: "resolved" }),
      ],
    );
    expect(items.map((item) => item.issues[0].id)).toEqual(["old"]);
  });
  it("does not lose unlinked handovers, merge by name, or merge across channels", () => {
    const reservation = { ...mermaidReceiptFixture, humanTakeover: true };
    const items = buildMermaidAttention(
      [reservation],
      [],
      [
        escalation("1", "", { customer_name: "Same name" }),
        escalation("2", "", { customer_name: "Same name" }),
        escalation("3", "shared"),
        escalation("4", "shared", { channel: "email" }),
      ],
    );
    expect(items).toHaveLength(5);
    expect(items.find((item) => item.reservation)?.issues).toEqual([]);
  });
  it("applies hidden/blocked filters even to escalation-only and reservation-only entries", () => {
    const reservation = { ...mermaidReceiptFixture, humanTakeover: true };
    expect(
      buildMermaidAttention(
        [reservation],
        [],
        [escalation("hidden", "hidden")],
        (keys) =>
          !keys.includes("hidden") &&
          !keys.includes(reservation.conversationId),
      ),
    ).toEqual([]);
  });
  it("preserves soft mode even when automatic replies are paused and uses structured reasons", () => {
    const issue = mermaidIssue(
      escalation("1", "a", {
        aiMuted: true,
        escalationSummary: {
          reason: "Guest asks for a wheelchair-accessible transfer",
          customerWants: "Accessible pickup",
          operatorNeedsToDecide:
            "Confirm whether a suitable vehicle is available",
        },
      }),
    );
    expect(issue?.mode).toBe("soft");
    expect(issue?.reason).toContain("wheelchair");
    expect(issue?.decision).toContain("suitable vehicle");
    expect(mermaidIssue(escalation("2", "b", { mode: null }))?.mode).toBeNull();
  });
  it("shows the guest message before escalation, not a later routine exchange or TRACY reply", () => {
    const messages = [
      {
        id: "1",
        role: "user" as const,
        content: "Can you arrange an accessible pickup?",
        timestamp: "",
        timestampMs: Date.parse("2026-09-03T00:58:00Z"),
      },
      {
        id: "2",
        role: "assistant" as const,
        content: "The crew will help.",
        timestamp: "",
        timestampMs: Date.parse("2026-09-03T01:00:00Z"),
      },
      {
        id: "3",
        role: "user" as const,
        content: "Thanks",
        timestamp: "",
        timestampMs: Date.parse("2026-09-03T01:02:00Z"),
      },
    ];
    expect(
      attentionGuestMessage(messages, "2026-09-03T01:00:00Z").message?.id,
    ).toBe("1");
    expect(attentionGuestMessage(messages, null).label).toBe(
      "Latest guest message",
    );
  });
});
