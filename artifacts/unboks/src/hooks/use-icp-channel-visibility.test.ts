import { describe, expect, it } from "vitest";

import {
  classifyToggles,
  resolveVisibleChannels,
} from "@/hooks/use-icp-channel-visibility";
import type { IcpEnvelope } from "@/hooks/use-icp-overrides";

function envelope(
  available: boolean,
  featureToggles: IcpEnvelope["feature_toggles"] = {},
): IcpEnvelope {
  return {
    available,
    tenant_id: "synthetic-tenant",
    feature_toggles: featureToggles,
  };
}

describe("tenant-scoped ICP channel visibility", () => {
  it("shows only explicitly enabled current-tenant channels", () => {
    const result = classifyToggles(envelope(true, {
      whatsapp_inbox: {
        value: true,
        source: "backend",
        wired: true,
        updated_at: null,
        updated_by: null,
      },
      email_inbox: {
        value: false,
        source: "backend",
        wired: true,
        updated_at: null,
        updated_by: null,
      },
    }));
    expect(result.visible).toEqual(["WhatsApp"]);
  });

  it.each([
    ["500", envelope(false), JSON.stringify(["WhatsApp"])],
    ["timeout", { ...envelope(false), reason: "timeout" }, JSON.stringify(["WhatsApp"])],
    ["unreadable", { ...envelope(false), reason: "unreadable" }, JSON.stringify(["WhatsApp"])],
  ])("keeps the last confirmed channels on %s", (_label, current, stored) => {
    expect(resolveVisibleChannels(current as IcpEnvelope, stored as string))
      .toEqual(["WhatsApp"]);
  });

  it("shows no channel rows for a fresh tenant when ICP is unavailable", () => {
    expect(resolveVisibleChannels(envelope(false), null)).toEqual([]);
    expect(resolveVisibleChannels(envelope(false), "corrupt-json")).toEqual([]);
  });

  it("never turns an unavailable response into all eight channels", () => {
    const visible = resolveVisibleChannels(envelope(false), JSON.stringify(["WhatsApp"]));
    expect(visible).toHaveLength(1);
    expect(visible).not.toContain("Email");
    expect(visible).not.toContain("Instagram");
  });
});
