import { pool } from "@workspace/db";
import { logger } from "./logger.js";

const CLIENT_SLUG = "unboks";

interface DemoConversation {
  externalId: string;
  platform: string;
  contactName: string;
  contactId: string;
  lastMessage: string;
  lastMessageAt: () => string;
  unread: boolean;
  escalated: boolean;
  escalationResolved: boolean;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt: () => string;
  }>;
}

function minsAgo(m: number): () => string {
  return () => new Date(Date.now() - m * 60_000).toISOString();
}

function hrsAgo(h: number): () => string {
  return () => new Date(Date.now() - h * 3_600_000).toISOString();
}

const DEMO_CONVERSATIONS: DemoConversation[] = [
  // ── 1. WhatsApp — Sofia Martínez (unread, not escalated) ─────────────────
  {
    externalId: "demo-wa-sofia",
    platform: "whatsapp",
    contactName: "Sofia Martínez",
    contactId: "+34612345678",
    lastMessage:
      "Hi, I'd like to book a tour for 4 people this Saturday. Is the Blue Lagoon trip still available?",
    lastMessageAt: minsAgo(18),
    unread: true,
    escalated: false,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content: "Hello! Do you have tours available this weekend?",
        createdAt: minsAgo(40),
      },
      {
        role: "assistant",
        content:
          "Hi Sofia! Yes, we have several tours available this weekend. What destination are you interested in?",
        createdAt: minsAgo(35),
      },
      {
        role: "user",
        content:
          "Hi, I'd like to book a tour for 4 people this Saturday. Is the Blue Lagoon trip still available?",
        createdAt: minsAgo(18),
      },
    ],
  },

  // ── 2. Email — James Okafor (read, not escalated) ────────────────────────
  {
    externalId: "demo-email-james",
    platform: "email",
    contactName: "James Okafor",
    contactId: "james.okafor@gmail.com",
    lastMessage:
      "Please confirm my reservation for the Blue Lagoon trip on Friday. We'll be 2 adults and 1 child.",
    lastMessageAt: hrsAgo(2),
    unread: false,
    escalated: false,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content:
          "Good morning, I made a booking last week for the Blue Lagoon trip on Friday. Booking ref BK-2041.",
        createdAt: hrsAgo(3),
      },
      {
        role: "assistant",
        content:
          "Hi James! I can see your booking BK-2041. You're confirmed for Friday's Blue Lagoon trip. Is there anything else you need?",
        createdAt: hrsAgo(2.5),
      },
      {
        role: "user",
        content:
          "Please confirm my reservation for the Blue Lagoon trip on Friday. We'll be 2 adults and 1 child.",
        createdAt: hrsAgo(2),
      },
      {
        role: "assistant",
        content:
          "Confirmed! 2 adults + 1 child on Friday's Blue Lagoon trip (BK-2041). See you there!",
        createdAt: hrsAgo(1.8),
      },
    ],
  },

  // ── 3. Instagram — Chloe Dupont (unread, not escalated) ──────────────────
  {
    externalId: "demo-ig-chloe",
    platform: "instagram",
    contactName: "Chloe Dupont",
    contactId: "chloe.dupont.ig",
    lastMessage:
      "Are you available for a whale watching trip next week for 2 people? What's the price?",
    lastMessageAt: hrsAgo(3),
    unread: true,
    escalated: false,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content:
          "Hey! I saw your posts about the whale watching tours 🐋 Looks absolutely amazing!",
        createdAt: hrsAgo(4),
      },
      {
        role: "assistant",
        content:
          "Thank you Chloe! Our whale watching tours run daily and the season has been incredible. What dates are you looking at?",
        createdAt: hrsAgo(3.5),
      },
      {
        role: "user",
        content:
          "Are you available for a whale watching trip next week for 2 people? What's the price?",
        createdAt: hrsAgo(3),
      },
    ],
  },

  // ── 4. Facebook — Marco Ricci (unread, ESCALATED — refund/cancel) ────────
  {
    externalId: "demo-fb-marco",
    platform: "facebook",
    contactName: "Marco Ricci",
    contactId: "marco.ricci.fb",
    lastMessage:
      "I need to cancel my booking for tomorrow's trip and I want a full refund. This is completely unacceptable.",
    lastMessageAt: minsAgo(45),
    unread: true,
    escalated: true,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content:
          "Hi, I booked a trip for tomorrow but I just found out I have a family emergency.",
        createdAt: hrsAgo(1.5),
      },
      {
        role: "assistant",
        content:
          "I'm sorry to hear that Marco. Could you share your booking reference so I can look into your options?",
        createdAt: hrsAgo(1.3),
      },
      {
        role: "user",
        content:
          "BK-2039. I need a full refund. The trip is tomorrow and I cannot make it.",
        createdAt: hrsAgo(1),
      },
      {
        role: "assistant",
        content:
          "I understand the urgency. I'm escalating this to our team now for an urgent refund review.",
        createdAt: minsAgo(55),
      },
      {
        role: "user",
        content:
          "I need to cancel my booking for tomorrow's trip and I want a full refund. This is completely unacceptable.",
        createdAt: minsAgo(45),
      },
    ],
  },

  // ── 5. Messenger — Amara Diallo (unread, ESCALATED — complaint) ──────────
  {
    externalId: "demo-msg-amara",
    platform: "messenger",
    contactName: "Amara Diallo",
    contactId: "amara.diallo.msg",
    lastMessage:
      "The boat trip yesterday was cancelled at the last minute and nobody notified us. We drove 2 hours for nothing.",
    lastMessageAt: hrsAgo(5),
    unread: true,
    escalated: true,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content:
          "Hi, I was booked on yesterday's morning boat trip. Booking ref BK-2037.",
        createdAt: hrsAgo(6),
      },
      {
        role: "assistant",
        content:
          "Hi Amara! I can see your booking. How can I help you today?",
        createdAt: hrsAgo(5.8),
      },
      {
        role: "user",
        content:
          "The boat trip yesterday was cancelled at the last minute and nobody notified us. We drove 2 hours for nothing.",
        createdAt: hrsAgo(5),
      },
    ],
  },

  // ── 6. WhatsApp — Lena Bauer (read, not escalated) ───────────────────────
  {
    externalId: "demo-wa-lena",
    platform: "whatsapp",
    contactName: "Lena Bauer",
    contactId: "+49170987654",
    lastMessage:
      "What time do we need to be at the dock for the morning cruise? Is parking available nearby?",
    lastMessageAt: hrsAgo(6),
    unread: false,
    escalated: false,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content: "Hi! Really looking forward to the cruise on Thursday!",
        createdAt: hrsAgo(7),
      },
      {
        role: "assistant",
        content:
          "Hi Lena! We're so excited to have you. Is there anything you'd like to know before Thursday?",
        createdAt: hrsAgo(6.5),
      },
      {
        role: "user",
        content:
          "What time do we need to be at the dock for the morning cruise? Is parking available nearby?",
        createdAt: hrsAgo(6),
      },
      {
        role: "assistant",
        content:
          "Please arrive by 8:30 AM for a 9:00 AM departure. Free parking is available at the marina car park — just a 3-minute walk to the dock.",
        createdAt: hrsAgo(5.5),
      },
    ],
  },

  // ── 7. Email — Thomas Andersen (read, not escalated) ─────────────────────
  {
    externalId: "demo-email-thomas",
    platform: "email",
    contactName: "Thomas Andersen",
    contactId: "t.andersen@outlook.com",
    lastMessage:
      "The weather forecast for this weekend looks rough. Can I rebook my hiking tour for next month instead?",
    lastMessageAt: hrsAgo(8),
    unread: false,
    escalated: false,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content:
          "Hi, I have a hiking tour booked for this Saturday. Ref BK-2040.",
        createdAt: hrsAgo(9),
      },
      {
        role: "assistant",
        content:
          "Hello Thomas! Yes, your hiking tour for Saturday is confirmed. Is there anything you'd like to check?",
        createdAt: hrsAgo(8.5),
      },
      {
        role: "user",
        content:
          "The weather forecast for this weekend looks rough. Can I rebook my hiking tour for next month instead?",
        createdAt: hrsAgo(8),
      },
    ],
  },

  // ── 8. Facebook — Yuki Tanaka (unread, ESCALATED — confirmed booking) ────
  {
    externalId: "demo-fb-yuki",
    platform: "facebook",
    contactName: "Yuki Tanaka",
    contactId: "yuki.tanaka.fb",
    lastMessage:
      "Booking confirmed for Saturday's sunset cruise — just a note, two of our group are vegetarian. Can you accommodate?",
    lastMessageAt: hrsAgo(1),
    unread: true,
    escalated: true,
    escalationResolved: false,
    messages: [
      {
        role: "user",
        content:
          "Hi! We just completed our booking for the Saturday sunset cruise, group of 6.",
        createdAt: hrsAgo(2),
      },
      {
        role: "assistant",
        content:
          "Hi Yuki! Your group of 6 is confirmed for Saturday's sunset cruise. We can't wait to have you aboard!",
        createdAt: hrsAgo(1.5),
      },
      {
        role: "user",
        content:
          "Booking confirmed for Saturday's sunset cruise — just a note, two of our group are vegetarian. Can you accommodate?",
        createdAt: hrsAgo(1),
      },
    ],
  },
];

export async function seedDemoData(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  try {
    const existing = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM conversations WHERE client_slug = $1`,
      [CLIENT_SLUG],
    );
    const count = parseInt(existing.rows[0]?.count ?? "0", 10);
    if (count > 0) {
      logger.info(
        { count },
        "Demo seed: data already exists — skipping",
      );
      return;
    }

    logger.info("Demo seed: inserting demo data for local development");

    for (const demo of DEMO_CONVERSATIONS) {
      const convResult = await pool.query<{ id: string }>(
        `INSERT INTO conversations
           (client_slug, external_id, platform, contact_name, contact_id,
            last_message, last_message_at, unread, escalated, escalation_resolved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          CLIENT_SLUG,
          demo.externalId,
          demo.platform,
          demo.contactName,
          demo.contactId,
          demo.lastMessage,
          demo.lastMessageAt(),
          demo.unread,
          demo.escalated,
          demo.escalationResolved,
        ],
      );

      const convId = convResult.rows[0]?.id;
      if (!convId) continue;

      for (const msg of demo.messages) {
        await pool.query(
          `INSERT INTO messages (conversation_id, role, content, created_at)
           VALUES ($1, $2, $3, $4)`,
          [convId, msg.role, msg.content, msg.createdAt()],
        );
      }
    }

    logger.info(
      "Demo seed: complete — 8 conversations, 3 escalations, messages inserted",
    );
  } catch (err) {
    logger.warn({ err }, "Demo seed: failed (non-fatal, continuing startup)");
  }
}
