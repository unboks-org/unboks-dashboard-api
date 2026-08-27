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
    enabled: query.data?.enabled === true,
    isLoading: query.isLoading,
    isUnavailable: query.isError,
  };
}
