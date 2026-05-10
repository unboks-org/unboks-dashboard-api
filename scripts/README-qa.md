# Unboks QA Runner

Internal QA/customer simulator for the Unboks client dashboard (Project 2).
Phase 1: dry-run validation + read-only API verification. No messages are sent.

## How to run

### Dry-run (no API calls — validates scenario shapes only)

```bash
pnpm --filter @workspace/scripts run qa:dry-run
```

### Live mode (read-only API verification)

Copy your bearer token from the browser:
DevTools → Application → Local Storage → `wtyj_token_unboks`

```bash
QA_TOKEN=<bearer-token> pnpm --filter @workspace/scripts run qa:live
```

### Optional flags

```bash
# Single scenario
QA_TOKEN=<token> pnpm --filter @workspace/scripts run qa:live -- --only APPT-001

# Category filter (appointment | faq | complaint | reply-threading | dashboard-action | edge-case)
QA_TOKEN=<token> pnpm --filter @workspace/scripts run qa:live -- --category complaint

# Custom output directory
QA_TOKEN=<token> pnpm --filter @workspace/scripts run qa:live -- --out /tmp/my-reports
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `QA_TOKEN` | _(none)_ | Bearer token from browser session. Required for live mode. |
| `QA_API_BASE` | `https://api.unboks.org` | API host. |
| `QA_CLIENT` | `unboks` | Tenant slug. |
| `QA_DRY_RUN` | _(unset)_ | Set to `1` to force dry-run regardless of token. |

## Reports

Reports are written to `reports/` (or the directory specified with `--out`):

- `qa-report-<timestamp>.json` — full structured report
- `qa-report-<timestamp>.md` — human-readable Markdown report

## Scenarios

50 scenarios in `tests/qa-scenarios/unboks-customer-scenarios.json`:

| Category | Count |
|---|---|
| appointment | 15 |
| faq | 10 |
| complaint | 10 |
| reply-threading | 5 |
| dashboard-action | 5 |
| edge-case | 5 |

Every message is prefixed with `[QA TEST]` to distinguish test traffic.
QA customer email: `calvinadamus@gmail.com`.

## Safety rules

- Phase 1 only. **No messages are sent.** No data is mutated.
- Uses read-only GET endpoints only: conversations, escalations, appointments, config, alert settings.
- No production alert channels are triggered.
- All test messages carry the `[QA TEST]` marker.
- `mustNotContain` guards check for `butlerbensonagent@gmail.com` and em-dash on every scenario.

## Phase 2 (not yet implemented)

Phase 2 will add:
- Safe dev/staging message injection via a dedicated test endpoint
- Cleanup mode (delete QA TEST conversations)
- Full per-scenario escalation / appointment / reply verification

Phase 2 checks are marked `skip` with `TODO Phase 2` in the current output.

## Removing the QA runner

Delete the following to remove it completely:

- `scripts/src/qa/` (this directory)
- `tests/qa-scenarios/unboks-customer-scenarios.json`
- `scripts/README-qa.md`
- `reports/` (generated output)
- The `qa:dry-run` and `qa:live` entries in `scripts/package.json`
