// ---------------------------------------------------------------------------
// Tenant + API Base URL handling (cleaned up for reliable welcome flow)
// ---------------------------------------------------------------------------
//
// The goal: when Calvin creates a tenant in ICP and sends a welcome email
// with https://dashboard.unboks.org/{slug}, the user who clicks it should
// land on Login with the workspace prefilled and be able to sign in
// against the correct backend tenant without any "Load Failed" or
// "workspace not recognized" friction.

// Production API host. This must point to the current nginx entrypoint
// that does dynamic /api/{slug}/... routing to the wtyj-unboks container.
const PRODUCTION_API_HOST = "https://api.unboks.org";

// Build-time override (useful for staging or special deploys).
// Set VITE_API_BASE_URL in the Replit deployment environment.
const ENV_API_HOST = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "";

// Final host used for all API calls.
// Priority: explicit env var > production default.
const API_HOST: string = ENV_API_HOST || PRODUCTION_API_HOST;

// ---------------------------------------------------------------------------
// Deploy-time default tenant (used when no slug is in the URL or localStorage)
// ---------------------------------------------------------------------------
const DEPLOY_CLIENT: string =
  (import.meta.env.VITE_CLIENT_SLUG as string | undefined) || "unboks";

// ---------------------------------------------------------------------------
// One-time self-heal for stuck slugs on module load
// ---------------------------------------------------------------------------
try {
  const _persistedSlug = localStorage.getItem("wtyj_client");
  if (_persistedSlug && !localStorage.getItem(`wtyj_token_${_persistedSlug}`)) {
    localStorage.removeItem("wtyj_client");
  }
} catch {
  // private mode / quota issues — ignore
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getClientSlug(): string {
  return localStorage.getItem("wtyj_client") || DEPLOY_CLIENT;
}

export function setClientSlug(slug: string): void {
  localStorage.setItem("wtyj_client", slug);
}

export function getTokenKey(slug?: string): string {
  return `wtyj_token_${slug ?? getClientSlug()}`;
}

export function getToken(slug?: string): string | null {
  return localStorage.getItem(getTokenKey(slug));
}

export function setToken(token: string, slug?: string): void {
  localStorage.setItem(getTokenKey(slug), token);
}

export function clearAuth(): void {
  const slug = getClientSlug();
  localStorage.removeItem(getTokenKey(slug));
}

/**
 * Returns the full base URL for dashboard API calls for a given tenant.
 *
 * Always produces paths of the form:
 *   https://api.unboks.org/api/{slug}/dashboard/api
 *
 * This must match the nginx dynamic routing we have on the VPS.
 */
export function getApiBase(slug?: string): string {
  const effectiveSlug = slug ?? getClientSlug();
  return `${API_HOST}/api/${effectiveSlug}/dashboard/api`;
}

/**
 * Returns the current API host (useful for diagnostics).
 */
export function getApiHost(): string {
  return API_HOST;
}
