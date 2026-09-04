# TRACY status and intentional controls

The Mermaid/Rental sidebar used the status label as a toggle: clicking “TRACY is active” immediately submitted `{active:false}`. It also rendered unavailable, missing and failed status requests as “TRACY is paused”. The audit found no automatic pause write on page load, polling, logout or settings saves; the pause PUT was only called from explicit click handlers.

The status is now read-only. A separate “Pause TRACY” or “Resume TRACY” button performs the requested action. Unknown, unavailable and failed requests display “TRACY status unavailable” and disable controls, including a failed refetch with previously cached active data. Nick uses the same shared shell. The generic inbox drawer also rejects unknown/error states and keeps its existing explicit controls.

The API type accepts the canonical runtime contract `{active:null,status:"unavailable",available:false}` while retaining compatibility with older unavailable envelopes carrying `active:false`. A verified `available:true,active:false` remains an actual pause.

## Validation

- 177 frontend tests passed before adding two generic-drawer cases; the final focused 16 sidebar/drawer tests pass.
- TypeScript and the production Vite build passed. Build uses `VITE_API_BASE_URL=https://api.unboks.org BASE_PATH=/`.
- Browser rehearsal used the real shell/hooks and a local simulated fetch handler that blocked unexpected requests. Desktop 1280px and mobile 390px screenshots show distinct status/action and disabled unavailable controls.
- Status clicks on both viewports produced no API writes. Clicking the explicit Pause action submitted exactly one `{active:false}` to the local stub. Forced refetch failure displayed unavailable; no browser errors or error overlays.
- Screenshots: `/tmp/tracy-pause-evidence/desktop-active.png`, `desktop-unavailable.png`, `mobile-active.png`, `mobile-unavailable.png`.
- Rehearsal files were removed before the production build. No production settings were changed and no provider messages were sent during verification.

## Release baseline

The inspected live static symlink was `/var/www/unboks-dashboard/current` → `releases/b8a38e1fa54073bb136eae50ebb5cca943de96d7`. Its source tree matches `origin/main` at `e28d165`, the merged operator retry fix. This patch is based on that tree and preserves its changes. Production publishing remains the responsibility of the coordinating task.
