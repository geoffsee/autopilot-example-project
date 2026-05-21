import { Database } from "bun:sqlite";
import { lookup } from "node:dns/promises";
import { log } from "./logger";

export function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 127) return true;                          // 127.0.0.0/8 loopback
  if (a === 10) return true;                           // 10.0.0.0/8 RFC-1918
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12 RFC-1918
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16 RFC-1918
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16 link-local
  return false;
}

export function setupWebhooks(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS webhooks (
      counter_name TEXT PRIMARY KEY,
      url          TEXT NOT NULL,
      created_at   TEXT NOT NULL
    )
  `);
}

export function registerWebhook(db: Database, counterName: string, url: string): void {
  db.run(
    "INSERT OR REPLACE INTO webhooks (counter_name, url, created_at) VALUES (?, ?, ?)",
    [counterName, url, new Date().toISOString()]
  );
}

export function deregisterWebhook(db: Database, counterName: string): boolean {
  const existing = db
    .query<{ url: string }, [string]>("SELECT url FROM webhooks WHERE counter_name = ?")
    .get(counterName);
  if (!existing) return false;
  db.run("DELETE FROM webhooks WHERE counter_name = ?", [counterName]);
  return true;
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
  opts: { _resolveIp?: (hostname: string) => Promise<string> } = {}
): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    log.error("webhook.delivery.invalid_url", { url });
    return;
  }

  const resolve = opts._resolveIp ?? (async (h: string) => {
    const { address } = await lookup(h);
    return address;
  });

  let ip: string;
  try {
    ip = await resolve(hostname);
  } catch (err) {
    log.error("webhook.delivery.dns_failed", { url, error: String(err) });
    return;
  }

  if (isPrivateIp(ip)) {
    log.error("webhook.delivery.blocked_private_ip", { url, ip });
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    log.error("webhook.delivery.failed", { url, error: String(err) });
  }
}
