# P0 #110 tenant-isolation inventory

The active tenant is per-tab `sessionStorage["unboks_active_tenant"]` and is
reactive through `AuthContext`. The retired cross-tab `wtyj_client` value is
ignored and removed. Tokens remain tenant-keyed (`wtyj_token_<slug>`).

## Server cache and request boundaries

All server-derived React Query keys use `tenantKey()` / `tenantKeyFor()` and
therefore start with `["tenant", <slug>]`. This includes conversations,
conversation detail, archives, escalations, appointments, orders, quote leads,
follow-ups, tasks, status, schedules, availability, config, profiles, ICP,
workspace labels, product settings, knowledge/files/media, learnings, agent
settings, ignored/blocked contacts, and every related mutation cache operation.

`apiFetch`, ICP, and tasks capture an immutable tenant/token pair before issuing
the request. Response tenant headers/envelopes are compared before data is
returned to React Query. Tenant switches and logout replace the QueryClient,
cancel the old client, clear it, and remount the tenant subtree.

## Browser persistence

Tenant data is stored only as `unboks:<tenant>:<feature>`:

- confirmed channel visibility;
- account/Your Info fallbacks;
- hidden conversations;
- follow-up queue state and login redirect;
- task drafts, attachments, authors, notes, numbers, parked state, edits and
  acting identity;
- data retention, alert, feature, email and translation preferences.

Unsafe generic legacy data overlays are ignored rather than migrated.

## Documented global exceptions

- `wtyj_token_<slug>`: tenant-keyed authentication token, intentionally shared
  so opening the same workspace in another tab does not require another login.
- `wtyj_workspace_hint`: per-tab, one-shot unauthenticated login hint containing
  no customer data.
- `__unboks_stale_bundle_reload`: per-tab build recovery marker.
- local custom event names: carry no persisted data; mounted listeners read only
  their current tenant-scoped key.

Static regression tests fail on unscoped query arrays, generic tenant-data
storage constants, or reintroduction of `wtyj_client` outside the isolation
module.
