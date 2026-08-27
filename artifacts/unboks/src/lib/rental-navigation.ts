export function isLegacyRentalSettingsSearch(search: string): boolean {
  try {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    return params.get("category") === "rental";
  } catch {
    return false;
  }
}
