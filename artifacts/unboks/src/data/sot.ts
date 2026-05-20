import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSourceOfTruth, saveSourceOfTruth } from "@/lib/api";
import { getClientSlug } from "@/lib/tenant";

export interface SotSubsection {
  title: string;
  content?: string;
  items?: string[];
}

export interface SotBlock {
  id: string;
  title: string;
  content?: string;
  items?: string[];
  subsections?: SotSubsection[];
}

// Kept as an exported constant for older imports, but intentionally empty.
// Fresh tenants must start blank. The dashboard must never seed Unboks
// knowledge into another tenant.
export const DEFAULT_SOT: SotBlock[] = [];

// Tenant-scoped query key. If a sign-in or deep link switches tenants
// mid-session (App.tsx calls setClientSlug for both), the cache must
// not surface the previous tenant's SOT. Stable for the duration the
// slug is the same, which is the only window the data is valid.
function sotQueryKey(slug: string): readonly [string, string] {
  return ["source-of-truth", slug] as const;
}

export interface UseSotResult {
  blocks: SotBlock[];
  saveBlock: (block: SotBlock) => Promise<void>;
  isSaving: boolean;
  isLoading: boolean;
  loadError: Error | null;
}

/**
 * Backend-synced Source-of-Truth hook.
 *
 * Behaviour:
 *   - GET /source-of-truth on mount via React Query.
 *   - Empty backend state renders as an empty knowledge panel.
 *   - `saveBlock` does a full PUT of the merged blocks list. The backend
 *     response is treated as canonical and replaces the cached value.
 *     Errors are re-thrown so the caller can show a toast and keep the
 *     operator in edit mode with their unsaved changes intact (the
 *     `SotKnowledgeCard` consumer relies on this throw-on-failure
 *     contract; do NOT swallow errors here).
 *
 * No `localStorage`. No silent fallback. If the backend is unreachable
 * the panel shows a clear error and Save is disabled until the GET
 * recovers.
 */
export function useSot(): UseSotResult {
  const qc = useQueryClient();
  // Snapshot the slug for the lifetime of this hook instance. App.tsx
  // remounts the route tree on tenant switch (sign in / deep link), so
  // a stable per-mount slug is correct and avoids re-keying the query
  // on every render.
  const slug = getClientSlug();
  const queryKey = useMemo(() => sotQueryKey(slug), [slug]);

  const query = useQuery({
    queryKey,
    queryFn: fetchSourceOfTruth,
    staleTime: 30_000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: async (next: SotBlock[]) => saveSourceOfTruth(next),
    onSuccess: (canonical) => {
      qc.setQueryData<SotBlock[]>(queryKey, canonical);
    },
  });

  // No render-time fallback to DEFAULT_SOT. Earlier we returned
  // DEFAULT_SOT while `query.isLoading` was true so the panel didn't
  // flash empty, but that opened a window where Edit/Save could fire
  // against fallback content from the wrong tenant. The Settings panel
  // renders a "Loading..." state
  // while `isLoading` is true (see Settings.tsx YourInfoKnowledge), so
  // returning `[]` here is safe and removes the foot-gun entirely.
  const blocks: SotBlock[] = query.data ?? [];

  const saveBlock = useCallback(
    async (updated: SotBlock) => {
      // Optimistic merge so two concurrent saves on different cards
      // don't clobber each other: each call reads the latest cache
      // snapshot, applies its change, then writes the merged array
      // back to the cache BEFORE awaiting the PUT. The second save's
      // snapshot then includes the first's pending change. On success
      // the backend's canonical response replaces the cache (in
      // `saveMutation.onSuccess`); on failure we roll back to the
      // pre-save snapshot so a rejected PUT doesn't leave optimistic
      // data sitting in the panel.
      const previous = qc.getQueryData<SotBlock[]>(queryKey) ?? [];
      const exists = previous.some((b) => b.id === updated.id);
      const next = exists
        ? previous.map((b) => (b.id === updated.id ? updated : b))
        : [...previous, updated];
      qc.setQueryData<SotBlock[]>(queryKey, next);
      try {
        // mutateAsync re-throws on failure so the caller
        // (SotKnowledgeCard) can surface a toast and keep the
        // operator in edit mode. Do not wrap this in a try/catch that
        // swallows the error.
        await saveMutation.mutateAsync(next);
      } catch (err) {
        qc.setQueryData<SotBlock[]>(queryKey, previous);
        throw err;
      }
    },
    [qc, queryKey, saveMutation],
  );

  return {
    blocks,
    saveBlock,
    isSaving: saveMutation.isPending,
    isLoading: query.isLoading,
    loadError: (query.error as Error) ?? null,
  };
}
