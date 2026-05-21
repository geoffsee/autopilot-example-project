# ADR-002: Webhook SSRF Mitigation via URL Allowlist

Date: 2026-05-21

## Status

Proposed

## Context

The planned C6 webhook notification feature allows callers to register arbitrary URLs that the server will POST to on counter events. Accepting and resolving arbitrary URLs from user input is the canonical Server-Side Request Forgery (SSRF) vector: a malicious caller can point the webhook at internal services (metadata endpoints, databases, admin APIs) and use the server as a proxy.

Mitigation options considered:

1. **No mitigation** — ship fast, add controls later; unacceptable given the straightforward exploit path.
2. **DNS rebinding + IP block on each request** — resolve the URL, reject RFC-1918 / loopback / link-local addresses; harder to implement correctly (TOCTOU between resolve and connect) and can be bypassed with DNS rebinding attacks.
3. **URL allowlist** — only URLs matching a pre-configured set of prefixes or domains are accepted; eliminates the SSRF surface by construction at the cost of operator configuration burden.
4. **Egress firewall** — enforce at the network layer; effective but outside application control and not portable across environments.

## Decision

Implement a URL allowlist for webhook endpoints.

- A `WEBHOOK_ALLOW_ORIGINS` environment variable holds a comma-separated list of allowed URL prefixes (e.g., `https://hooks.example.com,https://alerts.myco.io`).
- At registration time, reject any webhook URL whose origin is not in the allowlist.
- If `WEBHOOK_ALLOW_ORIGINS` is not set, webhook registration is disabled entirely (fail-safe default).
- Additionally, resolve the destination IP at registration time and reject RFC-1918, loopback (`127.0.0.0/8`), and link-local (`169.254.0.0/16`) ranges as a secondary defense.

## Consequences

**Positive:**
- SSRF surface is eliminated by construction; no valid registration path reaches internal addresses.
- Fail-safe default: unconfigured environments cannot register webhooks at all.
- Simple to audit: the allowlist is a single env var, visible in deployment configuration.

**Negative:**
- Operators must explicitly configure `WEBHOOK_ALLOW_ORIGINS` before webhooks are usable.
- Does not protect against cases where an allowlisted domain is itself compromised or resolves to an internal IP after registration (mitigated by re-validating the destination IP on each delivery).

This ADR will be updated to Accepted when C6 is implemented and the allowlist logic is in place.
