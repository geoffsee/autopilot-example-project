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

Sprint planning will turn these into trackable sprint issues. Do not create child issues here.

| ID | Title | Sizing | Depends On |
|----|-------|--------|-----------|
| C1 | Named counters `GET\|POST /api/counter/:name` | S | — |
| F2 | Health check `GET /api/health` | XS | — |
| F3 | ENV-var config (PORT, DB_PATH, MAX_ACTIVITY_ROWS) | XS | — |
| C3 | Signed delta (negative increments) | XS | — |
| C2 | Counter reset `DELETE /api/counter/:name` | XS | C1 |
| C4 | Activity filtering `?action=&limit=` | S | — |
| W1 | Leaderboard `GET /api/leaderboard` | S | C1 |
| F4 | Graceful shutdown on SIGTERM | S | — |
| C5 | Counter history `GET /api/counter/:name/history` | M | C1 |
| C6 | Rate limiting per-IP on write endpoints | M | — |
