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
import { validateEnv } from "./env";

if (import.meta.main) {
  validateEnv();
}

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
        GET(_req) {
          trackRequest("/metrics", "GET");
          return handleMetricsGet(db, rateLimiter);
        },
      },

      "/api/health": {
        GET(_req) {
          trackRequest("/api/health", "GET");
          return handleHealthGet(db);
        },
      },

      "/api/hello": {
        async GET(_req) {
          trackRequest("/api/hello", "GET");
          return Response.json({ message: "Hello, world!", method: "GET" });
        },
        async PUT(_req) {
          trackRequest("/api/hello", "PUT");
          return Response.json({ message: "Hello, world!", method: "PUT" });
        },
      },

      "/api/hello/:name": async (req) => {
        trackRequest("/api/hello/:name", req.method);
        return Response.json({ message: `Hello, ${req.params.name}!` });
      },

      "/api/counter": {
        GET(req) {
          trackRequest("/api/counter", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return authErr;
          const url = new URL(req.url);
          const prefix = url.searchParams.get("prefix");
          if (prefix !== null) {
            return Response.json(getCountersByPrefix(db, prefix));
          }
          return Response.json({ count: getCount(db) });
        },
        async POST(req, server) {
          trackRequest("/api/counter", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return authErr;
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
        },
      },

      "/api/activity": {
        GET(req) {
          trackRequest("/api/activity", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return authErr;
          return Response.json({ entries: getRecentActivity(db) });
        },
      },

      "/api/counter/history": {
        GET(req) {
          trackRequest("/api/counter/history", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return authErr;
          return Response.json({ entries: getRecentActivity(db) });
        },
      },

      "/api/audit": {
        GET(req) {
          trackRequest("/api/audit", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return authErr;
          const url = new URL(req.url);
          const counter = url.searchParams.get("counter") ?? undefined;
          const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
          const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 50;
          const offsetRaw = parseInt(url.searchParams.get("offset") ?? "", 10);
          const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
          return Response.json({
            entries: getAuditEntries(db, { counter, limit, offset }),
          });
        },
      },

      "/api/counter/:name": {
        GET(req) {
          trackRequest("/api/counter/:name", "GET");
          const authErr = requireReadAuth(req);
          if (authErr) return authErr;
          return Response.json(getNamedCounter(db, req.params.name));
        },
      },

      "/api/counter/:name/reset": {
        POST(req, server) {
          trackRequest("/api/counter/:name/reset", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return authErr;
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return limited;
          const { name } = req.params;
          const result = resetNamedCounter(db, name);
          if (!result) {
            return Response.json({ error: "Counter not found" }, { status: 404 });
          }
          writeAuditEntry(db, ip, name, result.oldValue, result.value);
          log.info("counter.reset", {
            actor: ip,
            counter: name,
            old_value: result.oldValue,
            timestamp: new Date().toISOString(),
          });
          return Response.json({ name: result.name, value: result.value });
        },
      },

      "/api/counter/:name/increment": {
        async POST(req, server) {
          trackRequest("/api/counter/:name/increment", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return authErr;
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
        },
      },

      "/api/webhook/:name": {
        async POST(req) {
          trackRequest("/api/webhook/:name", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return authErr;
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          if (typeof body !== "object" || body === null || !("url" in body) || typeof (body as Record<string, unknown>).url !== "string") {
            return Response.json({ error: "url is required" }, { status: 400 });
          }
          const url = (body as Record<string, unknown>).url as string;
          const parsed = (() => { try { return new URL(url); } catch { return null; } })();
          if (!parsed) return Response.json({ error: "Invalid URL" }, { status: 400 });
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return Response.json({ error: "URL must use http or https" }, { status: 400 });
          }
          const { name } = req.params;
          registerWebhook(db, name, url);
          log.info("webhook.registered", { counter: name, url });
          return Response.json({ name, url }, { status: 201 });
        },
        DELETE(req) {
          trackRequest("/api/webhook/:name", "DELETE");
          const authErr = requireWriteAuth(req);
          if (authErr) return authErr;
          const { name } = req.params;
          const removed = deregisterWebhook(db, name);
          if (!removed) {
            return Response.json({ error: "Webhook not found" }, { status: 404 });
          }
          log.info("webhook.deregistered", { counter: name });
          return Response.json({ name });
        },
      },

      "/ws": (req, server) => {
        if (server.upgrade(req)) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
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
