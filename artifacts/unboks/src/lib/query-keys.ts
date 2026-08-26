import { getClientSlug } from "@/lib/tenant";

export type TenantQueryKey = readonly ["tenant", string, ...unknown[]];

/** The only supported key constructor for server-derived React Query data. */
export function tenantKey(...parts: readonly unknown[]): TenantQueryKey {
  return tenantKeyFor(getClientSlug(), ...parts);
}

export function tenantKeyFor(
  tenantSlug: string,
  ...parts: readonly unknown[]
): TenantQueryKey {
  return ["tenant", tenantSlug, ...parts];
}

export function tenantPrefix(tenantSlug = getClientSlug()): TenantQueryKey {
  return ["tenant", tenantSlug];
}

export function isTenantQueryKey(value: readonly unknown[]): boolean {
  return value[0] === "tenant" && typeof value[1] === "string" && value[1].length > 0;
}
