# Issue Registry

Last updated: 2026-05-17

## Active Strategic Documents

| Issue | Label | Title | Status |
|-------|-------|-------|--------|
| [#107](https://github.com/geoffsee/autopilot-example-project/issues/107) | `strategic-review` | Strategic Review: 2026-05-17 — Named counters and observability unlock the next growth phase | Open (living document) |
| [#106](https://github.com/geoffsee/autopilot-example-project/issues/106) | `uxr-synthesis` | UXR Synthesis: 2026-05-17 — Named counters and observability are the clearest next bets | Open |
| [#105](https://github.com/geoffsee/autopilot-example-project/issues/105) | `ideation` | Ideation: 2026-05-17 — Expand the counter/activity platform into a richer, observable, multi-tenant service | Open |

## Housekeeping

| Issue | Title | Status |
|-------|-------|--------|
| [#104](https://github.com/geoffsee/autopilot-example-project/issues/104) | Housekeeping: 2026-05-17 — No-op run, repo fully clean | Open |

## Recommended Backlog (from Strategic Review #107)

Converted to sprint issues — see Sprint #119 below.

## Sprint: Named counters, operator hardening, and observability (#119)

Tracker: [#119](https://github.com/geoffsee/autopilot-example-project/issues/119)

### Task Dependency Hierarchy

| Issue | Depends On | Depended On By | Layer | Status |
|-------|-----------|----------------|-------|--------|
| [#109](https://github.com/geoffsee/autopilot-example-project/issues/109) C1: Named Counters `GET\|POST /api/counter/:name` | — | #113, #115, #117 | 0 | 🔴 Not Started |
| [#110](https://github.com/geoffsee/autopilot-example-project/issues/110) F2: Health Check `GET /api/health` | — | — | 0 | 🔴 Not Started |
| [#111](https://github.com/geoffsee/autopilot-example-project/issues/111) F3: ENV-Var Config (PORT, DB_PATH, MAX_ACTIVITY_ROWS) | — | — | 0 | 🔴 Not Started |
| [#112](https://github.com/geoffsee/autopilot-example-project/issues/112) C3: Signed Delta (Negative Increments) | — | — | 0 | 🔴 Not Started |
| [#114](https://github.com/geoffsee/autopilot-example-project/issues/114) C4: Activity Filtering `?action=&limit=` | — | — | 0 | 🔴 Not Started |
| [#116](https://github.com/geoffsee/autopilot-example-project/issues/116) F4: Graceful Shutdown (SIGTERM Handler) | — | — | 0 | 🔴 Not Started |
| [#118](https://github.com/geoffsee/autopilot-example-project/issues/118) C6: Rate Limiting (per-IP on Write Endpoints) | — | — | 0 | 🔴 Not Started |
| [#113](https://github.com/geoffsee/autopilot-example-project/issues/113) C2: Counter Reset `DELETE /api/counter/:name` | #109 | — | 1 | 🔴 Not Started |
| [#115](https://github.com/geoffsee/autopilot-example-project/issues/115) W1: Leaderboard `GET /api/leaderboard` | #109 | — | 1 | 🔴 Not Started |
| [#117](https://github.com/geoffsee/autopilot-example-project/issues/117) C5: Counter History `GET /api/counter/:name/history` | #109 | — | 1 | 🔴 Not Started |
