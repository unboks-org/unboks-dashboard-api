import { useIcpOverrides } from "@/hooks/use-icp-overrides";

export function useRentalControlCapability() {
  const query = useIcpOverrides();
  const toggle = query.data?.feature_toggles.rental_control_center_enabled;
  return {
    enabled: query.data?.available === true && toggle?.value === true,
    isLoading: query.isLoading,
    isUnavailable: query.data?.available === false,
  };
}
