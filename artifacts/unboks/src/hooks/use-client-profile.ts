import { useQuery } from "@tanstack/react-query";
import { getClientProfile, type ClientProfile } from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

/**
 * Tenant workspace profile (business name + status) for sidebar/header display.
 *
 * J3-N2-15: the underlying `getClientProfile()` already degrades to a
 * slug-derived display name if the backend hasn't shipped `/client/profile`
 * yet, so the hook always resolves to a usable `ClientProfile`. We still
 * wrap it in React Query so the result is cached, deduped across the
 * Drawer/Header/etc., and refetched once when the operator switches tenant.
 */
export function useClientProfile() {
  const slug = getClientSlug();
  return useQuery<ClientProfile>({
    queryKey: ["client-profile", slug],
    queryFn: getClientProfile,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    // A real backend regression now throws (404 + offline are still caught
    // and resolved as the slug-derived fallback inside getClientProfile).
    // Cap retries so a flaky tenant doesn't hammer the API on every render.
    retry: 1,
    // The sidebar can always fall back to the prettified slug if the
    // query errors, so we don't want React Query's error boundary to ever
    // unmount the Drawer. Consumers read `data` only.
    throwOnError: false,
  });
}
