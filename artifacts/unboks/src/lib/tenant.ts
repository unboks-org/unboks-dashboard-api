// ---------------------------------------------------------------------------
// Tenant + API Base URL handling (runtime detection version)
// ---------------------------------------------------------------------------
//
// Goal: Make the welcome email link flow work reliably without depending
// on correct build-time environment variables in Replit.
//
// Strategy:
//   - In production (dashboard.unboks.org), always use https://api.unboks.org
//   - Allow override via VITE_API_BASE_URL for staging / testing
//   - Fall back gracefully in development
// ---------------------------------------------------------------------------

/**
 * Determine the correct API host at runtime.
 * This removes the fragile dependency on VITE_API_BASE_URL being set correctly
 * in every Replit deployment.
 */
function resolveApiHost(): string {
  // 1. Explicit override (highest priority) - useful for staging or local testing
  const envOverride = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "";
  if (envOverride) {
    return envOverride.replace(/\/$/, ""); // remove trailing slash
  }

  // 2. Runtime detection based on current hostname (production)
  if (typeof window !== "undefined") {
    const host = window.location.hostname;

    // Production dashboard
    if (host === "dashboard.unboks.org" || host.endsWith(".dashboard.unboks.org")) {
      return "https://api.unboks.org";
    }

    // Replit preview / dev domains (common patterns)
    if (host.includes("replit") || host.includes("repl.co")) {
      // In Replit dev/preview we usually want to hit the real backend
      return "https://api.unboks.org";
    }
  }

  // 3. Safe development default (relative path lets Vite proxy handle it)
  return "";
}

const API_HOST: string = resolveApiHost();

// ---------------------------------------------------------------------------
// Default tenant when nothing else is specified
// ---------------------------------------------------------------------------
const DEPLOY_CLIENT: string =
  (import.meta.env.VITE_CLIENT_SLUG as string | undefined) || "unboks";

// ---------------------------------------------------------------------------
// Self-heal for stuck slugs
// ---------------------------------------------------------------------------
try {
  const _persistedSlug = localStorage.getItem("wtyj_client");
  if (_persistedSlug && !localStorage.getItem(`wtyj_token_${_persistedSlug}`)) {
    localStorage.removeItem("wtyj_client");
  }
} catch {}

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
 * Returns the full base URL for all dashboard API calls.
 * Always produces: https://api.unboks.org/api/{slug}/dashboard/api (in production)
 */
export function getApiBase(slug?: string): string {
  const effectiveSlug = slug ?? getClientSlug();
  const host = API_HOST ? API_HOST : ""; // empty = relative (dev proxy)
  return `${host}/api/${effectiveSlug}/dashboard/api`;
}

/**
 * Returns the resolved API host (useful for debugging in the console)
 */
export function getApiHost(): string {
  return API_HOST || "(relative - dev mode or proxy)";
}
