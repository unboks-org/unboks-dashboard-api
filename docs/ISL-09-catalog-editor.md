# ISL-09 — Isluno catalog editor

Issue: https://github.com/unboks-org/unboks-dashboard-api/issues/164. Dashboard base: `2e41f4a209fbafc602419408696a25fa9791dc34`. Backend base: `92c9989fae5546986c89590ba78b2b050b2745ec`. Candidate review only: 8/14 accepted, 0/14 merged/verified before this issue's review.

## Operator behavior

The existing Mermaid Settings → Trip & pricing entry now reads authenticated Isluno capabilities. When enabled for the current tenant, it displays the Isluno catalog; disabled or older (404) capability APIs retain the existing Mermaid editor. Other tenants never mount this entry. Transient errors expose retry rather than silently selecting another editor.

Operators can search every product by name, category or identifier, edit public facts/inclusions/visibility, review source notes and missing supplier facts, and edit existing supplier and approved demo rule layers separately. Rule forms include guest ages, existing capacity, age-band or booking prices, currency, taxes/demo terms, operating days/departures/durations/check-in, extras, pickup and policy text/evidence. Missing supplier envelopes stay unconfirmed; this editor does not invent confirmation or import new products/photos. Imported gallery photos retain their source/delivery identity and support complete ordering and captions through keyboard/touch buttons. Previews use authenticated local-image API blobs; there are no remote source-image fetches.

Publication uses the original loaded catalog revision. Validation errors preserve the draft; conflicts block repeated stale publication and offer an explicit discard/reload. Refresh errors retain the last loaded catalog and show retry. Loading, saving, saved, empty-search and missing-image states are explicit. Unsaved drafts warn before reload/product switching or browser unload. Existing global dashboard navigation behavior is retained.

Backend `GET/PUT /isluno/catalog` and `GET /isluno/catalog/media/{digest}.jpg` use the host dashboard authentication plus the strict active Mermaid/Isluno capability guard. There is no tenant or path selection in the edit body. Publication reuses CatalogStore validation, process lock, revision CAS, immutable archives and atomic filesystem writes. Existing demo provenance cannot be stripped or relabelled; labels, authority, approval reference and real-booking ineligibility remain immutable. Updated sample content receives its own version. Source asset identity and source claims remain importer-owned.

Historical itinerary, quote and paid snapshots/PDFs remain unchanged. New intake reads the newly published catalog; stale quote approval/payment already fails at the accepted catalog-revision guard. No inventory, payment, supplier, WhatsApp/email or model operation is invoked by catalog editing.

## Evidence

- Dashboard: 32 focused tests passed (four files) in 1.51s, using actual API wrappers and deterministic fetch adapters: Isluno settings, legacy Mermaid settings, reservation API and tenant isolation. TypeScript check passed; Vite production build passed in 3.47s. No lockfile/runtime dependency changes.
- Backend: 153 tests passed in 18.848s with sockets/DNS denied. Includes five real-auth catalog API checks and a real API-publication-to-new-itinerary regression proving changed prices affect new totals while paid snapshots and document bytes remain unchanged. Existing full catalog/assets, conversation, quote and fulfillment checks remain included.
- Actual local browser → authenticated FastAPI → CatalogStore flows used 31 synthetic products and three generated fixture images per product. The browser mounted the actual MermaidTripSettings entry and capability selector; the outer dashboard shell/login was not the fixture under test. The host `_check_auth` function was executed from its exact source with a synthetic session token, avoiding host startup/secret reads. Publication and media handlers, validators, persistence and client requests were real.
- Browser saved a description, moved photo 2 to position 1 using Enter, changed its caption, edited a sample adult price from 10000 to 12500 and added a 1500 minor-unit extra. Source price remained null. Keyboard time control changed 09:00 to 09:01 and persisted it. The CLI's programmatic time-fill command did not produce a change event, so time verification used actual keyboard arrows/Tab.
- An overlapping age-band edit returned HTTP 422 and the real validation message; concurrent publication returned HTTP 409, retained the draft and disabled stale save. Unauthenticated/wrong-token requests returned 401; another tenant URL returned 404. These are additional to disabled/wrong-runtime tenant API tests.
- At 390×844, gallery caption publication succeeded and document scroll width equalled viewport width (390); desktop width likewise 1280. Loading/retry state has component coverage; an aborted local catalog reload visibly retained cached data, showed error/retry and successfully recovered when restored. No Vite error overlay or unexpected browser exception was observed. Expected 401/404/409/422 and injected aborted-fetch errors are fault-test evidence, not successful deliveries.
- Screenshots in `output/isluno-09`: list, saved facts, ordered gallery, invalid rules, preserved conflict, mobile gallery, empty search and retryable reload error. List, editor, gallery, conflict/mobile and error states were visually inspected. Solid-color images are deliberately generated synthetic fixtures, not Isluno trip photographs. Final screenshot hashes are in the manifest.

## Reproduce locally ($0 external test budget)

Backend worktree:

```sh
tmp/isluno-test-venv/bin/python wtyj/scripts/verify_isluno_offline.py
tmp/isluno-test-venv/bin/python wtyj/scripts/serve_isluno_catalog_fixture.py --directory tmp/isluno-09-fixture
```

The fixture requires existing pinned backend dependencies (including uvicorn 0.41.0, ReportLab 4.4.3, Pillow and FastAPI); it writes synthetic files only under the supplied directory and denies outbound socket dispatch before runtime imports. It listens on loopback port 8787. Restart recreates its synthetic catalog; never point it at a live catalog directory.

Dashboard worktree:

```sh
pnpm --filter @workspace/unboks test src/components/settings/IslunoCatalogSettings.test.tsx src/components/settings/MermaidTripSettings.test.tsx src/lib/api.mermaid-reservation.test.ts src/lib/tenant-isolation.test.ts
pnpm --filter @workspace/unboks typecheck
pnpm --filter @workspace/unboks build
PORT=5179 BASE_PATH=/ pnpm --filter @workspace/unboks exec vite --config tests/isluno-preview.config.ts
agent-browser --session isluno09 open http://127.0.0.1:5179/tests/isluno-preview.html
agent-browser --session isluno09 snapshot -i
```

The test-only Vite configuration disables dotenv loading and proxies `/api` solely to loopback. The explicit preview entry supplies only the documented synthetic session. It is not a production build entry or authentication bypass in the application. No changes were made to production proxy configuration. The same equivalent temporary preview was used initially, then moved into this reproducible test location and re-verified.

## Boundaries and rollback

External test spend $0. No supplier/source/image refetch, live model/provider/send/email/payment, tenant feature activation, credentials, merge or deployment. Existing Mermaid technical tenant and number remain untouched. Hide the catalog-editor capability or disable the existing unpublished Isluno feature to remove the editor; retain published and historical catalog files. Dashboard branding and itinerary operations remain ISL-10/11, outside this issue.
