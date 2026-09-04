import { beforeEach, describe, expect, it } from "vitest";
import { escalationText } from "./escalation-copy";

describe("tenant-specific escalation copy", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("unboks_active_tenant", "mermaid");
  });
  it("uses TRACY and guest wording without a made-up schedule example", () => {
    expect(escalationText("Instructions to Agent", "")).toBe(
      "Guidance for TRACY",
    );
    expect(escalationText("Reply to customer", "")).toBe("Reply to guest");
    expect(
      escalationText("Send guidance to your Agent without resolving", ""),
    ).toContain("TRACY");
    const placeholder = escalationText(
      "Example: Confirm Sunday at 08:00 and ask the customer to confirm their phone number.",
      "",
    );
    expect(placeholder).toContain("crew");
    expect(placeholder).not.toMatch(/Sunday|08:00|phone number/);
  });
  it("preserves other tenants' English and Spanish copy", () => {
    sessionStorage.setItem("unboks_active_tenant", "ali-car-rental");
    expect(escalationText("Instructions to Agent", "Instrucciones")).toBe(
      "Instructions to Agent",
    );
    sessionStorage.setItem("unboks_active_tenant", "consulta-despertares");
    expect(escalationText("Instructions to Agent", "Instrucciones")).toBe(
      "Instrucciones",
    );
  });
});
