// =====================================================
// NEW CLEAN TENANT SYSTEM (Clean Slate - Nuclear Rewrite)
// =====================================================
//
// Goal: Make the ICP -> Welcome Email -> Login flow work reliably
// with the absolute minimum logic.

// Production API host - always use this in production
const API_HOST = "https://api.unboks.org";

/**
 * Get the current tenant slug.
 * Priority for welcome links:
 *   1. From URL path (e.g. /pepe or /pepe/login) - most important
 *   2. From localStorage (last used tenant)
 *   3. Default to "unboks"
 */
export function getCurrentSlug(): string {
  // Highest priority: slug from the URL (critical for welcome emails)
  if (typeof window !== "undefined") {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length > 0 && pathParts[0] !== "login") {
      return pathParts[0];
    }
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem("unboks_current_slug");
    if (stored) return stored;
  } catch {}

  return "unboks";
}

/**
 * Persist the current tenant slug (called after successful login)
 */
export function setCurrentSlug(slug: string): void {
  try {
    localStorage.setItem("unboks_current_slug", slug);
  } catch {}
}

/**
 * Returns the full base URL for dashboard API calls
 * Always returns: https://api.unboks.org/api/{slug}/dashboard/api
 */
export function getApiBase(slug?: string): string {
  const effective = slug || getCurrentSlug();
  return `${API_HOST}/api/${effective}/dashboard/api`;
}

// Per-tenant token storage

export function getTokenKey(slug?: string): string {
  return `unboks_token_${slug || getCurrentSlug()}`;
}

export function getToken(slug?: string): string | null {
  try {
    return localStorage.getItem(getTokenKey(slug));
  } catch {
    return null;
  }
}

export function setToken(token: string, slug?: string): void {
  try {
    localStorage.setItem(getTokenKey(slug), token);
  } catch {}
}

export function clearToken(slug?: string): void {
  try {
    localStorage.removeItem(getTokenKey(slug));
  } catch {}
}

/**
 * Simple check: does this slug have a stored token?
 */
export function hasValidSession(slug: string): boolean {
  try {
    return !!localStorage.getItem(`unboks_token_${slug}`);
  } catch {
    return false;
  }
}
