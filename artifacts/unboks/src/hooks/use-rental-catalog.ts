import { useQuery } from "@tanstack/react-query";
import { fetchRentalDraft } from "@/lib/rental-catalog";
import { tenantKey } from "@/lib/query-keys";

export function useRentalCatalogDraft() {
  return useQuery({
    queryKey: tenantKey("rental-catalog", "draft"),
    queryFn: ({ signal }) => fetchRentalDraft(signal),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
