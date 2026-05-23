import { serve } from "bun";
import { join } from "node:path";
import index from "./index.html";
import {
  createCounterDb,
  getCount,
  handleCounterPost,
  getNamedCounter,
  incrementNamedCounterTracked,
  getCountersByPrefix,
  resetNamedCounter,
} from "./counter";
import { logActivity, getRecentActivity } from "./activity";
import { runMigrations } from "./migrate";
import { handleHealthGet } from "./health";
import { handleMetricsGet, trackRequest } from "./metrics";
import { log } from "./logger";
import { rateLimiter } from "./rate-limit";
import { createRBAC, createAuthMiddleware } from "./auth";
import { writeAuditEntry, getAuditEntries } from "./audit";
import { deliverWebhook, registerWebhook, deregisterWebhook, getWebhookUrl } from "./webhook";
import { errorJson, ErrorCode } from "./errors";
import { validateEnv } from "./env";

if (import.meta.main) {
  validateEnv();
}

const db = createCounterDb();
await runMigrations(db, join(import.meta.dir, "../migrations"));

type WebhookDeliveryFn = (url: string, payload: Record<string, unknown>) => Promise<void>;

export function createServer(port?: number, opts: { webhookDelivery?: WebhookDeliveryFn } = {}) {
  const webhookDeliveryFn: WebhookDeliveryFn = opts.webhookDelivery ?? deliverWebhook;
  const rbac = createRBAC();
  const { withRead, withWrite, withPublic, applyDefaultAuth } = createAuthMiddleware(rbac);

  const routes = applyDefaultAuth({
    "/*": withPublic(index as any),

    "/metrics": {
      GET: withPublic((_req: Request) => {
        trackRequest("/metrics", "GET");
        return handleMetricsGet(db, rateLimiter);
      }),
    },

    "/api/health": {
      GET: withPublic((_req: Request) => {
        trackRequest("/api/health", "GET");
        return handleHealthGet(db);
      }),
    },

    "/api/hello": {
      GET: withPublic(async (_req: Request) => {
        trackRequest("/api/hello", "GET");
        return Response.json({ message: "Hello, world!", method: "GET" });
      }),
      PUT: withPublic(async (_req: Request) => {
        trackRequest("/api/hello", "PUT");
        return Response.json({ message: "Hello, world!", method: "PUT" });
      }),
    },

    "/api/hello/:name": withPublic(async (req: any) => {
      trackRequest("/api/hello/:name", req.method);
      return Response.json({ message: `Hello, ${req.params.name}!` });
    }),

    "/api/counter": {
      GET: withRead((req: Request) => {
        trackRequest("/api/counter", "GET");
        const url = new URL(req.url);
        const prefix = url.searchParams.get("prefix");
        if (prefix !== null) {
          return Response.json(getCountersByPrefix(db, prefix));
        }
        return Response.json({ count: getCount(db) });
      }),
      POST: withWrite(async (req: Request, server: any) => {
        trackRequest("/api/counter", "POST");
        const ip = server.requestIP(req)?.address ?? "unknown";
        const limited = rateLimiter(ip);
        if (limited) return limited;
        const { response, count, oldCount } = await handleCounterPost(req, db);
        if (response.ok && typeof count === "number" && typeof oldCount === "number") {
          writeAuditEntry(db, ip, "counter", oldCount, count);
          server.publish("counter", JSON.stringify({ type: "counter", count }));
          const entry = logActivity(db, "counter.increment");
          server.publish("activity", JSON.stringify({ type: "activity", entry }));
        }
        return response;
      }),
    },

    "/api/activity": {
      GET: withRead((_req: Request) => {
        trackRequest("/api/activity", "GET");
        return Response.json({ entries: getRecentActivity(db) });
      }),
    },

    "/api/counter/history": {
      GET: withRead((_req: Request) => {
        trackRequest("/api/counter/history", "GET");
        return Response.json({ entries: getRecentActivity(db) });
      }),
    },

    "/api/audit": {
      GET: withRead((req: Request) => {
        trackRequest("/api/audit", "GET");
        const url = new URL(req.url);
        const counter = url.searchParams.get("counter") ?? undefined;
        const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 50;
        const offsetRaw = parseInt(url.searchParams.get("offset") ?? "", 10);
        const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
        return Response.json({
          entries: getAuditEntries(db, { counter, limit, offset }),
        });
      }),
    },

    "/api/counter/:name": {
      GET: withRead((req: any) => {
        trackRequest("/api/counter/:name", "GET");
        return Response.json(getNamedCounter(db, req.params.name));
      }),
    },

    "/api/counter/:name/reset": {
      POST: withWrite((req: any, server: any) => {
        trackRequest("/api/counter/:name/reset", "POST");
        const ip = server.requestIP(req)?.address ?? "unknown";
        const limited = rateLimiter(ip);
        if (limited) return limited;
        const { name } = req.params;
        const result = resetNamedCounter(db, name);
        if (!result) {
          return errorJson("Counter not found", ErrorCode.COUNTER_NOT_FOUND, 404);
        }
        writeAuditEntry(db, ip, name, result.oldValue, result.value);
        log.info("counter.reset", {
          actor: ip,
          counter: name,
          old_value: result.oldValue,
          timestamp: new Date().toISOString(),
        });
        return Response.json({ name: result.name, value: result.value });
      }),
    },

    "/api/counter/:name/increment": {
      POST: withWrite(async (req: any, server: any) => {
        trackRequest("/api/counter/:name/increment", "POST");
        const ip = server.requestIP(req)?.address ?? "unknown";
        const limited = rateLimiter(ip);
        if (limited) return limited;
        const result = incrementNamedCounterTracked(db, req.params.name);
        writeAuditEntry(db, ip, req.params.name, result.oldValue, result.value);
        const webhookUrl = getWebhookUrl(db, result.name);
        if (webhookUrl) {
          const payload = { name: result.name, value: result.value, timestamp: new Date().toISOString() };
          webhookDeliveryFn(webhookUrl, payload).catch(err => {
            log.error("webhook.delivery.unhandled", { error: String(err) });
          });
        }
        return Response.json({ name: result.name, value: result.value });
      }),
    },

    "/api/webhook/:name": {
      POST: withWrite(async (req: any) => {
        trackRequest("/api/webhook/:name", "POST");
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return errorJson("Invalid JSON", ErrorCode.INVALID_JSON, 400);
        }
        if (typeof body !== "object" || body === null || !("url" in body) || typeof (body as Record<string, unknown>).url !== "string") {
          return errorJson("url is required", ErrorCode.MISSING_FIELD, 400);
        }
        const url = (body as Record<string, unknown>).url as string;
        const parsed = (() => { try { return new URL(url); } catch { return null; } })();
        if (!parsed) return errorJson("Invalid URL", ErrorCode.INVALID_URL, 400);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return errorJson("URL must use http or https", ErrorCode.INVALID_URL_SCHEME, 400);
        }
        const { name } = req.params;
        registerWebhook(db, name, url);
        log.info("webhook.registered", { counter: name, url });
        return Response.json({ name, url }, { status: 201 });
      }),
      DELETE: withWrite((req: any) => {
        trackRequest("/api/webhook/:name", "DELETE");
        const { name } = req.params;
        const removed = deregisterWebhook(db, name);
        if (!removed) {
          return errorJson("Webhook not found", ErrorCode.WEBHOOK_NOT_FOUND, 404);
        }
        log.info("webhook.deregistered", { counter: name });
        return Response.json({ name });
      }),
    },

    "/ws": withPublic((req: Request, server: any) => {
      if (server.upgrade(req)) return;
      return errorJson("WebSocket upgrade failed", ErrorCode.WEBSOCKET_UPGRADE_FAILED, 400);
    }),
  });

  return serve({
    port,
    routes,

    websocket: {
      open(ws) {
        ws.subscribe("counter");
        ws.subscribe("activity");
        const entries = getRecentActivity(db);
        ws.send(JSON.stringify({ type: "activity_history", entries }));
      },
      message(_ws, _msg) {},
      close(ws) {
        ws.unsubscribe("counter");
        ws.unsubscribe("activity");
      },
    },

    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });
}

if (import.meta.main) {
  const server = createServer();
  log.info("server started", { url: server.url.href });
}
