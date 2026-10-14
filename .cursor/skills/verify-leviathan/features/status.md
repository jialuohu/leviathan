# Status

Current monitor health, diagnostic details, and plugin endpoints. This is not a service SLA. Unknown history stays unknown.

## Sub-features

- `Current status` (`#health-status-heading`) with the state label (`Operational`, `Degraded`, `Unavailable`, or `No data` on `.health-state`), `Host uptime`, and `Monitor runtime`.
- Ninety-day history grid. Days with no saved observation stay unknown.
- `Diagnostic details` (`#diagnostics-heading`). Empty copy is `No active diagnostics.`
- `Plugins` (`#plugins-heading`) and `Refresh plugins`. Empty copy is `No plugins configured.`

## How to get to it (user POV)

Activate `Status` in `Workbench views`, or open `#status`. The page heading is `Status`. The older `#operations` and `#diagnostics` hashes also open this view. The header health ribbon's `Status` button comes here when a snapshot is already on screen.

## Driving it with Playwright

Use a fresh 1280×900 context on the verification `BASE_URL`.

1. `page.goto(BASE_URL + '/#status')`.
2. Wait for heading `Status` (level 1) and status `Connection status: Live`.
3. Wait for heading `Current status`. On the blackwell fixture:
   - `.health-state` has `data-state="operational"` and text `Operational` once `GET /api/v1/status` has returned. `No data` after the request completes is a failure.
   - `Host uptime` is `—`. The fixture snapshot does not carry a host uptime sample.
   - `Monitor runtime` matches a short duration such as `0m` (minutes of this process). A dash here means the status report never arrived.
4. `Diagnostic details` contains `No active diagnostics.`
5. `Plugins` contains `No plugins configured.` Click `Refresh plugins` and confirm another `GET /api/v1/plugins` returns HTTP 200 with `"plugins":[]`.
6. Read `GET /api/v1/status`. `persistence.enabled` is false. Screenshot the view and save the status JSON beside it.
7. The run's `XDG_STATE_HOME` is still empty after the page has loaded. Opening Status must not start health persistence.

## Gotchas

- Fixture and `--provider fake` disable 90-day health persistence in the server. Unknown history cells and `persistence.enabled: false` are the expected end state. Do not turn persistence on to make the grid look healthy, and do not treat unknown days as a failed health check.
- Host uptime `—` is specific to this fixture. A `--provider auto` serve on a live Linux host should show a real uptime; that is a different launch, and a dash there fails that journey.
- Yggdrasil is not configured, so the uplink row stays unknown (`Uploader is not configured.`). Unknown uplink does not by itself make `Current status` degraded. `Operational` here means host and GPU telemetry components are operational.
- `No active diagnostics.` is the blackwell fixture result. If diagnostics render, copy them into the evidence and fail this fixture journey. Fix the cause or update this gotcha with the new expected diagnostic; do not delete the assertion.
