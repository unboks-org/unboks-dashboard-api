import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAgentStatus,
  setAgentStatus,
  type AgentStatus,
} from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

function key() {
  return ["agent-status", getClientSlug()] as const;
}

export function useAgentStatus() {
  return useQuery<AgentStatus>({
    queryKey: key(),
    queryFn: getAgentStatus,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useSetAgentStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setAgentStatus,
    onSuccess: (status) => {
      client.setQueryData(key(), status);
      toast.success(status.active ? "Agent started." : "Agent paused.");
    },
    onError: () => {
      toast.error("The agent status could not be changed. Please try again.");
    },
  });
}
