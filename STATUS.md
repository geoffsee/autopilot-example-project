# Project Status

Last updated: 2026-05-30

## Implemented Features

| Area | Feature | Status |
|---|---|---|
| Core | SQLite-backed `/api/counter` (global) | Shipped |
| Core | Named counters `GET/POST /api/counter/:name` | Shipped |
| Core | Counter reset `POST /api/counter/:name/reset` | Shipped |
| Core | Counter aggregation `GET /api/counter?prefix=` | Shipped |
| Core | WebSocket real-time counter sync | Shipped |
| Core | `GET /api/counter/history` | Shipped |
| Auth | Bearer token authentication | Shipped |
| Auth | RBAC (read vs write tokens) | Shipped |
| Auth | Auth middleware chain (close-by-default) | Shipped |
| Auth | Per-client API keys (`_api_keys` table, POST/GET/DELETE `/api/keys`) | Shipped |
| Webhooks | Webhook notifications (`POST /api/webhooks`) | Shipped |
| Webhooks | Webhook retry queue with exponential backoff | Shipped |
| Webhooks | `GET /api/webhooks` list endpoint | Shipped |
| Webhooks | Webhook delivery history endpoint | Shipped |
| Observability | Structured JSON logging | Shipped |
| Observability | X-Request-ID header + log correlation | Shipped |
| Observability | Prometheus `/metrics` endpoint | Shipped |
| Observability | `GET /api/health` (process liveness) | Shipped |
| Observability | `GET /api/audit` (audit log) | Shipped |
| Reliability | Versioned migration runner | Shipped |
| Reliability | Migration rollback (down migrations) | Shipped |
| Reliability | Startup environment validation (fail-fast) | Shipped |
| Reliability | Rate limiting (429 + Retry-After) | Shipped |
| API | Structured error responses `{ error, code }` | Shipped |
| API | CI latency baseline | Shipped |
| Docs | Architecture Decision Records (ADRs) | Shipped |

## Active Sprint — #238: Bounded State, Atomic Operations, and Developer Discoverability

| Issue | Item | Description | Status |
|---|---|---|---|
| [#230](https://github.com/geoffsee/autopilot-example-project/issues/230) | F5 — Pagination | Cursor/offset pagination for `/api/audit`, `/api/webhooks`, `/api/counter` | 🔴 Not Started |
| [#231](https://github.com/geoffsee/autopilot-example-project/issues/231) | C1+C2 — Delta counters | Increment/decrement by arbitrary delta | 🔴 Not Started |
| [#232](https://github.com/geoffsee/autopilot-example-project/issues/232) | F4 — Health DB probe | Extend `/api/health` with DB ping; return `{ status, db, uptime_seconds }` | 🔴 Not Started |
| [#233](https://github.com/geoffsee/autopilot-example-project/issues/233) | F3 — Rate limit persistence | Persist rate-limit windows to SQLite (`_rate_limits` table) | 🔴 Not Started |
| [#234](https://github.com/geoffsee/autopilot-example-project/issues/234) | F1 — OpenAPI spec | Hand-written OpenAPI 3.0 at `/api/docs`; Swagger UI at `/api/docs/ui` | 🔴 Not Started |
| [#235](https://github.com/geoffsee/autopilot-example-project/issues/235) | P3-ADR — Audit retention ADR | ADR documenting retention window and compliance rationale | 🔴 Not Started |
| [#236](https://github.com/geoffsee/autopilot-example-project/issues/236) | C9 — Bulk batch | `POST /api/counter/batch` — atomic multi-counter mutation (blocked by #231) | 🔴 Not Started |
| [#237](https://github.com/geoffsee/autopilot-example-project/issues/237) | P3-impl — Audit retention impl | Scheduled purge with configurable retention window (blocked by #235) | 🔴 Not Started |

## Backlog (deferred)

C3 (tagging), C4 (TTL), C5 (alert thresholds), C7 (leaderboard), C8 (export), C10 (stats), P1 (global counter deprecation), P4 (per-token rate limiting), W1–W5 (wildcards).
