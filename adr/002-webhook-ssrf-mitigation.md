# ADR-002: Webhook SSRF Mitigation via DNS Resolution + Private IP Blocking

Date: 2026-05-21

## Status

Accepted

## Context

The C6 webhook notification feature allows callers to register arbitrary URLs that the server will POST to on counter events. Accepting and resolving arbitrary URLs from user input is the canonical Server-Side Request Forgery (SSRF) vector: a malicious caller can point the webhook at internal services (metadata endpoints, databases, admin APIs) and use the server as a proxy.

Mitigation options considered:

1. **No mitigation** — ship fast, add controls later; unacceptable given the straightforward exploit path.
2. **DNS resolution + IP block on each delivery** — resolve the URL before each outbound request, reject RFC-1918 / loopback / link-local addresses; provides broad coverage without operator configuration.
3. **URL allowlist** — only URLs matching a pre-configured set of prefixes or domains are accepted; eliminates the SSRF surface by construction but requires operators to configure `WEBHOOK_ALLOW_ORIGINS` before webhooks are usable at all.
4. **Egress firewall** — enforce at the network layer; effective but outside application control and not portable across environments.

## Decision

Resolve the destination IP on every webhook delivery and reject private address ranges.

- Before each outbound POST, resolve the target hostname via DNS.
- Reject addresses in RFC-1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), loopback (`127.0.0.0/8`), and link-local (`169.254.0.0/16`).
- Rejection applies on every delivery, not just at registration time, to defend against DNS rebinding attacks where a hostname initially resolves to a public IP but later resolves to an internal one.
- No environment variable is required; the protection is always active.

A stricter URL allowlist (option 3) remains a future hardening option for environments that need to constrain webhook destinations to a known set of domains.

## Consequences

**Positive:**
- Works out of the box with no operator configuration.
- Re-validating on each delivery closes the TOCTOU window for DNS rebinding.
- Broad coverage: any private IP range is rejected, not just a hard-coded list of known internal services.

**Negative:**
- A compromised public domain could still be used as a relay (the allowlist approach would not help here either, unless the domain itself were removed from the allowlist).
- DNS resolution adds a small latency cost per delivery.
- Does not prevent webhooks to arbitrary public internet destinations; rate limiting and authentication on the registration endpoint are the controls for that.
