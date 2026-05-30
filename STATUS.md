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

## Open Priorities (from Strategic Review #207)

| Priority | Item | Description |
|---|---|---|
| 1 | F5 — Pagination | Cursor/offset pagination for `/api/audit`, `/api/webhooks`, `/api/counter` |
| 2 | C1+C2 — Delta counters | Increment/decrement by arbitrary delta |
| 3 | F4 — Health DB probe | Extend `/api/health` with DB ping; return `{ status, db, uptime_seconds }` |
| 4 | C9 — Bulk batch | `POST /api/counter/batch` — atomic multi-counter mutation |
| 5 | F3 — Rate limit persistence | Persist rate-limit windows to SQLite (`_rate_limits` table) |
| 6 | F1 — OpenAPI spec | Hand-written OpenAPI 3.0 at `/api/docs`; Swagger UI at `/api/docs/ui` |
| 7 | P3 — Audit retention | ADR first, then scheduled purge with configurable retention window |

## Backlog (deferred)

C3 (tagging), C4 (TTL), C5 (alert thresholds), C7 (leaderboard), C8 (export), C10 (stats), P1 (global counter deprecation), P4 (per-token rate limiting), W1–W5 (wildcards).
