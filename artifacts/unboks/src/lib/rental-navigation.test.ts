import { describe, expect, it } from "vitest";

import { isLegacyRentalSettingsSearch } from "@/lib/rental-navigation";

describe("rental route consolidation", () => {
  it("recognizes the retired Settings rental deep link", () => {
    expect(isLegacyRentalSettingsSearch("?category=rental")).toBe(true);
    expect(isLegacyRentalSettingsSearch("category=rental&from=quote-leads")).toBe(
      true,
    );
  });

  it("leaves real Settings categories on the Settings page", () => {
    expect(isLegacyRentalSettingsSearch("?category=data-retention")).toBe(false);
    expect(isLegacyRentalSettingsSearch("?category=workspace")).toBe(false);
    expect(isLegacyRentalSettingsSearch("")).toBe(false);
  });
});
