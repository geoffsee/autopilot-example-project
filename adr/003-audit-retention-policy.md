# ADR-003: Audit and Webhook Delivery Retention Policy

Date: 2026-05-31

## Status

Accepted

## Context

The `_audit` and `_webhook_deliveries` tables accumulate rows without any deletion or archival mechanism. Each counter write appends a row to `_audit`; each webhook event creates one or more rows in `_webhook_deliveries` (one per delivery attempt). In a service with continuous traffic these tables grow without bound, producing two predictable failure modes:

1. **Backup inflation** — full database backups include all historical rows; backup size grows linearly with operational age, increasing storage cost and restore time.
2. **Query degradation** — unbounded tables increase B-tree depth and cause full or near-full scans on unindexed access paths. The `_audit` table has no index beyond `id`; large cardinality degrades the `GET /api/audit` endpoint over time.

Three retention windows were evaluated:

| Option | Window | Tradeoffs |
|--------|--------|-----------|
| A | 30 days | Smallest footprint; may be too short for incident post-mortems that span a calendar month |
| B | 90 days | Covers a full fiscal quarter; aligns with common SLA review cadences; manageable table size at typical counter-write volumes |
| C | 365 days | Covers annual compliance look-backs; large table footprint; most organisations with annual requirements export to cold storage rather than keep data in-line |

Compliance context: the project does not currently process personal data, payment card data, or other regulated categories that mandate a specific minimum retention period. The retention decision is therefore driven by operational and incident-response needs rather than a hard regulatory floor. If a regulated data category is introduced in the future, this decision must be revisited before deployment in that context.

Both tables are treated identically — there is no operational reason to retain webhook delivery receipts longer than the counter mutation log that triggered them.

## Decision

Retain rows in `_audit` and `_webhook_deliveries` for **90 days**, measured from the record's creation timestamp (`_audit.timestamp` and `_webhook_deliveries.created_at`).

- Rows older than 90 days are eligible for deletion.
- Deletion is performed by a periodic background job (scheduled SQL `DELETE WHERE timestamp < now - 90d`) executed on a configurable interval (default: once per hour). No rows are deleted at read time.
- The retention window is configurable via an environment variable `AUDIT_RETENTION_DAYS` (default `90`) so operators can narrow or widen the window without a code deploy. Values below `7` are rejected at startup to prevent accidental mass deletion.
- `_webhook_deliveries` rows are only deleted once their `status` is terminal (`delivered` or `failed`); pending and in-flight rows are never eligible regardless of age.
- No archival export to cold storage is performed in this phase. If compliance requirements later mandate long-term retention, an export-before-delete step should be added without changing this ADR's core retention window.

## Consequences

**Positive:**
- Table size is bounded; backup size and query performance stabilise at steady state.
- A 90-day window comfortably covers incident post-mortems and fiscal-quarter SLA reviews.
- Configurable `AUDIT_RETENTION_DAYS` lets operators adjust without a redeploy.
- Pending/in-flight webhook deliveries are protected from premature deletion regardless of their age.

**Negative:**
- Audit history older than 90 days (by default) is permanently deleted with no recovery path. Operators who need longer retention must increase `AUDIT_RETENTION_DAYS` before old rows are purged.
- If a regulated data category is later introduced, the chosen window may not satisfy the applicable minimum retention or maximum retention requirements; this ADR must be reviewed at that time.
- The hourly background job adds a small, periodic write load to the database. Under extreme write pressure this could marginally increase WAL checkpoint frequency in SQLite.
