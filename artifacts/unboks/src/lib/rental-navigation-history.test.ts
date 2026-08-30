import { beforeEach, describe, expect, it } from "vitest";
import {
  hasRentalBackHistory,
  rememberRentalScroll,
  rentalNavigationState,
  rentalScrollPosition,
} from "./rental-navigation-history";

describe("rental dashboard navigation history", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/customers?stage=postquote&q=maria");
  });

  it("preserves the exact source URL and scroll position before navigation", () => {
    rememberRentalScroll("ali-car-rental", 427);

    expect(window.location.pathname).toBe("/customers");
    expect(window.location.search).toBe("?stage=postquote&q=maria");
    expect(rentalScrollPosition("ali-car-rental")).toBe(427);
    expect(hasRentalBackHistory("ali-car-rental")).toBe(false);
  });

  it("marks only same-tenant dashboard destinations as back-enabled", () => {
    window.history.pushState(
      rentalNavigationState("ali-car-rental"),
      "",
      "/today",
    );

    expect(hasRentalBackHistory("ali-car-rental")).toBe(true);
    expect(hasRentalBackHistory("another-rental")).toBe(false);
  });

  it("keeps earlier internal history while updating its scroll position", () => {
    window.history.replaceState(
      rentalNavigationState("ali-car-rental"),
      "",
      "/fleet?view=quote",
    );
    rememberRentalScroll("ali-car-rental", 912);

    expect(hasRentalBackHistory("ali-car-rental")).toBe(true);
    expect(rentalScrollPosition("ali-car-rental")).toBe(912);
  });
});
