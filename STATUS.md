# Project Status

_Last updated: 2026-05-20_

## Shipped Capabilities

| ID | Description | Issue | Status |
|----|-------------|-------|--------|
| C1 | WebSocket real-time counter sync (frontend) | #144 | ✅ Shipped |
| C2 | `GET /api/counter/history` endpoint | #141 | ✅ Shipped |
| F1 | Versioned migration runner | #143 | ✅ Shipped |
| F2 | Structured JSON logging | #146 | ✅ Shipped |
| F3 | `GET /api/health` endpoint | #142 | ✅ Shipped |

## Active Sprint — [#157](https://github.com/geoffsee/autopilot-example-project/issues/157)

| ID | Description | Priority | Sizing | Issue |
|----|-------------|----------|--------|-------|
| C3 | Named counters (`GET|POST /api/counter/:name`) | 1 | M | #153 |
| F4 | Prometheus `/metrics` endpoint | 2 | S | #154 |
| C4 | Rate limiting (429 + `Retry-After`) | 3 | S | #155 |
| C5 | Bearer token auth on POST endpoints | 4 | S | #156 |

**Manual control-plane follow-up (not in executable sprint scope):**
- F5 — p50/p95 CI latency baseline: requires `.github/workflows/**` changes; human review required.

## Deferred / Backlog

| ID | Description | Status |
|----|-------------|--------|
| P1 | Drop React frontend (pure API) | Deferred — requires stakeholder decision |
| P2 | Append-only event log | Deferred — F1 migration runner handles if revisited |
| P3 | CLI companion (`bun cli.ts`) | Backlog |
| W1 | Multi-tenant counter-as-a-service | Speculative — deferred indefinitely |
| W2 | OpenAPI spec auto-generated | Backlog — after API surface stabilizes |
