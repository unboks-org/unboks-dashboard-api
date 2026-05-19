# J3-BE-46 — Tenant Login Diagnostics for Nr 2

Companion to the ICP J3-BE-44 / J3-BE-45 flow: documents the
client-side code paths a new-tenant login takes, the failure
modes a user perceives as "Load Failed" or "workspace not
recognized", and the structured logs added in this commit so
each failure mode is now diagnosable from the browser DevTools
console alone.

## Welcome-email link contract (verified)

ICP side (`unboks-internal-control-panel`, `app/routes/admin.py:325`)
constructs the link as:

    https://dashboard.unboks.org/{safe_slug}

Path-based. The legacy `?workspace=<slug>` form is no longer
emitted by ICP — but Nr 2 still accepts it (Login.tsx
`readWorkspaceHint` priority 1) for backward-compat with any
mail in transit.

## URL-form handling in Nr 2

| Inbound URL                              | Wouter route                  | React handler                  | Persists slug?                |
| ---------------------------------------- | ----------------------------- | ------------------------------ | ----------------------------- |
| `/{slug}`                                | `/:tenant`                    | `TenantRootRedirect` (App.tsx) | only if `wtyj_token_<slug>` already exists |
| `/{slug}/escalations/{id}`               | `/:tenant/escalations/:id`    | `TenantDeepLinkRedirect`       | only if token exists          |
| `/{slug}/appointments/{id}`              | `/:tenant/appointments/:id`   | `TenantDeepLinkRedirect`       | only if token exists          |
| `/?workspace={slug}`                     | `/` (root)                    | `Login.tsx readWorkspaceHint`  | no (pre-fills the form only)  |
| `/`                                      | `/` (root)                    | `Inbox` via `ProtectedRoute`   | n/a                           |

The persistence rule (don't write `wtyj_client` to localStorage
until the user has a paired auth token) is the J3-N2-06 lesson —
without it, visiting any `/<unknown-slug>` poisons the
persistent slug and bricks every subsequent visit until the user
manually clears localStorage.

## Failure modes a user perceives as "Load Failed" / "workspace not recognized"

### Mode A — Slug not yet provisioned on the backend

**User experience.** Welcome-email link `https://dashboard.unboks.org/test-3`
opens fine; user is redirected to `/login` with the workspace
field pre-filled to `test-3`; user enters the password from the
email; backend returns 401 because the slug doesn't exist on the
wtyj-agent yet (or the per-tenant container hasn't been
provisioned). Login.tsx surfaces "Invalid access key".

**Logs to look for.**

```
[tenant-nav]  tenant_root.no_token_to_login  { slug: "test-3", workspace_hint_set: true, next: "/login" }
[tenant-nav]  login.hint_from_session        { slug: "test-3", source: "sessionStorage" }
```

The DOM action that follows (POST to `/api/test-3/login`)
returns 401. That confirms backend doesn't know `test-3`.
Triage:
  - Was the provisioner POST attempted? Check Nr3 log for
    `provision_new_tenant.ok slug=test-3` (J3-BE-43 event).
  - Did the provisioner actually write the file? Check VPS for
    `<TENANT_ROOT>/test-3/config/client.json`.
  - Does the wtyj-agent pick up new client.json files dynamically
    or per-tenant container? (Out of Nr 2 scope.)

### Mode B — `?workspace=` slug fails shape check

**User experience.** Tampered or malformed URL like
`https://dashboard.unboks.org/?workspace=invalid!!` opens the
login page with an EMPTY workspace field. User wonders why their
welcome-email link "didn't work".

**Logs to look for.**

```
[tenant-nav]  login.no_hint  { reason: "no ?workspace= and no sessionStorage hint", ts: ... }
```

`fromUrl` failed `isValidTenantSlug` so the priority-1 branch
returned without logging. Priority-2 (sessionStorage) had nothing
either. Workspace field renders empty.

Triage:
  - Inspect the URL in the address bar for accidental URL
    encoding ("%21" instead of "!", trailing whitespace, etc.).
  - Confirm the link in the actual email body matches what the
    user clicked (some MTAs rewrite links for safety/tracking).

### Mode C — User already authed for tenant A, clicks tenant B link

**User experience.** User has an active `unboks` session
(`wtyj_token_unboks` present), clicks
`https://dashboard.unboks.org/test-3` from a welcome email. They
land on... their own inbox, not test-3's. Confusing but not
broken.

**Logs to look for.**

```
[tenant-nav]  tenant_root.no_token_to_login  { slug: "test-3", workspace_hint_set: true, next: "/login" }
[tenant-nav]  login.hint_from_session         { slug: "test-3", source: "sessionStorage" }
```

`TenantRootRedirect` correctly identified that there's no
`wtyj_token_test-3` and bounced to `/login`. But `/login`'s
`Redirect` away if already authenticated (existing behaviour)
kicks the user back to `/` for their old tenant — `Login.tsx`'s
`isAuthenticated` short-circuit prevents the workspace pre-fill
from being seen at all.

This is by design (the user has a perfectly valid session, just
for the wrong tenant). Not a bug; the hint was correctly stashed
and is available if the user signs out + back in with the new
slug.

### Mode D — Genuine "Load Failed" (stale bundle hash)

**User experience.** Page blank or iOS Safari overlay "Load
failed". No JavaScript errors in the console (because no JS
runs).

**Logs to look for.** None — the bundle itself failed to load.
The safety net in `artifacts/unboks/index.html` (J3-N2-09 /
J3-N2-10) catches script-load failures and forces a cache-bust
reload via `?_cb=<timestamp>`. If the safety net is in place,
this self-heals after one reload.

Triage:
  - Inspect Network tab for the `index-*.js` URL. If it returns
    text/html (732 bytes), the bundle hash is stale.
  - Hard-refresh OR the safety net's 5-second `#root`-empty
    watchdog should reload automatically.

### Mode E — "workspace not recognized" (old shape-check failure)

**User experience.** This wording shipped in `pages/Login.tsx`
when slugs were membership-checked against a hardcoded list
(`VALID_CLIENTS`). Since J3-N2-07 (`e7e72a8`) we accept any
shape-valid slug, so this exact wording shouldn't appear any
more. If it does, the deploy is on an old bundle — see Mode D.

## Structured logging in this commit

`App.tsx` and `pages/Login.tsx` now emit a tagged event at every
decision point in the tenant-URL flow. All events are prefixed
`[tenant-nav]` so DevTools filtering is one click. Each payload
is an OBJECT (not a printf string) so the console renders
fields expandably.

| Event name                          | Where                       | When                                                    |
| ----------------------------------- | --------------------------- | ------------------------------------------------------- |
| `tenant_root.invalid_slug`          | `TenantRootRedirect`        | `/:tenant` segment fails `isValidTenantSlug` shape check |
| `tenant_root.has_token`             | `TenantRootRedirect`        | `wtyj_token_<slug>` present → switch + go to inbox      |
| `tenant_root.no_token_to_login`     | `TenantRootRedirect`        | No token → stash hint + redirect to /login              |
| `tenant_deeplink.invalid_slug`      | `TenantDeepLinkRedirect`    | `/:tenant/escalations/:id` (or appointments) bad slug   |
| `tenant_deeplink.no_id`             | `TenantDeepLinkRedirect`    | Deep-link path missing the id segment                   |
| `tenant_deeplink.switch`            | `TenantDeepLinkRedirect`    | Deep link with token present → switch + navigate        |
| `tenant_deeplink.unauth`            | `TenantDeepLinkRedirect`    | Deep link without token → navigate to section (will bounce to /login) |
| `login.hint_from_url`               | `Login.readWorkspaceHint`   | `?workspace=<slug>` priority-1 match                    |
| `login.hint_from_session`           | `Login.readWorkspaceHint`   | sessionStorage hint priority-2 match                    |
| `login.no_hint`                     | `Login.readWorkspaceHint`   | No hint from URL or session — form renders empty        |

Filter recipe in DevTools console:
- Filter string: `[tenant-nav]`
- A new-tenant welcome-email click should produce, in order:
  1. `tenant_root.no_token_to_login`
  2. `login.hint_from_session`

If you don't see (2), the form will render with an empty
workspace field — that's Mode B / E above.

## Acceptance check

- [x] Welcome email link is the canonical
      `https://dashboard.unboks.org/{slug}` form. Verified in
      `unboks-internal-control-panel/app/routes/admin.py:325`.
- [x] Structured logging at every tenant-URL decision point on
      the Nr 2 side. `[tenant-nav]` prefix + object payloads.
- [x] Failure-mode report documenting the five observed
      categories with the log signatures needed to diagnose each.
- [x] Pushed with a clear commit message.

## Out of scope (deliberately, per the brief)

- Deep changes to Nr 2 auth or tenant loading logic.
- UI/mobile work.
- Backend / wtyj-agent provisioning changes (tracked separately
  in J3-BE-42 → J3-BE-45).
