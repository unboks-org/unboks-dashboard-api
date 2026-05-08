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

export function saveSot(blocks: SotBlock[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
  } catch {
    // ignore
  }
}
