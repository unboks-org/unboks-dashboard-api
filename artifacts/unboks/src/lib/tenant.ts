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
  const slug = getClientSlug();
  localStorage.removeItem(getTokenKey(slug));
  localStorage.removeItem("wtyj_client");
}

export function getApiBase(slug?: string): string {
  return `https://api.wetakeyourjob.com/${slug ?? getClientSlug()}/dashboard/api`;
}
