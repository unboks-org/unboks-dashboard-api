// ---------------------------------------------------------------------------
// Tab-local tenant session
// ---------------------------------------------------------------------------

const DEPLOY_CLIENT: string =
  (import.meta.env.VITE_CLIENT_SLUG as string | undefined) || "unboks";

const ACTIVE_TENANT_KEY = "unboks_active_tenant";
const LEGACY_GLOBAL_TENANT_KEY = "wtyj_client";
const TENANT_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function validSlug(value: string | null): value is string {
  return Boolean(value && TENANT_SLUG_PATTERN.test(value));
}

/**
 * The active workspace is deliberately sessionStorage-backed: each browser
 * tab owns its tenant identity. Authentication tokens remain tenant-keyed in
 * localStorage so an operator does not need to sign in again in every tab,
 * but no tab may change another tab's active workspace.
 */
export function getClientSlug(): string {
  try {
    const slug = sessionStorage.getItem(ACTIVE_TENANT_KEY);
    if (slug === null) return DEPLOY_CLIENT;
    return validSlug(slug) ? slug : "";
  } catch {
    return "";
  }
}

export function setClientSlug(slug: string): void {
  if (!validSlug(slug)) throw new Error("Invalid workspace slug");
  sessionStorage.setItem(ACTIVE_TENANT_KEY, slug);
  try {
    // The retired cross-tab runtime key is intentionally not migrated: it
    // may identify a different tenant from the current tab.
    localStorage.removeItem(LEGACY_GLOBAL_TENANT_KEY);
  } catch {
    // Removing an obsolete shared key is best-effort. The tab-local session
    // is already authoritative and never reads this value.
  }
}

export function getTokenKey(slug: string): string {
  return `wtyj_token_${slug}`;
}

export function getToken(slug = getClientSlug()): string | null {
  if (!validSlug(slug)) return null;
  try {
    return localStorage.getItem(getTokenKey(slug));
  } catch {
    return null;
  }
}

export function setToken(token: string, slug = getClientSlug()): void {
  if (!validSlug(slug)) throw new Error("Invalid workspace slug");
  localStorage.setItem(getTokenKey(slug), token);
}

export function clearAuth(slug = getClientSlug()): void {
  try {
    localStorage.removeItem(getTokenKey(slug));
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

export interface TenantRequestScope {
  tenantSlug: string;
  token: string | null;
}

/** Capture one immutable tenant/token pair before constructing a request. */
export function captureTenantRequestScope(
  tenantSlug = getClientSlug(),
): TenantRequestScope {
  return Object.freeze({ tenantSlug, token: getToken(tenantSlug) });
}

/** Tenant-data browser persistence. Unsafe generic legacy keys are ignored. */
export function tenantStorageKey(feature: string, slug = getClientSlug()): string {
  const safeFeature = feature.replace(/[^A-Za-z0-9:_-]/g, "-");
  return `unboks:${slug}:${safeFeature}`;
}

const API_HOST: string =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.PROD ? "https://api.unboks.org" : "");

export function getApiBase(slug = getClientSlug()): string {
  return `${API_HOST}/api/${slug}/dashboard/api`;
}
