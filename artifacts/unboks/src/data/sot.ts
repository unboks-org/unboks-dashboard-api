import { useCallback, useEffect, useMemo, useRef } from "react";
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

/**
 * Default Source-of-Truth content. Used in two places:
 *  1. As the seed PUT to the backend when GET returns an empty list (so
 *     a fresh tenant starts with the canonical Unboks knowledge base
 *     instead of a blank panel).
 *  2. As a render-time fallback while the initial GET is still loading
 *     so the operator never sees a blank knowledge panel mid-load.
 *
 * The backend is the single source of truth once a workspace has any
 * blocks at all. We never read or write `localStorage` for SOT.
 */
export const DEFAULT_SOT: SotBlock[] = [
  {
    id: "core-value",
    title: "Core Value",
    content:
      "We save our clients time by letting your Unboks Agent answer routine messages and only passing selected messages to a human.",
  },
  {
    id: "clients",
    title: "Clients",
    content:
      "Our clients receive the same kinds of messages every day across different channels and still answer them manually.",
  },
  {
    id: "channels",
    title: "Channels",
    items: ["WhatsApp", "Email", "Instagram", "Facebook", "Telegram", "TikTok", "X"],
  },
  {
    id: "core-functionality",
    title: "Core Functionality",
    items: [
      "Your Unboks Agent automatically replies to messages.",
      "Agent uses client-provided information to answer.",
      "Agent sorts and classifies messages (e.g. question, booking, order).",
      "Agent forwards messages to the right person.",
      "Agent follows up automatically.",
      "Your Agent improves from approved answers.",
      "Agent supports multiple languages.",
      "Agent runs 24/7.",
      "All conversations are visible in one unified inbox.",
      "Humans can step in and reply from the dashboard.",
    ],
  },
  {
    id: "escalation-system",
    title: "Escalation System",
    subsections: [
      {
        title: "Hard escalation",
        items: [
          "Booking is confirmed and paid.",
          "Customer asks for a human.",
          "Complaint.",
          "Refund or payment issue.",
          "Booking problem.",
          "Legal issue.",
          "Customer persists in inappropriate, unethical, or irrelevant behavior.",
        ],
      },
      {
        title: "Hard escalation - behavior",
        content: "Your Agent stops and hands the conversation to a human. The human replies directly from the dashboard.",
      },
      {
        title: "Soft escalation",
        content:
          "Your Agent asks a human for input internally and uses that input to reply to the customer.",
      },
      {
        title: "No escalation",
        content:
          "Unclear question or low confidence, Agent continues asking and iterating until resolved.",
      },
    ],
  },
  {
    id: "knowledge-base",
    title: "Knowledge Base (SOT)",
    subsections: [
      {
        title: "Setup",
        content:
          "During intake, Unboks gathers all relevant client information and builds the Source of Truth.",
      },
      {
        title: "Sources",
        items: [
          "PDFs",
          "Text and notes",
          "FAQs",
          "Images",
          "Pricing",
          "Policies",
          "Website content",
          "Chat history",
        ],
      },
      {
        title: "Updates",
        content: "Clients can add or update information at any time.",
        items: [
          "Special offers (e.g. Valentine's Day, Christmas)",
          "Temporary opening hours",
          "Seasonal services or promotions",
        ],
      },
    ],
  },
  {
    id: "communication-style",
    title: "Communication Style",
    items: [
      "Tone of voice is defined during intake.",
      "Unboks sets how your Agent communicates.",
      "Clients do not change tone directly.",
      "Unboks can update tone when needed.",
    ],
  },
  {
    id: "human-handover",
    title: "Human Handover",
    content:
      "All escalations are handled inside the Unboks dashboard. Notifications can be sent externally (e.g. WhatsApp or Telegram).",
  },
  {
    id: "daily-use",
    title: "Daily Use",
    items: [
      "Check notifications.",
      "View escalations.",
      "View messages.",
      "Check bookings (bookings are treated as escalations).",
    ],
  },
  {
    id: "structured-data",
    title: "Structured Data Extraction",
    items: [
      "Customer name",
      "Contact details",
      "Channel / source",
      "Date and time",
      "Number of people",
      "Service or order type",
      "Payment status",
      "Special requests",
      "Notes",
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    items: ["WhatsApp", "Email", "Instagram", "Facebook", "Telegram", "TikTok", "X"],
    subsections: [
      {
        title: "Internal note",
        content: "Zernio is used internally but is not visible to the client.",
      },
    ],
  },
  {
    id: "onboarding",
    title: "Onboarding",
    items: [
      "Client contacts Unboks.",
      "Unboks conducts intake conversation.",
      "Information is gathered.",
      "Channels are connected.",
      "Source of Truth is built.",
      "Client receives dashboard access.",
    ],
    subsections: [
      {
        title: "Trial",
        content: "Client receives 14 days free. After 14 days, service becomes paid.",
      },
    ],
  },
  {
    id: "pricing",
    title: "Pricing",
    content:
      "Pricing is not fixed. Clients must contact Unboks for personalized pricing.",
  },
  {
    id: "positioning",
    title: "Positioning",
    content:
      "Unboks replaces time spent on repetitive messages by letting your Agent handle them and only sending the important ones to you.",
  },
  {
    id: "not-unboks",
    title: "What Unboks is NOT",
    items: [
      "Not a chatbot builder.",
      "Not a CRM.",
      "Not a marketing tool.",
      "Not a helpdesk or ticketing system.",
      "Not a social media management tool.",
    ],
  },
];

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
 *   - If the GET returns an empty array AND we have not already
 *     attempted a seed in this session, PUT `DEFAULT_SOT` once so the
 *     workspace lands on the canonical content. Future GETs will return
 *     whatever the backend stored. The seed-once latch (`seededRef`) is
 *     intentionally module-instance scoped via a hook ref so React 18
 *     StrictMode's double-invoke doesn't fire two PUTs.
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
  const seededRef = useRef(false);
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

  const seedMutation = useMutation({
    mutationFn: () => saveSourceOfTruth(DEFAULT_SOT),
    onSuccess: (canonical) => {
      qc.setQueryData<SotBlock[]>(queryKey, canonical);
    },
  });

  // One-shot seed when the backend reports an empty workspace. We gate
  // on `isSuccess` (not just `data`) so a still-loading or errored
  // initial fetch never trips the seed path. Narrow deps to the
  // mutation's stable callbacks (not the whole object, which is
  // re-created every render) so the effect doesn't re-evaluate
  // needlessly. The `seededRef` latch still belt-and-braces against
  // React 18 StrictMode double-invoke.
  const seedMutate = seedMutation.mutate;
  const seedPending = seedMutation.isPending;
  useEffect(() => {
    if (
      query.isSuccess &&
      Array.isArray(query.data) &&
      query.data.length === 0 &&
      !seededRef.current &&
      !seedPending
    ) {
      seededRef.current = true;
      seedMutate();
    }
  }, [query.isSuccess, query.data, seedMutate, seedPending]);

  const saveMutation = useMutation({
    mutationFn: async (next: SotBlock[]) => saveSourceOfTruth(next),
    onSuccess: (canonical) => {
      qc.setQueryData<SotBlock[]>(queryKey, canonical);
    },
  });

  // No render-time fallback to DEFAULT_SOT. Earlier we returned
  // DEFAULT_SOT while `query.isLoading` was true so the panel didn't
  // flash empty, but that opened a window where Edit/Save could fire
  // against fallback content with ids the real backend payload doesn't
  // contain — losing the operator's edit silently or racing the
  // seed-on-empty PUT. The Settings panel renders a "Loading..." state
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
      const next = previous.map((b) => (b.id === updated.id ? updated : b));
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
    isSaving: saveMutation.isPending || seedMutation.isPending,
    // Treat the in-flight seed PUT as "still loading" too — the cards
    // would render with stale-empty data otherwise, and we want the
    // panel to stay in its loading state until the canonical content
    // is in the cache.
    isLoading: query.isLoading || seedMutation.isPending,
    loadError: (query.error as Error) ?? null,
  };
}
