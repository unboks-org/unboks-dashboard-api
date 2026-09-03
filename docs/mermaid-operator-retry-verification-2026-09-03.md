# Mermaid operator retry verification — 2026-09-03

## Release scope

Persist operator request identities at the shared API boundary for regular WhatsApp replies, escalation replies (including selected images), and AI guidance. This is a frontend safety release, not the missing reservation-backend deployment.

Each pending intent is keyed by a SHA-256 fingerprint of tenant, route/action, and exact payload. Session storage contains the fingerprint and request UUID, not the message, phone number, or image content. An in-memory flight guard prevents rapid concurrent identical sends. Storage must work before a request is sent.

An identity is removed only after a parsed backend response explicitly acknowledges `ok: true`. Network errors, 401/re-login, 409, 502, malformed JSON, empty 204 and unconfirmed 200 bodies preserve it. Changing the draft/image/action creates a separate intent. A deliberate new send after acknowledgement gets a new identity. Pending identities do not silently expire.

Scope: the same browser tab, including reloads, component remounts and re-login. Session storage is not a cross-device or cross-tab outbox and does not survive closing the tab/browser session. Draft text is not persisted by this change; after a reload, an exact retry requires re-entering the same text and image selection. Backend idempotency and provider reconciliation remain necessary.

## Browser rehearsal

Actual React composers and API client were served from localhost:5183 against a localhost:4183 synthetic backend. No external model calls, real provider sends, production mutations or customer data were used. The fake backend recorded delivery, then returned HTTP 502 to simulate loss of confirmation.

| Actual UI action | First attempt | After reload, exact retry | Deliberate new send | Fake deliveries |
| --- | --- | --- | --- | --- |
| Inbox WhatsApp reply | Identity A, lost confirmation | Identity A, acknowledged replay | Identity B | 2 |
| Escalation customer reply | Identity C, lost confirmation | Identity C, acknowledged replay | Identity D | 2 |
| Guidance to the Agent | Identity E, lost confirmation | Identity E, acknowledged replay | Identity F | 2 |

Nine send requests represented six logical sends. The three reload retries caused no additional simulated delivery. Both combined send-and-resolve paths were exercised: no resolve request after an unconfirmed send; after confirmed delivery with failed resolution, the draft cleared and partial-success feedback appeared. Follow-up regression tests distinguish internal guidance from a customer-facing message and avoid claiming a failed response proves non-delivery.

The temporary rehearsal HTML was removed before the production build; its fake credentials and backend are not shipped.

## Verification and rollout boundary

- Unit/integration coverage includes exact tenant/action/text/image scope, no plaintext retry storage, concurrent-submit deduplication, blocked storage, workspace changes during preparation, 401/re-login, malformed/empty/unconfirmed responses and both escalation composer modes.
- Verified: 170 tests across 33 files passed; TypeScript passed; production build with `VITE_API_BASE_URL=https://api.unboks.org BASE_PATH=/` passed. Existing UI-component sourcemap warnings remain non-fatal.
- Preserve existing hashed assets in an additive static release and retain an explicit rollback symlink.
- The Reservations task owns the combined canonical backend release and protected credential/session remediation. Do not activate an older runtime or claim the reservation 404 is fixed based on these frontend tests.
