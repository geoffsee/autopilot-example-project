# autopilot-example-project

Minimal repo wired to [`caretta-autopilot-action`](https://github.com/geoffsee/caretta-autopilot-action).

Two workflows, that's the whole integration:

- **`autopilot.yml`** — invokes the autopilot action. Event-driven: fires when a sprint issue is opened/labeled, when an agent PR closes, when agent CI completes, plus a cron heartbeat for idle periods.
- **`ci.yml`** — the `Test` check the autopilot gates agent PRs on. Lives in the consumer repo because it runs *your* tests.

The autopilot action runs everything inline — no dispatched follow-up workflows to maintain.

## Setup

1. Copy `.github/workflows/` into your repo.
2. Set secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `DEV_BOT_APP_ID`, `DEV_BOT_INSTALLATION_ID`, `DEV_BOT_PRIVATE_KEY_B64`. (All four App-related secrets are required — caretta mints its own installation token via JWT and needs the installation ID to call `/app/installations/{id}/access_tokens`.)
3. Settings → Actions → General → enable *Read and write permissions* and *Allow GitHub Actions to create and approve pull requests*.
4. Open a sprint issue with the `sprint` label to kick off the work-dispatch route, or leave it empty and the factory cycle will seed ideas on the next heartbeat.

## Why these events

| Event | Why fire here |
| --- | --- |
| `issues` opened/labeled (`sprint`) | A tracker just appeared — drive it immediately, don't wait for cron. |
| `issues` closed | A sprint or seed issue closed — state moved, recheck. |
| `pull_request` closed on `agent/issue-*` | Agent PR landed or was abandoned — may unblock more work. |
| `workflow_run` (CI) completed on `agent/issue-*` | The Test check the work-dispatch route is gated on just finished. |
| `schedule` (6h) | Heartbeat for genuinely idle repos so the factory cycle still pulses. |
| `workflow_dispatch` | Manual override / debugging. |

The workflow subscribes to all of these unconditionally. The autopilot action itself inspects the event and exits cleanly when it isn't relevant (non-sprint issue activity, non-agent PRs, etc.), so the YAML stays trivial and the gate logic stays testable.
