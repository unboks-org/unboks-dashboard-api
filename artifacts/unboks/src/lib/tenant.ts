const DEFAULT_CLIENT = "unboks";

export function getClientSlug(): string {
  return localStorage.getItem("wtyj_client") || DEFAULT_CLIENT;
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
  // Only clear the auth token. Keep the client slug so the login screen
  // and tenant-scoped UI still know which workspace the user belongs to.
  const slug = getClientSlug();
  localStorage.removeItem(getTokenKey(slug));
}

// In production set VITE_API_BASE_URL=https://api.unboks.org
// In development leave it unset — relative /api/... is used automatically
const API_HOST: string = import.meta.env.VITE_API_BASE_URL ?? "";

export function getApiBase(slug?: string): string {
  return `${API_HOST}/api/${slug ?? getClientSlug()}/dashboard/api`;
}
