# Project Status

Last updated: 2026-05-17

## Shipped Capabilities

| Feature | Status | Notes |
|---------|--------|-------|
| SQLite-backed `/api/counter` (GET + POST) | ✅ Shipped | `d22e623` |
| WebSocket broadcast on counter change | ✅ Shipped | `d22e623` |
| Activity logging (last 20 events) | ✅ Shipped | `d22e623` |
| Real HTTP integration tests | ✅ Shipped | `070b0ac` |
| Test-first rule enforced via AGENTS.md + CI | ✅ Shipped | `7290894` |
| Git hooks wired into postinstall | ✅ Shipped | `6f84974` |
| React frontend (counter + activity feed) | ✅ Shipped | `b8c5c02` |
| In-memory DB for tests (`:memory:`) | ✅ Shipped | |

## In-Flight

None. Repo is clean.

## Strategic Direction

Strategic review: [#107](https://github.com/geoffsee/autopilot-example-project/issues/107)

Top priorities per strategic review:
1. **C1** — Named counters `GET|POST /api/counter/:name` (Builder / End-User, S)
2. **F2** — Health check `GET /api/health` (Operator, XS)
3. **F3** — ENV-var config: PORT, DB_PATH, MAX_ACTIVITY_ROWS (Operator, XS)
4. **C3** — Signed delta / negative increments (Builder, XS)
5. **C2** — Counter reset `DELETE /api/counter/:name` (Operator, XS, after C1)
