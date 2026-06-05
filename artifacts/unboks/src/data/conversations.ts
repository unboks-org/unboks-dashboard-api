export type Channel = "All" | "Email" | "WhatsApp" | "Instagram" | "Facebook" | "Messenger" | "Telegram" | "TikTok" | "X" | "Unknown";

export type EscalationMode = "soft" | "hard" | "order" | null;
export type LearningStatus = "none" | "suggested" | "approved" | "saved";

export interface Conversation {
  id: string;
  /**
   * Backend-routable conversation key for write actions
   * (email Reply / Forward / Delete, future per-channel mutations).
   *
   * For most rows this equals `id` — `mapApiConversation` picks the
   * strongest available backend identifier (`conversationId` →
   * `conversation_id` → `threadKey` → `thread_key` → `phone` →
   * `external_id` → `externalId` → `_id`) and writes the same value
   * to both fields. Keeping a separate field lets call sites be
   * explicit about which one they want and lets us evolve `id`
   * (display key) independently of the routable key in future.
   *
   * Optional only because legacy mock rows in this file don't set it.
   */
  conversationKey?: string;
  /**
   * When the row originated from `/escalations`, this is the source
   * escalation id. Used as a fallback hide key when the row has no
   * routable `conversationKey` (e.g. an Email escalation whose
   * conversation never made it into `/messages/conversations`).
   * Optional only because plain inbox rows don't have one.
   */
  escalationId?: string;
  channel: Channel;
  sender: string;
  subject: string;
  preview: string;
  timestamp: string;
  /**
   * Raw last-message epoch (ms) used for newest-first sorting. 0 means
   * unknown/invalid — those rows sort to the bottom. Display formatting
   * still uses `timestamp`.
   */
  timestampMs?: number;
  unread: boolean;
  escalated: boolean;
  /**
   * Lightweight inbox-row signal that the latest visible text contains
   * a concrete appointment/date-time cue. This is a UI flag only; the
   * canonical appointment rows still come from `/appointments` and the
   * stricter appointment detector.
   */
  appointmentSignal?: boolean;
  hasAttachment: boolean;
  escalationMode?: EscalationMode;
  escalationSummary?: string | null;
  learningStatus?: LearningStatus;
  /**
   * Set to `true` for rows sourced from the resolved escalations endpoint.
   * Allows `ConversationDetailPane` to enforce read-only/history mode
   * independently of the active UI filter state.
   */
  resolvedEscalation?: boolean;
}

export const conversations: Conversation[] = [
  {
    id: "1",
    channel: "Email",
    sender: "Sarah Jenkins",
    subject: "Re: Your booking confirmation",
    preview: "Hi team, I need to reschedule my booking for tomorrow to next week. Let me know what slots are available.",
    timestamp: "9:42 AM",
    unread: true,
    escalated: true,
    hasAttachment: false,
  },
  {
    id: "2",
    channel: "WhatsApp",
    sender: "Michael Chang",
    subject: "Pricing inquiry",
    preview: "Can you send over the updated price list for the enterprise tier?",
    timestamp: "8:15 AM",
    unread: false,
    escalated: false,
    hasAttachment: true,
  },
  {
    id: "3",
    channel: "X",
    sender: "Alex Rivers",
    subject: "Issue with my recent order",
    preview: "Hey @unboks, my order #49281 never arrived. It says delivered on the tracker.",
    timestamp: "Yesterday",
    unread: true,
    escalated: true,
    hasAttachment: false,
  },
  {
    id: "4",
    channel: "Instagram",
    sender: "jessicashoes",
    subject: "Collaboration",
    preview: "Love your recent post! Would you be open to a collab? I have 50k followers in your niche.",
    timestamp: "Yesterday",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "5",
    channel: "Facebook",
    sender: "David Smith",
    subject: "Opening hours",
    preview: "Are you guys open this coming Monday for the public holiday?",
    timestamp: "3 Nov",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "6",
    channel: "Email",
    sender: "Emma Larson",
    subject: "Invoice #INV-2024-09",
    preview: "Please find attached the latest invoice. Note the change in our billing address.",
    timestamp: "3 Nov",
    unread: true,
    escalated: false,
    hasAttachment: true,
  },
  {
    id: "7",
    channel: "Facebook",
    sender: "Robert Downey",
    subject: "Refund request",
    preview: "I'd like to request a refund for the services rendered last month. They did not meet expectations.",
    timestamp: "2 Nov",
    unread: false,
    escalated: true,
    hasAttachment: false,
  },
  {
    id: "8",
    channel: "WhatsApp",
    sender: "Maria Garcia",
    subject: "Meeting follow up",
    preview: "Great meeting today! I'll send over the specs by end of day Friday.",
    timestamp: "2 Nov",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "9",
    channel: "Email",
    sender: "James Wilson",
    subject: "Account access",
    preview: "I'm locked out of my account. The password reset email never arrived. Please help.",
    timestamp: "1 Nov",
    unread: true,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "10",
    channel: "TikTok",
    sender: "tech_reviewer",
    subject: "Review unit",
    preview: "Can I get a review unit of the new model? My audience would love it.",
    timestamp: "31 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "11",
    channel: "Email",
    sender: "Linda Martinez",
    subject: "Feedback on feature",
    preview: "The new dashboard is great, but it's missing the export button we used to have.",
    timestamp: "31 Oct",
    unread: false,
    escalated: false,
    hasAttachment: true,
  },
  {
    id: "12",
    channel: "X",
    sender: "Devin_codes",
    subject: "API downtime",
    preview: "Is the API down? I'm getting 500s across all my endpoints for the last 10 minutes.",
    timestamp: "30 Oct",
    unread: true,
    escalated: true,
    hasAttachment: false,
  },
  {
    id: "13",
    channel: "Email",
    sender: "Richard Anderson",
    subject: "Contract renewal",
    preview: "Let's schedule a call to discuss the contract renewal for next year.",
    timestamp: "30 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "14",
    channel: "WhatsApp",
    sender: "Supplier Corp",
    subject: "Delivery delay",
    preview: "Apologies, the delivery scheduled for tomorrow is delayed by 2 days due to customs.",
    timestamp: "29 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "15",
    channel: "Instagram",
    sender: "photo_pro",
    subject: "License question",
    preview: "If I buy the standard tier, can I use it for commercial client work?",
    timestamp: "29 Oct",
    unread: true,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "16",
    channel: "Facebook",
    sender: "Susan Lee",
    subject: "Where are you located?",
    preview: "I tried calling but no answer. What's the exact address for the downtown branch?",
    timestamp: "28 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "17",
    channel: "Email",
    sender: "Paul Taylor",
    subject: "Bug report: checkout",
    preview: "When I try to check out with a non-US address, the form crashes.",
    timestamp: "28 Oct",
    unread: false,
    escalated: true,
    hasAttachment: true,
  },
  {
    id: "18",
    channel: "Facebook",
    sender: "Lisa Thomas",
    subject: "Update my email",
    preview: "Can you update the email on my account to this one? I lost access to the old one.",
    timestamp: "27 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "19",
    channel: "WhatsApp",
    sender: "Kevin White",
    subject: "Quick question",
    preview: "Does the warranty cover accidental drops?",
    timestamp: "27 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "20",
    channel: "Email",
    sender: "Karen Harris",
    subject: "Thank you!",
    preview: "Just wanted to say the support team was amazing yesterday. Resolved my issue in 5 minutes.",
    timestamp: "26 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "21",
    channel: "X",
    sender: "crypto_guy",
    subject: "Payment methods",
    preview: "Do you guys accept crypto payments? Would love to see USDC support.",
    timestamp: "26 Oct",
    unread: true,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "22",
    channel: "TikTok",
    sender: "daily_hacks",
    subject: "Promo code",
    preview: "Is the SUMMER50 promo code still valid? It's not working for me.",
    timestamp: "25 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "23",
    channel: "Email",
    sender: "Daniel Martin",
    subject: "Security vulnerability",
    preview: "I found a minor XSS vulnerability on your search page. Please see the attached report.",
    timestamp: "25 Oct",
    unread: false,
    escalated: true,
    hasAttachment: true,
  },
  {
    id: "24",
    channel: "Instagram",
    sender: "style_icon",
    subject: "Out of stock",
    preview: "When will the black version be back in stock in size M?",
    timestamp: "24 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  },
  {
    id: "25",
    channel: "WhatsApp",
    sender: "John Doe",
    subject: "Address change",
    preview: "Please update my shipping address to the new one I sent yesterday before dispatching.",
    timestamp: "24 Oct",
    unread: false,
    escalated: false,
    hasAttachment: false,
  }
];
