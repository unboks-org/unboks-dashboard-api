import { useQuery } from "@tanstack/react-query";
import { fetchOnboardingStatus } from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

export function useOnboardingStatus() {
  const slug = getClientSlug();
  return useQuery({
    queryKey: ["onboarding-status", slug],
    queryFn: fetchOnboardingStatus,
    staleTime: 60_000,
    retry: 1,
  });
}
