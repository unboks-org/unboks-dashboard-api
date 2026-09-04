# Mermaid trip settings

The read-only top-level Trip & pricing page has moved into `Settings → Trip & pricing` (`/settings?category=trip-pricing`). Legacy `/trip` and Mermaid `/fleet` links redirect there. Customers, Reservations, Conversations, Today and Settings remain in Mermaid's main menu; Ali's Fleet & pricing and other tenants' Settings stay unchanged.

The form edits the server-owned catalog used by TRACY: trip name, meeting point, check-in/return time, weekdays, explicit USD/EUR/XCG fare bands, default currency, pickup lead time, car/van capacities and prices, overflow handling, inclusions, packing list, extras and policy wording.

Only operator-owned fields are sent. This does not edit tenant identity, checkout URLs, message templates, agent state or feature flags. Publishing requires review/confirmation, uses the server revision, preserves drafts on errors and background refresh, blocks stale overwrites and reports actual persisted success. Unsupported servers show publishing as unavailable. Reload/discard is explicit; a browser-close warning protects unsaved changes.

The backend preserves each existing reservation's monetary snapshot and retains prior catalog versions. Updated prices apply to new quotes, not issued quotes/receipts. Times are local to Curaçao. Whole-unit prices match the current engine; pickup currency must match the default until conversion rates are configured. Real inventory, payments, reminders and insurance claims remain outside this demo editor.

Validation covers actual API request scoping and headers, other-tenant response rejection, saved/failed/conflicting publishes, no write before confirmation, vehicle data, valid timing and policy safeguards, unsupported servers, and main-menu removal. Build on the deployed customer-account frontend `704e6a0` so those newer features are preserved.
