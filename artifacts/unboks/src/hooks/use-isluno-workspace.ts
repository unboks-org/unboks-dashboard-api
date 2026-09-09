import { useQuery } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { fetchIslunoCapabilities } from "@/lib/isluno-catalog";
import { getClientSlug } from "@/lib/tenant";
import { tenantKey } from "@/lib/query-keys";
import { ApiError } from "@/lib/error";

export function useIslunoWorkspace() {
  const tenant = getClientSlug();
  const search = useSearch();
  const [location] = useLocation();
  const query = useQuery({
    queryKey: tenantKey("isluno-capabilities"),
    queryFn: fetchIslunoCapabilities,
    enabled: tenant === "mermaid",
    retry: false,
    staleTime: 30_000,
  });
  const unavailable =
    tenant === "mermaid" &&
    query.isError &&
    !(query.error instanceof ApiError && query.error.status === 404);
  const brand =
    !query.isError &&
    query.data?.tenant_slug === tenant &&
    query.data.enabled === true &&
    query.data.capabilities.brand_profile === true &&
    query.data.brand?.id === "isluno"
      ? query.data.brand
      : null;
  return {
    query,
    brand,
    enabled:
      tenant === "mermaid" &&
      !!brand &&
      query.data?.capabilities.itinerary_workspace === true,
    legacy:
      new URLSearchParams(search).get("view") === "mermaid" ||
      location.startsWith("/reservations/") ||
      location.startsWith("/customers/"),
    unavailable,
    loading: tenant === "mermaid" && query.isLoading,
  };
}
