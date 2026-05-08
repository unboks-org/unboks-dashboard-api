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
