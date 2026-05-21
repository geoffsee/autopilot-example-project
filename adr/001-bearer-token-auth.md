# ADR-001: Bearer Token Authentication with Single Shared Secret

Date: 2026-05-21

## Status

Accepted

## Context

The counter increment endpoint (`POST /api/counter/:name/increment`) needed protection against unauthorized writes. Three approaches were considered:

1. **No authentication** — any client can mutate counters; unacceptable for a production service.
2. **Per-client API keys** — each caller gets a unique token; supports per-client revocation and audit trails but requires a key-management store and increases operational overhead significantly at this stage.
3. **Single shared secret** — one token distributed out-of-band to all authorized callers; simplest to operate and rotate, suitable when the client population is small and auditability at the per-client level is not yet required.

The project is in an early production phase with a small, known client set. The priority is shipping a working auth gate quickly without introducing a new persistence dependency (key store).

## Decision

Use a single shared Bearer token delivered via the `API_TOKEN` environment variable.

- The `Authorization: Bearer <token>` header is required on protected endpoints.
- If `API_TOKEN` is not set, the token check is skipped (dev-friendly default; must be set in production).
- The check is implemented in `src/auth.ts` and applied per-route in `src/index.ts`.
- Token comparison is strict string equality (no hashing needed for a shared secret of this kind).

## Consequences

**Positive:**
- Zero additional dependencies or database tables.
- Trivial to rotate: update `API_TOKEN` env var and restart.
- Dev environments work without any configuration.

**Negative:**
- All authorized callers share one credential; compromising one client compromises all.
- No per-client revocation — rotating the secret invalidates all clients simultaneously.
- No audit trail distinguishing which client made a given request.

When per-client accountability becomes a requirement (e.g., multi-tenant usage, compliance), this decision should be revisited in favor of per-client keys stored in the database.
