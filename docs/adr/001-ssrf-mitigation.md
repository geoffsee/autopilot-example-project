# ADR-001: SSRF Mitigation Strategy for Webhook Notifications

## Status

Accepted

## Context

C6 introduces the first outbound HTTP feature in this project: webhook notifications fired
on named-counter increments. Allowing callers to supply an arbitrary URL creates a
Server-Side Request Forgery (SSRF) risk: an attacker could supply an internal address
(e.g., `http://192.168.1.1/admin`) and use the server as a proxy to reach resources on
the private network.

## Decision

Before issuing any outbound webhook request, validate the target URL with the following
rules (fail-closed — any validation failure silently drops the request and logs an error):

1. **Protocol allowlist** — only `http:` and `https:` are permitted. Reject `file://`,
   `ftp://`, and all other schemes.
2. **DNS resolution** — resolve the hostname with `dns.lookup` before connecting.
3. **Private/reserved IP blocklist** — reject the resolved address if it falls in any of:
   - RFC 1918 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Loopback: `127.0.0.0/8` (IPv4), `::1` (IPv6)
   - Link-local: `169.254.0.0/16` (IPv4), `fe80::/10` (IPv6)
   - Unique local IPv6: `fc00::/7`
   - Unspecified: `0.0.0.0/8`
4. **DNS resolution failure** — treat as rejected (fail-closed).

## Consequences

- **Operators cannot configure webhooks to internal services.** This is intentional and
  the primary security property this ADR delivers.
- **One extra DNS round-trip per delivery.** Acceptable overhead for an async,
  fire-and-forget path.
- **DNS rebinding is out of scope.** A full mitigation would require resolving the address
  at connection time inside the HTTP client, not ahead of it. That complexity is deferred
  until there is evidence of a concrete threat.
- **Failed deliveries never abort the counter operation.** The webhook path is entirely
  side-effectful; all errors are logged via structured JSON logging (F2) and swallowed.
