import { useQuery } from "@tanstack/react-query";
import { fetchOnboardingStatus } from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";
import { tenantKey } from "@/lib/query-keys";

export function useOnboardingStatus() {
  const slug = getClientSlug();
  return useQuery({
    queryKey: tenantKey("onboarding-status", slug),
    queryFn: fetchOnboardingStatus,
    staleTime: 60_000,
    retry: 1,
  });
}
