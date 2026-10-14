# Overview

Default workbench view. Shows whether the host is measurable: CPU, RAM, GPU assignment, and storage capacity, then activity charts for those resources.

## Sub-features

- Host capacity cards: `Inspect CPU resources`, `Inspect RAM resources`, `Inspect GPU resources`, `Inspect Storage resources` inside the `Host capacity` region. A card click opens Resources and focuses that category.
- Activity charts under the `Activity` heading, in order: `host-cpu-chart`, `host-ram-chart`, `gpu-activity-chart`, `utilization-chart` (GPU compute), `memory-chart` (GPU memory), `temperature-chart`, `pcie-throughput-chart`, `memory-activity-chart`, and `host-storage-chart`. The GPU charts render only when the snapshot has at least one GPU. The storage panel's `Storage chart metric` radios switch `I/O` and `Space`.
- `Chart window` radios `5m`, `15m`, `30m`, `1h`, `4h`, `12h`. The choice is saved in `localStorage['leviathan.chartWindow.v1']` and reloads aligned history.
- Header connection status, view-update cadence, and theme. Cadence and theme stay in this browser.

## How to get to it (user POV)

Open the dashboard origin. The address becomes `#overview`. The page heading is `Overview`. The header shows the machine hostname. On the blackwell fixture the connection control reads `Degraded` and the health ribbon says `1 active provider diagnostic.` The snapshot stream is up; `/healthz` is still `ok`.

## Driving it with Playwright

`scripts/drive.mjs overview` performs this journey in a fresh 1280×900 context. The same steps by hand:

1. `page.goto(BASE_URL + '/#overview')`.
2. Wait for heading `Overview` (level 1), status `Connection status: Degraded`, and the text `1 active provider diagnostic.`
3. Read `GET /api/v1/snapshot`. The header text matches `host.hostname`. The footer contains `Leviathan` plus the formatted `/api/v1/version` (`dev` stays `dev`; any other version gains a `v` prefix when missing). `diagnostics` is exactly one item: code `plugin_stale`, component `hardware`, summary `Source observation is unavailable or stale`.
4. On the blackwell fixture the cards read:
   - CPU: `32`, `logical processors`, and a percent utilized (the percent moves; `Utilization unavailable` means the card failed).
   - RAM: `128.0 GiB`.
   - Storage: `2.5 TiB`.
   - GPU: `Assignment or GPU discovery is incomplete` and state `Incomplete`. The unassigned count is an em dash. The builtin fake plugin publishes attribution with no resolution, so the card stays incomplete.
5. Wait until `host-cpu-chart`, `host-ram-chart`, `host-storage-chart`, and `utilization-chart` are visible. Screenshot this as `overview-before.png`.
6. The `Chart window` radio named `30m` (exact) is checked. Click the visible `5m` label. The radio named `5m` (exact; `15m` also contains those characters) becomes checked, `localStorage['leviathan.chartWindow.v1']` is `300000`, and the page sends `POST /api/v1/history/aligned` with JSON `"window":"5m"` and receives HTTP 200. Screenshot `overview-5m.png`.
7. Click `Inspect CPU resources`. The URL hash is `#resources`, region `Motherboard resources` is visible, and `#resource-cpu` (heading text `CPU`) is the focused element. Screenshot `overview-cpu-resources.png`.

Write those results to `overview-actions.json`, including the POST status and the snapshot hostname, CPU model, logical processor count, and GPU name.

## Gotchas

- Hostname comes from the machine (`os.Hostname()`), not from the fixture name. The blackwell CPU model `Leviathan fixture CPU` is on the snapshot and in Resources, not on the Overview CPU card.
- `Connection status: Degraded` is the fixture's steady state, not a slow first sample. The builtin `hardware` plugin's `workload-measurements` observation is `unavailable`, and the collector records that as `plugin_stale`. If that diagnostic disappears, the header should read `Live` and this journey must be updated. Do not accept either label.
- The GPU card stays `Incomplete` / `Assignment or GPU discovery is incomplete` because attribution is present and `resolution` is absent. Do not invent an unassigned count, and do not treat this as the unconfigured copy (`Workspace attribution is not configured`).
- A capacity-card click leaves Overview on purpose. Landing on `#resources` with `#resource-cpu` focused is the successful end state.
- Chart window and view-update cadence are different controls. Cadence (`0.5s` / `1s` / `2s`, `leviathan.displayCadence.v1`) does not change `POST /api/v1/history/aligned`.
- A reused browser profile can restore a chart window other than `30m`. The harness uses a new context. If `30m` is not the initial check, stop and say the profile was reused.
- The Vite Playwright suite fulfills `/api/v1/**` in the page. A green `make test-browser` does not prove this journey.
