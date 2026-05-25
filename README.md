# Unboks Dashboard API

## Production backend status

The production Nr2 dashboard at `dashboard.unboks.org` is served from the VPS
static release path and talks to the canonical tenant runtime/backend in
`BensonOpas/wtyj-agent`.

The TypeScript server under `artifacts/api-server` is **not** the canonical
production backend. It is incomplete compared with the live Python tenant API
surface and must not be deployed as the production Nr2 API by accident.

To reduce deployment risk, `artifacts/api-server` now refuses to start when
`NODE_ENV=production` unless all of the following are true:

- `ALLOW_LEGACY_TS_API_SERVER_PRODUCTION=true`
- `SESSION_SECRET` is set
- `ZERNIO_SIGNING_SECRET` is set

That override is only for an explicitly approved migration or staging run. It is
not the normal production path.

Current normal production ownership:

- Nr2 frontend source: `artifacts/unboks`
- Nr2 live static releases: `/var/www/unboks-dashboard/releases/*`
- Nr2 canonical backend/runtime: `BensonOpas/wtyj-agent` tenant containers
