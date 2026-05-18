// ---------------------------------------------------------------------------
// Deploy-time tenant
// ---------------------------------------------------------------------------
//
// VITE_CLIENT_SLUG is baked into the bundle at build time so the correct
// tenant is wired in without relying on per-device localStorage. Set it in
// .env.local (dev) or as an environment variable in the deployment runner:
//
//   VITE_CLIENT_SLUG=unboks
//
// Fallback chain (highest priority first):
//   1. URL path / login flow via setClientSlug() → written to localStorage
//   2. VITE_CLIENT_SLUG build-time constant → baked into the JS bundle
//   3. Hard-coded "unboks" default → correct for the primary production deploy
//
// The result: a fresh mobile browser with empty localStorage always hits
// the right tenant as long as the deploy was built with VITE_CLIENT_SLUG
// or the user opens a URL that contains the tenant slug (see TenantRootRedirect
// in App.tsx).
const DEPLOY_CLIENT: string =
  (import.meta.env.VITE_CLIENT_SLUG as string | undefined) || "unboks";

// One-shot self-heal at module load.
//
// A persisted client slug without a paired auth token is dead weight:
// every authenticated API call needs both, and the token is keyed by
// slug. The stuck-slug state happens when a user visits a /<slug>
// deep link (welcome email, shared URL, manual test) for a tenant
// they have no session for — the slug sticks in localStorage, the
// inbox tries to load against that backend, the API 404s, and the
// dashboard shows "Couldn't load conversations" with no escape
// except clearing localStorage by hand. Wiping the orphan slug here
// makes recovery automatic on the next page load: getClientSlug
// falls back to DEPLOY_CLIENT, AuthProvider re-checks the token, and
// the user lands either on the working inbox (if a default-tenant
// token exists) or on /login (clean slate).
try {
  const _persistedSlug = localStorage.getItem("wtyj_client");
  if (_persistedSlug &&
      !localStorage.getItem(`wtyj_token_${_persistedSlug}`)) {
    localStorage.removeItem("wtyj_client");
  }
} catch {
  // localStorage unavailable (private mode quotas, etc.); the worst
  // case is the user keeps seeing the stuck-slug failure until they
  // sign in to a real tenant.
}

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

// In production set VITE_API_BASE_URL=https://api.unboks.org
// In development leave it unset — relative /api/... is used automatically
const API_HOST: string = import.meta.env.VITE_API_BASE_URL ?? "";

export function getApiBase(slug?: string): string {
  return `${API_HOST}/api/${slug ?? getClientSlug()}/dashboard/api`;
}
