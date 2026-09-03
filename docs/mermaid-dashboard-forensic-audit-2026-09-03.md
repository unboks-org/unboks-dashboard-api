# Mermaid / TRACY dashboard: forensic audit and release handoff

Date: 3 September 2026. Scope: Mermaid's existing Unboks dashboard, reservation/chat work, and the reusable patterns in Ali, Roberto and Unboks. No customer records were copied between tenants.

## Purpose and five engineering rules

TRACY should handle routine trip enquiries and reservation intake; the crew should see exceptions, the exact guest conversation, and trustworthy booking evidence. The dashboard is an operational view, not a substitute for Mermaid's official inventory or payment systems.

The requested five-rule sequence was applied in order:

1. **Question the requirements.** A chat message is not a reservation; waiting for a guest is not a crew decision; a simulated payment is not revenue. Define each metric before styling it.
2. **Delete unnecessary parts.** Remove Mermaid's dependency on Ali's rental capability endpoint, irrelevant rental quote queries, duplicate reservation fetch keys, and car-rental terminology. Do not introduce another inbox or duplicate customer store.
3. **Simplify and optimize.** One shared stage vocabulary, canonical reservation records, exact conversation links, server-owned prices/actions, tenant-scoped queries, and explicit unavailable states.
4. **Accelerate the cycle.** Put the attention queue first on mobile, offer URL-backed reservation filters and search, and keep guest, trip, quote, documents and timeline together.
5. **Automate last.** Test the data semantics and tenant boundaries before release. Keep real availability, payments and reminders disabled until their integrations and policies are approved. Do not automate a broken or unreviewed delivery path.

## Evidence inventory

Read-only production database/configuration checks found the following snapshot. These counts are not claims about the current state after this audit.

| Tenant/source | Evidence | Design implication |
| --- | --- | --- |
| Mermaid | 22 rows in `whatsapp_threads` (messages, not conversations); 13 processed inbound events; last stored chat activity approximately 15:14 UTC; no deployed `mermaid_reservations` table | Use the existing canonical chat API. Do not manufacture historical bookings from messages or seed demo guests into production. |
| Mermaid structured stores | Customers, interactions, appointments, bookings and pending notifications were empty | Empty is legitimate; unavailable must not be represented as zero. |
| Ali | 2 structured reservations, 54 lifecycle events, 6 quotes, 1 payment, 3 documents, 14 actions | Reuse the reservation/state/evidence pattern, not Ali's records, vehicle concepts or pricing. |
| Roberto (`consulta-despertares`) | Existing callback/follow-up and human-handover workflow | Reuse clear ownership and next-action distinctions, not clinic terminology. |
| Unboks | Existing canonical inbox and tenant-scoped hide/block/deep-link behavior | Use that inbox as the one conversation source; apply the same visibility rules. |

The reservations-and-chat task supplies a new server-owned Mermaid demo workflow in backend PR [#334](https://github.com/BensonOpas/wtyj-agent/pull/334), based on the TRACY foundation in PR [#324](https://github.com/BensonOpas/wtyj-agent/pull/324). This frontend must be released with a reviewed compatible backend, not against the old runtime.

## Login finding and current safety hold

The observed `Load failed`/HTTP 502 condition is consistent with the dashboard's upstream Mermaid API container being stopped; it is not evidence of an incorrect password.

During this task, the old Mermaid container was started at 18:38 UTC while diagnosing login, before the parallel TRACY task's safety hold was known. The TRACY task intentionally stopped it again at 18:52 UTC, set `restart=no`, and disabled inbox, AI auto-reply, Facebook and channel flags. That task reports no inbound processing or replies during the brief restart interval; the read-only last-message timestamp is consistent with that report. This dashboard task acknowledged the coordination error and made no further runtime/provider changes after learning of the hold.

The runtime owner reports release-blocking tenant-boundary and delivery-recovery defects in the old `c55fb4a` image. **Do not restart it to make login work.** Login/live end-to-end verification remains blocked until the TRACY task announces a reviewed candidate. Other tenants must remain untouched.

## Implemented dashboard

- **Today:** ocean-teal Mermaid identity, explicit demo marker, active journeys and actual conversation counts, crew handovers, guest-waiting states, booked guests and unread chats. A deduplicated action badge and attention queue link to the exact reservation or chat. Upcoming journeys exclude cancelled/past trips using Curaçao's date.
- **Reservations:** searchable, URL-backed All / In progress / Needs crew / Booked / Cancelled filters; desktop table and mobile cards; guest mix, language, transport, stage, amount and activity.
- **Guest workspace:** lifecycle rail, guest/trip/transport facts, dietary/accessibility/special requests, price lines, catalog version, server-provided booking code, document delivery state, chat snapshot and audit timeline. Server-authorized conversation actions resolve to the exact guest chat.
- **Trip & pricing:** all catalog currencies and price bands, including the previously omitted sedula resident band; meeting/arrival/return details, operating days, inclusions, extras and what to bring. Unapproved policy/inventory/payment assumptions remain visible.
- **Isolation and resilience:** Mermaid-only routes; shared query keys; no unrelated rental capability dependency; hide/block consistency; required `X-Unboks-Tenant` or equivalent identity on every Mermaid reservation response; cross-tenant/missing identity rejected; error/retry states distinguish unknown from empty.
- **Accessibility:** mobile zoom restored, keyboard-scrollable main area, labeled search landmarks/filter groups, visible focus states and contrast adjustments. Browser checks influenced both the mobile layout and these corrections.

No new real payment, booking, inventory, reminder or outbound-message action was enabled by the dashboard design.

## API contract and retry coordination

Reservation reads remain:

- `GET /mermaid-reservations?query=...` → `{items, demo:true, remindersEnabled:false}`.
- `GET /mermaid-reservations/{publicId}` → reservation, chat snapshot, documents and events.
- `GET /mermaid-reservations/catalog` → versioned catalog; the TypeScript model now includes optional `extras`.

All are tenant-scoped and uncached. The existing backend branch already sends `X-Unboks-Tenant: mermaid`; the frontend now requires a matching identity before accepting these responses. List totals describe the returned set (the current backend caps its list at 500); they are not an all-time revenue/reporting ledger.

At the runtime owner's request, the direct WhatsApp composer now supplies optional `request_id` to `POST /messages/whatsapp/reply` alongside unchanged `conversation_id` and verbatim `message`. The UUID is generated before the logical send, reused for a same-draft retry after an uncertain failure, and replaced after acknowledged success or a changed message/conversation/tenant. It is retained in the mounted composer, not persisted across browser reloads. The API helper never regenerates a supplied identity. This is frontend preparation, **not proof of exactly-once provider delivery**; it depends on the reviewed backend implementation.

The direct composer remains allowlisted to Ali/Clínica; this task does not enable Mermaid direct sending during quarantine. Escalation/media delivery and the backend's pending/conflict response semantics require coordination with the runtime owner before provider cutover.

## Catalog source checks

Checked against Mermaid's [official rates](https://www.mermaidboattrips.com/Rates-Daytrip-Klein-Curacao/), [trip information](https://www.mermaidboattrips.com/) and [official reservation system](https://reservations.mermaidboattrips.com/Reservations/). The versioned demo catalog includes USD/EUR/XCG, adult, child 4–12, infant 0–3 and sedula resident pricing. The public schedule is Monday, Tuesday, Wednesday, Friday, Saturday and Sunday; Fishermen's Pier arrival is 06:45 and return boarding 15:20.

Public information is not live availability. Pickup pricing remains unverified; generic demo cancellation/safety wording is not an approved production policy and insurance is not verified. Official reservation inventory and real checkout are not connected here.

## Verification and release gate

- **142 frontend tests across 30 files passed**, followed by successful TypeScript checks, Vite production build and `git diff --check`. Existing UI sourcemap warnings remain non-fatal.
- Independently reran **52 backend tests** for Mermaid dashboard projection, reservation store, multilingual intake, quote PDFs, demo payment and demo end-to-end workflow on backend commit `8b775cb`: all passed. These do not certify the subsequent runtime-hardening candidate.
- Browser rehearsal used a localhost-only synthetic API, three explicitly prefixed `Preview` reservations and four synthetic conversations. No preview rows were written to production. Screenshots are rehearsal evidence, not live reservations.
- Visually checked Today, Reservations, Guest workspace and Trip & pricing at desktop and 390px mobile widths. Checked exact chat navigation and the Needs crew filter. No horizontal overflow was observed on the mobile Today view.
- Automated accessibility checks on the checked screens finished without violations after corrections. Gradient/overlap contrast checks left some manual-review items; those were visually inspected. Automated accessibility is not a full accessibility certification.

Release sequence: review frontend PR [#153](https://github.com/unboks-org/unboks-dashboard-api/pull/153); reconcile reservation PR #334 with the final hardened PR #324 foundation; confirm tenant identity and operator-send contracts; let the runtime owner perform the reviewed cutover; then verify login → actual chat → reservation → document evidence against real Mermaid data. Do not claim production completion before that final flow passes.
