import { useQuery } from "@tanstack/react-query";
import { fetchRentalCapability } from "@/lib/rental-catalog";
import { tenantKey } from "@/lib/query-keys";
import { isMermaidReservationTenant } from "@/lib/tenant-ui";

export function useRentalControlCapability() {
  const mermaid = isMermaidReservationTenant();
  const query = useQuery({
    queryKey: tenantKey("rental-catalog", "capability"),
    queryFn: ({ signal }) => fetchRentalCapability(signal),
    enabled: !mermaid,
    staleTime: 30_000,
    gcTime: 0,
    // Reuse fresh tenant capability data when the page remounts. Only the
    // initial request should block the Rental boundary.
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
  return {
    enabled: !mermaid && query.data?.enabled === true,
    isLoading: !mermaid && query.isPending,
    isUnavailable: !mermaid && query.isError,
    retry: query.refetch,
  };
}
