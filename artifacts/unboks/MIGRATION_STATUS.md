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
| `src/hooks/use-client-api.ts` | React Query hooks for all endpoints |
| `src/hooks/use-read-status.ts` | Local unread/read tracking |
| `src/hooks/use-platform-filter.tsx` | Active nav filter state |
| `src/pages/Login.tsx` | Password login page |

---

## Files Changed

| File | What changed |
|---|---|
| `src/App.tsx` | Added `AuthProvider`, `FeatureTogglesProvider`, `<Toaster>` (sonner), login route, protected `/` route |
| `src/pages/Inbox.tsx` | Uses `useConversations()` → real API; maps `ApiConversation` → `Conversation`; falls back to mock data on error; passes `onLogout` to Drawer |
| `src/components/inbox/Drawer.tsx` | Added `onLogout` prop + Sign out button at bottom |

---

## Pages Connected

| Page | Status | Endpoint |
|---|---|---|
| Login | ✅ Connected | `POST /login` |
| Inbox | ✅ Connected | `GET /messages/conversations` |
| Channel filter (drawer) | ✅ Connected | Derived from conversations |
| Escalations (filter) | ✅ Partial | Filtered from conversations `escalated` flag |
| Bookings (filter) | ✅ Partial | Keyword filter on subject/preview |

---

## Buttons / Actions Connected

| Action | Status |
|---|---|
| Login submit | ✅ Calls `POST /login`, stores token |
| Logout (drawer Sign out) | ✅ Clears token, redirects to `/login` |
| Channel tab filter | ✅ Filters live conversation list |
| Escalations nav item | ✅ Filters to escalated convos |
| Search bar | ✅ Filters live/real data |
| Star conversation | ✅ Local toggle |
| 401 session expiry | ✅ Auto-logout after 2nd 401 within 60s |

---

## API Endpoints Now Used

| Endpoint | Hook |
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
| `GET /schedule/slots` | `fetchScheduleSlots()` |
| `PUT /schedule/slots` | `saveScheduleSlots()` |
| `GET /settings/dry-run` | `fetchDryRunStatus()` |
| `POST /settings/dry-run` | `setDryRun()` |

---

## Mocked / Still Local

| Feature | Status |
|---|---|
| Star conversations | Local state only — no backend endpoint |
| Read/unread marking | Local state only — no `PATCH /messages/:id/read` endpoint in spec |
| Archive/hide conversation | Local — no archive endpoint in spec; `DELETE` available |
| Bookings page (full view) | `useAvailability()` hook ready, page not yet built |
| Settings page | Hooks ready (`useScheduleSlots`, `useDryRun`), page not yet built |
| Analytics page | `useStatus()` + `useConversations()` hooks ready, page not yet built |
| Social / Drafts pipeline | Not present in current UI — hook stubs available |
| Source of Truth / Brand | Not present in current UI — hook stubs available |

---

## Required Environment Variables

None required in the frontend — the API URL is derived from the client slug at runtime:
```
https://api.wetakeyourjob.com/{clientSlug}/dashboard/api
```

Token and client slug are stored in `localStorage`:
- `wtyj_token_unboks` — auth token
- `wtyj_client` — active client slug (default: `unboks`)

---

## Test Checklist

- [ ] Navigate to `/` → redirects to `/login` when not authenticated
- [ ] Enter wrong password → error message shown
- [ ] Enter correct password → token stored in `localStorage["wtyj_token_unboks"]`
- [ ] After login → redirected to `/`, inbox loads real conversations
- [ ] Search bar filters real conversations
- [ ] Click "WhatsApp" in sidebar → shows only WhatsApp conversations
- [ ] Click "Escalations" → shows only escalated conversations
- [ ] Click "Sign out" in sidebar → clears token, redirects to `/login`
- [ ] Visit `/` after logout → redirected to `/login`
- [ ] Simulate 401 response twice within 60s → auto-logout fires
- [ ] On API error → inbox falls back to mock data with "(preview mode)" label
