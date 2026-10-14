# Workloads

Per-owner CPU, RAM, GPU, and storage telemetry, plus workspace assignments. With no attribution source the view explains that, instead of showing an empty user list.

## Sub-features

- Section heading `Workspaces` (`#assigned-workloads-heading`).
- Fixture state: `data-testid="workload-inventory-state"` with `Workspace inventory is unavailable.`
- Configured owners: `data-testid="people-view"`, a `Users` tablist (desktop) or `Select user` (narrow), owner tabs, and the workload charts for the selected owner.
- Unconfigured attribution, with no workload telemetry object at all: `data-testid="people-attribution-unconfigured"` and heading `Workspace attribution is not configured`.
- Attribution present but not `available`, and no people: `data-testid="people-attribution-state"` (`Workspace assignments are {status}.`). `people-attribution-empty` is the leftover zero-people panel (`No workspaces reported.`), not that degraded state. `Workspace diagnostics` appears when workspace diagnostics exist.

## How to get to it (user POV)

Activate `Workloads` in `Workbench views`, or open `#workloads`. The page heading is `Workloads`. The older `#processes` hash also opens this view.

## Driving it with Playwright

Use a fresh 1280×900 context on the verification `BASE_URL`.

1. `page.goto(BASE_URL + '/#workloads')`.
2. Wait for heading `Workloads` (level 1), heading `Workspaces`, and status `Connection status: Degraded`.
3. On the blackwell fixture launch, wait for `workload-inventory-state` and the text `Workspace inventory is unavailable.` Screenshot the view.
4. Confirm `GET /api/v1/snapshot` has `attribution.status` `available` with empty `workloads` and `assignments`, and `workloadTelemetry.status` `unavailable`. That pair is why the inventory panel renders instead of an owner list. Save both objects in the evidence JSON.
5. Stop there for this launch. There is no user tab to select.

A journey against a serve that was started with a live attribution socket and workload measurements is different and is not what `instance.sh launch` provides. On that serve, wait for `people-view`, select the first tab in `Users`, and confirm the selected owner's charts render. If measurements are enabled and the panel still says the inventory is unavailable, the journey fails. Write `attribution.status` and `workloadTelemetry.status` into the evidence JSON.

## Gotchas

- The builtin fake plugin publishes attribution with nobody in it, and workload measurements as `unavailable`. `Workspace inventory is unavailable.` is the end state for `instance.sh launch`. Do not seed a fake owner in the page, and do not mark the journey passed because the heading `Workloads` rendered.
- `people-attribution-unconfigured` is the state when both `attribution` and `workloadTelemetry` are missing. This fixture has both objects, so that panel is the wrong end state.
- `people-attribution-empty` (`No workspaces reported.`) means measurements are available and listed nobody. The blackwell fixture should not show it. If it does, record `attribution` and `workloadTelemetry` and fail.
- Owner charts request `POST /api/v1/history/aligned`. That request only exists after an owner is selected. Do not expect it on the unconfigured fixture.
