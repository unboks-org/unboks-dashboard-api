import { useCallback, useEffect, useState } from "react";
import {
  fetchAgentNameSettings,
  saveAgentNameSettings,
  type AgentNameSettings,
} from "@/lib/api";

const DEFAULT: AgentNameSettings = {
  defaultName: "Marina",
  tenantValue: "Marina",
  adminOverride: null,
  effectiveName: "Marina",
  source: "default",
};

export function useAgentNameSettings() {
  const [settings, setSettings] = useState<AgentNameSettings>(DEFAULT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchAgentNameSettings()
      .then((next) => {
        if (!cancelled) setSettings({ ...DEFAULT, ...next });
      })
      .catch(() => {
        if (!cancelled) setSettings(DEFAULT);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (agentName: string) => {
    const next = await saveAgentNameSettings(agentName);
    setSettings({ ...DEFAULT, ...next });
    return next;
  }, []);

  return { settings, isLoading, save };
}
