---
name: verify-leviathan
description: Drive the Leviathan local dashboard served by `leviathan serve` (browser UI for CPU, RAM, storage, and NVIDIA GPU telemetry). Use when changing the dashboard, the serve API, fixtures, or host telemetry the workbench shows.
---

# Verify Leviathan

The primary surface is the loopback dashboard embedded in the `leviathan` binary. A user opens it in a browser. Secondary surfaces, not driven by this skill, are the Bubble Tea TUI (`leviathan` / `leviathan tui`; keys `j`/`k`, `Tab`, `/`, `Enter`, `p`, `?`, `q`), one-shot `leviathan snapshot -f json`, streaming `leviathan watch -f jsonl`, and `leviathan doctor`. The Kubernetes bridge and updater are separate binaries.

`make test-browser` is the repo's Playwright regression suite. It is not this verification. `web/playwright.config.ts` starts Vite, and `web/e2e/fixtures/dashboard.ts` fulfills `/api/v1/**` inside the page. Proof has to come from `leviathan serve` and the browser talking to that process.

Launch the `blackwell` fixture. That is the documented preview path (`leviathan --fixture blackwell serve`): the real dashboard and the real HTTP API, with deterministic host and GPU samples instead of NVML. It is the path to drive on a machine without an NVIDIA GPU. Confirm the boundaries below by observation: the serve log has no `Yggdrasil uplink enabled` line, and the isolated `XDG_STATE_HOME` stays empty because health persistence is off when a fixture or the fake provider is selected.

Two instances can run together. Each `launch` picks its own `127.0.0.1` port, config path, `HOME`, `XDG_CONFIG_HOME`, and `XDG_STATE_HOME`. Do not attach to a dashboard already listening on `127.0.0.1:1397`, and do not reuse a browser profile. Pass `RUN_ID` when more than one instance is up; `$LEVIATHAN_VERIFY_ROOT/current` points at the latest launch only.

## Launch

From the repo root:

```bash
chmod +x .cursor/skills/verify-leviathan/scripts/instance.sh .cursor/skills/verify-leviathan/scripts/drive.mjs
eval "$(.cursor/skills/verify-leviathan/scripts/instance.sh launch)"
```

`launch` builds `bin/leviathan` with `make build-leviathan` when that binary is missing. The build needs a C compiler because the binary links the NVML bindings even for the fixture path. The served UI is the committed bundle in `internal/webui/dist`. After changing `web/src`, regenerate that bundle with `make frontend` (Node.js 24 or newer) and rebuild `bin/leviathan` before launching again.

The script strips `LEVIATHAN_*` from the environment, points `HOME` and the XDG dirs at the run directory, and passes `--config` to a path that does not exist so the user config is not loaded. The process is:

```text
bin/leviathan --config <run>/config.toml --provider fake --fixture blackwell --listen 127.0.0.1:<port> serve
```

Ready means both of these, not merely an open socket:

- stderr (captured in the run log) contains `Leviathan dashboard: http://127.0.0.1:<port>`
- `GET /healthz` returns HTTP 200 with `"status":"ok"` and a `sampledAt` timestamp

`/healthz` stays HTTP 503 with `"status":"unavailable"` until the first snapshot exists. `launch` waits up to 20 seconds, then runs Doctor. On failure it kills the process it started.

Stdout is `KEY=value` lines: `RUN_ID`, `BASE_URL`, `EVIDENCE_DIR`, `PID`, `LOG`, and the isolated directories. `eval` loads them into the shell.

## Doctor

Run this first whenever the dashboard looks wrong:

```bash
.cursor/skills/verify-leviathan/scripts/instance.sh doctor
```

Doctor is read-only. It answers whether this instance is worth driving:

- the recorded pid is alive and its command line is this repo's `bin/leviathan` with `--provider fake`, `--fixture blackwell`, the recorded `--listen 127.0.0.1:<port>`, and `serve`
- that pid owns the listen socket (inode in `/proc/<pid>/net/tcp`, not a process-name search)
- `GET /healthz` is `ok`, system and gpu domains are `available`, and `sampledAt` is within 30 seconds
- `GET /api/v1/version` matches `bin/leviathan version -f json` (`version`, `commit`, `buildDate`)
- `GET /api/v1/snapshot` is schema `v1`, CPU model `Leviathan fixture CPU` with 32 logical processors, and two GPUs whose first name contains `Blackwell`
- the serve log has the dashboard line and no `Yggdrasil uplink enabled` line
- the run's `XDG_STATE_HOME` contains no files

There is no login. A usable instance answers these GETs with no credential. A 401 means this is not the Leviathan dashboard.

## Drive

Harness: Playwright (the same library as `web/e2e`) against the `launch` base URL, using the system Chrome binary. Install the driver outside the repo when `web/node_modules/playwright` is absent:

```bash
npm install --prefix /tmp/leviathan-verify-tools playwright-core
NODE_PATH=/tmp/leviathan-verify-tools/node_modules \
  node .cursor/skills/verify-leviathan/scripts/drive.mjs overview
```

`drive.mjs overview` opens a fresh 1280×900 dark context at `$BASE_URL/#overview` and runs the Overview journey in `features/overview.md`. Chrome is launched with `--no-sandbox` and `--disable-dev-shm-usage` so it can run in this container. Set `CHROME_PATH` when `google-chrome` is not on the default path.

For Resources, Workloads, and Status, follow the matching file under `features/`. Use the same browser launch and the same base URL. Do not point Playwright at `web/playwright.config.ts`.

Stable handles are the workbench hash, the nav link name (`Overview`, `Resources`, `Workloads`, `Status` inside `nav[aria-label="Workbench views"]` at ≥768px), `aria-label`s, and `data-testid`s named in the feature files. The desktop header connection control is an `output` named `Connection status: Live`.

## Evidence

Write proof under the `EVIDENCE_DIR` printed by `launch` (`/tmp/leviathan-verify/evidence/<run-id>/` unless `LEVIATHAN_VERIFY_ROOT` is set).

The Overview helper writes:

- `overview-before.png` — Live Overview with the capacity cards and charts
- `overview-5m.png` — the same view after the chart window changes
- `overview-cpu-resources.png` — Resources after Inspect CPU
- `overview-actions.json` — each action, the resulting UI state, the aligned-history POST, and the snapshot fields that were checked

A failed drive also leaves `overview-failure.png` and `overview-failure.json` in that directory.

Proof standards:

- Exercise the dashboard the binary serves. Do not call test-only setters or the Vite route mocks.
- Capture the action and the state it produces. A final screenshot without the preceding action is not proof.
- Check the side effect, not only the pixels: `localStorage['leviathan.chartWindow.v1']`, the `POST /api/v1/history/aligned` body, and the URL hash after a capacity card click.
- Keep external systems out of the fixture path. The browser may only request `127.0.0.1`. The serve log must not enable the uplink, and the isolated state directory must stay empty. Those observations are part of `overview-actions.json`.

## Cleanup

```bash
.cursor/skills/verify-leviathan/scripts/instance.sh stop
```

`stop` sends `SIGTERM` to the recorded pid, then `SIGKILL` if it is still alive after five seconds, and deletes that run directory. It does not signal by process name and it does not delete `EVIDENCE_DIR`. After `stop`, the evidence files must still be present. Run `stop` after a failed launch or drive too, so the port and pid are not left behind. `launch` already kills the pid when Doctor fails during startup; `stop` still removes the run directory.

## Helpers

| Script | Invocation |
| --- | --- |
| `scripts/instance.sh` | `launch`, `doctor`, `stop` as shown above. `launch` prints the shell assignments. |
| `scripts/drive.mjs` | `NODE_PATH=/tmp/leviathan-verify-tools/node_modules node .cursor/skills/verify-leviathan/scripts/drive.mjs overview` after the Playwright install above. Other feature names exit with a pointer at `features/<name>.md`. |
