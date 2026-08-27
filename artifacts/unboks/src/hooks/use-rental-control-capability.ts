import { useQuery } from "@tanstack/react-query";
import { fetchRentalCapability } from "@/lib/rental-catalog";
import { tenantKey } from "@/lib/query-keys";

export function useRentalControlCapability() {
  const query = useQuery({
    queryKey: tenantKey("rental-catalog", "capability"),
    queryFn: ({ signal }) => fetchRentalCapability(signal),
    staleTime: 30_000,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  return {
    tenantSlug: query.data?.tenantSlug ?? null,
    enabled: query.data?.enabled === true,
    // Refetches may begin with an older cached `enabled: false` value. Keep
    // showing the verification state until the authoritative request settles
    // instead of briefly claiming that the tenant is disabled.
    isLoading: query.isPending || query.isFetching,
    isUnavailable: query.isError,
    error: query.error,
    retry: query.refetch,
  };
}
