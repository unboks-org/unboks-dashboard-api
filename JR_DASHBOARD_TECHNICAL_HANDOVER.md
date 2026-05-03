# JR Dashboard Technical Handover Report

**Project:** Unboks Customer Dashboard  
**Date:** 2026-05-03  
**Prepared for:** Jr — connecting the LLM/AI system and channel integrations  
**Scope:** Read-only inspection. No code was changed to produce this document.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [App Architecture](#2-app-architecture)
3. [Routes](#3-routes)
4. [Authentication State](#4-authentication-state)
5. [Remote API Usage](#5-remote-api-usage)
6. [Data Models / Types](#6-data-models--types)
7. [Pages State](#7-pages-state)
8. [Inbox / Messages Flow](#8-inbox--messages-flow)
9. [Escalation Flow](#9-escalation-flow)
10. [Bookings / Orders Flow](#10-bookings--orders-flow)
11. [Settings State](#11-settings-state)
12. [Channel Toggles](#12-channel-toggles)
13. [Source of Truth State](#13-source-of-truth-state)
14. [Analytics State](#14-analytics-state)
15. [LocalStorage Usage](#15-localstorage-usage)
16. [Secrets / Environment Variables](#16-secrets--environment-variables)
17. [Dependencies](#17-dependencies)
18. [Assets / Branding](#18-assets--branding)
19. [Build / Deployment](#19-build--deployment)
20. [LLM / Channel Integration Readiness](#20-llm--channel-integration-readiness)
21. [Risks / Warnings](#21-risks--warnings)
22. [Final Summary For Jr](#22-final-summary-for-jr)

---

## Build & Typecheck Results

These outputs were captured verbatim by running the commands against the live codebase.

### Typecheck

```
> @workspace/unboks@0.0.0 typecheck /home/runner/workspace/artifacts/unboks
> tsc -p tsconfig.json --noEmit
```

**Result: PASS — zero errors, zero warnings.**

### Build

The build requires `PORT` and `BASE_PATH` environment variables (`vite.config.ts` throws on startup if either is missing). The command was run with these vars set:

```
PORT=25767 BASE_PATH=/ pnpm --filter @workspace/unboks run build

> @workspace/unboks@0.0.0 build /home/runner/workspace/artifacts/unboks
> vite build --config vite.config.ts

vite v7.3.2 building client environment for production...
src/components/ui/tooltip.tsx (2:0): Error when using sourcemap for reporting an error: Can't resolve original location of error.
✓ 2405 modules transformed.
dist/public/index.html                   0.73 kB │ gzip:   0.41 kB
dist/public/assets/index-BEcKnvHs.css  100.44 kB │ gzip:  16.59 kB
dist/public/assets/index-I3u1_jQn.js   764.63 kB │ gzip: 225.84 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 10.53s
```

**Result: PASS — build succeeds.**  
Notes:
- The sourcemap warning on `tooltip.tsx` is from a Radix UI component and is cosmetic — it does not affect the build output.
- The large-chunk warning (764 kB JS) is a performance advisory, not an error. The app is fully functional.
- Running `pnpm --filter @workspace/unboks run build` without `PORT` and `BASE_PATH` will throw immediately from `vite.config.ts` before any compilation begins.

---

## 1. Project Overview

**What it is:** The Unboks Customer Dashboard is a multi-client, multi-channel AI inbox and escalation management dashboard. Clients (e.g. Unboks, Blue Marlin, Adamus) use it to view conversations their AI agent is handling, review escalations that need human attention, track order/booking handoffs, manage system settings, and view basic analytics.

**What it is not:** Not a booking form, not a CRM, not a chatbot builder, not a marketing tool. It does not handle message delivery or LLM inference itself — those belong on the backend.

**API target:** All live data comes from a remote REST API at:
```
https://api.wetakeyourjob.com/{clientSlug}/dashboard/api
```
For example, for the default client `unboks`, the base URL is:
```
https://api.wetakeyourjob.com/unboks/dashboard/api
```
This is constructed at runtime by `getApiBase()` in `src/lib/tenant.ts` using the stored client slug.

**Replit preview path:** `/` (the app is served at the root path of the Replit domain).

**Artifact ID:** `artifacts/unboks`  
**Workspace package name:** `@workspace/unboks`

---

## 2. App Architecture

| Layer | Technology |
|---|---|
| Framework | React 18 |
| Build tool | Vite (with `@vitejs/plugin-react`) |
| Language | TypeScript (strict, `noEmit`) |
| Monorepo | pnpm workspace (`@workspace/unboks`) |
| Routing | Wouter v3 (`wouter`) |
| Server state | TanStack Query (`@tanstack/react-query`) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + Radix UI primitives |
| Toasts | Sonner |
| Animations | Framer Motion |
| Charts | Recharts |

**Entry point chain:**
```
src/main.tsx
  → createRoot(document.getElementById("root")).render(<App />)
    → src/App.tsx
```

**Provider tree (outermost to innermost):**
```
QueryClientProvider         ← TanStack Query cache
  FeatureTogglesProvider    ← localStorage-backed feature flags
    TooltipProvider         ← Radix UI tooltip context
      WouterRouter          ← Wouter router (base = import.meta.env.BASE_URL)
        AuthProvider        ← Auth state + login/logout
          Router            ← Route switch
            ...pages
        Toaster             ← Sonner toast outlet (sibling to WouterRouter)
```

**QueryClient config** (`src/App.tsx`):
- `refetchOnWindowFocus: false`
- Retry logic: never retry on 401, otherwise up to 2 retries.

**Static SPA deployment:** The production build outputs to `artifacts/unboks/dist/public/`. It is served as a static site by Replit with a catch-all SPA rewrite (`/* → /index.html`) defined in `artifact.toml`.

---

## 3. Routes

All routes are defined in `src/App.tsx` inside the `<Router>` component using Wouter's `<Switch>` / `<Route>`.

| Path | Component | Access | Data status |
|---|---|---|---|
| `/login` | `Login` | Public | Real API (POST /login) |
| `/` | `Inbox` | Protected | Real API with mock fallback |
| `/bookings` | `Bookings` | Protected | Real API with mock fallback |
| `/settings` | `Settings` (in `SettingsErrorBoundary`) | Protected | Mixed — see Section 11 |
| `/analytics` | `Analytics` | Protected | Locally derived from existing data |
| `*` (catch-all) | `NotFound` | Public | Static |

**Protected routes** are wrapped in `<ProtectedRoute>`, which redirects to `/login` if `auth.isAuthenticated` is false.

**`SettingsErrorBoundary`** is a React class component error boundary that catches render errors in `<Settings />` and shows a "Try again" recovery UI instead of crashing the whole app.

---

## 4. Authentication State

**Files:**
- `src/components/auth/AuthProvider.tsx` — state container and logic
- `src/components/auth/AuthContext.ts` — context definition
- `src/components/auth/ProtectedRoute.tsx` — route guard
- `src/components/auth/useAuth.ts` — hook for consuming auth context

**How it works:**

Token and client slug are stored in `localStorage` by `src/lib/tenant.ts`:
- Token key: `wtyj_token_{slug}` (per-client, e.g. `wtyj_token_unboks`)
- Slug key: `wtyj_client`

**Default client:** `"unboks"` (hardcoded in `tenant.ts`).

**Valid clients** (defined in `src/lib/api.ts`):
```typescript
export const VALID_CLIENTS = ["unboks", "bluemarlin", "adamus", "consultadespertares"] as const;
```

**Login flow:**
1. User selects a client from the dropdown and enters a password.
2. `Login.tsx` calls `login(password, clientSlug)` from `useAuth()`.
3. `AuthProvider.login()` stores the slug, calls `apiLogin(password)` (POST /login, no auth header), stores the returned `token`, sets `isAuthenticated = true`, navigates to `/`.

**401 grace period** (implemented in `src/lib/api.ts` `handle401()`):
- First 401 with a valid token: tolerated, timestamp recorded. The session is not cleared immediately (protects against stale in-flight requests).
- Second 401 within 60 seconds: session is cleared, `_onUnauthorized` callback fires → toast "Session expired. Please log in again." + navigate to `/login`.
- More than 60 seconds between 401s: window resets.
- 401 with no token at all: immediate clear and redirect.

**Logout:** `clearAuth()` removes `wtyj_token_{slug}` and `wtyj_client` from localStorage. Navigates to `/login`. Non-auth localStorage keys (channels, SOT, feature toggles, etc.) are NOT cleared on logout.

**Auth is fully working end-to-end** when the remote API is reachable.

---

## 5. Remote API Usage

**Base URL construction** — `src/lib/tenant.ts`:
```typescript
export function getApiBase(slug?: string): string {
  return `https://api.wetakeyourjob.com/${slug ?? getClientSlug()}/dashboard/api`;
}
```

All functions below are in `src/lib/api.ts`. All use `Bearer {token}` in the `Authorization` header except `apiLogin` (which sets `skipAuth = true`).

| Function | Method | Path | Description |
|---|---|---|---|
| `apiLogin(password)` | POST | `/login` | Authenticate. Returns `{ token: string }`. No auth header sent. |
| `fetchConversations()` | GET | `/messages/conversations` | Full conversation list. Returns `ApiConversation[]`. |
| `fetchConversation(phone)` | GET | `/messages/conversations/:phone` | Single conversation thread. Returns `ConversationDetail`. |
| `deleteConversation(phone)` | DELETE | `/messages/conversations/:phone` | Delete a conversation. Returns void. |
| `suggestReply(phone)` | POST | `/messages/suggest-reply` | Request an AI-suggested reply. Body: `{ phone }`. Returns `{ suggestion: string }`. |
| `fetchEscalations()` | GET | `/escalations` | All escalations. Returns `Escalation[]`. |
| `resolveEscalation(id)` | POST | `/escalations/:id/resolve` | Mark escalation resolved. Returns void. |
| `replyEscalation(id, message)` | POST | `/escalations/:id/reply` | Send a reply via the escalation. Body: `{ message }`. Returns void. |
| `deleteEscalation(id)` | DELETE | `/escalations/:id` | Remove an escalation. Returns void. |
| `fetchAvailability(days?)` | GET | `/availability?days=N` | Availability slots. Default `days=7`. Returns `AvailabilitySlot[]`. |
| `fetchConfig()` | GET | `/config` | Client configuration. Returns `ConfigResponse`. |
| `fetchScheduleSlots()` | GET | `/schedule/slots` | Posting schedule slots. Returns `ScheduleSlot[]`. |
| `saveScheduleSlots(slots)` | PUT | `/schedule/slots` | Save posting schedule. Body: `ScheduleSlot[]`. Returns void. |
| `fetchStatus()` | GET | `/status` | System health/stats. Returns `StatusResponse`. |
| `fetchDryRunStatus()` | GET | `/settings/dry-run` | Dry-run toggle state. Returns `{ enabled: boolean }`. |
| `setDryRun(enabled)` | POST | `/settings/dry-run` | Toggle dry-run. Body: `{ enabled: boolean }`. Returns void. |

**Error handling:** HTTP errors throw `ApiError(status, message)` from `src/lib/error.ts`. 401s are routed through `handle401()` which manages the grace period.

---

## 6. Data Models / Types

### From `src/lib/api.ts`

```typescript
interface ApiConversation {
  phone: string;         // used as conversation ID
  name: string;          // display name
  lastMessage: string;   // full last message text (may contain \n)
  timestamp: string;     // display string, e.g. "9:42 AM", "Yesterday"
  unread: boolean;
  platform: string;      // e.g. "whatsapp", "email"
  hasAttachment?: boolean;
  escalated?: boolean;
}

interface ApiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ConversationDetail {
  phone: string;
  name: string;
  platform: string;
  messages: ApiMessage[];
}

interface Escalation {
  id: string;
  customerName: string;
  issue: string;          // also used as AI summary text in Bookings
  platform: string;
  createdAt: string;
  resolved: boolean;
  phone?: string;
}

interface AvailabilitySlot {
  date: string;
  capacity: number;
  booked: number;
  guests: string[];
}

interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface ConfigResponse {
  clientName?: string;
  connectedPlatforms?: string[];
  features?: Record<string, boolean>;
}

interface StatusResponse {
  status: "ok" | "degraded" | "down";
  activeConversations: number;
  openEscalations: number;
  uptime: string;
}

interface LoginResponse {
  token: string;
}
```

### From `src/data/conversations.ts`

```typescript
type Channel = "All" | "Email" | "WhatsApp" | "Instagram" | "Facebook" | "X" | "TikTok" | "Messenger";

interface Conversation {
  id: string;
  channel: Channel;
  sender: string;
  subject: string;
  preview: string;
  timestamp: string;
  unread: boolean;
  escalated: boolean;
  hasAttachment: boolean;
}
```

### From `src/data/sot.ts`

```typescript
interface SotSubsection {
  title: string;
  content?: string;
  items?: string[];
}

interface SotBlock {
  id: string;
  title: string;
  content?: string;
  items?: string[];
  subsections?: SotSubsection[];
}
```

### From `src/pages/Bookings.tsx` (local only)

```typescript
interface OrderRow {
  id: string;
  customerName: string;
  contact: string;     // phone or channel name
  service: string;     // maps to escalation.issue
  channel: string;
  date: string;
  resolved: boolean;
  summary: string;     // maps to escalation.issue (same field)
}
```

### From `src/lib/channel-map.ts`

```typescript
type PlatformKey = "whatsapp" | "email" | "instagram" | "facebook" | "x" | "twitter" | "tiktok" | "messenger";

interface PlatformDef {
  key: PlatformKey;
  label: string;
  channel: Channel;
}
```

### From `src/components/auth/AuthContext.ts`

```typescript
interface AuthState {
  isAuthenticated: boolean;
  clientSlug: string;
  login: (password: string, clientSlug?: string) => Promise<void>;
  logout: () => void;
}
```

### From `src/lib/feature-toggles.tsx`

```typescript
interface FeatureToggles {
  dryRun: boolean;
  emailNotifications: boolean;
  aiSuggestReply: boolean;
}
```

### From `src/components/inbox/Drawer.tsx`

```typescript
type NavId =
  | "inbox"
  | "escalations"
  | "bookings"
  | "settings"
  | "analytics"
  | `channel:${Channel}`;
```

---

## 7. Pages State

### Login — `src/pages/Login.tsx`
- **Purpose:** Authenticate a team member for a given client workspace.
- **Hooks:** `useAuth()`, `useMutation` (TanStack Query)
- **API:** POST `/login` (via `auth.login()`)
- **UI actions:** Client selector dropdown (4 valid clients), password field, submit button.
- **Data:** All real — login hits the live API.
- **Known issues:** None. If already authenticated, immediately redirects to `/`.

### Inbox — `src/pages/Inbox.tsx`
- **Purpose:** Primary message list. Shows all conversations filtered by channel and nav selection.
- **Hooks:** `useConversations()`, `useEnabledChannels()`
- **API:** GET `/messages/conversations`
- **UI actions:** Nav selection (inbox / escalations / channel filter), search bar.
- **Data:** Real API with automatic fallback to 25 hardcoded mock conversations on error.
- **Known issues:** No `onClick` handler on `MessageRow` — clicking a conversation row does nothing. No conversation detail panel is wired up.

### Bookings — `src/pages/Bookings.tsx`
- **Purpose:** Show customer order/booking handoffs that the AI has escalated.
- **Hooks:** `useEscalations()`, `useConversations()`, `useEscalationMutations()`, `useBookingsLabel()`
- **API:** GET `/escalations`, GET `/messages/conversations`, POST `/escalations/:id/resolve`
- **UI actions:** Click row to open detail panel, "Mark as handled" button.
- **Data:** Mixed — uses real escalations API; falls back to keyword-filtered conversations if escalations are empty; no real paid-order data.
- **Known issues:** `fetchAvailability` is defined but not used here. No reply UI wired. No structured payment/booking type field.

### Settings — `src/pages/Settings.tsx`
- **Purpose:** Configure system behavior, view SOT, manage channels/schedule/labels.
- **Hooks:** `useConfig()`, `useScheduleSlots()`, `useScheduleSlotMutations()`, `useDryRun()`, `useEmailSettings()`, `useBookingsLabel()`, `useFeatureToggles()`, `useEnabledChannels()`
- **API:** GET `/config`, GET `/schedule/slots`, PUT `/schedule/slots`, GET `/settings/dry-run`, POST `/settings/dry-run`
- **UI actions:** View client/system info, expand SOT (read-only), save schedule, toggle dry-run, select email client, rename bookings label, toggle channels, toggle AI features.
- **Data:** Mixed — some from API, some from localStorage (see Section 11).
- **Known issues:** SOT is read-only display; no edit UI exists. Wrapped in `SettingsErrorBoundary`.

### Analytics — `src/pages/Analytics.tsx`
- **Purpose:** Dashboard-level stats and charts.
- **Hooks:** `useConversations()`, `useEscalations()`, `useStatus()`
- **API:** GET `/messages/conversations`, GET `/escalations`, GET `/status`
- **UI actions:** View-only (no interactive elements).
- **Data:** All locally derived from conversation and escalation data. No dedicated analytics API. "Orders detected" stat is hardcoded to `"—"`.
- **Known issues:** See Section 14.

### NotFound — `src/pages/not-found.tsx`
- **Purpose:** 404 fallback for unrecognized routes.
- **Hooks:** None.
- **API:** None.
- **Data:** Static.

---

## 8. Inbox / Messages Flow

**Data loading:**
- `useConversations()` (in `src/hooks/use-client-api.ts`) wraps `fetchConversations()` with TanStack Query. `staleTime: 30_000` (30 seconds).
- On error or missing data: **falls back to `MOCK_CONVERSATIONS`** — the 25 hardcoded conversations in `src/data/conversations.ts`.

**Mapping:** `mapApiConversation(c: ApiConversation): Conversation` (defined locally in `Inbox.tsx`):
- `id` = `c.phone`
- `channel` = `platformToChannel(c.platform)` (maps platform string to `Channel` enum)
- `sender` = `c.name || c.phone`
- `subject` = first line of `c.lastMessage` (max 80 chars), fallback `"New message"`
- `preview` = remaining lines of `c.lastMessage`
- `timestamp`, `unread`, `escalated`, `hasAttachment` mapped directly

**Channel filtering:** `useEnabledChannels().isChannelEnabled(c.channel)` — conversations from disabled channels are filtered out. `"All"` and `"Messenger"` channels always pass through.

**Escalations filter:** `activeNav === "escalations"` → `list.filter(c => c.escalated)`. This is a client-side filter on the conversation list; it does NOT call the separate `/escalations` endpoint.

**Search:** Client-side. Filters on `sender`, `subject`, and `preview` (case-insensitive substring).

**What is NOT wired:**
- Clicking a `MessageRow` does nothing — there is no `onClick` prop and no navigation to a detail panel.
- `deleteConversation` — the API function exists, the `useDeleteConversation()` hook exists, but neither is connected to any UI button.
- `suggestReply` — the API function exists, the `useSuggestReply()` hook exists, but neither is connected to any UI button.
- `useReadStatus` hook — defined in `src/hooks/use-read-status.ts`, but imported and used nowhere. Read/unread state is driven entirely by the `unread` field from `ApiConversation`.

---

## 9. Escalation Flow

**Data loading:** `useEscalations()` wraps `fetchEscalations()` (GET `/escalations`). `staleTime: 30_000`.

**Where escalations appear:**
- In `Inbox.tsx`: filtered view when `activeNav === "escalations"` (client-side from conversation list, not from `/escalations` endpoint).
- In `Bookings.tsx`: mapped to `OrderRow` via `escalationToOrder()`.
- In `DashboardShell.tsx`: badge count in the drawer nav uses `apiEscalations?.filter(e => !e.resolved).length`.
- In `Analytics.tsx`: open/resolved counts are derived from escalations data.

**Wired actions (all in `useEscalationMutations()`):**
- `resolve.mutate(id)` → POST `/escalations/:id/resolve` — marks as resolved, invalidates `["escalations"]` cache, collapses detail panel.
- `remove.mutate(id)` → DELETE `/escalations/:id` — removes from list.
- `reply.mutate({ id, message })` → POST `/escalations/:id/reply` — sends a reply message.

**What is NOT wired:**
- There is no hard vs soft escalation distinction in the UI. All escalations from the API are treated uniformly, regardless of any type field.
- `replyEscalation` is wired in `useEscalationMutations()` as `reply`, but no reply input or button exists in the Bookings `DetailPanel`. The mutation is available but cannot be triggered from the UI.

**No dedicated escalation page:** Escalations live inside Inbox as a nav filter, and inside Bookings as the primary data source for orders.

---

## 10. Bookings / Orders Flow

**File:** `src/pages/Bookings.tsx`

**Primary data source:** `useEscalations()` (GET `/escalations`).

**Mapping:** `escalationToOrder(e: Escalation): OrderRow`:
```typescript
{
  id: e.id,
  customerName: e.customerName,
  contact: e.phone ?? "—",
  service: e.issue,           // raw issue text used as service description
  channel: e.platform,
  date: e.createdAt,
  resolved: e.resolved,
  summary: e.issue,           // same field — no separate AI summary
}
```

**Fallback (no escalations):** If `escalations` is empty or unavailable, Bookings falls back to filtering `conversations` by keyword regex:
```
/booking|order|payment|paid|service|sign.?up|purchas/i
```
applied to `subject + " " + preview`. These keyword-matched conversations are mapped to `OrderRow` manually (all `resolved: false`, no phone).

**Detail panel actions:** Only "Mark as handled" is available, which calls `resolve.mutate(selected.id)`.

**`fetchAvailability`:** The API function exists and `useAvailability()` hook exists, but neither is used anywhere in the Bookings page. Availability data is completely disconnected from the UI.

**No real paid-order detection:** There is no dedicated `type` or `paymentStatus` field on `Escalation`. The "Orders detected" stat card in Analytics is hardcoded to `"—"` with a `"TODO: paid-order endpoint"` comment in the source.

---

## 11. Settings State

**File:** `src/pages/Settings.tsx`

Each settings section and its data source:

| Section | Data source | Persisted where | Save mechanism |
|---|---|---|---|
| Client & System | `useConfig()` → GET `/config` | Server | Read-only display |
| Source of Truth | `loadSot()` → localStorage | `unboks_sot` localStorage | No save UI — read-only |
| Posting Schedule | `useScheduleSlots()` → GET `/schedule/slots` | Server | "Save schedule" → PUT `/schedule/slots` |
| Dry Run | `useDryRun()` → GET `/settings/dry-run` | Server | Toggle → POST `/settings/dry-run`. Shows fallback if API unavailable. |
| Email Reply Preference | `useEmailSettings()` | `unboks_email_client` localStorage | Instant on button click |
| Orders Label | `useBookingsLabel()` | `unboks_bookings_label` localStorage | Instant on button click or input blur |
| Channels | `useEnabledChannels()` | `unboks_enabled_channels` localStorage | Instant toggle |
| Feature Visibility | `useFeatureToggles()` | `unboks_feature_toggles` localStorage | Instant toggle |

**Client & System display fields** (from `ConfigResponse`):
- Client slug (from `getClientSlug()`)
- API endpoint (from `getApiBase()`)
- Client name (`config.clientName`)
- Connected platforms (`config.connectedPlatforms`)

---

## 12. Channel Toggles

**Hook:** `useEnabledChannels()` — `src/hooks/use-enabled-channels.ts`  
**Storage key:** `unboks_enabled_channels`

**Sync mechanism:**
- On toggle: `localStorage.setItem(...)` + `window.dispatchEvent(new CustomEvent("unboks_enabled_channels_changed"))` for same-tab re-sync.
- On `window.storage` event for cross-tab sync.
- Effect listens to both events and re-reads from storage.

**Toggleable channels** (exported as `TOGGLEABLE_CHANNELS`):
```typescript
["WhatsApp", "Instagram", "Facebook", "Email", "X", "TikTok"]
```

**Non-toggleable (always visible):** `"All"`, `"Messenger"` — `isChannelEnabled` always returns `true` for these.

**Default enabled:** `["WhatsApp", "Instagram", "Facebook", "Email"]` — X and TikTok are off by default.

**Effect of toggling:**
- Settings page shows/hides toggles in the Channels section.
- Drawer nav hides channel entries for disabled channels.
- Inbox filters out conversations from disabled channels.

**Telegram:** Appears in the SOT data as a channel but is **not implemented** in the dashboard channel system. There is no `"Telegram"` value in the `Channel` type, no toggle for it, and no platform mapping for it.

---

## 13. Source of Truth State

**Files:** `src/data/sot.ts`

**Storage:**
- `localStorage` key: `unboks_sot`
- `loadSot()` reads from localStorage, falls back to `DEFAULT_SOT` if absent, unparseable, or empty array.
- `saveSot(blocks)` writes to localStorage.

**`DEFAULT_SOT`** is a hardcoded array of **15** `SotBlock` entries covering (note: the original engineering brief referenced 16 — the live code in `src/data/sot.ts` contains 15 blocks, confirmed by inspection):

| Block ID | Title |
|---|---|
| `core-value` | Core Value |
| `clients` | Clients |
| `channels` | Channels (lists: WhatsApp, Email, Instagram, Facebook, **Telegram**, Messenger) |
| `core-functionality` | Core Functionality (10 bullet items) |
| `escalation-system` | Escalation System (hard escalation, soft escalation, no escalation subsections) |
| `knowledge-base` | Knowledge Base (SOT) — setup, sources, updates |
| `communication-style` | Communication Style |
| `human-handover` | Human Handover |
| `daily-use` | Daily Use |
| `structured-data` | Structured Data Extraction |
| `integrations` | Integrations (channels + note about Zernio being internal) |
| `onboarding` | Onboarding (steps + 14-day trial note) |
| `pricing` | Pricing |
| `positioning` | Positioning |
| `not-unboks` | What Unboks is NOT |

**Current UI:** Settings page displays SOT blocks in a collapsible read-only panel. No edit capability.

**What Jr must build:**
1. A backend API endpoint to store and serve SOT blocks (replacing/syncing localStorage).
2. An editor UI in Settings to add/edit/remove SOT blocks.
3. The backend must inject the SOT content as a system prompt when calling the LLM.

**Escalation rules from SOT:**
- **Hard escalation** (AI stops, human replies directly): confirmed/paid booking, customer requests human, complaint, refund/payment issue, booking problem, legal issue, inappropriate behavior.
- **Soft escalation** (AI asks human internally, uses input to reply to customer): low confidence situations.
- **No escalation:** Unclear question — AI continues iterating.

These rules exist only in the SOT text data. The backend must implement the actual hard/soft escalation logic.

---

## 14. Analytics State

**File:** `src/pages/Analytics.tsx`

**Stat cards:**

| Card | Data source |
|---|---|
| Conversations | `conversations.length` (local count from data) |
| Open escalations | `status?.openEscalations` (from GET /status) if available, otherwise count from `escalations` or `conversations` |
| Resolved escalations | `escalations?.filter(e => e.resolved).length` |
| Orders detected | Hardcoded `"—"` — `sub="TODO: paid-order endpoint"` |

**Charts:**
- **Messages by channel** (bar chart): Counts `conversations` grouped by `channel`. Color-coded per channel. Derived locally.
- **14-day activity** (bar chart): Uses `parseRelativeDate(c.timestamp)` to guess which day each conversation belongs to. This is very approximate — timestamps like `"9:42 AM"` map to today, `"Yesterday"` maps to yesterday, `"3 Nov"` parses with `new Date("3 Nov " + year)`. Not reliable for real analytics.

**System status block:** Shown if `useStatus()` returns data. Displays `status.status` (ok/degraded/down) and `status.uptime`.

**No dedicated analytics endpoint exists** on the remote API. All numbers are derived from conversation, escalation, and status data.

---

## 15. LocalStorage Usage

Complete inventory of all localStorage keys used across the codebase:

| Key | File | Purpose | Cleared on logout? |
|---|---|---|---|
| `wtyj_client` | `src/lib/tenant.ts` | Current client slug (e.g. `"unboks"`) | **Yes** (`clearAuth()`) |
| `wtyj_token_{slug}` | `src/lib/tenant.ts` | Bearer token for API auth (e.g. `wtyj_token_unboks`) | **Yes** (`clearAuth()`) |
| `unboks_enabled_channels` | `src/hooks/use-enabled-channels.ts` | Array of enabled channel names | No |
| `unboks_feature_toggles` | `src/lib/feature-toggles.tsx` | `{ dryRun, emailNotifications, aiSuggestReply }` object | No |
| `unboks_email_client` | `src/hooks/use-email-settings.ts` | `"gmail"` or `"mailto"` | No |
| `unboks_bookings_label` | `src/hooks/use-bookings-label.ts` | Custom label string for Bookings nav item | No |
| `unboks_sot` | `src/data/sot.ts` | Array of `SotBlock` objects (Source of Truth) | No |

---

## 16. Secrets / Environment Variables

**Runtime environment variables (both required):**

| Variable | Source | Value (dev) | Purpose |
|---|---|---|---|
| `PORT` | `artifact.toml` `[services.env]` | `25767` | Dev server port. Vite throws if missing. |
| `BASE_PATH` | `artifact.toml` `[services.env]` | `/` | Vite `base` config and `WouterRouter` base. Vite throws if missing. |

**No secrets required in the frontend.** There is no `DATABASE_URL`, no `SESSION_SECRET`, no third-party API keys stored in the frontend environment. Authentication is via the password sent to the remote API at login time.

**Remote API secrets:** The `api.wetakeyourjob.com` backend is a separate service. Its internal secrets (LLM API keys, channel webhook tokens, etc.) are not present in this repo and are outside the scope of this frontend inspection.

**No Replit Secrets needed** for the frontend artifact to build and run.

---

## 17. Dependencies

All dependencies are listed as `devDependencies` in `artifacts/unboks/package.json` because this is a static-built Vite/React app (all deps are compile-time).

**Core runtime libraries:**

| Package | Version | Role |
|---|---|---|
| `react` + `react-dom` | catalog (18.x) | UI framework |
| `wouter` | `^3.3.5` | Client-side routing |
| `@tanstack/react-query` | catalog | Server state management |
| `sonner` | `^2.0.7` | Toast notifications |
| `lucide-react` | catalog | Icon library |
| `recharts` | `^2.15.2` | Charts (Analytics page) |
| `framer-motion` | catalog | Animations |
| `date-fns` | `^3.6.0` | Date utilities |
| `zod` | catalog | Schema validation |
| `@workspace/api-client-react` | `workspace:*` | Internal workspace lib |

**UI component libraries (Radix UI):**

All Radix UI packages are wrapped in shadcn/ui-style components under `src/components/ui/`. The app pages and feature components import very few of these wrappers directly:

- `@radix-ui/react-tooltip` — imported by `src/App.tsx` as `TooltipProvider` (wraps the whole app).
- All other Radix UI packages have wrapper files in `src/components/ui/` but **none of those wrappers are imported by any page or feature component** (verified by grepping all imports in `src/pages/`, `src/components/auth/`, `src/components/inbox/`, and `src/components/SettingsErrorBoundary.tsx`). The only non-tooltip UI import from outside the `ui/` directory is `card` used by `not-found.tsx`.

The following packages each have a `src/components/ui/` wrapper file that exists but is not called by any page or feature component:

`react-accordion`, `react-alert-dialog`, `react-aspect-ratio`, `react-avatar`, `react-checkbox`, `react-collapsible`, `react-context-menu`, `react-dialog`, `react-dropdown-menu`, `react-hover-card`, `react-label`, `react-menubar`, `react-navigation-menu`, `react-popover`, `react-progress`, `react-radio-group`, `react-scroll-area`, `react-select`, `react-separator`, `react-slider`, `react-slot`, `react-switch`, `react-tabs`, `react-toast`, `react-toggle`, `react-toggle-group`.

**Other UI utilities:**

These packages each have a wrapper component in `src/components/ui/` (verified by grep). None of those wrappers are imported by any page or feature component outside the `ui/` directory:

- `class-variance-authority` (CVA) — variant-based className util; used inside `src/components/ui/` wrappers
- `clsx`, `tailwind-merge` — className merging utilities; used throughout `src/components/ui/`
- `cmdk` — imported by `src/components/ui/command.tsx`; not used by any page
- `vaul` — imported by `src/components/ui/drawer.tsx`; not used by any page
- `embla-carousel-react` — imported by `src/components/ui/carousel.tsx`; not used by any page
- `react-resizable-panels` — imported by `src/components/ui/resizable.tsx`; not used by any page
- `react-day-picker` — imported by `src/components/ui/calendar.tsx`; not used by any page
- `react-hook-form` + `@hookform/resolvers` — imported by `src/components/ui/form.tsx`; not used by any page
- `input-otp` — imported by `src/components/ui/input-otp.tsx`; not used by any page
- `next-themes` — imported by `src/components/ui/sonner.tsx` (`useTheme`); not used directly by any page
- `react-icons` — listed in `package.json`; not found in any source import

**Build / dev tools:**
- `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`
- `@replit/vite-plugin-runtime-error-modal` — error overlay in dev
- `@replit/vite-plugin-cartographer` — Replit file explorer integration
- `@replit/vite-plugin-dev-banner` — Replit dev banner
- `@types/node`, `@types/react`, `@types/react-dom`

---

## 18. Assets / Branding

**Logo:** `public/unboks-logo.png` — referenced in `Drawer.tsx` as `src="/unboks-logo.png"`. Served from the Vite public directory. No other images are imported in source files.

**Vite asset alias:** `@assets` maps to `../../attached_assets` (the repo-root `attached_assets/` directory). This alias exists in `vite.config.ts` but no source file currently uses `@assets` imports.

**Color palette (inline Tailwind classes throughout source):**

| Token | Hex | Usage |
|---|---|---|
| Primary blue | `#1a73e8` | Buttons, active state, links |
| Dark text | `#202124` | Primary body text |
| Medium grey | `#5f6368` | Secondary text, icons |
| Light grey | `#9aa0a6` | Placeholder / muted text |
| Surface | `#f6f8fc` | Card backgrounds, hover states |
| Border | `#f1f3f4`, `#e8eaed` | Dividers, borders |
| Green | `#34a853` | Success / resolved state |
| Red | `#ea4335` / `#d93025` | Error / destructive |
| Blue tint | `#e8f0fe` | Selected item background |

No old branding artifacts were found in the source. Branding is consistently Unboks.

---

## 19. Build / Deployment

**Development:**
```bash
pnpm --filter @workspace/unboks run dev
# Internally: vite --config vite.config.ts --host 0.0.0.0
# Reads PORT and BASE_PATH from env (set by artifact.toml)
```

**Production build:**
```bash
PORT=25767 BASE_PATH=/ pnpm --filter @workspace/unboks run build
# Outputs to: artifacts/unboks/dist/public/
```

**Typecheck:**
```bash
pnpm --filter @workspace/unboks run typecheck
# Internally: tsc -p tsconfig.json --noEmit
```

**Static file serving (production):**
- Output dir: `artifacts/unboks/dist/public/`
- Served as static SPA by Replit.
- SPA rewrite: `/* → /index.html` (configured in `artifact.toml`).
- Port: `25767` (dev and production).

**Vite config behavior:**
- Throws a hard error if `PORT` or `BASE_PATH` env vars are missing.
- `allowedHosts: true` — accepts all hostnames (required for Replit proxy).
- Cartographer and dev-banner plugins are only loaded in dev + when `REPL_ID` is present.

**`tsconfig.json` key settings:**
- Extends `../../tsconfig.base.json` (monorepo strict defaults).
- `moduleResolution: "bundler"` — Vite-compatible.
- Path alias `@/*` → `./src/*`.
- References `../../lib/api-client-react` (composite lib).
- `noEmit: true` (leaf package — never emits declarations).

---

## 20. LLM / Channel Integration Readiness

### What already exists in the frontend

- Conversation inbox UI with channel filtering, escalation filtering, search.
- Escalation list with resolve, delete, and reply mutations wired.
- Bookings/Orders UI backed by escalation data.
- Settings: SOT display, channel toggles, dry-run toggle, schedule config.
- `suggestReply` API endpoint stub (POST `/messages/suggest-reply`) — hook and function exist.
- `replyEscalation` mutation exists and is connected to `useEscalationMutations().reply`.
- Dry-run toggle wired to GET/POST `/settings/dry-run`.
- Channel toggles respected by Inbox filtering and Drawer nav.

### What does NOT exist (must be built on the backend)

- **Channel webhook handlers** — WhatsApp, Instagram, Facebook, Email, X, TikTok incoming message processing. None of this is in the frontend.
- **LLM inference calls** — The frontend has no LLM code. All AI inference must happen server-side.
- **SOT backend storage** — SOT is currently localStorage-only. The backend needs an endpoint to store, serve, and update SOT blocks per client.
- **Real paid-order detection** — No structured `paymentStatus` or `orderType` field on `Escalation`. The "Orders detected" card is a TODO.
- **Telegram channel** — Listed in SOT but absent from the channel system entirely.
- **Structured data extraction pipeline** — The SOT defines fields to extract (name, contact, channel, date, people count, service type, payment status, special requests, notes) but no extraction happens in the frontend.
- **AI-generated reply sending** — `suggestReply` has no UI trigger on `MessageRow`. The backend route at `/messages/suggest-reply` needs LLM integration.
- **Auto-reply pipeline** — Not represented in the frontend at all. Belongs entirely on the backend.

### Where integrations must live

All LLM calls, channel webhooks, and data processing belong in `artifacts/api-server` (the backend). **Do not add LLM logic to the frontend.**

### How the AI should use SOT

1. Backend stores SOT blocks per client (e.g. in a DB, keyed by `clientSlug`).
2. On each incoming message, backend fetches the relevant SOT blocks.
3. SOT content is injected as the system prompt for the LLM call.
4. The `POST /messages/suggest-reply` endpoint should perform this fetch + inject + LLM call and return the `{ suggestion: string }` response.

### Escalation rule implementation

Hard/soft escalation logic should be implemented server-side, using the rules defined in the SOT (`escalation-system` block). The backend should:
- Classify each incoming message against hard escalation triggers.
- If hard: create an `Escalation` record (via POST to the escalation store), stop AI auto-reply.
- If soft: ask an internal human, use response to continue AI reply.
- Set `escalated: true` on the relevant `ApiConversation` so the frontend can surface it.

### Channel toggle integration

The frontend already respects enabled channels in the inbox UI. The backend must also check the per-client enabled channels list when deciding whether to process incoming messages from a given channel. These should be stored server-side (mirroring or replacing the current localStorage approach).

---

## 21. Risks / Warnings

The following are known issues, stubs, and hardcoded values discovered during inspection. Each one represents a potential source of confusion or bugs for Jr.

1. **25 hardcoded mock conversations** — `src/data/conversations.ts` contains `conversations: Conversation[]` with 25 entries. These are shown automatically when the real API is unreachable. Users may not realize they are looking at fake data — the inbox shows `(preview mode)` in small red text, but this is easy to miss.

2. **SOT is localStorage-only** — The `DEFAULT_SOT` in `src/data/sot.ts` is a large hardcoded array. User edits are stored in `unboks_sot` localStorage — not on any server. Clearing browser data or switching browsers loses all SOT customizations.

3. **`useReadStatus` hook is defined but never used** — `src/hooks/use-read-status.ts` exports a hook for managing an in-memory `Set<string>` of unread IDs, but it is imported and called nowhere in the app. Read/unread is driven by `ApiConversation.unread` from the API.

4. **`fetchAvailability` is defined but not used in Bookings** — The API function, the `useAvailability()` hook, and the GET `/availability` endpoint all exist, but the Bookings page does not call them. Availability data is completely disconnected from the order/booking flow.

5. **`usePlatformFilter` hook is defined but not used** — `src/hooks/use-platform-filter.tsx` exports a `usePlatformFilter()` hook with `NavFilter` state management. It is not imported by any page or component. The `Inbox.tsx` page manages its own `activeNav` state independently.

6. **Hardcoded sidebar heartbeat strings** — In `Drawer.tsx`, the operational status block shows:
   ```
   Last activity: 30s ago
   12 conversations handled today
   3 escalations waiting
   ```
   These are **static strings** — they do not come from the API or any real-time data. They are always the same regardless of actual system state.

7. **BottomNav tabs do nothing** — The `BottomNav` component (`src/components/inbox/BottomNav.tsx`) has three tabs: Mail, Chat, Meet. They update local `bottomTab` state in `DashboardShell` but this state is never read by any other component. Switching tabs has no visual effect beyond the active highlight.

8. **Star button on MessageRow is local state only** — `MessageRow` has a star button that toggles `starred: boolean` in local component state. This state is not persisted to localStorage or the API. Stars reset on every re-render.

9. **"Orders detected" stat hardcoded to `"—"`** — `Analytics.tsx` line:
   ```tsx
   <StatCard label="Orders detected" value="—" sub="TODO: paid-order endpoint" />
   ```
   This will never show a real number until a dedicated paid-order endpoint is added to the API and wired up.

10. **Telegram listed in SOT but absent from channel system** — The `channels` SOT block lists Telegram. The `integrations` SOT block also lists Telegram. However, there is no `"Telegram"` value in the `Channel` type, no platform mapping in `channel-map.ts`, and no toggle for it in Settings. Building Telegram support requires updating the type system and channel map in the frontend in addition to backend webhook handling.

11. **`replyEscalation` has no UI trigger** — The `reply` mutation in `useEscalationMutations()` is fully wired to POST `/escalations/:id/reply`, but the Bookings `DetailPanel` has no reply input field or send button. The only available action is "Mark as handled."

12. **`deleteConversation` and `suggestReply` have no UI trigger** — Both API functions and their corresponding hooks (`useDeleteConversation`, `useSuggestReply`) exist, but no button or interaction in `MessageRow` or anywhere else calls them.

---

## 22. Final Summary For Jr

### What works today

- **Login / auth** — Fully functional. The client selector, password form, token storage, 401 grace period, and logout all work.
- **Inbox conversations** — Loads real conversations from GET `/messages/conversations`. Channels filter and search work. Falls back to mock data gracefully.
- **Escalations** — Loads from GET `/escalations`. Resolve and delete are wired and functional. Escalation count shows in the Drawer badge.
- **Bookings/Orders** — Shows escalations as order rows. "Mark as handled" calls the resolve endpoint. Detail panel shows customer info and AI summary (= escalation issue text).
- **Settings** — Client info, schedule, dry-run, email preference, bookings label, channel toggles, and feature toggles all work. SOT is displayed read-only.
- **Analytics** — Basic stats and charts work (derived from existing data). System status block shows live API health.
- **Multi-client** — Switching clients at login changes the API base URL and token correctly.

### What is frontend-only (no backend consequence)

- Channel toggles (filter the displayed list; backend does not know about them)
- Bookings label rename
- Email reply preference
- SOT display (reads from localStorage, not from API)
- Feature toggle UI (the `aiSuggestReply` and `emailNotifications` flags have no backend effect yet)
- Star button on messages
- BottomNav tabs

### What is API-connected and working

- Login → POST `/login`
- Conversations → GET `/messages/conversations`
- Escalations → GET `/escalations`, POST resolve, DELETE
- Config → GET `/config`
- Schedule → GET/PUT `/schedule/slots`
- Dry-run → GET/POST `/settings/dry-run`
- Status → GET `/status`

### What Jr should NOT touch in the frontend (it works, leave it alone)

- Auth system (`AuthProvider`, `tenant.ts`, `ProtectedRoute`)
- API layer (`src/lib/api.ts`, `src/hooks/use-client-api.ts`)
- Routing (`App.tsx`)
- Channel toggle system
- `apiFetch` wrapper and 401 handling

### Recommended next engineering steps (backend, then frontend wires)

1. **Build a backend SOT API endpoint** — `GET /sot` and `PUT /sot` per client. Wire the Settings SOT section to save/load from the API instead of localStorage. Pass SOT to the LLM as system prompt.

2. **Add a `type` field to escalations** — Distinguish hard escalations (paid booking, human requested) from soft escalations. Add `paymentStatus` or `orderType` field so the Bookings page can surface real orders vs general escalations. Wire "Orders detected" in Analytics.

3. **Connect LLM inference to `/messages/suggest-reply`** — The frontend hook and API function are ready. The backend endpoint needs to fetch conversation history, build a prompt using the SOT, call the LLM, and return `{ suggestion: string }`. Then add a "Suggest reply" button to `MessageRow`.

4. **Wire channel webhooks to the backend** — WhatsApp, Instagram, Facebook, Email, X, TikTok incoming message handling. The frontend channel system maps platform names already — ensure API responses use the same platform key strings.

5. **Add a reply UI to the Bookings detail panel** — The `replyEscalation` mutation is already wired server-side. Just add a text input and send button to `DetailPanel` that calls `reply.mutate({ id, message })`.

6. **Replace hardcoded sidebar heartbeat with live status poll** — Replace the three static strings in `Drawer.tsx` with data from `useStatus()` (already available) and a conversation count from `useConversations()`.

7. **Wire `deleteConversation` to a UI button on `MessageRow`** — The hook and API function exist. Add a trash/archive button to the row's action area.

8. **Build the Telegram channel** — Add `"Telegram"` to the `Channel` type in `data/conversations.ts`, add a platform entry in `channel-map.ts`, add it to `TOGGLEABLE_CHANNELS`, and build the backend Telegram webhook handler.
