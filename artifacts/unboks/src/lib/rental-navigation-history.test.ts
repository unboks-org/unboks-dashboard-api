import { beforeEach, describe, expect, it } from "vitest";
import {
  hasRentalBackHistory,
  prepareRentalNavigationState,
  rememberRentalScroll,
  rentalHistoryEntryId,
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

  it("tracks every pushed dashboard destination while preserving supplied state", () => {
    const nextState = prepareRentalNavigationState(
      "ali-car-rental",
      638,
      { selectedRow: "lead-42" },
      false,
    );

    expect(rentalScrollPosition("ali-car-rental")).toBe(638);
    window.history.pushState(nextState, "", "/customers/lead-42");
    expect(hasRentalBackHistory("ali-car-rental")).toBe(true);
    expect(window.history.state.selectedRow).toBe("lead-42");
  });

  it("keeps one history entry when only filters or search are replaced", () => {
    window.history.replaceState(
      rentalNavigationState("ali-car-rental"),
      "",
      "/customers?stage=postquote",
    );
    const entryId = rentalHistoryEntryId("ali-car-rental");
    const nextState = prepareRentalNavigationState(
      "ali-car-rental",
      284,
      { searchOpen: true },
      true,
    );
    window.history.replaceState(
      nextState,
      "",
      "/customers?stage=postquote&q=maria",
    );

    expect(rentalHistoryEntryId("ali-car-rental")).toBe(entryId);
    expect(rentalScrollPosition("ali-car-rental")).toBe(284);
    expect(window.history.state.searchOpen).toBe(true);
  });
});
