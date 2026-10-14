# Resources

Host board plus every GPU. This is where a capacity card lands, and where a user inspects MIG chips.

## Sub-features

- Motherboard panel (`data-testid="motherboard-resources"`, region name `Motherboard resources`). Category headings are `#resource-cpu`, `#resource-memory`, and `#resource-storage` (visible text `CPU`, `RAM`, `Storage`). Picking the matching board region focuses that heading. Clicking the heading does not change the selection.
- `Live GPU capacity` (`data-testid="gpu-capacity-panel"`) with `Refresh live GPU capacity`. Counts are extra DRA allocations, not the GPU cards below.
- GPU section heading `GPUs` (`#resource-gpu`). Each board has `Open GPU <index> physical GPU details`. A non-MIG card also has `Open GPU <index> full GPU details`. A MIG card has one `Open GPU <index> · GI <id> · CI <id> details` per compute instance. A MIG card with no compute instances shows `No observed MIG instances.` and only the physical details button. The detail dialog is `data-testid="detail-sheet"` with a `Close` button.
- Board controls: `Zoom in`, `Zoom out`, `Reset view`, `Focus board` or `Focus chip`, and the interactive-view label. Without WebGL the board shows `3D unavailable` and those toolbar buttons stay disabled. Detail buttons stay usable.

## How to get to it (user POV)

From any view, activate the `Resources` link in `Workbench views`, or open `#resources`. The page heading is `Resources`. From Overview, `Inspect CPU resources` (and the RAM, GPU, and Storage cards) opens this view and focuses that category.

## Driving it with Playwright

Use the browser launch from the skill (`drive.mjs` is the pattern; point a new context at the same `BASE_URL`). Viewport 1280×900.

1. `page.goto(BASE_URL + '/#resources')` and wait for heading `Resources` (level 1) and status `Connection status: Degraded`.
2. Wait for region `Motherboard resources`. On the blackwell fixture, `#resource-cpu` is present. The snapshot CPU model is `Leviathan fixture CPU`.
3. Wait for heading `GPUs` and `data-testid="gpu-capacity-panel"`. On this fixture the panel's `data-status` is `unavailable` and the body is `No capacity plugin observation is available`. There is no count. Click `Refresh live GPU capacity` and confirm a `GET /api/v1/gpu-capacity` returns HTTP 200 with `status` `unavailable` and `rows` `[]`. Screenshot before and after the refresh.
4. Blackwell GPU 0 is MIG. Click `Open GPU 0 · GI 1 · CI 0 details` (the dot is U+00B7). `[data-testid="detail-sheet"]` becomes visible and shows that GI/CI. Click `Close` and confirm the dialog is gone.
5. Also confirm `Open GPU 0 physical GPU details` is present. Do not require a WebGL canvas. If the board says `3D unavailable`, the detail buttons are still the proof.

Record the capacity response status and the detail open/close in the evidence JSON next to the screenshots.

## Gotchas

- The fixture header stays `Degraded` on this view because of the Overview `plugin_stale` diagnostic. The ribbon is not a failed motherboard. The board journey still requires the motherboard region, the capacity panel, and a GPU detail dialog.
- Live GPU capacity is unavailable until a capacity plugin is configured. The builtin fake plugin does not provide `gpu-capacity`. The panel copy comes from `GET /api/v1/gpu-capacity`. This fixture has no rows, so the panel shows that message and no count. An em dash is a row whose availability is unknown. It is not zero free GPUs, and it is not this fixture's empty document. If a capacity plugin is configured and the panel stays `unavailable`, that journey fails. Record the response body rather than skipping the refresh.
- Headless Chrome often has no WebGL. `3D unavailable` with working detail buttons is success for this harness. A blank board with no `Open GPU … details` button is a failure.
- Camera drag and particle motion are decorative. Do not use pixel diffs of the WebGL canvas as the proof.
- Overview's CPU card and this view share one navigation path. When both change, run the Overview journey as well as this one.
