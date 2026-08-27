import { useQuery } from "@tanstack/react-query";
import { fetchRentalCapability } from "@/lib/rental-catalog";
import { tenantKey } from "@/lib/query-keys";

export function useRentalControlCapability() {
  const query = useQuery({
    queryKey: tenantKey("rental-catalog", "capability"),
    queryFn: ({ signal }) => fetchRentalCapability(signal),
    staleTime: 30_000,
    gcTime: 0,
    // Reuse fresh tenant capability data when the page remounts. Only the
    // initial request should block the Rental boundary.
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
  return {
    enabled: query.data?.enabled === true,
    isLoading: query.isPending,
    isUnavailable: query.isError,
    retry: query.refetch,
  };
}
