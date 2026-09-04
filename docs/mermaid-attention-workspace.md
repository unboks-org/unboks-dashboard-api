# Mermaid human-operator attention workspace

## Problem and evidence

The former Today queue combined unread chats and reservation handover flags, capped the list at seven, and routed a handover to the reservation rather than the decision. It did not query the dedicated escalation source. The reservation displayed a generic badge but not the actual recorded problem.

Read-only production checks on 2026-09-03 returned HTTP 200 with `X-Unboks-Tenant: mermaid` for escalations, reservations and conversations. The screenshot's reservation has a linked pending soft escalation. Its existing structured summary already contains the guest request, reason, decision needed and triggering guest message. No customer messages, bookings, agent controls or escalation statuses were changed during verification.

## Operator flow

- Today opens with the attention workspace ahead of reservation statistics. The count is distinct conversations, not unread messages or number of escalation records. All returned unresolved cases are shown, including older cases, without the seven-item cap. Today's trips sort first, then oldest outstanding cases.
- Every card shows the recorded request and triggering guest message. One click opens the full reason, decision and response controls in place. The exact count is also shown in desktop and mobile navigation.
- Soft mode: internal guidance goes through the existing `/escalations/{id}/guidance` route; TRACY prepares and sends the customer-facing response.
- Take over explicitly before replying as the HO. The panel waits for the backend's hard mode before exposing the direct reply. A return-to-TRACY action uses the existing handback route.
- Internal guidance and direct-message drafts are separate. Closing/reopening a case preserves its drafts. A successful send does not automatically resolve; the operator explicitly marks the case resolved once handled.
- Reservation detail shows the same decision panel already expanded, immediately below the header. A resolved canonical escalation supersedes stale reservation handover flags in attention counts/header.

## Safety and scope

- Existing tenant scoping, blocked/hidden filters, query keys and delivery routes are reused. No database, runtime configuration, catalog, trip/pricing navigation, customer communication, or agent activation changes are part of this release.
- Existing durable request identities handle ambiguous send failures. Drafts stay present on failure; unchanged retries use the same request identity. Duplicate clicks are guarded.
- Before sending, refresh the escalation list and reject a closed case or changed mode. This is a client-side stale-state guard, not an atomic server concurrency lock.
- Never infer hard delivery semantics merely from `aiMuted`: a soft escalation may pause automatic replies while awaiting guidance. Preserve the actual endpoint mode.
- All queue sources must load successfully before displaying a confirmed zero. Partial data remains visibly incomplete. An unlinked handover remains visible with guest context and an explicit explanation; no fabricated escalation ID is used for writes.
- The queue reflects records exposed by the existing backend. Its existing archival/blocked-record policy is unchanged. Future backend changes would be needed to audit escalations that its API excludes.
- Structured triggering text is preferred over loading chat history. If absent, read-only conversation history supplies the guest message near the escalation; it is labelled separately from the recorded reason. No message text is sent to an additional model or third party.

## Verification

- Full frontend suite: 213 tests across 37 files passed. TypeScript and the production build passed. Existing UI-component sourcemap warnings remain non-fatal.

- Automated tests cover 30 chats/10 attention cases, one count with multiple retained issues, prior-day cases, resolved/stale flags, missing links, channel separation, hidden/blocked cases, structured reasons, guest-message selection, loading/error/partial states, one-click response, preserved drafts, reservation panels, exact mobile count and the existing print receipt regression.
- UI-to-client-action tests cover guidance versus direct reply, confirmed takeover, explicit resolution, changed/closed cases, unknown mode, failed drafts and duplicate clicks. Existing API idempotency and tenant-isolation tests remain in the full suite.
- Provider delivery in this turn is not exercised against a real guest. Mutation behavior is verified with controlled test doubles and the existing API contracts; production verification is read-only.
