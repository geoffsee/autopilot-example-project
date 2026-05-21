import { lookup } from "node:dns/promises";
import { log } from "./logger";

// RFC-1918, loopback, link-local, and unique-local ranges (IPv4 + IPv6).
const OCT = "(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)";
const PRIVATE_RANGES: RegExp[] = [
  new RegExp(`^10\\.${OCT}\\.${OCT}\\.${OCT}$`),
  new RegExp(`^172\\.(1[6-9]|2\\d|3[01])\\.${OCT}\\.${OCT}$`),
  new RegExp(`^192\\.168\\.${OCT}\\.${OCT}$`),
  new RegExp(`^127\\.${OCT}\\.${OCT}\\.${OCT}$`),
  new RegExp(`^169\\.254\\.${OCT}\\.${OCT}$`),
  new RegExp(`^0\\.${OCT}\\.${OCT}\\.${OCT}$`),
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
        redirect: "manual",   // prevent redirect-based SSRF bypass
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
