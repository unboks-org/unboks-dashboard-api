import { ApiError } from "@/lib/error";
import { getApiBase, getToken, clearAuth } from "@/lib/tenant";
import { formatConversationTimestamp, parseTimestampMs } from "@/lib/conversation-mapper";

// ---------------------------------------------------------------------------
// Valid clients
// ---------------------------------------------------------------------------

export const VALID_CLIENTS = [
  "unboks",
  "bluemarlin",
  "adamus",
  "consultadespertares",
] as const;

export type ValidClient = (typeof VALID_CLIENTS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationMode = "soft" | "hard" | null;
export type LearningStatus = "none" | "suggested" | "approved" | "saved";

export interface ApiConversation {
  phone: string;
  /**
   * Backend-routable conversation key. Email threads in particular do
   * NOT use `phone` as the addressable key — the Python backend mints
   * a stable thread id (e.g. `email::subj:from@x.com:subject…`) and
   * exposes it under one of these aliases. The mapper picks the first
   * non-empty value and surfaces it as `Conversation.conversationKey`
   * so email Reply / Forward / Delete can target the correct thread
   * even when `phone` happens to be a Mongo ObjectId or a display id.
   */
  conversationId?: string;
  conversation_id?: string;
  threadKey?: string;
  thread_key?: string;
  external_id?: string;
  externalId?: string;
  name?: string;
  lastMessage?: string;
  timestamp?: string;
  unread?: boolean;
  /**
   * The Python backend returns the channel under `channel`. Older shapes
   * also returned it under `platform`. Both are accepted by the mapper.
   */
  channel?: string;
  platform?: string;
  hasAttachment?: boolean;
  escalated?: boolean;
  escalationMode?: EscalationMode;
  escalationSummary?: string | null;
  learningStatus?: LearningStatus;
  aiMuted?: boolean;
  // Alternative field names that different API shapes may return
  _id?: string;
  customerName?: string;
  customer_name?: string;
  senderName?: string;
  contactName?: string;
  profileName?: string;
  email?: string;
  from?: string;
  latestMessage?: string;
  last_message?: string;
  last_message_at?: string;
  last_message_role?: string;
  message_count?: number;
  status?: string;
  preview?: string;
  snippet?: string;
  body?: string;
  text?: string;
  messages?: Array<{
    id?: string;
    role?: string;
    content?: string;
    text?: string;
    body?: string;
    timestamp?: string;
  }>;
}

export interface ApiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Display-formatted timestamp (e.g. "9:42 AM", "Yesterday", "3 Nov"). */
  timestamp: string;
  /**
   * Parsed milliseconds-since-epoch for the original backend timestamp,
   * or 0 if the field was missing / not a real date. Used to sort the
   * message thread newest-first without re-parsing the display string
   * (which is lossy — "9:42 AM" has no date).
   */
  timestampMs: number;
}

export interface ConversationDetail {
  phone: string;
  name: string;
  contactId?: string | null;
  platform: string;
  messages: ApiMessage[];
  escalated?: boolean;
  escalationResolved?: boolean;
  escalationMode?: EscalationMode;
  escalationReason?: string | null;
  escalationSummary?: string | null;
  humanGuidance?: string | null;
  humanResponder?: string | null;
  humanRespondedAt?: string | null;
  humanTakeoverAt?: string | null;
  aiMuted?: boolean;
  learningStatus?: LearningStatus;
  /**
   * Backend-supplied recommended options for the operator. When present,
   * EVERY entry must be rendered as its own chip in the briefing panel,
   * in order, with no slicing and no collapsing of duplicates.
   */
  recommendedOptions?: string[] | null;
  /**
   * Structured details extracted from the conversation by the backend.
   * `proposedTimes` is the canonical source for scheduling chips: each
   * entry becomes its own "Confirm <time>" option. Multiple times must
   * never be collapsed into a single generic chip.
   */
  extractedDetails?: {
    proposedTimes?: string[] | null;
  } | null;
}

export interface Escalation {
  id: string;
  customerName: string;
  issue: string;
  platform: string;
  createdAt: string;
  resolved: boolean;
  phone?: string;
  mode?: EscalationMode;
  reason?: string | null;
  summary?: string | null;
  learningStatus?: LearningStatus;
  aiMuted?: boolean;
}

export interface GuidancePayload {
  guidance: string;
  saveToYourInfo?: boolean;
  autoUseNextTime?: boolean;
  category?: string;
}

export interface ResolvePayload {
  resolutionNote?: string;
  saveAsLearning?: boolean;
  autoUseNextTime?: boolean;
  category?: string;
}

export interface LearningEntry {
  id: string;
  conversationId: string | null;
  sourceQuestion: string;
  aiUncertainty: string | null;
  humanAnswer: string;
  category: string | null;
  aiMayUseAutomatically: boolean;
  status: LearningStatus;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
//
// Appointments are surfaced in Workspace → Appointments. The product
// rule is:
//
//   When a customer asks to meet/book/activate, gives availability, and
//   the operator (or Marina) confirms a specific date/time (and ideally
//   a location), the system shows it as an appointment.
//
// The backend will expose the canonical appointments collection at
// `/appointments` (see GET/POST/PATCH/DELETE in the spec). Until that
// endpoint is live the frontend falls back to a detection layer that
// reads the same conversations the operator already sees and renders
// rows as "Pending sync" / "Detected" so nothing slips between the
// cracks. The status field below carries that distinction so backend
// rows can land alongside detected ones without losing fidelity.

export type AppointmentStatus = "confirmed" | "pending" | "detected";
export type AppointmentSource = "conversation" | "backend";

export interface Appointment {
  id: string;
  customerName: string;
  /** Lower-cased channel slug (e.g. "whatsapp", "email"). */
  channel: string;
  /** Conversation key (phone / email key) used to deep-link back. */
  conversationId: string;
  title: string;
  dateTimeLabel: string;
  location?: string | null;
  status: AppointmentStatus;
  source: AppointmentSource;
  createdAt: string;
}

export interface AppointmentsResponse {
  /**
   * True when `/appointments` returned a real response (even an empty
   * list). False when the endpoint isn't connected yet (404 / 501 /
   * 503 / network). Drives the "Pending sync" copy on the page so an
   * empty-but-connected backend never gets mislabelled as not connected.
   */
  connected: boolean;
  items: Appointment[];
}

/**
 * Try to fetch appointments from the canonical backend endpoint. If the
 * endpoint isn't connected yet (404 / 501 / 503 / network), resolve to
 * `{ connected: false, items: [] }` so the frontend detection layer can
 * still render rows.
 *
 * We deliberately do NOT throw on missing endpoint: the page should
 * render normally and the detected rows will fill the void. A real auth
 * failure (401/403) still propagates and triggers the global handler.
 */
export async function fetchAppointments(): Promise<AppointmentsResponse> {
  try {
    const raw = await apiFetch<unknown>("/appointments");
    return { connected: true, items: normalizeAppointmentList(raw) };
  } catch (err) {
    if (err instanceof ApiError && APPOINTMENTS_NOT_CONNECTED.has(err.status)) {
      return { connected: false, items: [] };
    }
    if (err instanceof Error && (err.name === "TypeError" || err.message === "Failed to fetch")) {
      return { connected: false, items: [] };
    }
    throw err;
  }
}

const APPOINTMENTS_NOT_CONNECTED = new Set([0, 404, 501, 503]);

function normalizeAppointmentList(raw: unknown): Appointment[] {
  // Accept both `[ ... ]` and `{ items: [...] }` envelope shapes.
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") {
    const maybe = (raw as Record<string, unknown>).items ?? (raw as Record<string, unknown>).appointments;
    if (Array.isArray(maybe)) items = maybe;
  }
  const out: Appointment[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = pickStr(o, "id", "_id", "appointmentId");
    const customerName = pickStr(o, "customerName", "customer_name", "name");
    const channel = pickStr(o, "channel", "platform") ?? "unknown";
    const conversationId = pickStr(o, "conversationId", "conversation_id", "phone") ?? "";
    const title = pickStr(o, "title", "topic", "subject") ?? "Appointment";
    const dateTimeLabel = pickStr(o, "dateTimeLabel", "date_time_label", "when", "date", "time") ?? "";
    const location = pickStr(o, "location", "place");
    const statusRaw = (pickStr(o, "status") ?? "").toLowerCase();
    const status: AppointmentStatus =
      statusRaw === "confirmed" || statusRaw === "pending" || statusRaw === "detected"
        ? statusRaw
        : "confirmed";
    const createdAt = pickStr(o, "createdAt", "created_at") ?? new Date().toISOString();
    if (!id || !customerName || !dateTimeLabel || !conversationId) continue;
    out.push({
      id,
      customerName,
      channel: channel.toLowerCase(),
      conversationId,
      title,
      dateTimeLabel,
      location: location ?? null,
      status,
      source: "backend",
      createdAt,
    });
  }
  return out;
}

export interface AvailabilitySlot {
  date: string;
  capacity: number;
  booked: number;
  guests: string[];
}

export interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface ConfigResponse {
  clientName?: string;
  connectedPlatforms?: string[];
  features?: Record<string, boolean>;
}

export interface StatusResponse {
  status: "ok" | "degraded" | "down";
  activeConversations: number;
  openEscalations: number;
  uptime: string;
}

export interface LoginResponse {
  token: string;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

let _onUnauthorized: (() => void) | null = null;
let _authFailureFired = false;

export function registerUnauthorizedHandler(fn: () => void) {
  _onUnauthorized = fn;
}

/**
 * Called only on a verified authentication failure (HTTP 401 or 403 from a
 * request that DID send a Bearer token). Network/CORS/5xx errors do not
 * route here, so transient backend issues never log the user out.
 *
 * Idempotent: only fires the global handler once per session to avoid
 * redirect/toast storms when several queries fail at the same time.
 */
function handleAuthFailure() {
  if (_authFailureFired) return;
  _authFailureFired = true;
  clearAuth();
  _onUnauthorized?.();
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  skipAuth = false,
): Promise<T> {
  const base = getApiBase();
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (!skipAuth && token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...options, headers });
  } catch (networkErr) {
    // Network failure / CORS / DNS / offline — keep the user logged in.
    // Surface as ApiError(0) so callers can distinguish from auth errors.
    throw new ApiError(0, networkErr instanceof Error ? networkErr.message : "Network error");
  }

  // Only treat as an auth failure if the request actually sent a token.
  // Unauthenticated requests (e.g., login) returning 401 are not a session expiry.
  if ((res.status === 401 || res.status === 403) && !skipAuth && token) {
    handleAuthFailure();
    throw new ApiError(res.status, res.status === 401 ? "Unauthorized" : "Forbidden");
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message ?? body.error ?? msg;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function apiLogin(password: string): Promise<LoginResponse> {
  // Login must NOT send an Authorization header
  const result = await apiFetch<LoginResponse>("/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  }, true);
  // A successful login starts a fresh session — re-arm the auth-failure latch
  _authFailureFired = false;
  return result;
}

// ---------------------------------------------------------------------------
// Conversations (Inbox)
// ---------------------------------------------------------------------------

export async function fetchConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/messages/conversations");
}

/**
 * Sanitize a conversation identifier before placing it in a URL path.
 *
 * The Python backend uses the `phone` field as the conversation key. For
 * email conversations that key can be a long, subject-derived string like
 * `email::subj:workspace-noreply@google.com:boost productivity…` which
 * sometimes carries trailing whitespace or stray CR/LF characters from
 * upstream parsing. `encodeURIComponent` would faithfully turn `\n` into
 * `%0A`, which most servers / proxies reject as a control-character path
 * smuggling attempt — manifesting as a silently empty detail pane.
 *
 * Trim and strip CR/LF defensively before encoding. We do NOT touch any
 * other characters (`:`, `@`, spaces are valid id content and round-trip
 * cleanly through encodeURIComponent).
 */
export function encodeConversationKey(rawKey: string): string {
  const cleaned = (rawKey ?? "").replace(/[\r\n]+/g, "").trim();
  return encodeURIComponent(cleaned);
}

/**
 * Normalize a single raw message from the backend into the strict
 * `ApiMessage` shape used by the UI. The Python backend has shipped several
 * message shapes over time and the email pipeline in particular returns
 * objects whose body field is `text` / `body` / `message` rather than
 * `content`, plus `created_at` instead of `timestamp`. Without this mapping
 * the detail pane rendered empty bubbles for every email message because
 * `msg.content` resolved to undefined.
 *
 * Field priority follows the backend's documented + observed shapes; first
 * non-empty wins. Role is mapped from `role` / `direction` / `sender` /
 * `from`, with `incoming|inbound|customer|user` → `user` and everything
 * else (`outgoing|outbound|assistant|agent|bot|ai`) → `assistant`.
 */
function pickStr(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normalizeMessage(raw: unknown, idx: number): ApiMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const content =
    pickStr(o, "text", "content", "body", "message", "snippet") ?? "";
  // Drop messages with no body — they'd render as empty bubbles otherwise.
  // (e.g. system pings, attachment-only rows we don't yet preview.)
  if (!content) return null;

  const roleRaw = (
    pickStr(o, "role", "direction", "sender", "from", "author") ?? ""
  ).toLowerCase();
  const role: "user" | "assistant" =
    /^(incoming|inbound|in|customer|user|client|contact)$/.test(roleRaw)
      ? "user"
      : "assistant";

  const timestampRaw = pickStr(
    o,
    "timestamp",
    "created_at",
    "createdAt",
    "sent_at",
    "sentAt",
    "date",
    "time",
  );
  const timestamp = timestampRaw
    ? formatConversationTimestamp(timestampRaw)
    : "";
  // parseTimestampMs handles ISO 8601 including Python microsecond format
  // (`2026-05-05T20:06:19.000326+00:00`) and rejects display-only labels
  // like "9:42 AM" by returning 0.
  const timestampMs = parseTimestampMs(timestampRaw);

  const id = pickStr(o, "id", "_id", "messageId", "message_id") ?? `msg-${idx}`;

  return { id, role, content, timestamp, timestampMs };
}

/** Pull the messages array from any of the shapes the backend has returned:
 *  bare array, `{ messages: [...] }`, `{ history: [...] }`, etc. */
function extractRawMessages(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of ["messages", "history", "thread", "items", "data"]) {
      const v = o[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export async function fetchConversation(phone: string): Promise<ConversationDetail> {
  const key = (phone ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) {
    throw new ApiError(400, "Conversation id is missing.");
  }
  // Fetch as `unknown` so we can defensively normalize both the message
  // field names and the envelope shape (bare array vs. object with
  // `messages`). Email conversations in particular return body text under
  // `text` / `body` rather than `content`, and timestamps under
  // `created_at` rather than `timestamp` — without normalization the
  // detail pane renders empty bubbles for every email.
  const raw = await apiFetch<unknown>(
    `/messages/conversations/${encodeConversationKey(key)}`,
  );

  const rawMessages = extractRawMessages(raw);
  const messages = rawMessages
    .map((m, i) => normalizeMessage(m, i))
    .filter((m): m is ApiMessage => m !== null);

  // Pull metadata from the envelope when present; otherwise fall back to
  // sensible defaults so the rest of the UI (header, escalation banner,
  // composer) keeps working even on minimal responses.
  const env = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  return {
    phone: pickStr(env, "phone", "external_id", "externalId") ?? key,
    name: pickStr(env, "name", "customerName", "customer_name") ?? "",
    contactId: pickStr(env, "contactId", "contact_id"),
    platform: pickStr(env, "platform", "channel") ?? "",
    messages,
    escalated: typeof env.escalated === "boolean" ? env.escalated : undefined,
    escalationResolved:
      typeof env.escalationResolved === "boolean"
        ? env.escalationResolved
        : typeof env.escalation_resolved === "boolean"
          ? (env.escalation_resolved as boolean)
          : undefined,
    escalationMode: (pickStr(env, "escalationMode", "escalation_mode") ?? null) as ConversationDetail["escalationMode"],
    escalationReason: pickStr(env, "escalationReason", "escalation_reason"),
    escalationSummary: pickStr(env, "escalationSummary", "escalation_summary"),
    humanGuidance: pickStr(env, "humanGuidance", "human_guidance"),
    humanResponder: pickStr(env, "humanResponder", "human_responder"),
    humanRespondedAt: pickStr(env, "humanRespondedAt", "human_responded_at"),
    humanTakeoverAt: pickStr(env, "humanTakeoverAt", "human_takeover_at"),
    aiMuted: typeof env.aiMuted === "boolean"
      ? env.aiMuted
      : typeof env.ai_muted === "boolean"
        ? (env.ai_muted as boolean)
        : undefined,
    learningStatus: (pickStr(env, "learningStatus", "learning_status") ?? undefined) as ConversationDetail["learningStatus"],
    recommendedOptions: pickStringArray(
      env,
      "recommendedOptions",
      "recommended_options",
    ),
    extractedDetails: pickExtractedDetails(env),
  };
}

/**
 * Read a string array from the response envelope under any of the given
 * keys. Returns null if no key holds an array of strings, otherwise an
 * array containing every non-empty string entry in original order. We
 * NEVER slice this list — every recommended option must reach the UI
 * so the operator sees all backend recommendations as chips.
 */
function pickStringArray(
  o: Record<string, unknown>,
  ...keys: string[]
): string[] | null {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      const cleaned = v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
      if (cleaned.length > 0) return cleaned;
    }
  }
  return null;
}

/**
 * Read structured `extractedDetails` (camelCase or snake_case) and pull
 * out `proposedTimes` (camelCase or snake_case) as a string array. The
 * full list is preserved — multiple proposed times are never collapsed
 * here, since the briefing builder turns each entry into its own chip.
 */
function pickExtractedDetails(
  o: Record<string, unknown>,
): { proposedTimes?: string[] | null } | null {
  const raw =
    (o["extractedDetails"] as unknown) ??
    (o["extracted_details"] as unknown) ??
    null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const inner = raw as Record<string, unknown>;
  const proposedTimes = pickStringArray(
    inner,
    "proposedTimes",
    "proposed_times",
  );
  if (!proposedTimes) return null;
  return { proposedTimes };
}

export async function deleteConversation(phone: string): Promise<void> {
  const key = (phone ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) {
    throw new ApiError(400, "Conversation id is missing.");
  }
  return apiFetch<void>(
    `/messages/conversations/${encodeConversationKey(key)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Email actions (TASK-021 / Briefs 210 + 218)
// ---------------------------------------------------------------------------
//
// Reply / Forward / Delete for Email channel conversations. The Python
// backend exposes these under the same `/messages/conversations/:id`
// prefix as the existing detail/delete routes, so they share
// `encodeConversationKey` (email ids can contain `:` / `@` / spaces).
//
// Errors propagate as ApiError so callers can branch on `.status`:
//   0           — network / CORS — show generic retry copy
//   401 / 403   — handled globally (auth wipe + redirect)
//   404 / 501   — endpoint not deployed yet — show "not available yet"
//   400/409/500 — show backend message verbatim

export interface EmailReplyPayload {
  body: string;
  /** "direct" sends as the operator. Backend default if omitted. */
  mode?: "direct";
  attachments?: unknown[];
}

export interface EmailForwardPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  note?: string;
  includeAttachments?: boolean;
}

export interface EmailDeletePayload {
  /** "trash" = local hide. Backend may add archive/purge later. */
  deleteMode?: "trash";
}

/**
 * Send an email reply.
 *
 * Primary endpoint (the contract Jr published in Brief 210):
 *   POST /messages/conversations/{id}/email/reply
 *
 * Some live deployments responded with HTTP 405 to the `/email/reply`
 * suffix because the backend mounted the route as the channel-agnostic
 * `/reply` (the `/email/...` suffix landed only on `forward` + `delete`).
 * To unblock operators without guessing wildly we add ONE narrow
 * compatibility fallback: on 404/405 retry the bare `/reply` path. Any
 * other error bubbles up untouched. If both attempts return 404/405 we
 * surface the explicit spec copy so the operator sees a useful error
 * instead of a generic "not available yet" placeholder.
 *
 * Logged (info-level) so it's visible in browser devtools which path
 * actually carried the message.
 */
export async function replyToEmail(
  conversationId: string,
  payload: EmailReplyPayload,
): Promise<{ ok: boolean }> {
  const key = (conversationId ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) throw new ApiError(400, "Conversation id is missing.");
  const enc = encodeConversationKey(key);
  const body = JSON.stringify({
    body: payload.body,
    mode: payload.mode ?? "direct",
    attachments: payload.attachments ?? [],
  });
  const primary = `/messages/conversations/${enc}/email/reply`;
  const fallback = `/messages/conversations/${enc}/reply`;
  try {
    const result = await apiFetch<{ ok: boolean }>(primary, { method: "POST", body });
    // eslint-disable-next-line no-console
    console.info(`[unboks] email reply via ${primary}`);
    return result;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      try {
        const result = await apiFetch<{ ok: boolean }>(fallback, { method: "POST", body });
        // eslint-disable-next-line no-console
        console.info(
          `[unboks] email reply via ${fallback} (fell back from ${primary} → HTTP ${err.status})`,
        );
        return result;
      } catch (fallbackErr) {
        if (
          fallbackErr instanceof ApiError &&
          (fallbackErr.status === 404 || fallbackErr.status === 405)
        ) {
          throw new ApiError(
            405,
            "Email reply endpoint method mismatch. Backend returned HTTP 405.",
          );
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export async function forwardEmail(
  conversationId: string,
  payload: EmailForwardPayload,
): Promise<{ ok: boolean }> {
  const key = (conversationId ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) throw new ApiError(400, "Conversation id is missing.");
  return apiFetch<{ ok: boolean }>(
    `/messages/conversations/${encodeConversationKey(key)}/email/forward`,
    {
      method: "POST",
      body: JSON.stringify({
        to: payload.to,
        cc: payload.cc ?? [],
        bcc: payload.bcc ?? [],
        note: payload.note ?? "",
        includeAttachments: payload.includeAttachments ?? true,
      }),
    },
  );
}

/**
 * Delete (local hide) an email conversation. Tries DELETE first per the
 * product contract; on 404/405 (older deployments may have only the POST
 * variant) falls back to POST `/email/delete`. Any other error bubbles up.
 */
export async function deleteEmail(
  conversationId: string,
  payload: EmailDeletePayload = {},
): Promise<{ ok: boolean }> {
  const key = (conversationId ?? "").replace(/[\r\n]+/g, "").trim();
  if (!key) throw new ApiError(400, "Conversation id is missing.");
  const enc = encodeConversationKey(key);
  const deleteMode = payload.deleteMode ?? "trash";
  try {
    return await apiFetch<{ ok: boolean }>(
      `/messages/conversations/${enc}/email?deleteMode=${encodeURIComponent(deleteMode)}`,
      { method: "DELETE" },
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      return apiFetch<{ ok: boolean }>(
        `/messages/conversations/${enc}/email/delete`,
        { method: "POST", body: JSON.stringify({ deleteMode }) },
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Workspace lifecycle: disconnect Unboks (danger zone)
// ---------------------------------------------------------------------------

/**
 * Discriminated outcome of `disconnectUnboks`. The danger-zone UI uses
 * this to decide between a true "Disconnected" state (`"confirmed"`)
 * and an honest "Disconnect requested locally" state (`"requested"`)
 * when the backend hasn't yet shipped a real endpoint.
 */
export type DisconnectUnboksOutcome =
  | { kind: "confirmed"; status: number; message?: string }
  | { kind: "missing-backend"; status: number; message: string };

/**
 * Attempt to stop Unboks from handling new messages for the current
 * workspace. Tries the preferred endpoint first, then a legacy
 * fallback. On any "missing endpoint" response (404 / 405 / 501) we
 * resolve with `kind: "missing-backend"` instead of throwing — the
 * caller (Settings danger zone) is responsible for surfacing that
 * honestly to the operator (per the brief: "Do not fake successful
 * provider disconnection"). Any other error (auth, network, 5xx)
 * propagates as an `ApiError` so the modal can show the real failure.
 */
export async function disconnectUnboks(
  reason?: string,
): Promise<DisconnectUnboksOutcome> {
  const body = JSON.stringify({ reason: reason ?? null });
  const primary = "/settings/disconnect-unboks";
  const fallback = "/disconnect-unboks";
  const isMissing = (s: number) => s === 404 || s === 405 || s === 501;

  try {
    await apiFetch<unknown>(primary, { method: "POST", body });
    // eslint-disable-next-line no-console
    console.info(`[unboks] disconnect via ${primary}`);
    return { kind: "confirmed", status: 200 };
  } catch (err) {
    if (err instanceof ApiError && isMissing(err.status)) {
      try {
        await apiFetch<unknown>(fallback, { method: "POST", body });
        // eslint-disable-next-line no-console
        console.info(
          `[unboks] disconnect via ${fallback} (fell back from ${primary} → HTTP ${err.status})`,
        );
        return { kind: "confirmed", status: 200 };
      } catch (fbErr) {
        if (fbErr instanceof ApiError && isMissing(fbErr.status)) {
          return {
            kind: "missing-backend",
            status: fbErr.status,
            message:
              "Unboks backend doesn't yet expose a disconnect endpoint. " +
              "Your request has been recorded on this device — contact " +
              "the Unboks team to complete the disconnect.",
          };
        }
        throw fbErr;
      }
    }
    throw err;
  }
}

export async function suggestReply(phone: string): Promise<{ suggestion: string }> {
  return apiFetch<{ suggestion: string }>("/messages/suggest-reply", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export async function fetchEscalations(mode?: "soft" | "hard" | "all"): Promise<Escalation[]> {
  const qs = mode && mode !== "all" ? `?mode=${mode}` : "";
  return apiFetch<Escalation[]>(`/escalations${qs}`);
}

export async function resolveEscalation(
  id: string,
  payload?: ResolvePayload,
): Promise<{ ok: boolean; learningEntryId?: string | null }> {
  return apiFetch(`/escalations/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function replyEscalation(id: string, message: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function deleteEscalation(id: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}`, { method: "DELETE" });
}

export async function submitGuidance(
  id: string,
  payload: GuidancePayload,
): Promise<{ ok: boolean; learningEntryId?: string | null }> {
  return apiFetch(`/escalations/${id}/guidance`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function takeoverEscalation(id: string, note?: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/takeover`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function setEscalationMode(
  id: string,
  mode: "soft" | "hard",
): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/mode`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export async function handbackEscalation(id: string): Promise<void> {
  return apiFetch<void>(`/escalations/${id}/handback`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// AI Editor (Translate / Style / Fix)
// ---------------------------------------------------------------------------
//
// Frontend client only. The backend endpoint may not exist yet — callers
// must catch ApiError and treat status 0 / 404 / 501 / 503 as "not connected"
// and surface the calm copy "AI Editor will be connected by the Unboks team."
// instead of crashing or wiping the operator's draft.

export type AIEditorAction = "translate" | "style" | "fix";

export type AIEditorLanguage =
  | "English"
  | "Dutch"
  | "Spanish"
  | "Papiamento"
  | "Swedish"
  | "Portuguese";

export type AIEditorStyle =
  | "professional"
  | "warmer"
  | "shorter"
  | "friendlier"
  | "direct";

export interface AIEditorContext {
  conversationId?: string;
  escalationMode?: "soft" | "hard";
  channel?: string;
}

export interface AIEditorParams {
  action: AIEditorAction;
  text: string;
  targetLanguage?: AIEditorLanguage;
  style?: AIEditorStyle;
  context?: AIEditorContext;
}

export interface AIEditorResponse {
  text: string;
}

export async function aiEditorEdit(params: AIEditorParams): Promise<AIEditorResponse> {
  return apiFetch<AIEditorResponse>(`/ai-editor`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ---------------------------------------------------------------------------
// Message Translation (operator read-side)
// ---------------------------------------------------------------------------
//
// Distinct from AI Editor in intent: this is for the human operator to read
// an inbound (or outbound) message in English. It does NOT modify the
// conversation, does NOT send anything to the customer, and is not used by
// Marina's reply pipeline.
//
// V1 reuses the AI Editor endpoint with `action: "translate"`. Frontend
// naming is kept separate so the message bubble button can read "Translate"
// and never expose AI Editor terminology to the operator on the read side.
// If the backend later ships a dedicated `/translate` route, only this
// function changes.

export interface TranslateMessageContext {
  conversationId: string;
  messageId: string;
  channel?: string;
  /** Disambiguates from AI Editor's draft-rewrite usage on the server side. */
  usage?: "operator_message_translation";
}

export interface TranslateMessageParams {
  text: string;
  targetLanguage: AIEditorLanguage;
  context: TranslateMessageContext;
}

export interface TranslateMessageResponse {
  /** Translated text in `targetLanguage`. */
  text: string;
  /** Detected source language, when the backend provides it. */
  sourceLanguage?: string;
  targetLanguage?: AIEditorLanguage;
}

export async function translateMessage(
  params: TranslateMessageParams,
): Promise<TranslateMessageResponse> {
  const result = await aiEditorEdit({
    action: "translate",
    text: params.text,
    targetLanguage: params.targetLanguage,
    context: {
      conversationId: params.context.conversationId,
      channel: params.context.channel,
    },
  });
  return {
    text: result.text,
    targetLanguage: params.targetLanguage,
  };
}

// ---------------------------------------------------------------------------
// Learning entries
// ---------------------------------------------------------------------------

export async function fetchLearningEntries(status?: string): Promise<LearningEntry[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<LearningEntry[]>(`/learning${qs}`);
}

export async function approveLearning(id: string): Promise<void> {
  return apiFetch<void>(`/learning/${id}/approve`, { method: "POST" });
}

export async function saveLearning(id: string): Promise<void> {
  return apiFetch<void>(`/learning/${id}/save`, { method: "POST" });
}

export async function deleteLearning(id: string): Promise<void> {
  return apiFetch<void>(`/learning/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Availability (Bookings)
// ---------------------------------------------------------------------------

export async function fetchAvailability(days = 7): Promise<AvailabilitySlot[]> {
  return apiFetch<AvailabilitySlot[]>(`/availability?days=${days}`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<ConfigResponse> {
  return apiFetch<ConfigResponse>("/config");
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export async function fetchScheduleSlots(): Promise<ScheduleSlot[]> {
  return apiFetch<ScheduleSlot[]>("/schedule/slots");
}

export async function saveScheduleSlots(slots: ScheduleSlot[]): Promise<void> {
  return apiFetch<void>("/schedule/slots", {
    method: "PUT",
    body: JSON.stringify(slots),
  });
}

// ---------------------------------------------------------------------------
// Status / Analytics
// ---------------------------------------------------------------------------

export async function fetchStatus(): Promise<StatusResponse> {
  return apiFetch<StatusResponse>("/status");
}

// ---------------------------------------------------------------------------
// Dry-run
// ---------------------------------------------------------------------------

export async function fetchDryRunStatus(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>("/settings/dry-run");
}

export async function setDryRun(enabled: boolean): Promise<void> {
  return apiFetch<void>("/settings/dry-run", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

// ---------------------------------------------------------------------------
// Escalation alert settings
// ---------------------------------------------------------------------------
//
// Backend (Python) endpoints:
//   GET  /api/{client}/dashboard/api/settings/escalation-alerts
//   PUT  /api/{client}/dashboard/api/settings/escalation-alerts
//
// Canonical response shape:
//   { "channels": { "email": { enabled, destination, deliveryStatus? },
//                   "whatsapp": {...}, "messenger": {...}, "telegram": {...} } }
//
// We also accept a flat shape `{ email: {...}, whatsapp: {...}, ... }`
// because Jr's first cut may not nest under `channels` consistently.

export type EscalationAlertChannelKey =
  | "email"
  | "whatsapp"
  | "messenger"
  | "telegram";

export interface EscalationAlertChannelPref {
  enabled: boolean;
  destination: string;
  /**
   * Optional second destination. For email this is the operator-supplied
   * "alternative email" — when set, the backend fans out escalation
   * alerts to BOTH `destination` (or its resolved form) AND this address.
   * Empty string / null means "no alternative".
   */
  alternativeDestination?: string | null;
  /**
   * Backend-resolved real address when `destination` is a sentinel like
   * `"default"`. For email this is the actual `support_email` from the
   * client config, so the UI can show "Always on, sent to
   * hello@unboks.org" instead of the literal string "default".
   */
  resolvedDestination?: string | null;
  /**
   * Optional backend-supplied delivery status. Free-form so we can render
   * any future status the backend introduces. Common values today:
   *   "active" | "saved_only" | "provider_not_configured" | "failed"
   *   | "default" | "skipped"
   */
  deliveryStatus?: string | null;
}

export interface EscalationAlertSettings {
  channels: Partial<Record<EscalationAlertChannelKey, EscalationAlertChannelPref>>;
}

function pickChannelPref(raw: unknown): EscalationAlertChannelPref | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const enabledRaw = o.enabled;
  const enabled =
    typeof enabledRaw === "boolean"
      ? enabledRaw
      : enabledRaw === "true"
        ? true
        : false;
  const destRaw = o.destination ?? o.address ?? o.value ?? "";
  const destination = typeof destRaw === "string" ? destRaw : "";
  const status =
    typeof o.deliveryStatus === "string"
      ? o.deliveryStatus
      : typeof o.delivery_status === "string"
        ? o.delivery_status
        : typeof o.status === "string"
          ? o.status
          : null;
  // Backend may return the resolved real address under several aliases.
  // For email that's `support_email` from the client config; for other
  // channels it could be a routed inbox address. Tried in order so the
  // strongest signal wins.
  const resolvedRaw =
    o.resolvedDestination ??
    o.resolved_destination ??
    o.resolvedAddress ??
    o.resolved_address ??
    o.email ??
    o.supportEmail ??
    o.support_email ??
    null;
  const resolvedDestination =
    typeof resolvedRaw === "string" && resolvedRaw.trim().length > 0
      ? resolvedRaw.trim()
      : null;
  // Backend may surface the second/alt address under several aliases.
  // `alternativeDestination` is the canonical wire name; the rest are
  // tolerated so older payload shapes don't silently lose the value.
  const altRaw =
    o.alternativeDestination ??
    o.alternative_destination ??
    o.alternativeEmail ??
    o.alternative_email ??
    o.secondaryEmail ??
    o.secondary_email ??
    o.backupEmail ??
    o.backup_email ??
    null;
  const alternativeDestination =
    typeof altRaw === "string" && altRaw.trim().length > 0 ? altRaw.trim() : null;
  return {
    enabled,
    destination,
    alternativeDestination,
    resolvedDestination,
    deliveryStatus: status,
  };
}

/**
 * Normalize whatever the backend returned into our canonical
 * `{ channels: { email, whatsapp, messenger, telegram } }` shape. Accepts
 * either nested-under-`channels` or flat root-level keys.
 */
export function normalizeEscalationAlertSettings(raw: unknown): EscalationAlertSettings {
  const empty: EscalationAlertSettings = { channels: {} };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const src =
    o.channels && typeof o.channels === "object"
      ? (o.channels as Record<string, unknown>)
      : o;
  const out: EscalationAlertSettings = { channels: {} };
  for (const key of ["email", "whatsapp", "messenger", "telegram"] as EscalationAlertChannelKey[]) {
    const pref = pickChannelPref(src[key]);
    if (pref) out.channels[key] = pref;
  }
  return out;
}

export async function getEscalationAlertSettings(): Promise<EscalationAlertSettings> {
  const raw = await apiFetch<unknown>("/settings/escalation-alerts");
  return normalizeEscalationAlertSettings(raw);
}

export async function updateEscalationAlertSettings(
  payload: EscalationAlertSettings,
): Promise<EscalationAlertSettings> {
  const raw = await apiFetch<unknown>("/settings/escalation-alerts", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return normalizeEscalationAlertSettings(raw);
}
