import { lookup } from "node:dns/promises";
import { log } from "./logger";

// RFC-1918, loopback, link-local, and unique-local ranges (IPv4 + IPv6).
const PRIVATE_RANGES: RegExp[] = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^fe[89ab][0-9a-f]:/i,   // fe80::/10 link-local
  /^f[cd][0-9a-f]{2}:/i,   // fc00::/7 unique-local
];

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

export async function isAllowedWebhookUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  try {
    const { address } = await lookup(url.hostname);
    return !isPrivateIp(address);
  } catch {
    return false;
  }
}

export type UrlValidator = (url: string) => Promise<boolean>;
export type DeliverFn = (url: string, payload: Record<string, unknown>) => Promise<void>;

export function createWebhookDelivery(validate: UrlValidator = isAllowedWebhookUrl): DeliverFn {
  return async function deliver(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const allowed = await validate(webhookUrl);
      if (!allowed) {
        log.error("webhook blocked: private or invalid URL", { url: webhookUrl });
        return;
      }
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        log.error("webhook delivery failed", { url: webhookUrl, status: res.status });
      }
    } catch (err) {
      log.error("webhook delivery error", { url: webhookUrl, error: String(err) });
    }
  };
}

export const deliverWebhook: DeliverFn = createWebhookDelivery();
