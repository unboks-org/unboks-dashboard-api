const RENTAL_HISTORY_KEY = "__unboksRentalNavigation";

interface RentalHistoryMetadata {
  entryId: string;
  tenant: string;
  internal: boolean;
  scrollTop?: number;
}

type BrowserHistoryState = Record<string, unknown> & {
  [RENTAL_HISTORY_KEY]?: RentalHistoryMetadata;
};

function stateRecord(value: unknown): BrowserHistoryState {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as BrowserHistoryState)
    : {};
}

function currentState(): BrowserHistoryState {
  return stateRecord(window.history.state);
}

function metadata(): RentalHistoryMetadata | null {
  const value = currentState()[RENTAL_HISTORY_KEY];
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.entryId !== "string" ||
    typeof value.tenant !== "string" ||
    typeof value.internal !== "boolean"
  ) {
    return null;
  }
  return value;
}

export function rememberRentalScroll(tenant: string, scrollTop: number): void {
  const state = currentState();
  const previous = metadata();
  window.history.replaceState(
    {
      ...state,
      [RENTAL_HISTORY_KEY]: {
        entryId: previous?.entryId ?? crypto.randomUUID(),
        tenant,
        internal: previous?.tenant === tenant ? previous.internal : false,
        scrollTop: Math.max(0, Math.round(scrollTop)),
      } satisfies RentalHistoryMetadata,
    },
    "",
    window.location.href,
  );
}

export function rentalNavigationState(tenant: string): BrowserHistoryState {
  return {
    [RENTAL_HISTORY_KEY]: {
      entryId: crypto.randomUUID(),
      tenant,
      internal: true,
    } satisfies RentalHistoryMetadata,
  };
}

/**
 * Capture the page being left and return state for the destination entry.
 * Pushes receive a fresh internal entry marker; URL-only replacements keep
 * the same entry id and scroll snapshot so filters/search remain one page in
 * browser history.
 */
export function prepareRentalNavigationState(
  tenant: string,
  scrollTop: number,
  destinationState: unknown,
  replace: boolean,
): BrowserHistoryState {
  rememberRentalScroll(tenant, scrollTop);
  const supplied = stateRecord(destinationState);
  return replace
    ? { ...currentState(), ...supplied }
    : { ...supplied, ...rentalNavigationState(tenant) };
}

export function hasRentalBackHistory(tenant: string): boolean {
  const value = metadata();
  return Boolean(value?.internal && value.tenant === tenant);
}

export function rentalScrollPosition(tenant: string): number | null {
  const value = metadata();
  return value?.tenant === tenant && Number.isFinite(value.scrollTop)
    ? Math.max(0, value.scrollTop ?? 0)
    : null;
}

export function rentalHistoryEntryId(tenant: string): string | null {
  const value = metadata();
  return value?.tenant === tenant ? value.entryId : null;
}
