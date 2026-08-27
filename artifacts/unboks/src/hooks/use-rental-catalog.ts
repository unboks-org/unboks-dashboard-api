import { useQuery } from "@tanstack/react-query";
import { useRentalControlCapability } from "@/hooks/use-rental-control-capability";
import { fetchRentalDraft } from "@/lib/rental-catalog";
import { tenantKey } from "@/lib/query-keys";

export function useRentalCatalogDraft() {
  const capability = useRentalControlCapability();
  const query = useQuery({
    queryKey: tenantKey("rental-catalog", "draft"),
    queryFn: ({ signal }) => fetchRentalDraft(signal),
    enabled: capability.enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  return { ...query, capability };
}
