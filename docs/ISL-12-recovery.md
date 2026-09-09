# ISL-12 — Operator recovery and cutover audit

Extends the existing Today page in the real rental dashboard shell. The authenticated backend projection supplies model incidents, reminder outcomes, discovery failures and quarantined Mermaid work. An ambiguous or interrupted send requires reconciliation; the view offers inspection links and no automatic resend control. Saved progress and original Mermaid history remain accessible. The candidate reminder policy is disabled.

## Verification

- `pnpm --filter @workspace/unboks test`: 47 files, **292 tests passed**, 6.26 seconds. The added actual-shell test consumes `artifacts/unboks/tests/isluno-recovery.fixture.json`, captured from the real synthetic Today API, and checks disabled policy, model error, ambiguity, suppression, legacy disposition, inspection links and read-only controls.
- `pnpm --filter @workspace/unboks typecheck`: passed.
- `pnpm --filter @workspace/unboks build`: passed, 2.98 seconds.
- Real loopback backend `serve_isluno_operations_fixture.py --workspace --recovery` and Vite `tests/isluno-workspace.config.ts`, not an isolated component mount. API fixture uses the host auth function with a synthetic token and disables external outbound transports.
- Browser at 1280 desktop and 390 mobile: Today shows 11 attention records and recovery audit; no horizontal document overflow. The saved-itinerary link opens the real detail route, retaining 2026-10-15 after an injected failed change to 2026-10-20. Original Mermaid route remains reachable with its legacy shell; that route uses an empty synthetic legacy list, so DB preservation is established separately by backend rehearsal.
- Four screenshots and hashes in `output/isluno-12/manifest.json`: recovery desktop/mobile and saved progress desktop/mobile. Browser error collection empty.

Backend evidence: 177 network-denied tests including 12 recovery cases; five-table cutover/rollback rehearsal leaves original rows unchanged, rejects old checkout with HTTP 410 and prevents stale inbound replay. See paired backend `wtyj/briefs/isluno_recovery.md` and `output/isluno-12/cutover-rollback.json`.

Scope limits: fixture-authenticated local shell/API evidence does not establish outer login, live controls, provider delivery or native WhatsApp rendering. Papiamento copy still needs native review. No live model/provider/email/payment/supplier calls, feature activation, credentials, number changes, merge or deployment. External test spend $0. Rollback retains guard-capable code and durable quarantine; it does not automatically revive old Mermaid actions.
