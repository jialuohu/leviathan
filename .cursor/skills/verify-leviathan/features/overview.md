# Overview

Default workbench view. Shows whether the host is measurable: CPU, RAM, GPU assignment, and storage capacity, then activity charts for those resources.

## Sub-features

- Host capacity cards: `Inspect CPU resources`, `Inspect RAM resources`, `Inspect GPU resources`, `Inspect Storage resources` inside the `Host capacity` region. A card click opens Resources and focuses that category.
- Activity charts under the `Activity` heading: `host-cpu-chart`, `host-ram-chart`, `utilization-chart` (GPU compute), the GPU memory chart, and `host-storage-chart`. The storage panel's `Storage chart metric` radios switch `I/O` and `Space`.
- `Chart window` radios `5m`, `15m`, `30m`, `1h`, `4h`, `12h`. The choice is saved in `localStorage['leviathan.chartWindow.v1']` and reloads aligned history.
- Header connection status, view-update cadence, and theme. Cadence and theme stay in this browser.

## How to get to it (user POV)

Open the dashboard origin. The address becomes `#overview`. The page heading is `Overview`. The header shows the machine hostname and `Live` once the snapshot stream is up.

## Driving it with Playwright

`scripts/drive.mjs overview` performs this journey in a fresh 1280×900 context. The same steps by hand:

1. `page.goto(BASE_URL + '/#overview')`.
2. Wait for heading `Overview` (level 1) and status `Connection status: Live`.
3. Read `GET /api/v1/snapshot`. The header text matches `host.hostname`. The footer contains `Leviathan` plus the formatted `/api/v1/version` (`dev` stays `dev`; any other version gains a `v` prefix when missing).
4. On the blackwell fixture the cards read:
   - CPU: `32`, `logical processors`, and a percent utilized (the percent moves; `Utilization unavailable` means the card failed).
   - RAM: `128.0 GiB`.
   - Storage: `2.5 TiB`.
   - GPU: `Workspace attribution is not configured` and state `Unknown`. The fixture has GPUs and no attribution plugin, so the unassigned count is an em dash.
5. Wait until `host-cpu-chart`, `host-ram-chart`, `host-storage-chart`, and `utilization-chart` are visible. Screenshot this as `overview-before.png`.
6. The `Chart window` radio `30m` is checked. Click the visible `5m` label. The `5m` radio becomes checked, `localStorage['leviathan.chartWindow.v1']` is `300000`, and the page sends `POST /api/v1/history/aligned` with JSON `"window":"5m"` and receives HTTP 200. Screenshot `overview-5m.png`.
7. Click `Inspect CPU resources`. The URL hash is `#resources`, region `Motherboard resources` is visible, and `#resource-cpu` (heading text `CPU`) is the focused element. Screenshot `overview-cpu-resources.png`.

Write those results to `overview-actions.json`, including the POST status and the snapshot hostname, CPU model, logical processor count, and GPU name.

## Gotchas

- Hostname comes from the machine (`os.Hostname()`), not from the fixture name. The blackwell CPU model `Leviathan fixture CPU` is on the snapshot and in Resources, not on the Overview CPU card.
- GPU assignment stays `Unknown` / `Workspace attribution is not configured` until a real attribution source is configured. Do not invent an unassigned count to make the card look populated.
- A capacity-card click leaves Overview on purpose. Landing on `#resources` with `#resource-cpu` focused is the successful end state.
- Chart window and view-update cadence are different controls. Cadence (`0.5s` / `1s` / `2s`, `leviathan.displayCadence.v1`) does not change `POST /api/v1/history/aligned`.
- A reused browser profile can restore a chart window other than `30m`. The harness uses a new context. If `30m` is not the initial check, stop and say the profile was reused.
- The Vite Playwright suite fulfills `/api/v1/**` in the page. A green `make test-browser` does not prove this journey.
