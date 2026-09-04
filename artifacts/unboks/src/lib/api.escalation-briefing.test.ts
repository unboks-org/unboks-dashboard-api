import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConversation } from "./api";

export const structuredCrewBriefing = {
  reason:
    "The guest needs assistance boarding and leaving the boat on Sunday. The Mermaid crew must assess what support is possible.",
  customerWants:
    "Boarding and disembarking assistance for a guest with limited mobility.",
  operatorNeedsToDecide:
    "Confirm the support the vessel and crew can safely provide, including any limitations.",
  latestCustomerMessage:
    "My partner needs help getting on and off the boat. Can the crew help?",
  recommendedOptions: ["Check with the crew", "Ask what assistance is needed"],
  extractedDetails: { proposedTimes: ["sunday"] },
};

describe("conversation escalation briefing payload", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
    localStorage.setItem("wtyj_token_mermaid", "synthetic-token");
    vi.stubGlobal("fetch", vi.fn());
  });
  function respond(body: unknown) {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "X-Unboks-Tenant": "mermaid" },
      }),
    );
  }
  it("preserves the structured reason, guest request, crew decision and triggering message", async () => {
    respond({ messages: [], escalationSummary: structuredCrewBriefing });
    const detail = await fetchConversation("guest");
    expect(detail.escalationSummary).toBe(structuredCrewBriefing.reason);
    expect(detail.customerWants).toBe(structuredCrewBriefing.customerWants);
    expect(detail.operatorNeedsToDecide).toBe(
      structuredCrewBriefing.operatorNeedsToDecide,
    );
    expect(detail.escalationCustomerMessage).toBe(
      structuredCrewBriefing.latestCustomerMessage,
    );
    expect(detail.recommendedOptions).toEqual(
      structuredCrewBriefing.recommendedOptions,
    );
    expect(detail.extractedDetails?.proposedTimes).toEqual(["sunday"]);
  });
  it("retains legacy string summaries and gives existing top-level fields precedence", async () => {
    respond({
      messages: [],
      escalationSummary: "Existing approved explanation",
      customerWants: "Guest request",
      operatorNeedsToDecide: "Crew decision",
    });
    const legacy = await fetchConversation("guest");
    expect(legacy.escalationSummary).toBe("Existing approved explanation");
    respond({
      messages: [],
      escalationSummary: structuredCrewBriefing,
      customerWants: "More recent top-level request",
      operatorNeedsToDecide: "More recent decision",
      recommendedOptions: [],
    });
    const detail = await fetchConversation("guest");
    expect(detail.customerWants).toBe("More recent top-level request");
    expect(detail.operatorNeedsToDecide).toBe("More recent decision");
    expect(detail.recommendedOptions).toBeNull();
  });
  it.each([null, [], { reason: 42, customerWants: false }, ""])(
    "does not invent briefing fields from malformed data: %s",
    async (value) => {
      respond({ messages: [], escalationSummary: value });
      const detail = await fetchConversation("guest");
      expect(detail.escalationSummary).toBeNull();
      expect(detail.customerWants).toBeNull();
      expect(detail.escalationCustomerMessage).toBeNull();
    },
  );
});
