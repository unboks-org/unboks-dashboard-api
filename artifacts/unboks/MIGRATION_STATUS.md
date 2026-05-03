# Unboks Dashboard — Migration Status

## Remote API
Base URL: `https://api.wetakeyourjob.com/unboks/dashboard/api`
Default client slug: `unboks`

---

## Files Added

| File | Purpose |
|---|---|
| `src/lib/tenant.ts` | Client slug + token management (`localStorage`) |
| `src/lib/api.ts` | Typed API client: all fetch wrappers + 401 handler |
| `src/lib/error.ts` | `ApiError` class + helpers |
| `src/lib/channel-map.ts` | Platform key ↔ Channel mapping |
| `src/lib/feature-toggles.tsx` | Local feature toggles (dry-run, email, AI) |
| `src/components/auth/AuthContext.ts` | Auth context shape |
| `src/components/auth/AuthProvider.tsx` | Login/logout logic, 401 intercept, token storage |
| `src/components/auth/ProtectedRoute.tsx` | Redirects unauthenticated users to `/login` |
| `src/components/auth/useAuth.ts` | `useAuth()` hook |
| `src/hooks/use-client-api.ts` | React Query hooks for all endpoints incl. schedule mutations |
| `src/hooks/use-read-status.ts` | Local unread/read tracking |
| `src/hooks/use-platform-filter.tsx` | Active nav filter state |
| `src/hooks/use-email-settings.ts` | Local `localStorage` email client preference |
| `src/hooks/use-bookings-label.ts` | Local `localStorage` bookings label preference |
| `src/hooks/use-dry-run.ts` | React Query + mutation wrapper for dry-run API |
| `src/components/inbox/DashboardShell.tsx` | Shared layout shell (Drawer + bottom nav + routing) |
| `src/pages/Login.tsx` | Password login page |
| `src/pages/Bookings.tsx` | Paid-order escalation handoff inbox |
| `src/pages/Settings.tsx` | Settings page (7 sections) |
| `src/pages/Analytics.tsx` | Analytics dashboard (stat cards + Recharts) |

---

## Files Changed

| File | What changed |
|---|---|
| `src/App.tsx` | Added routes for `/bookings`, `/settings`, `/analytics` |
| `src/pages/Inbox.tsx` | Refactored to use `DashboardShell`; filter state stays in page |
| `src/components/inbox/Drawer.tsx` | Added `analytics` to `NavId` type; added Analytics nav item with `BarChart2` icon |
| `src/hooks/use-client-api.ts` | Added `useScheduleSlots()` and `useScheduleSlotMutations()` |

---

## Pages Status

### Bookings / Orders — ✅ Built

| Item | Status |
|---|---|
| Page route | ✅ `/bookings` |
| Data source | ✅ `useEscalations()` (primary); falls back to keyword-filtered conversations |
| Order list (customer name, contact, service, channel, date, status, summary) | ✅ |
| Detail panel (click to open) | ✅ |
| Mark as handled action | ✅ Calls `POST /escalations/:id/resolve` |
| Paid-order detection | ⚠️ TODO — no dedicated backend endpoint; derived from escalations |
| Payment/order status field | ⚠️ TODO — not present in escalation schema |

**TODO:** Add a dedicated `GET /orders` or `GET /escalations?type=paid` backend endpoint so paid-order escalations can be filtered distinctly from general escalations.

---

### Settings — ✅ Built

| Section | Status | Hook |
|---|---|---|
| Client & System Info | ✅ Shows slug, API base, config | `useConfig()` |
| Source of Truth | ✅ Placeholder panel with knowledge base categories | TODO: `POST /training` endpoint |
| Posting Schedule | ✅ Shows slots when API available; graceful fallback | `useScheduleSlots()` + `useScheduleSlotMutations()` |
| Dry Run Mode | ✅ Toggle; graceful fallback on API error | `useDryRun()` → `GET/POST /settings/dry-run` |
| Email Reply Preference | ✅ Gmail / Default mail — persisted to `localStorage` | `useEmailSettings()` |
| Orders Label | ✅ "Bookings" / "Orders" / custom — persisted to `localStorage` | `useBookingsLabel()` |
| Feature Visibility | ✅ AI suggest reply + email notifications toggles | `useFeatureToggles()` |

---

### Analytics — ✅ Built

| Card / Chart | Status | Source |
|---|---|---|
| Total conversations | ✅ Real count | `useConversations()` |
| Open escalations | ✅ Real count | `useEscalations()` |
| Resolved escalations | ✅ Real count | `useEscalations()` |
| Orders detected | ⚠️ "—" placeholder | TODO: dedicated paid-order endpoint |
| Messages by channel bar chart | ✅ Recharts `BarChart` with brand colors | `useConversations()` derived |
| 14-day activity trend | ✅ Recharts `BarChart` — parses relative timestamps | `useConversations()` derived |
| System status | ✅ Shows status + uptime when available | `useStatus()` |

---

## API Endpoints Used

| Endpoint | Hook / Function |
|---|---|
| `POST /login` | `apiLogin()` |
| `GET /messages/conversations` | `useConversations()` |
| `GET /messages/conversations/:phone` | `useConversation(phone)` |
| `DELETE /messages/conversations/:phone` | `useDeleteConversation()` |
| `POST /messages/suggest-reply` | `useSuggestReply()` |
| `GET /escalations` | `useEscalations()` |
| `POST /escalations/:id/resolve` | `useEscalationMutations().resolve` |
| `POST /escalations/:id/reply` | `useEscalationMutations().reply` |
| `DELETE /escalations/:id` | `useEscalationMutations().remove` |
| `GET /availability?days=N` | `useAvailability(days)` |
| `GET /config` | `useConfig()` |
| `GET /status` | `useStatus()` |
| `GET /schedule/slots` | `useScheduleSlots()` |
| `PUT /schedule/slots` | `useScheduleSlotMutations().save` |
| `GET /settings/dry-run` | `useDryRun()` |
| `POST /settings/dry-run` | `useDryRun().toggle()` |

---

## What is Real Data (when API is reachable)

- Inbox conversations, channel counts, unread counts
- Escalation list (used as order handoffs on Bookings page)
- Config (client name, connected platforms)
- Schedule slots
- Dry-run status
- System status + uptime

## What is Placeholder / TODO

| Feature | Note |
|---|---|
| Paid-order detection | No `/orders` or typed escalation endpoint — derived from general escalations |
| Payment/order status | Not in escalation schema — would need backend field |
| Source of Truth upload | Placeholder panel — needs `POST /training` backend endpoint |
| Star conversations | Local state only |
| Read/unread marking | Local state only — no PATCH endpoint |
| Orders detected (Analytics card) | Shows "—" — needs dedicated endpoint |

---

## Missing Backend Endpoints Needed

| Endpoint | Purpose |
|---|---|
| `GET /orders` or `GET /escalations?type=paid` | Distinct paid-order escalation list for Bookings page |
| `POST /training` | Upload knowledge base documents for Source of Truth |
| `PATCH /messages/:id/read` | Server-side read/unread state |

---

## Required Environment Variables

None required in the frontend — the API URL is derived from the client slug at runtime:
```
https://api.wetakeyourjob.com/{clientSlug}/dashboard/api
```

Token and client slug are stored in `localStorage`:
- `wtyj_token_unboks` — auth token
- `wtyj_client` — active client slug (default: `unboks`)
