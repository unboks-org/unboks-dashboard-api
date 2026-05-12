import { useCallback, useState } from "react";

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
    items: ["WhatsApp", "Email", "Instagram", "Facebook", "Telegram", "Messenger"],
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
        title: "Hard escalation — behavior",
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
    items: ["WhatsApp", "Email", "Instagram", "Facebook", "Telegram", "Messenger"],
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

const STORAGE_KEY = "unboks_sot";

export function loadSot(): SotBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SOT;
    return parsed as SotBlock[];
  } catch {
    return DEFAULT_SOT;
  }
}

export function saveSotSync(blocks: SotBlock[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
  } catch {
    // ignore
  }
}

/**
 * Persistence shape for the editable Source-of-Truth UI.
 *
 * `source` is intentionally exposed so the UI can be transparent with the
 * operator about *where* the change lives. Today the dashboard has no
 * backend endpoint for SOT (see backend contract notes in the R2-28
 * report), so writes are persisted to `localStorage` and the UI shows a
 * clear "saved on this device" notice rather than faking server-side
 * persistence. When the backend ships the contract documented below,
 * `useSot` is the single swap point: replace the localStorage write with
 * a `PUT /api/unboks/source-of-truth` call and flip `source` to
 * `"server"`.
 *
 * Backend contract needed (frontend-ready):
 *   GET  /api/unboks/source-of-truth  -> { blocks: SotBlock[] }
 *   PUT  /api/unboks/source-of-truth  body { blocks: SotBlock[] }
 *                                     -> { blocks: SotBlock[] }
 *   Auth: same tenant cookie as the rest of the dashboard.
 *   Validation: titles are server-controlled (don't trust client titles
 *   for built-in blocks); content/items/subsections are free-text and
 *   should be length-capped (e.g. 4 KB per field) to stop runaway pastes.
 */
export type SotSource = "local" | "server";

export interface UseSotResult {
  blocks: SotBlock[];
  source: SotSource;
  saveBlock: (block: SotBlock) => Promise<void>;
  isSaving: boolean;
}

export function useSot(): UseSotResult {
  // Lazy initialiser: read once from localStorage on first render and keep
  // the hydrated array in React state so subsequent edits show up
  // immediately without re-reading storage.
  const [blocks, setBlocks] = useState<SotBlock[]>(() => loadSot());
  const [isSaving, setIsSaving] = useState(false);

  const saveBlock = useCallback(async (updated: SotBlock) => {
    setIsSaving(true);
    try {
      // Build the next array with the updated block in place. We never
      // change block ordering or insert new blocks here — the editor is
      // strictly an in-place editor for known sections.
      const next = blocks.map((b) => (b.id === updated.id ? updated : b));
      // No backend yet — persist locally and surface the failure to the
      // caller so the UI can show an error state instead of a fake
      // success. NOTE: we intentionally bypass `saveSotSync` here because
      // it swallows storage errors for backwards-compat callers; the hook
      // needs the raw exception so a quota / private-mode failure can be
      // shown to the operator. When the API ships, swap this for a
      // `PUT /api/unboks/source-of-truth` and only update local state on
      // a 2xx.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? err.message
            : "Browser storage refused the write (it may be full or in private mode).",
        );
      }
      // Only mirror the new array into React state after the write
      // succeeded — on failure we keep the canonical pre-save value so
      // the read view never shows data that wasn't actually persisted.
      setBlocks(next);
    } finally {
      setIsSaving(false);
    }
  }, [blocks]);

  return { blocks, source: "local", saveBlock, isSaving };
}
