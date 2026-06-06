import { ApiError } from "@/lib/error";
import { DEBUG_LOGS_ENABLED, debugInfo } from "@/lib/debug-log";
import { getApiBase, getToken, clearAuth, getClientSlug } from "@/lib/tenant";
import { formatConversationTimestamp, parseTimestampMs } from "@/lib/conversation-mapper";

// ---------------------------------------------------------------------------
// Tenant slug validation (NO hardcoded list)
// ---------------------------------------------------------------------------
//
// J3-N2-10: tenants are created in ICP (Nr 3) and become reachable from
// Nr 2 the moment the welcome email is clicked — no frontend redeploy, no
// hardcoded list, no allowlist. The previous pattern
// (^[a-z][a-z0-9_-]{1,49}$) was too narrow: any tenant slug that ICP
// generated with an uppercase letter, a leading digit, or a length over
// 50 was rejected at the URL level and never reached the backend, which
// surfaced as "workspace not recognized" / "Load Failed" from a brand
// new welcome link.
//
// The new rule is the loosest URL-safe shape that still distinguishes
// a tenant segment from junk like "/favicon.ico" or "/robots.txt":
//   - alphanumeric, underscore, or hyphen
//   - 1 to 100 characters
//   - no dots, no slashes, no extensions, no whitespace
//
// The backend (wtyj-agent) is the SOLE authority on whether a tenant
// actually exists. An unknown slug fails at login with the same generic
// error as a wrong password, so we leak no information about valid
// tenants. See TenantRootRedirect in App.tsx for the persistence rule
// (slug is only written to localStorage AFTER a successful login).

const TENANT_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isValidTenantSlug(slug: string | null | undefined): boolean {
  if (!slug || typeof slug !== "string") return false;
  return TENANT_SLUG_PATTERN.test(slug);
}

// Backward-compat string alias so existing call sites
// (login(password, client: ValidClient)) compile without churn.
// The actual shape check happens at the boundary via isValidTenantSlug().
export type ValidClient = string;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationMode = "soft" | "hard" | "order" | null;
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
  appointmentSignal?: boolean;
  appointment_signal?: boolean;
  appointmentDetected?: boolean;
  appointment_detected?: boolean;
  hasAppointment?: boolean;
  has_appointment?: boolean;
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
  /**
   * Who sent the message.
   *   - "user"      — the customer (inbound from any channel)
   *   - "assistant" — Marina (the AI agent)
   *   - "operator"  — a human teammate replying directly to the customer
   *                  (human takeover, "Team will confirm" replies, etc.)
   *
   * The thread renderer styles each role distinctly so the operator
   * can tell at a glance which side spoke. Backend role names map
   * via `normalizeMessage` (see lib/api.ts) — `operator | staff |
   * team | teammate | human | admin | support` all collapse to
   * "operator". `agent` keeps mapping to "assistant" since Marina is
   * the agent.
   */
  role: "user" | "assistant" | "operator";
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
  /**
   * Backend-supplied "what the customer wants" line. When the prompt
   * provides this directly, the briefing panel uses it verbatim
   * instead of re-deriving from message text.
   */
  customerWants?: string | null;
  /**
   * Backend-supplied "what the operator needs to decide" line.
   * Surfaced as the "Suggested next step" row when present.
   */
  operatorNeedsToDecide?: string | null;
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
export type AppointmentSource = "conversation" | "backend" | "order_escalation";

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
  order?: OrderDetails | null;
}

export interface OrderLine {
  name: string;
  quantity: number | null;
  unitPrice?: number | null;
  subtotal?: number | null;
}

export interface OrderDetails {
  customerName: string;
  phone: string;
  address: string;
  products: OrderLine[];
  total: number | null;
  currency: string;
  comments?: string | null;
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

// ---------------------------------------------------------------------------
// Cloud knowledge connections
// ---------------------------------------------------------------------------
//
// Backend contract (issue unboks-org/unboks-dashboard-api#29):
//   GET /api/{tenant}/dashboard/api/knowledge/cloud-connections
//   200: { providers: CloudConnectionProvider[] }
//
// The backend is the single source of truth for which providers are even
// shown — the frontend renders ONLY what it returns. SharePoint and Box
// are intentionally absent from the product, so they are absent from the
// response and the UI never mentions them.
//
// `status` drives the action button:
//   - "connected"        → Connected badge + folder + last_synced
//   - "setup_required"   → Setup required + Connect (may route to OAuth
//                          when `needs_provider_app_registration` is
//                          false; otherwise disabled with a help line)
//   - "not_configured"   → Setup pending / Contact Unboks team
//                          (Connect button always disabled)

export type CloudConnectionStatus =
  | "connected"
  | "setup_required"
  | "not_configured";

export type CloudConnectionProviderId = "google_drive" | "onedrive" | "dropbox";

export interface CloudConnectionProvider {
  provider: CloudConnectionProviderId;
  label: string;
  blurb: string;
  status: CloudConnectionStatus;
  needs_provider_app_registration: boolean;
  folder_name?: string | null;
  last_synced_at?: string | null;
}

export interface CloudConnectionsResponse {
  providers: CloudConnectionProvider[];
}

const ALLOWED_CLOUD_PROVIDERS: ReadonlySet<CloudConnectionProviderId> = new Set([
  "google_drive",
  "onedrive",
  "dropbox",
]);

const ALLOWED_CLOUD_STATUSES: ReadonlySet<CloudConnectionStatus> = new Set([
  "connected",
  "setup_required",
  "not_configured",
]);

export async function fetchCloudConnections(): Promise<CloudConnectionsResponse> {
  const raw = await apiFetch<unknown>("/knowledge/cloud-connections");
  return { providers: normalizeCloudConnections(raw) };
}

function normalizeCloudConnections(raw: unknown): CloudConnectionProvider[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") {
    const maybe = (raw as Record<string, unknown>).providers;
    if (Array.isArray(maybe)) items = maybe;
  }
  const out: CloudConnectionProvider[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const providerRaw = pickStr(o, "provider", "id");
    if (!providerRaw) continue;
    // Hard filter: never render SharePoint / Box even if the backend
    // accidentally surfaces them. The product decision in #29 is
    // explicit — only Google Drive, OneDrive, Dropbox.
    if (!ALLOWED_CLOUD_PROVIDERS.has(providerRaw as CloudConnectionProviderId)) {
      continue;
    }
    const statusRaw = (pickStr(o, "status") ?? "").toLowerCase();
    const status: CloudConnectionStatus = ALLOWED_CLOUD_STATUSES.has(
      statusRaw as CloudConnectionStatus,
    )
      ? (statusRaw as CloudConnectionStatus)
      : "not_configured";
    out.push({
      provider: providerRaw as CloudConnectionProviderId,
      label: pickStr(o, "label") ?? defaultProviderLabel(providerRaw as CloudConnectionProviderId),
      blurb: pickStr(o, "blurb") ?? "",
      status,
      needs_provider_app_registration:
        o.needs_provider_app_registration === true ||
        o.needsProviderAppRegistration === true,
      folder_name: pickStr(o, "folder_name", "folderName"),
      last_synced_at: pickStr(o, "last_synced_at", "lastSyncedAt"),
    });
  }
  return out;
}

function defaultProviderLabel(p: CloudConnectionProviderId): string {
  switch (p) {
    case "google_drive":
      return "Google Drive";
    case "onedrive":
      return "OneDrive";
    case "dropbox":
      return "Dropbox";
  }
}

// ---------------------------------------------------------------------------
// Knowledge files
// ---------------------------------------------------------------------------
//
// Backend contract:
//   GET    /api/{tenant}/dashboard/api/knowledge/files
//   POST   /api/{tenant}/dashboard/api/knowledge/files
//          multipart/form-data: file=<document>
//   DELETE /api/{tenant}/dashboard/api/knowledge/files/{id}
//
// The backend stores the file, extracts readable text, and Marina reads
// rows with status="ready" into the prompt as uploaded source-of-truth
// material. The frontend does not keep a local fake list.

export type KnowledgeFileStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export interface KnowledgeFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KnowledgeFileStatus;
  uploadedAt: string;
  lastUsedAt?: string;
}

const ALLOWED_KNOWLEDGE_FILE_STATUSES: ReadonlySet<KnowledgeFileStatus> = new Set([
  "pending",
  "processing",
  "ready",
  "failed",
]);

function normalizeKnowledgeFile(raw: unknown): KnowledgeFile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = pickStr(o, "id");
  const filename = pickStr(o, "filename", "name");
  if (!id || !filename) return null;
  const statusRaw = (pickStr(o, "status") ?? "pending").toLowerCase();
  const status = ALLOWED_KNOWLEDGE_FILE_STATUSES.has(statusRaw as KnowledgeFileStatus)
    ? (statusRaw as KnowledgeFileStatus)
    : "pending";
  return {
    id,
    filename,
    mimeType: pickStr(o, "mimeType", "mime_type", "contentType", "content_type") ?? "",
    sizeBytes: Number(o.sizeBytes ?? o.size_bytes ?? 0) || 0,
    status,
    uploadedAt: pickStr(o, "uploadedAt", "uploaded_at") ?? "",
    lastUsedAt: pickStr(o, "lastUsedAt", "last_used_at") ?? undefined,
  };
}

function normalizeKnowledgeFiles(raw: unknown): KnowledgeFile[] {
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).files)
      ? ((raw as Record<string, unknown>).files as unknown[])
      : [];
  return items
    .map(normalizeKnowledgeFile)
    .filter((f): f is KnowledgeFile => Boolean(f));
}

export async function fetchKnowledgeFiles(): Promise<KnowledgeFile[]> {
  const raw = await apiFetch<unknown>("/knowledge/files");
  return normalizeKnowledgeFiles(raw);
}

export async function uploadKnowledgeFile(file: File): Promise<KnowledgeFile> {
  const body = new FormData();
  body.append("file", file);
  const raw = await apiFetch<unknown>("/knowledge/files", {
    method: "POST",
    body,
  });
  const normalized = normalizeKnowledgeFile(raw);
  if (!normalized) {
    throw new ApiError(500, "Upload completed, but the server returned an invalid file record.");
  }
  return normalized;
}

export async function deleteKnowledgeFile(fileId: string): Promise<void> {
  await apiFetch<void>(`/knowledge/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Knowledge media
// ---------------------------------------------------------------------------
//
// Images are attached to saved knowledge items (for example a property,
// product, menu item, or service). They are not OCR'd. The backend stores
// tenant-scoped images and returns safe public links Marina can share when a
// customer asks for photos.

export interface KnowledgeMedia {
  id: string;
  knowledgeSource: string;
  knowledgeId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  caption: string;
  url: string;
  uploadedAt: string;
  lastUsedAt?: string;
}

function normalizeKnowledgeMedia(raw: unknown): KnowledgeMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = pickStr(o, "id");
  const knowledgeId = pickStr(o, "knowledgeId", "knowledge_id");
  if (!id || !knowledgeId) return null;
  return {
    id,
    knowledgeSource: pickStr(o, "knowledgeSource", "knowledge_source") ?? "info_update",
    knowledgeId,
    filename: pickStr(o, "filename") ?? "",
    originalFilename: pickStr(o, "originalFilename", "original_filename") ?? "",
    mimeType: pickStr(o, "mimeType", "mime_type") ?? "image/jpeg",
    sizeBytes: Number(o.sizeBytes ?? o.size_bytes ?? 0) || 0,
    caption: pickStr(o, "caption") ?? "",
    url: pickStr(o, "url") ?? "",
    uploadedAt: pickStr(o, "uploadedAt", "uploaded_at") ?? "",
    lastUsedAt: pickStr(o, "lastUsedAt", "last_used_at") ?? undefined,
  };
}

function normalizeKnowledgeMediaList(raw: unknown): KnowledgeMedia[] {
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).media)
      ? ((raw as Record<string, unknown>).media as unknown[])
      : [];
  return items
    .map(normalizeKnowledgeMedia)
    .filter((m): m is KnowledgeMedia => Boolean(m));
}

export async function fetchKnowledgeMedia(
  knowledgeId: string,
  source = "info_update",
): Promise<KnowledgeMedia[]> {
  const params = new URLSearchParams({
    knowledge_id: knowledgeId,
    source,
  });
  const raw = await apiFetch<unknown>(`/knowledge/media?${params.toString()}`);
  return normalizeKnowledgeMediaList(raw);
}

export async function uploadKnowledgeMedia(input: {
  knowledgeId: string;
  source?: string;
  caption?: string;
  file: File;
}): Promise<KnowledgeMedia> {
  const body = new FormData();
  body.append("knowledge_id", input.knowledgeId);
  body.append("source", input.source ?? "info_update");
  body.append("caption", input.caption ?? "");
  body.append("file", input.file);
  const raw = await apiFetch<unknown>("/knowledge/media", {
    method: "POST",
    body,
  });
  const normalized = normalizeKnowledgeMedia(raw);
  if (!normalized) {
    throw new ApiError(500, "Upload completed, but the server returned an invalid image record.");
  }
  return normalized;
}

export async function deleteKnowledgeMedia(mediaId: string): Promise<void> {
  await apiFetch<void>(`/knowledge/media/${encodeURIComponent(mediaId)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Block sender (Unboks-level block)
// ---------------------------------------------------------------------------
//
// Backend contract (issue unboks-org/unboks-dashboard-api#30):
//   POST   /dashboard/api/messages/conversations/{conversationId}/block
//          body: { reason, blocked_by }
//   POST   /dashboard/api/messages/conversations/{conversationId}/unblock
//   GET    /dashboard/api/blocked-senders
//          200: { conversations: BlockedSender[] }
//
// "Block in Unboks" only suppresses the conversation inside this dashboard:
// future inbound messages do not appear in the active inbox, the Agent does
// not auto-reply, and escalation alerts do not fire. It does NOT block the
// contact at the channel layer (e.g. WhatsApp) — operators must do that on
// the phone separately if they want the contact to stop reaching them at
// all. Historical messages are preserved.

export type BlockReason = "spam" | "abusive" | "wrong_contact" | "other";

export const BLOCK_REASONS: ReadonlyArray<{ value: BlockReason; label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "abusive", label: "Abusive" },
  { value: "wrong_contact", label: "Wrong contact" },
  { value: "other", label: "Other" },
];

export interface BlockedSender {
  conversationId: string;
  channel: string;
  updatedAt: string;
  reason: BlockReason | string;
  blockedBy: string;
}

export interface BlockedSendersResponse {
  conversations: BlockedSender[];
}

export interface AutoBlockSettings {
  enabled: boolean;
  zero_tolerance: {
    hate_speech: boolean;
    severe_insult: boolean;
    threat: boolean;
    sexual_harassment: boolean;
    fraud_scam: boolean;
    severe_abuse: boolean;
  };
  repeated_profanity: {
    enabled: boolean;
    threshold: 2 | 3 | 5;
    warn_before_block: boolean;
    warning_message: string;
    window_hours: number;
  };
  final_block_notice_enabled: boolean;
  admin_override?: boolean;
}

export interface IgnoredContact {
  id: number;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  emailNormalized: string;
  channel: string;
  externalSenderId: string;
  label: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IgnoredContactPayload {
  name?: string;
  phone?: string;
  email?: string;
  channel?: string;
  external_sender_id?: string;
  label?: string;
  note?: string;
}

export interface IgnoredContactsResponse {
  contacts: IgnoredContact[];
}

export interface IgnoredContactImportPreviewContact {
  clientId: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string;
  emailNormalized: string;
  channel: string;
  externalSenderId: string;
  label: string;
  note: string;
  valid: boolean;
  duplicate: boolean;
  alreadyIgnored: boolean;
  selected: boolean;
  errors: string[];
}

export interface IgnoredContactImportPreview {
  summary: {
    total: number;
    valid: number;
    duplicates: number;
    invalid: number;
    alreadyIgnored: number;
    toAdd: number;
    skipped: number;
  };
  contacts: IgnoredContactImportPreviewContact[];
}

export interface BlockConversationPayload {
  reason: BlockReason;
  blocked_by: string;
}

export interface BlockConversationResponse {
  ok: boolean;
  conversationId: string;
  blocked: true;
  reason: string;
  blockedBy: string;
}

export async function blockConversation(
  conversationId: string,
  payload: BlockConversationPayload,
): Promise<BlockConversationResponse> {
  const enc = encodeConversationKey(conversationId);
  const raw = await apiFetch<unknown>(
    `/messages/conversations/${enc}/block`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ok: o.ok === true,
    conversationId: pickStr(o, "conversationId", "conversation_id") ?? conversationId,
    blocked: true,
    reason: pickStr(o, "reason") ?? payload.reason,
    blockedBy: pickStr(o, "blockedBy", "blocked_by") ?? payload.blocked_by,
  };
}

export async function unblockConversation(conversationId: string): Promise<void> {
  const enc = encodeConversationKey(conversationId);
  return apiFetch<void>(
    `/messages/conversations/${enc}/unblock`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Source of Truth (Your Agent knowledge)
// ---------------------------------------------------------------------------

// We import the SotBlock type only (no runtime symbols) so we don't create a
// circular runtime dependency between `lib/api.ts` and `data/sot.ts` —
// `data/sot.ts` calls these two functions; `import type` is erased at build
// time so the cycle is purely structural and TypeScript handles it cleanly.
import type { SotBlock } from "@/data/sot";

/**
 * GET /source-of-truth — canonical knowledge for this workspace.
 *
 * Tolerant decoder: accepts the contracted `{ blocks: SotBlock[] }` shape,
 * a bare array (in case the backend skips the wrapper), or an empty body.
 * Returning `[]` on an unrecognised shape keeps a fresh tenant blank
 * instead of leaking another tenant's knowledge.
 */
export async function fetchSourceOfTruth(): Promise<SotBlock[]> {
  const raw = await apiFetch<unknown>("/source-of-truth");
  if (raw && typeof raw === "object" && Array.isArray((raw as { blocks?: unknown }).blocks)) {
    return (raw as { blocks: SotBlock[] }).blocks;
  }
  if (Array.isArray(raw)) return raw as SotBlock[];
  return [];
}

/**
 * PUT /source-of-truth — replace the full blocks list. The backend
 * response is the new canonical value (it may have normalised / trimmed
 * fields the FE didn't), so we hand it back to the caller verbatim and
 * the React Query cache adopts it.
 *
 * If the response is malformed we fall back to the array we just sent
 * so the UI doesn't lose the operator's edit on a successful 200.
 */
export async function saveSourceOfTruth(blocks: SotBlock[]): Promise<SotBlock[]> {
  const raw = await apiFetch<unknown>("/source-of-truth", {
    method: "PUT",
    body: JSON.stringify({ blocks }),
  });
  if (raw && typeof raw === "object" && Array.isArray((raw as { blocks?: unknown }).blocks)) {
    return (raw as { blocks: SotBlock[] }).blocks;
  }
  if (Array.isArray(raw)) return raw as SotBlock[];
  return blocks;
}

export async function fetchBlockedSenders(): Promise<BlockedSendersResponse> {
  const raw = await apiFetch<unknown>("/blocked-senders");
  return { conversations: normalizeBlockedSenders(raw) };
}

function normalizeIgnoredContact(raw: unknown): IgnoredContact | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const idRaw = o.id;
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: pickStr(o, "name") ?? "",
    phone: pickStr(o, "phone", "phone_original") ?? "",
    phoneNormalized: pickStr(o, "phoneNormalized", "phone_normalized") ?? "",
    email: pickStr(o, "email", "email_original") ?? "",
    emailNormalized: pickStr(o, "emailNormalized", "email_normalized") ?? "",
    channel: pickStr(o, "channel") ?? "",
    externalSenderId: pickStr(o, "externalSenderId", "external_sender_id") ?? "",
    label: pickStr(o, "label") ?? "",
    note: pickStr(o, "note") ?? "",
    createdBy: pickStr(o, "createdBy", "created_by") ?? "",
    createdAt: pickStr(o, "createdAt", "created_at") ?? "",
    updatedAt: pickStr(o, "updatedAt", "updated_at") ?? "",
  };
}

function normalizeImportPreview(raw: unknown): IgnoredContactImportPreview {
  const fallback: IgnoredContactImportPreview = {
    summary: {
      total: 0,
      valid: 0,
      duplicates: 0,
      invalid: 0,
      alreadyIgnored: 0,
      toAdd: 0,
      skipped: 0,
    },
    contacts: [],
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const s = (r.summary && typeof r.summary === "object" ? r.summary : {}) as Record<string, unknown>;
  const contactsRaw = Array.isArray(r.contacts) ? r.contacts : [];
  return {
    summary: {
      total: Number(s.total ?? 0),
      valid: Number(s.valid ?? 0),
      duplicates: Number(s.duplicates ?? 0),
      invalid: Number(s.invalid ?? 0),
      alreadyIgnored: Number(s.alreadyIgnored ?? s.already_ignored ?? 0),
      toAdd: Number(s.toAdd ?? s.to_add ?? 0),
      skipped: Number(s.skipped ?? 0),
    },
    contacts: contactsRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        return {
          clientId: pickStr(o, "clientId", "client_id") ?? (
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `import-${Math.random().toString(36).slice(2)}`
          ),
          name: pickStr(o, "name") ?? "",
          phone: pickStr(o, "phone") ?? "",
          phoneNormalized: pickStr(o, "phoneNormalized", "phone_normalized") ?? "",
          email: pickStr(o, "email") ?? "",
          emailNormalized: pickStr(o, "emailNormalized", "email_normalized") ?? "",
          channel: pickStr(o, "channel") ?? "",
          externalSenderId: pickStr(o, "externalSenderId", "external_sender_id") ?? "",
          label: pickStr(o, "label") ?? "",
          note: pickStr(o, "note") ?? "",
          valid: o.valid === true,
          duplicate: o.duplicate === true,
          alreadyIgnored: o.alreadyIgnored === true || o.already_ignored === true,
          selected: o.selected === true,
          errors: Array.isArray(o.errors) ? o.errors.map(String) : [],
        } satisfies IgnoredContactImportPreviewContact;
      })
      .filter((item): item is IgnoredContactImportPreviewContact => item !== null),
  };
}

export async function fetchIgnoredContacts(): Promise<IgnoredContactsResponse> {
  const raw = await apiFetch<unknown>("/ignored-contacts");
  const items = raw && typeof raw === "object" && Array.isArray((raw as { contacts?: unknown }).contacts)
    ? (raw as { contacts: unknown[] }).contacts
    : [];
  return { contacts: items.map(normalizeIgnoredContact).filter((x): x is IgnoredContact => x !== null) };
}

export async function addIgnoredContact(payload: IgnoredContactPayload): Promise<IgnoredContact> {
  const raw = await apiFetch<unknown>("/ignored-contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const contact = normalizeIgnoredContact((raw as { contact?: unknown })?.contact);
  if (!contact) throw new ApiError(500, "Invalid ignored contact response");
  return contact;
}

export async function updateIgnoredContact(id: number, payload: IgnoredContactPayload): Promise<IgnoredContact> {
  const raw = await apiFetch<unknown>(`/ignored-contacts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const contact = normalizeIgnoredContact((raw as { contact?: unknown })?.contact);
  if (!contact) throw new ApiError(500, "Invalid ignored contact response");
  return contact;
}

export async function deleteIgnoredContact(id: number): Promise<void> {
  return apiFetch<void>(`/ignored-contacts/${id}`, { method: "DELETE" });
}

export async function validateIgnoredContactsImport(file: File): Promise<IgnoredContactImportPreview> {
  const form = new FormData();
  form.append("file", file);
  const raw = await apiFetch<unknown>("/ignored-contacts/import/validate", {
    method: "POST",
    body: form,
  });
  return normalizeImportPreview(raw);
}

export async function importIgnoredContacts(
  contacts: IgnoredContactImportPreviewContact[],
): Promise<{ added: IgnoredContact[]; skipped: unknown[] }> {
  const raw = await apiFetch<unknown>("/ignored-contacts/import", {
    method: "POST",
    body: JSON.stringify({
      contacts: contacts.map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email,
        channel: c.channel,
        external_sender_id: c.externalSenderId,
        label: c.label,
        note: c.note,
      })),
    }),
  });
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const added = Array.isArray(r.added) ? r.added.map(normalizeIgnoredContact).filter((x): x is IgnoredContact => x !== null) : [];
  return { added, skipped: Array.isArray(r.skipped) ? r.skipped : [] };
}

export async function fetchAutoBlockSettings(): Promise<AutoBlockSettings> {
  return apiFetch<AutoBlockSettings>("/settings/auto-block");
}

export async function saveAutoBlockSettings(settings: AutoBlockSettings): Promise<AutoBlockSettings> {
  return apiFetch<AutoBlockSettings>("/settings/auto-block", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

function normalizeBlockedSenders(raw: unknown): BlockedSender[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const maybe = r.conversations ?? r.items ?? r.blocked;
    if (Array.isArray(maybe)) items = maybe;
  }
  const out: BlockedSender[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const conversationId = pickStr(o, "conversationId", "conversation_id", "phone", "id");
    if (!conversationId) continue;
    out.push({
      conversationId,
      channel: (pickStr(o, "channel", "platform") ?? "unknown").toLowerCase(),
      updatedAt: pickStr(o, "updatedAt", "updated_at", "blockedAt", "blocked_at") ?? "",
      reason: (pickStr(o, "reason") ?? "other") as BlockReason | string,
      blockedBy: pickStr(o, "blockedBy", "blocked_by") ?? "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Confirm appointment
// ---------------------------------------------------------------------------
//
// Backend contract (issue unboks-org/unboks-dashboard-api#1):
//   POST /dashboard/api/appointments/{appointment_id}/confirm
//   Auth: Bearer (existing dashboard auth)
//   Body (optional): { confirmedBy?: string, note?: string }
//   200: { id, status: "confirmed", confirmedAt, alreadyConfirmed: boolean }
//   404: { detail: "appointment not found" }
//
// Confirm is final operator confirmation — the backend fans out alerts
// (email / alt email / WhatsApp via Zernio / Telegram or Messenger when
// configured), so the UI guards the action behind a confirmation
// dialog and surfaces the `alreadyConfirmed` flag distinctly.

export interface ConfirmAppointmentPayload {
  confirmedBy?: string;
  note?: string;
}

export interface ConfirmAppointmentResponse {
  id: string;
  status: string;
  confirmedAt: string | null;
  alreadyConfirmed: boolean;
}

export async function confirmAppointment(
  appointmentId: string,
  payload: ConfirmAppointmentPayload = {},
): Promise<ConfirmAppointmentResponse> {
  const id = (appointmentId ?? "").toString().trim();
  if (!id) {
    throw new ApiError(400, "Appointment id is missing.");
  }
  // The issue documents the endpoint as
  //   POST /dashboard/api/appointments/{appointment_id}/confirm
  // but `getApiBase()` already returns `<host>/api/<slug>/dashboard/api`
  // (see lib/tenant.ts), so we pass only the suffix here. The composed
  // request URL ends up as
  //   <host>/api/<slug>/dashboard/api/appointments/<id>/confirm
  // — exactly the documented path under the per-tenant slug routing
  // every other dashboard endpoint already uses.
  const raw = await apiFetch<unknown>(
    `/appointments/${encodeURIComponent(id)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  const o = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    id: pickStr(o, "id", "_id", "appointmentId") ?? id,
    status: pickStr(o, "status") ?? "confirmed",
    confirmedAt: pickStr(o, "confirmedAt", "confirmed_at"),
    alreadyConfirmed: o.alreadyConfirmed === true || o.already_confirmed === true,
  };
}

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

export interface AccountSettingsApiResponse {
  name?: string | null;
  email?: string | null;
  support_email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
}

export interface AccountSettingsApiPayload {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface AgentNameSettings {
  defaultName: string;
  tenantValue: string;
  adminOverride: string | null;
  effectiveName: string;
  source: "default" | "tenant" | "admin_override" | string;
}

export interface ResponseTimingValue {
  message_batching_enabled: boolean;
  mode?: "preset" | "custom" | "random" | string;
  preset: "fast" | "balanced" | "patient" | string;
  delay_seconds: number;
  max_wait_seconds: number;
  custom_delay_seconds?: number;
  random_min_seconds?: number;
  random_max_seconds?: number;
  random_picked_seconds?: number;
  source?: string;
}

export interface ResponseTimingSettings {
  default: ResponseTimingValue;
  tenantValue: ResponseTimingValue;
  adminOverride: ResponseTimingValue | null;
  effective: ResponseTimingValue;
  source: "tenant" | "admin_override" | string;
  presets: Array<{ key: string; label: string; delay_seconds: number }>;
}

export interface WorkspaceLabelsSettings {
  bookingsLabel: string;
  defaultBookingsLabel: string;
  presets: string[];
}

export interface InfoUpdateApiItem {
  id: number | string;
  type?: string | null;
  text?: string | null;
  active?: boolean | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface InfoUpdatesApiResponse {
  updates?: InfoUpdateApiItem[];
}

export interface InfoUpdateCreatePayload {
  text: string;
  type: string;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
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
    ...(options.headers as Record<string, string> | undefined),
  };

  const hasContentType = Object.keys(headers).some(
    (k) => k.toLowerCase() === "content-type",
  );
  if (!(options.body instanceof FormData) && !hasContentType) {
    headers["Content-Type"] = "application/json";
  }

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
      // `body.detail` is what the new escalation-learning endpoints
      // (Claudia #32) return for human-friendly errors. Other endpoints
      // continue to use `message` / `error`. Order: message > error >
      // detail so we don't regress existing behaviour.
      msg = body.message ?? body.error ?? body.detail ?? msg;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Client profile (workspace display name + status)
// ---------------------------------------------------------------------------
//
// J3-N2-15: render the tenant's business name in the sidebar so a new
// operator opening a fresh dashboard sees "Pepe Test" / "Acme Corp" — not
// the generic "Connected to Unboks" badge. The backend is expected to
// expose `GET /client/profile` returning
//
//   { slug: string; name: string; business_name?: string; status?: string }
//
// where `business_name` is the brand name from `client.json` and `name` is
// either the same value or the slug used to look the tenant up. If the
// endpoint is missing we degrade gracefully to a slug-derived display
// name so the dashboard ships the visual improvement TODAY, ahead of the
// backend change. No fake placeholder data: the slug is what the operator
// typed at login, so showing it title-cased is honest.

export interface ClientProfile {
  slug: string;
  name: string;
  status: "active" | "trial" | "suspended" | "unknown";
}

function prettifySlug(slug: string): string {
  if (!slug) return "";
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function normalizeClientProfile(raw: unknown, slug: string): ClientProfile {
  const fallback: ClientProfile = {
    slug,
    name: prettifySlug(slug),
    status: "unknown",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const business =
    typeof r.business === "object" && r.business
      ? (r.business as Record<string, unknown>)
      : null;
  const candidates: unknown[] = [
    business?.name,
    business?.display_name,
    r.business_name,
    r.display_name,
    r.name,
  ];
  const name = candidates.find(
    (v) => typeof v === "string" && v.trim().length > 0,
  ) as string | undefined;
  const rawStatus = typeof r.status === "string" ? r.status.toLowerCase() : "";
  const status: ClientProfile["status"] =
    rawStatus === "active" || rawStatus === "trial" || rawStatus === "suspended"
      ? rawStatus
      : "unknown";
  return {
    slug,
    name: name && name.trim().length > 0 ? name.trim() : fallback.name,
    status,
  };
}

export async function getClientProfile(): Promise<ClientProfile> {
  const slug = getClientSlug();
  try {
    const raw = await apiFetch<unknown>("/client/profile");
    return normalizeClientProfile(raw, slug);
  } catch (err) {
    // Two cases that justify a silent fallback to the slug-derived name:
    //   1. Endpoint missing (404) — backend hasn't shipped /client/profile yet.
    //   2. Network failure (ApiError status 0) — the operator is offline /
    //      CORS preflight failed / DNS broke. Showing the slug is honest
    //      and the rest of the dashboard will surface the network problem
    //      via its own queries.
    // Everything else (401/403 auth, 5xx server, malformed JSON, etc.)
    // must propagate so a real server regression doesn't get masked by
    // a permanently happy-looking sidebar.
    if (
      err instanceof ApiError &&
      (err.status === 404 || err.status === 0)
    ) {
      return {
        slug,
        name: prettifySlug(slug),
        status: "unknown",
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function apiLogin(
  password: string,
  slug?: string,
): Promise<LoginResponse> {
  // J3-N2-10: callers may pass an explicit slug so the URL targets the
  // intended tenant WITHOUT persisting it to localStorage first. The
  // persistence invariant (slug + token are only written after the
  // backend confirms credentials) lives in AuthProvider.login. When no
  // slug is provided we fall back to the currently persisted client.
  const base = slug ? getApiBase(slug) : getApiBase();
  let res: Response;
  try {
    res = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch (networkErr) {
    throw new ApiError(0, networkErr instanceof Error ? networkErr.message : "Network error");
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message ?? body.error ?? body.detail ?? msg;
    } catch {
      // ignore body parse failure — fall through with the status code message
    }
    throw new ApiError(res.status, msg);
  }
  // A successful login starts a fresh session — re-arm the auth-failure latch
  _authFailureFired = false;
  return (await res.json()) as LoginResponse;
}

export async function fetchAccountSettings(): Promise<AccountSettingsApiResponse> {
  return apiFetch<AccountSettingsApiResponse>("/settings/your-info");
}

export async function saveAccountSettings(
  payload: AccountSettingsApiPayload,
): Promise<AccountSettingsApiResponse> {
  return apiFetch<AccountSettingsApiResponse>("/settings/your-info", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchAgentNameSettings(): Promise<AgentNameSettings> {
  return apiFetch<AgentNameSettings>("/settings/agent-name");
}

export async function saveAgentNameSettings(agentName: string): Promise<AgentNameSettings> {
  return apiFetch<AgentNameSettings>("/settings/agent-name", {
    method: "PUT",
    body: JSON.stringify({ agent_name: agentName }),
  });
}

export async function fetchResponseTimingSettings(): Promise<ResponseTimingSettings> {
  return apiFetch<ResponseTimingSettings>("/settings/response-timing");
}

export async function saveResponseTimingSettings(
  value: ResponseTimingValue,
): Promise<ResponseTimingSettings> {
  return apiFetch<ResponseTimingSettings>("/settings/response-timing", {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

export async function fetchWorkspaceLabelsSettings(): Promise<WorkspaceLabelsSettings> {
  return apiFetch<WorkspaceLabelsSettings>("/settings/workspace-labels");
}

export async function saveWorkspaceLabelsSettings(
  bookingsLabel: string,
): Promise<WorkspaceLabelsSettings> {
  return apiFetch<WorkspaceLabelsSettings>("/settings/workspace-labels", {
    method: "PUT",
    body: JSON.stringify({ bookings_label: bookingsLabel }),
  });
}

export async function fetchInfoUpdates(): Promise<InfoUpdatesApiResponse> {
  return apiFetch<InfoUpdatesApiResponse>("/settings/info-updates");
}

export async function createInfoUpdate(
  payload: InfoUpdateCreatePayload,
): Promise<{ ok: boolean; id: number | string }> {
  return apiFetch<{ ok: boolean; id: number | string }>("/settings/info-updates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function setInfoUpdateActive(
  id: string,
  active: boolean,
): Promise<void> {
  await apiFetch(`/settings/info-updates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ active }),
  });
}

export async function deleteInfoUpdate(id: string): Promise<void> {
  await apiFetch(`/settings/info-updates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Conversations (Inbox)
// ---------------------------------------------------------------------------

export async function fetchConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/messages/conversations");
}

export async function fetchArchivedConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/messages/conversations/archived");
}

export async function archiveConversation(conversationId: string): Promise<void> {
  return apiFetch<void>(
    `/messages/conversations/${encodeConversationKey(conversationId)}/archive`,
    { method: "POST" },
  );
}

export async function unarchiveConversation(conversationId: string): Promise<void> {
  return apiFetch<void>(
    `/messages/conversations/${encodeConversationKey(conversationId)}/unarchive`,
    { method: "POST" },
  );
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
  // Three-way role mapping:
  //   - inbound / customer-side strings → "user"
  //   - human-team strings              → "operator"
  //   - everything else (incl. "agent", "marina", "ai", "bot",
  //     "outbound") → "assistant" (Marina, the AI)
  // Order matters: check operator BEFORE the catch-all assistant.
  const role: "user" | "assistant" | "operator" = /^(incoming|inbound|in|customer|user|client|contact)$/.test(
    roleRaw,
  )
    ? "user"
    : /^(operator|staff|team|teammate|human|admin|support|takeover|human_reply|team_reply|from_team|outbound_human|manual_reply)$/.test(roleRaw)
      ? "operator"
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
    // Accept both `escalated: true` (boolean field) and `status: "escalated"`
    // (string field used by the Python backend for email conversations).
    escalated:
      typeof env.escalated === "boolean"
        ? env.escalated
        : typeof env.status === "string" && /^escalated$/i.test(env.status as string)
          ? true
          : undefined,
    escalationResolved:
      typeof env.escalationResolved === "boolean"
        ? env.escalationResolved
        : typeof env.escalation_resolved === "boolean"
          ? (env.escalation_resolved as boolean)
          : undefined,
    escalationMode: (pickStr(env, "escalationMode", "escalation_mode") ?? null) as ConversationDetail["escalationMode"],
    escalationReason: pickStr(env, "escalationReason", "escalation_reason"),
    escalationSummary: pickStr(env, "escalationSummary", "escalation_summary"),
    customerWants: pickStr(env, "customerWants", "customer_wants"),
    operatorNeedsToDecide: pickStr(
      env,
      "operatorNeedsToDecide",
      "operator_needs_to_decide",
    ),
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
    if (DEBUG_LOGS_ENABLED) debugInfo(`[unboks] email reply via ${primary}`);
    return result;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      try {
        const result = await apiFetch<{ ok: boolean }>(fallback, { method: "POST", body });
        if (DEBUG_LOGS_ENABLED) {
          debugInfo(
            `[unboks] email reply via ${fallback} (fell back from ${primary} → HTTP ${err.status})`,
          );
        }
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

export async function suggestReply(phone: string): Promise<{ suggestion: string }> {
  return apiFetch<{ suggestion: string }>("/messages/suggest-reply", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export async function fetchEscalations(mode?: "soft" | "hard" | "order" | "all"): Promise<Escalation[]> {
  const qs = mode && mode !== "all" ? `?mode=${mode}` : "";
  return apiFetch<Escalation[]>(`/escalations${qs}`);
}

export async function fetchResolvedEscalations(): Promise<Escalation[]> {
  return apiFetch<Escalation[]>(`/escalations?status=resolved`);
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

export async function unresolveEscalation(id: string): Promise<Escalation> {
  return apiFetch<Escalation>(`/escalations/${id}/unresolve`, {
    method: "POST",
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
  mode: "soft" | "hard" | "order",
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
  escalationMode?: "soft" | "hard" | "order";
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
// Escalation Learnings (R2-32 / R2-34, Claudia #32 backend)
// ---------------------------------------------------------------------------
//
// NEW system, deliberately separate from the legacy `/learning` endpoints
// above. The flow:
//
//   1. After the operator Sends, Send & Resolves, or Resolves an
//      escalation, the dashboard POSTs the operator's reply text to
//      `/escalations/{id}/suggest-learning` to create a "pending"
//      learning candidate.
//   2. The operator sees a SuggestedLearningCard with three actions:
//      Approve, Edit first, Do not save. Approve / Edit-then-Approve
//      promote the candidate to "approved"; Do not save dismisses it.
//   3. Pending candidates are also surfaced in the Settings page
//      (Agent learnings) so the operator can review anything they
//      skipped at composer time.
//
// Approved learnings are the only ones the Agent should ever consult.
// Pending and dismissed entries must never look like active knowledge.

export type EscalationLearningStatus = "pending" | "approved" | "dismissed";

export interface EscalationLearning {
  id: string;
  status: EscalationLearningStatus;
  suggestedText: string;
  sourceQuestion: string;
  channel: string;
  operator: string;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  dismissedAt?: string;
  escalationId?: string;
}

export interface SuggestEscalationLearningPayload {
  suggestedText: string;
  sourceQuestion: string;
  channel: string;
  operator: string;
}

export async function fetchEscalationLearnings(
  status?: EscalationLearningStatus,
): Promise<EscalationLearning[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<EscalationLearning[]>(`/escalation-learnings${qs}`);
}

export async function suggestEscalationLearning(
  escalationId: string,
  payload: SuggestEscalationLearningPayload,
): Promise<EscalationLearning> {
  return apiFetch<EscalationLearning>(
    `/escalations/${encodeURIComponent(escalationId)}/suggest-learning`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function editEscalationLearning(
  id: string,
  suggestedText: string,
): Promise<EscalationLearning> {
  return apiFetch<EscalationLearning>(
    `/escalation-learnings/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ suggestedText }) },
  );
}

export async function approveEscalationLearning(
  id: string,
  operator: string,
): Promise<EscalationLearning> {
  return apiFetch<EscalationLearning>(
    `/escalation-learnings/${encodeURIComponent(id)}/approve`,
    { method: "POST", body: JSON.stringify({ operator }) },
  );
}

export async function dismissEscalationLearning(id: string): Promise<void> {
  return apiFetch<void>(
    `/escalation-learnings/${encodeURIComponent(id)}/dismiss`,
    { method: "POST" },
  );
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

export interface OnboardingStatus {
  tenantSlug: string;
  businessName: string;
  billingStatus: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  whatsappConnected: boolean;
  whatsappConnectionStatus: string;
  whatsappConnectUrl: string;
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  const raw = await apiFetch<Partial<OnboardingStatus>>("/onboarding/status");
  return {
    tenantSlug: typeof raw.tenantSlug === "string" ? raw.tenantSlug : "",
    businessName: typeof raw.businessName === "string" ? raw.businessName : "",
    billingStatus: typeof raw.billingStatus === "string" ? raw.billingStatus : "",
    trialStartedAt: typeof raw.trialStartedAt === "string" ? raw.trialStartedAt : null,
    trialEndsAt: typeof raw.trialEndsAt === "string" ? raw.trialEndsAt : null,
    trialDaysRemaining:
      typeof raw.trialDaysRemaining === "number" ? raw.trialDaysRemaining : null,
    whatsappConnected:
      typeof raw.whatsappConnected === "boolean" ? raw.whatsappConnected : false,
    whatsappConnectionStatus:
      typeof raw.whatsappConnectionStatus === "string"
        ? raw.whatsappConnectionStatus
        : "",
    whatsappConnectUrl:
      typeof raw.whatsappConnectUrl === "string" ? raw.whatsappConnectUrl : "",
  };
}

export interface AgentPersonalitySettings {
  tone: string;
  formality: string;
  empathy: string;
  appointmentStyle: string;
  instructions: string;
  examples: string[];
}

const EMPTY_AGENT_PERSONALITY: AgentPersonalitySettings = {
  tone: "",
  formality: "",
  empathy: "",
  appointmentStyle: "",
  instructions: "",
  examples: [],
};

function normalizeAgentPersonality(raw: unknown): AgentPersonalitySettings {
  if (!raw || typeof raw !== "object") return { ...EMPTY_AGENT_PERSONALITY };
  const o = raw as Record<string, unknown>;
  const examples = Array.isArray(o.examples)
    ? o.examples.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return {
    tone: typeof o.tone === "string" ? o.tone : "",
    formality: typeof o.formality === "string" ? o.formality : "",
    empathy: typeof o.empathy === "string" ? o.empathy : "",
    appointmentStyle: typeof o.appointmentStyle === "string" ? o.appointmentStyle : "",
    instructions: typeof o.instructions === "string" ? o.instructions : "",
    examples,
  };
}

export async function fetchAgentPersonality(): Promise<AgentPersonalitySettings> {
  return normalizeAgentPersonality(
    await apiFetch<unknown>("/settings/agent-personality"),
  );
}

export async function generateAgentPersonalityExamples(
  settings: AgentPersonalitySettings,
): Promise<{ examples: string[]; model: string }> {
  const raw = await apiFetch<unknown>("/settings/agent-personality/examples", {
    method: "POST",
    body: JSON.stringify(settings),
  });
  if (!raw || typeof raw !== "object") return { examples: [], model: "" };
  const o = raw as Record<string, unknown>;
  return {
    examples: Array.isArray(o.examples)
      ? o.examples.map((x) => String(x).trim()).filter(Boolean)
      : [],
    model: typeof o.model === "string" ? o.model : "",
  };
}

export async function saveAgentPersonality(
  settings: AgentPersonalitySettings,
): Promise<AgentPersonalitySettings & { bridgeSaved?: boolean }> {
  const raw = await apiFetch<unknown>("/settings/agent-personality", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  return {
    ...normalizeAgentPersonality(raw),
    bridgeSaved:
      raw && typeof raw === "object" && "bridgeSaved" in raw
        ? Boolean((raw as { bridgeSaved?: unknown }).bridgeSaved)
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Agent learning preferences (R2-35 follow-up — Claudia #35 backend live)
// ---------------------------------------------------------------------------
//
// Two tenant-scoped, server-persisted toggles that govern how intrusive
// the suggested-learning flow is. They never auto-approve a learning —
// at most they create a pending row that the operator must still review
// in Settings.
//
//   showSuggestionAfterReplies (default true)
//     ON  → after a teachable Send / Send & Resolve / Resolve, the
//           Suggested Learning card appears over the conversation pane.
//     OFF → the card never appears. If a pending row was created
//           (depends on the second toggle) it is still visible in
//           Settings → Agent learnings → Pending.
//
//   createPendingLearningFromOperatorReplies (default false)
//     ON  → operator replies are persisted as PENDING learning rows
//           for later review (never auto-approved).
//     OFF → no pending row is created. The reply is only sent to the
//           customer; the Agent does not learn from it unless the
//           operator explicitly triggers a learning some other way.
//
// Backend (Claudia #35):
//   GET  /api/{tenant}/dashboard/api/settings/agent-learnings
//   PUT  /api/{tenant}/dashboard/api/settings/agent-learnings
// Body shape (both directions):
//   { "showSuggestionAfterReplies": boolean,
//     "createPendingLearningFromOperatorReplies": boolean }
// Tenant-scoped. Server persisted. Cross-browser, cross-device, team-wide.
// No client-side fallback. Server is source of truth.

export interface AgentLearningPrefs {
  showSuggestionAfterReplies: boolean;
  createPendingLearningFromOperatorReplies: boolean;
}

/**
 * Tenant defaults. Used only when the backend response is missing a
 * key (contract violation) or when the Inbox needs a fallback before
 * the first GET resolves. New tenants should be initialised by the
 * backend with these same defaults.
 */
export const DEFAULT_AGENT_LEARNING_PREFS: AgentLearningPrefs = {
  showSuggestionAfterReplies: true,
  createPendingLearningFromOperatorReplies: false,
};

function coerceAgentLearningPrefs(raw: unknown): AgentLearningPrefs {
  // Missing / malformed → fall back to documented defaults rather than
  // inventing values. This keeps the contract surface honest if Claudia
  // ever ships a partial response.
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_AGENT_LEARNING_PREFS };
  }
  const o = raw as Record<string, unknown>;
  const show = o.showSuggestionAfterReplies;
  const create = o.createPendingLearningFromOperatorReplies;
  return {
    showSuggestionAfterReplies:
      typeof show === "boolean" ? show : DEFAULT_AGENT_LEARNING_PREFS.showSuggestionAfterReplies,
    createPendingLearningFromOperatorReplies:
      typeof create === "boolean"
        ? create
        : DEFAULT_AGENT_LEARNING_PREFS.createPendingLearningFromOperatorReplies,
  };
}

export async function fetchAgentLearningPrefs(): Promise<AgentLearningPrefs> {
  const raw = await apiFetch<unknown>("/settings/agent-learnings");
  return coerceAgentLearningPrefs(raw);
}

export async function setAgentLearningPrefs(
  prefs: AgentLearningPrefs,
): Promise<AgentLearningPrefs> {
  const raw = await apiFetch<unknown>("/settings/agent-learnings", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
  if (!raw || typeof raw !== "object") return { ...prefs };
  return coerceAgentLearningPrefs(raw);
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
   *   | "default" | "skipped" | "pending_activation"
   */
  deliveryStatus?: string | null;
  /**
   * WhatsApp-only: whether the operator's WhatsApp number has been
   * resolved by the Zernio routing service yet. When `true` the
   * channel can actually deliver alerts; when `false` the destination
   * is saved but inert until the operator sends START to the business
   * number. The backend exposes this as `channels.whatsapp.zernioResolved`
   * (camelCase) — we also accept `zernio_resolved` for forward
   * compatibility. `undefined` means the backend didn't include the
   * field at all (older deployment) and we can't make a claim either way.
   */
  zernioResolved?: boolean | null;
}

/**
 * Which categories of alerts the tenant wants delivered.
 *  - `escalations`  → urgent moments where Marina needs human help
 *  - `appointments` → confirmed bookings / scheduled calls
 *
 * Both default to `true` for backward compatibility: an older backend
 * that doesn't yet include `alertTypes` in the GET response is treated
 * as "all alert types on", matching the pre-toggle behaviour.
 */
export interface EscalationAlertTypes {
  escalations: boolean;
  appointments: boolean;
}

export interface EscalationAlertSettings {
  channels: Partial<Record<EscalationAlertChannelKey, EscalationAlertChannelPref>>;
  alertTypes: EscalationAlertTypes;
}

const DEFAULT_ALERT_TYPES: EscalationAlertTypes = {
  escalations: true,
  appointments: true,
};

function pickAlertTypes(raw: unknown): EscalationAlertTypes {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ALERT_TYPES };
  const o = raw as Record<string, unknown>;
  // Tolerate snake_case from older Python payloads as well as the
  // canonical camelCase wire shape documented in the issue.
  const escRaw = o.escalations ?? o.escalation ?? o.escalation_alerts;
  const aptRaw = o.appointments ?? o.appointment ?? o.appointment_alerts;
  return {
    escalations: typeof escRaw === "boolean" ? escRaw : DEFAULT_ALERT_TYPES.escalations,
    appointments: typeof aptRaw === "boolean" ? aptRaw : DEFAULT_ALERT_TYPES.appointments,
  };
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
  // Per the issue, the backend now reports WhatsApp activation state as
  // `channels.whatsapp.zernioResolved`. Tolerate the snake_case alias
  // and treat any non-boolean value as "unknown" so we never lie about
  // activation when the field is missing.
  const zernioRaw =
    "zernioResolved" in o
      ? o.zernioResolved
      : "zernio_resolved" in o
        ? o.zernio_resolved
        : undefined;
  const zernioResolved =
    typeof zernioRaw === "boolean" ? zernioRaw : undefined;
  return {
    enabled,
    destination,
    alternativeDestination,
    resolvedDestination,
    deliveryStatus: status,
    zernioResolved,
  };
}

/**
 * Normalize whatever the backend returned into our canonical
 * `{ channels: { email, whatsapp, messenger, telegram } }` shape. Accepts
 * either nested-under-`channels` or flat root-level keys.
 */
export function normalizeEscalationAlertSettings(raw: unknown): EscalationAlertSettings {
  const empty: EscalationAlertSettings = {
    channels: {},
    alertTypes: { ...DEFAULT_ALERT_TYPES },
  };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const src =
    o.channels && typeof o.channels === "object"
      ? (o.channels as Record<string, unknown>)
      : o;
  const out: EscalationAlertSettings = {
    channels: {},
    // Tolerate both `alertTypes` (canonical) and `alert_types` (snake).
    alertTypes: pickAlertTypes(o.alertTypes ?? o.alert_types),
  };
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
