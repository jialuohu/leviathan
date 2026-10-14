# Leviathan dashboard feature map

Verification drives the loopback dashboard from `leviathan serve`. Routes are URL hashes on that origin. The desktop nav (`nav[aria-label="Workbench views"]`, viewport width ≥768) is the way in.

| Feature | Hash | File | What the user gets |
| --- | --- | --- | --- |
| Overview | `#overview` | [overview.md](overview.md) | Host capacity cards and activity charts |
| Resources | `#resources` | [resources.md](resources.md) | Motherboard, live GPU capacity, GPU boards |
| Workloads | `#workloads` | [workloads.md](workloads.md) | Workspace attribution and per-owner telemetry |
| Status | `#status` | [status.md](status.md) | Current health, diagnostics, and plugins |

The header is on every view: connection status, the `View updates` cadence (`0.5s`, `1s`, `2s`), the theme button (`Use light theme` / `Use dark theme`), and `Open Leviathan repository on GitHub`. Cadence is stored in `localStorage['leviathan.displayCadence.v1']` and theme in `leviathan.theme.v1`. Neither changes the server sampling interval. Check them from Overview; they are not a separate feature.

`scripts/drive.mjs` executes the Overview journey. The other files are the journeys to run when a change touches them.
