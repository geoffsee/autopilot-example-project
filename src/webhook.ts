import { Database } from "bun:sqlite";
import { lookup } from "node:dns/promises";
import { log } from "./logger";

export function isPrivateIp(ip: string): boolean {
  // IPv6 loopback / link-local / ULA
  if (ip === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;        // fe80::/10 link-local
  if (/^f[cd]/i.test(ip)) return true;                   // fc00::/7 unique-local
  if (/^::ffff:/i.test(ip)) return isPrivateIp(ip.slice(7)); // IPv4-mapped IPv6
  // IPv4
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return false;
  const a = parts[0]!;
  const b = parts[1]!;
  if (a === 0) return true;                            // 0.0.0.0/8 — any-interface, routes to localhost
  if (a === 127) return true;                          // 127.0.0.0/8 loopback
  if (a === 10) return true;                           // 10.0.0.0/8 RFC-1918
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12 RFC-1918
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16 RFC-1918
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 link-local
  if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64.0.0/10 CGNAT RFC-6598
  return false;
}

export function registerWebhook(db: Database, counterName: string, url: string): void {
  db.run(
    "INSERT OR REPLACE INTO webhooks (counter_name, url, created_at) VALUES (?, ?, ?)",
    [counterName, url, new Date().toISOString()]
  );
}

export function deregisterWebhook(db: Database, counterName: string): boolean {
  const result = db.run("DELETE FROM webhooks WHERE counter_name = ?", [counterName]);
  return result.changes > 0;
}

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  created_at: string;
}

export function listWebhooks(db: Database): WebhookRow[] {
  const rows = db
    .query<{ counter_name: string; url: string; created_at: string }, []>(
      "SELECT counter_name, url, created_at FROM webhooks ORDER BY created_at ASC"
    )
    .all();
  return rows.map(r => ({ id: r.counter_name, url: r.url, events: [r.counter_name], created_at: r.created_at }));
}

export function getWebhookUrl(db: Database, counterName: string): string | null {
  const row = db
    .query<{ url: string }, [string]>("SELECT url FROM webhooks WHERE counter_name = ?")
    .get(counterName);
  return row?.url ?? null;
}

export async function deliverWebhook(
  url: string,
  payload: Record<string, unknown>,
  opts: {
    _resolveIp?: (hostname: string) => Promise<string>;
    _resolveIp6?: (hostname: string) => Promise<string | null>;
  } = {}
): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    log.error("webhook.delivery.invalid_url", { url });
    return;
  }

  const resolve4 = opts._resolveIp ?? (async (h: string) => {
    const { address } = await lookup(h, { family: 4 });
    return address;
  });
  const resolve6 = opts._resolveIp6 ?? (async (h: string) => {
    try {
      const { address } = await lookup(h, { family: 6 });
      return address;
    } catch {
      return null;
    }
  });

  let ip4: string;
  try {
    ip4 = await resolve4(hostname);
  } catch (err) {
    log.error("webhook.delivery.dns_failed", { url, error: String(err) });
    return;
  }

  if (isPrivateIp(ip4)) {
    log.error("webhook.delivery.blocked_private_ip", { url, ip: ip4 });
    return;
  }

  const ip6 = await resolve6(hostname);
  if (ip6 !== null && isPrivateIp(ip6)) {
    log.error("webhook.delivery.blocked_private_ip", { url, ip: ip6 });
    return;
  }

  // Residual TOCTOU risk: DNS resolution above and the fetch() below are separate
  // operations. A domain with a sub-second TTL could serve a public IP during the
  // pre-check and switch to a private IP before fetch() re-resolves it. Closing
  // this fully would require intercepting the TCP destination IP, which fetch()
  // does not expose. Substituting the resolved IP in the URL was rejected because
  // it breaks TLS (SNI/cert validation). This is a deliberate, documented tradeoff.
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) log.warn("webhook.delivery.non_2xx", { url, status: res.status });
  } catch (err) {
    log.error("webhook.delivery.failed", { url, error: String(err) });
  }
}
