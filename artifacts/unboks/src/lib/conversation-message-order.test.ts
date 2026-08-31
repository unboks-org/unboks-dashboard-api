import { describe, expect, it } from "vitest";
import type { ApiMessage } from "@/lib/api";
import {
  latestConversationMessage,
  orderConversationMessagesChronologically,
} from "./conversation-message-order";

function message(id: string, role: ApiMessage["role"], timestampMs: number): ApiMessage {
  return { id, role, content: id, timestamp: id, timestampMs };
}

describe("conversation message order", () => {
  it("renders customer input before the later agent reply", () => {
    const agent = message("agent-reply", "assistant", 200);
    const customer = message("customer-message", "user", 100);

    expect(
      orderConversationMessagesChronologically([agent, customer]).map(
        (item) => item.id,
      ),
    ).toEqual(["customer-message", "agent-reply"]);
  });

  it("keeps unparseable timestamps stable without mutating the source", () => {
    const source = [
      message("later", "assistant", 200),
      message("unknown-one", "user", 0),
      message("earlier", "user", 100),
      message("unknown-two", "assistant", 0),
    ];

    const ordered = orderConversationMessagesChronologically(source);

    expect(ordered.map((item) => item.id)).toEqual([
      "earlier",
      "later",
      "unknown-one",
      "unknown-two",
    ]);
    expect(source.map((item) => item.id)).toEqual([
      "later",
      "unknown-one",
      "earlier",
      "unknown-two",
    ]);
  });

  it("finds the latest customer message from either array direction", () => {
    const messages = [
      message("customer-old", "user", 100),
      message("agent", "assistant", 200),
      message("customer-new", "user", 300),
    ];

    expect(
      latestConversationMessage(messages, (item) => item.role === "user")?.id,
    ).toBe("customer-new");
    expect(
      latestConversationMessage(
        [...messages].reverse(),
        (item) => item.role === "user",
      )?.id,
    ).toBe("customer-new");
  });
});
