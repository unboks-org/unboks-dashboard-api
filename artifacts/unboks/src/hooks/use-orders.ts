import { useQuery } from "@tanstack/react-query";
import { fetchOrders, type Appointment } from "@/lib/api";

const ORDERS_KEY = ["orders"] as const;

export interface UseOrdersResult {
  orders: Appointment[];
  isLoading: boolean;
  backendAvailable: boolean;
}

export function useOrders(): UseOrdersResult {
  const query = useQuery({
    queryKey: ORDERS_KEY,
    queryFn: fetchOrders,
    staleTime: 30_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    retry: 0,
  });

  return {
    orders: query.data?.items ?? [],
    isLoading: query.isLoading,
    backendAvailable: query.isSuccess && query.data?.connected === true,
  };
}
