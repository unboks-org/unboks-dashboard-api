import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAgentStatus, setAgentStatus, type AgentStatus } from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";
import { tenantKey } from "@/lib/query-keys";

function key() {
  return tenantKey("agent-status");
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
    onMutate: () => ({ queryKey: key(), tenant: getClientSlug() }),
    onSuccess: (status, _active, context) => {
      if (!context || context.tenant !== getClientSlug()) return;
      client.setQueryData(context.queryKey, status);
      if (status.available === true && typeof status.active === "boolean")
        toast.success(status.active ? "Agent started." : "Agent paused.");
      else
        toast.error("Automation state could not be verified. Refresh status.");
    },
    onError: () => {
      toast.error("The agent status could not be changed. Please try again.");
    },
  });
}
