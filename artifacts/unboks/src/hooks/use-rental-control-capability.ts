import { useQuery } from "@tanstack/react-query";
import { fetchRentalCapability } from "@/lib/rental-catalog";
import { tenantKey } from "@/lib/query-keys";

export function useRentalControlCapability() {
  const query = useQuery({
    queryKey: tenantKey("rental-catalog", "capability"),
    queryFn: ({ signal }) => fetchRentalCapability(signal),
    staleTime: 30_000,
    gcTime: 0,
    // RentalControlCenter also observes this capability after the page-level
    // check succeeds. Refetching fresh data for every new observer makes the
    // page hide and unmount the editor, which mounts another observer and
    // creates an endless fetch/mount loop.
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
  return {
    tenantSlug: query.data?.tenantSlug ?? null,
    enabled: query.data?.enabled === true,
    // Only the first request blocks the page. A background verification must
    // not tear down already-authorized controls and restart their queries.
    isLoading: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
    isUnavailable: query.isError,
    error: query.error,
    retry: query.refetch,
  };
}
