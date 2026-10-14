# Workloads

Per-owner CPU, RAM, GPU, and storage telemetry, plus workspace assignments. With no attribution source the view explains that, instead of showing an empty user list.

## Sub-features

- Section heading `Workspaces` (`#assigned-workloads-heading`).
- Unconfigured state: `data-testid="people-attribution-unconfigured"` and heading `Workspace attribution is not configured`.
- Configured state: `data-testid="people-view"`, a `Users` tablist (desktop) or `Select user` (narrow), owner tabs, and the workload charts for the selected owner.
- Degraded attribution: `data-testid="people-attribution-state"` or `people-attribution-empty`, and `Workspace diagnostics` when workspace diagnostics exist.

## How to get to it (user POV)

Activate `Workloads` in `Workbench views`, or open `#workloads`. The page heading is `Workloads`. The older `#processes` hash also opens this view.

## Driving it with Playwright

Use a fresh 1280×900 context on the verification `BASE_URL`.

1. `page.goto(BASE_URL + '/#workloads')`.
2. Wait for heading `Workloads` (level 1), heading `Workspaces`, and status `Connection status: Live`.
3. On the blackwell fixture launch (no `--attribution-socket`, no workload telemetry), wait for `people-attribution-unconfigured` and the heading `Workspace attribution is not configured`. The body says hardware telemetry is in Resources. Screenshot the view.
4. Confirm `GET /api/v1/snapshot` has no `attribution` object. That is the side effect check: the panel matches the payload.
5. Stop there for this launch. There is no user tab to select.

A journey against a serve that was started with a live attribution socket is different and is not what `instance.sh launch` provides. On that serve, wait for `people-view`, select the first tab in `Users`, and confirm the selected owner's charts render. If the socket is set and the panel stays on `people-attribution-unconfigured`, or if it shows `Workspace assignments are <status>` with no owners, the journey fails. Write the attribution `status` and the snapshot's attribution object into the evidence JSON.

## Gotchas

- The fixture has no Coder or Kubernetes assignment data. The unconfigured panel is the end state for `instance.sh launch`. Do not seed a fake owner in the page, and do not mark the journey passed because the heading `Workloads` rendered.
- `people-attribution-empty` (`No workspaces reported.`) is a different state: attribution exists and listed nobody. The blackwell fixture should not show it. If it does, record the snapshot's `attribution` and `workloadTelemetry` and fail.
- Owner charts request `POST /api/v1/history/aligned`. That request only exists after an owner is selected. Do not expect it on the unconfigured fixture.
