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
import { createRBAC } from "./auth";
import { writeAuditEntry, getAuditEntries } from "./audit";
import { deliverWebhook, registerWebhook, deregisterWebhook, getWebhookUrl } from "./webhook";
import { getRequestId, tagged } from "./request-id";

const db = createCounterDb();
await runMigrations(db, join(import.meta.dir, "../migrations"));

type WebhookDeliveryFn = (url: string, payload: Record<string, unknown>) => Promise<void>;

export function createServer(port?: number, opts: { webhookDelivery?: WebhookDeliveryFn } = {}) {
  const webhookDeliveryFn: WebhookDeliveryFn = opts.webhookDelivery ?? deliverWebhook;
  const { requireWrite: requireWriteAuth, requireRead: requireReadAuth } = createRBAC();
  return serve({
    port,
    routes: {
      "/*": index,

      "/metrics": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/metrics", "GET");
          return tagged(handleMetricsGet(db, rateLimiter), requestId);
        },
      },

      "/api/health": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/health", "GET");
          return tagged(handleHealthGet(db), requestId);
        },
      },

      "/api/hello": {
        async GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/hello", "GET");
          return tagged(Response.json({ message: "Hello, world!", method: "GET" }), requestId);
        },
        async PUT(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/hello", "PUT");
          return tagged(Response.json({ message: "Hello, world!", method: "PUT" }), requestId);
        },
      },

      "/api/hello/:name": async (req) => {
        const requestId = getRequestId(req);
        trackRequest("/api/hello/:name", req.method);
        return tagged(Response.json({ message: `Hello, ${req.params.name}!` }), requestId);
      },

      "/api/counter": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return tagged(authErr, requestId);
          const url = new URL(req.url);
          const prefix = url.searchParams.get("prefix");
          if (prefix !== null) {
            return tagged(Response.json(getCountersByPrefix(db, prefix)), requestId);
          }
          return tagged(Response.json({ count: getCount(db) }), requestId);
        },
        async POST(req, server) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return tagged(authErr, requestId);
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return tagged(limited, requestId);
          const { response, count, oldCount } = await handleCounterPost(req, db);
          if (response.ok && typeof count === "number" && typeof oldCount === "number") {
            writeAuditEntry(db, ip, "counter", oldCount, count);
            server.publish("counter", JSON.stringify({ type: "counter", count }));
            const entry = logActivity(db, "counter.increment");
            server.publish("activity", JSON.stringify({ type: "activity", entry }));
          }
          return tagged(response, requestId);
        },
      },

      "/api/activity": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/activity", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json({ entries: getRecentActivity(db) }), requestId);
        },
      },

      "/api/counter/history": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/history", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json({ entries: getRecentActivity(db) }), requestId);
        },
      },

      "/api/audit": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/audit", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return tagged(authErr, requestId);
          const url = new URL(req.url);
          const counter = url.searchParams.get("counter") ?? undefined;
          const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
          const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 50;
          const offsetRaw = parseInt(url.searchParams.get("offset") ?? "", 10);
          const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
          return tagged(Response.json({
            entries: getAuditEntries(db, { counter, limit, offset }),
          }), requestId);
        },
      },

      "/api/counter/:name": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/:name", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json(getNamedCounter(db, req.params.name)), requestId);
        },
      },

      "/api/counter/:name/reset": {
        POST(req, server) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/:name/reset", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return tagged(authErr, requestId);
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return tagged(limited, requestId);
          const { name } = req.params;
          const result = resetNamedCounter(db, name);
          if (!result) {
            return tagged(Response.json({ error: "Counter not found" }, { status: 404 }), requestId);
          }
          writeAuditEntry(db, ip, name, result.oldValue, result.value);
          log.info("counter.reset", {
            actor: ip,
            counter: name,
            old_value: result.oldValue,
            timestamp: new Date().toISOString(),
            request_id: requestId,
          });
          return tagged(Response.json({ name: result.name, value: result.value }), requestId);
        },
      },

      "/api/counter/:name/increment": {
        async POST(req, server) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/:name/increment", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return tagged(authErr, requestId);
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return tagged(limited, requestId);
          const result = incrementNamedCounterTracked(db, req.params.name);
          writeAuditEntry(db, ip, req.params.name, result.oldValue, result.value);
          const webhookUrl = getWebhookUrl(db, result.name);
          if (webhookUrl) {
            const payload = { name: result.name, value: result.value, timestamp: new Date().toISOString() };
            webhookDeliveryFn(webhookUrl, payload).catch(err => {
              log.error("webhook.delivery.unhandled", { error: String(err), request_id: requestId });
            });
          }
          return tagged(Response.json({ name: result.name, value: result.value }), requestId);
        },
      },

      "/api/webhook/:name": {
        async POST(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/webhook/:name", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return tagged(authErr, requestId);
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return tagged(Response.json({ error: "Invalid JSON" }, { status: 400 }), requestId);
          }
          if (typeof body !== "object" || body === null || !("url" in body) || typeof (body as Record<string, unknown>).url !== "string") {
            return tagged(Response.json({ error: "url is required" }, { status: 400 }), requestId);
          }
          const url = (body as Record<string, unknown>).url as string;
          const parsed = (() => { try { return new URL(url); } catch { return null; } })();
          if (!parsed) return tagged(Response.json({ error: "Invalid URL" }, { status: 400 }), requestId);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return tagged(Response.json({ error: "URL must use http or https" }, { status: 400 }), requestId);
          }
          const { name } = req.params;
          registerWebhook(db, name, url);
          log.info("webhook.registered", { counter: name, url, request_id: requestId });
          return tagged(Response.json({ name, url }, { status: 201 }), requestId);
        },
        DELETE(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/webhook/:name", "DELETE");
          const authErr = requireWriteAuth(req);
          if (authErr) return tagged(authErr, requestId);
          const { name } = req.params;
          const removed = deregisterWebhook(db, name);
          if (!removed) {
            return tagged(Response.json({ error: "Webhook not found" }, { status: 404 }), requestId);
          }
          log.info("webhook.deregistered", { counter: name, request_id: requestId });
          return tagged(Response.json({ name }), requestId);
        },
      },

      "/ws": (req, server) => {
        if (server.upgrade(req)) return;
        const requestId = getRequestId(req);
        return tagged(new Response("WebSocket upgrade failed", { status: 400 }), requestId);
      },
    },

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
