import { serve } from "bun";
import { join } from "node:path";
import index from "./index.html";
import {
  createCounterDb,
  getCount,
  handleCounterPost,
  getNamedCounter,
  incrementNamedCounterByDelta,
  decrementNamedCounterByDelta,
  getCountersByPrefix,
  resetNamedCounter,
  batchCounterOperations,
  type BatchOperation,
} from "./counter";
import { logActivity, getRecentActivity } from "./activity";
import { runMigrations } from "./migrate";
import { handleHealthGet } from "./health";
import { handleMetricsGet, trackRequest } from "./metrics";
import { log } from "./logger";
import { rateLimiter } from "./rate-limit";
import { createRBAC } from "./auth";
import { writeAuditEntry, getAuditEntries } from "./audit";
import { deliverWebhook, deliverWebhookChecked, registerWebhook, deregisterWebhook, getWebhookUrl, listWebhooks, enqueueWebhookDelivery, getWebhookDeliveries, processWebhookRetries } from "./webhook";
import { getRequestId, tagged } from "./request-id";
import { createApiKey, listApiKeys, deleteApiKey } from "./api-keys";
import { errorJson, ErrorCode } from "./errors";
import { validateEnv } from "./env";
import openApiSpec from "./openapi.json" with { type: "json" };

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Counter API – Swagger UI</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css"
  integrity="sha384-rcbEi6xgdPk0iWkAQzT2F3FeBJXdG+ydrawGlfHAFIZG7wU6aKbQaRewysYpmrlW" crossorigin="anonymous"/>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"
  integrity="sha384-NXtFPpN61oWCuN4D42K6Zd5Rt2+uxeIT36R7kpXBuY9tLnZorzrJ4ykpqwJfgjpZ" crossorigin="anonymous"></script>
<script>
window.onload = () => {
  SwaggerUIBundle({ url: '/api/docs', dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout: 'BaseLayout' });
};
</script>
</body>
</html>`;

if (import.meta.main) {
  validateEnv();
}

const db = createCounterDb();
await runMigrations(db, join(import.meta.dir, "../migrations"));

async function parseDeltaBody(req: Request): Promise<{ delta: number } | Response> {
  const text = await req.text();
  if (!text.trim()) return { delta: 1 };
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return errorJson("Content-Type must be application/json", ErrorCode.INVALID_CONTENT_TYPE, 400);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorJson("Invalid JSON", ErrorCode.INVALID_JSON, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorJson("Body must be an object", ErrorCode.INVALID_BODY, 400);
  }
  const obj = body as Record<string, unknown>;
  if (!("delta" in obj)) return { delta: 1 };
  const d = obj.delta;
  if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 1_000_000) {
    return errorJson(
      "delta must be a positive integer no greater than 1000000",
      ErrorCode.INVALID_DELTA,
      400,
    );
  }
  return { delta: d };
}

type WebhookDeliveryFn = (url: string, payload: Record<string, unknown>) => Promise<void>;

export function createServer(port?: number, opts: { webhookDelivery?: WebhookDeliveryFn } = {}) {
  const webhookDeliveryFn: WebhookDeliveryFn = opts.webhookDelivery ?? deliverWebhook;
  const rbac = createRBAC(undefined, undefined, db);
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
          const authErr = rbac.requireRead(req);
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
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return tagged(limited, requestId);
          const { response, count, oldCount } = await handleCounterPost(req, db);
          if (response.ok && typeof count === "number" && typeof oldCount === "number") {
            const actor = rbac.resolveActor(req) ?? ip;
            writeAuditEntry(db, actor, "counter", oldCount, count);
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
          const authErr = rbac.requireRead(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json({ entries: getRecentActivity(db) }), requestId);
        },
      },

      "/api/counter/history": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/history", "GET");
          const authErr = rbac.requireRead(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json({ entries: getRecentActivity(db) }), requestId);
        },
      },

      "/api/audit": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/audit", "GET");
          const authErr = rbac.requireRead(req);
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

      "/api/counter/batch": {
        async POST(req, server) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/batch", "POST");
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);

          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return tagged(errorJson("Invalid JSON", ErrorCode.INVALID_JSON, 400), requestId);
          }

          if (typeof body !== "object" || body === null || Array.isArray(body)) {
            return tagged(errorJson("Body must be an object", ErrorCode.INVALID_BODY, 400), requestId);
          }

          const obj = body as Record<string, unknown>;
          if (!Array.isArray(obj.operations)) {
            return tagged(errorJson("operations must be an array", ErrorCode.INVALID_BODY, 400), requestId);
          }

          const ops = obj.operations as unknown[];
          if (ops.length > 100) {
            return tagged(errorJson("Batch size exceeds maximum of 100", ErrorCode.BATCH_TOO_LARGE, 400), requestId);
          }

          for (let i = 0; i < ops.length; i++) {
            const op = ops[i];
            if (typeof op !== "object" || op === null || Array.isArray(op)) {
              return tagged(errorJson(`Operation at index ${i} must be an object`, ErrorCode.INVALID_BODY, 400), requestId);
            }
            const { name, delta } = op as Record<string, unknown>;
            if (typeof name !== "string" || !name.trim()) {
              return tagged(errorJson(`Operation at index ${i} has invalid name`, ErrorCode.INVALID_BODY, 400), requestId);
            }
            if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
              return tagged(errorJson(`Operation at index ${i} has invalid delta (must be a non-zero integer)`, ErrorCode.INVALID_DELTA, 400), requestId);
            }
          }

          const results = batchCounterOperations(db, ops as BatchOperation[]);
          return tagged(Response.json({ results }), requestId);
        },
      },

      "/api/counter/:name": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/:name", "GET");
          const authErr = rbac.requireRead(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json(getNamedCounter(db, req.params.name)), requestId);
        },
      },

      "/api/counter/:name/reset": {
        POST(req, server) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/:name/reset", "POST");
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return tagged(limited, requestId);
          const { name } = req.params;
          const result = resetNamedCounter(db, name);
          if (!result) {
            return tagged(errorJson("Counter not found", ErrorCode.COUNTER_NOT_FOUND, 404), requestId);
          }
          const actor = rbac.resolveActor(req) ?? ip;
          writeAuditEntry(db, actor, name, result.oldValue, result.value);
          log.info("counter.reset", {
            actor,
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
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return tagged(limited, requestId);
          const parsed = await parseDeltaBody(req);
          if (parsed instanceof Response) return tagged(parsed, requestId);
          const result = incrementNamedCounterByDelta(db, req.params.name, parsed.delta);
          const actor = rbac.resolveActor(req) ?? ip;
          writeAuditEntry(db, actor, req.params.name, result.oldValue, result.value, result.delta);
          const webhookUrl = getWebhookUrl(db, result.name);
          if (webhookUrl) {
            const payload = { name: result.name, value: result.value, timestamp: new Date().toISOString() };
            enqueueWebhookDelivery(db, result.name, webhookUrl, payload);
            processWebhookRetries(db, webhookDeliveryFn).catch(err => {
              log.error("webhook.delivery.unhandled", { error: String(err), request_id: requestId });
            });
          }
          return tagged(Response.json({ name: result.name, value: result.value }), requestId);
        },
      },

      "/api/counter/:name/decrement": {
        async POST(req, server) {
          const requestId = getRequestId(req);
          trackRequest("/api/counter/:name/decrement", "POST");
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return tagged(limited, requestId);
          const parsed = await parseDeltaBody(req);
          if (parsed instanceof Response) return tagged(parsed, requestId);
          const result = decrementNamedCounterByDelta(db, req.params.name, parsed.delta);
          const actor = rbac.resolveActor(req) ?? ip;
          writeAuditEntry(db, actor, req.params.name, result.oldValue, result.value, result.delta);
          const webhookUrl = getWebhookUrl(db, result.name);
          if (webhookUrl) {
            const payload = { name: result.name, value: result.value, timestamp: new Date().toISOString() };
            enqueueWebhookDelivery(db, result.name, webhookUrl, payload);
            processWebhookRetries(db, webhookDeliveryFn).catch(err => {
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
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return tagged(errorJson("Invalid JSON", ErrorCode.INVALID_JSON, 400), requestId);
          }
          if (typeof body !== "object" || body === null || !("url" in body)) {
            return tagged(errorJson("url is required", ErrorCode.MISSING_FIELD, 400), requestId);
          }
          if (typeof (body as Record<string, unknown>).url !== "string") {
            return tagged(errorJson("url must be a string", ErrorCode.INVALID_URL, 400), requestId);
          }
          const url = (body as Record<string, unknown>).url as string;
          const parsed = (() => { try { return new URL(url); } catch { return null; } })();
          if (!parsed) return tagged(errorJson("Invalid URL", ErrorCode.INVALID_URL, 400), requestId);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return tagged(errorJson("URL must use http or https", ErrorCode.INVALID_URL_SCHEME, 400), requestId);
          }
          const { name } = req.params;
          registerWebhook(db, name, url);
          log.info("webhook.registered", { counter: name, url, request_id: requestId });
          return tagged(Response.json({ name, url }, { status: 201 }), requestId);
        },
        DELETE(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/webhook/:name", "DELETE");
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          const { name } = req.params;
          const removed = deregisterWebhook(db, name);
          if (!removed) {
            return tagged(errorJson("Webhook not found", ErrorCode.WEBHOOK_NOT_FOUND, 404), requestId);
          }
          log.info("webhook.deregistered", { counter: name, request_id: requestId });
          return tagged(Response.json({ name }), requestId);
        },
      },

      "/api/webhooks": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/webhooks", "GET");
          const authErr = rbac.requireRead(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json({ webhooks: listWebhooks(db) }), requestId);
        },
      },

      "/api/webhooks/:id/deliveries": {
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/webhooks/:id/deliveries", "GET");
          const authErr = rbac.requireRead(req);
          if (authErr) return tagged(authErr, requestId);
          const { id } = req.params;
          const webhookUrl = getWebhookUrl(db, id);
          if (webhookUrl === null) {
            return tagged(errorJson("Webhook not found", ErrorCode.WEBHOOK_NOT_FOUND, 404), requestId);
          }
          const rows = getWebhookDeliveries(db, id);
          const deliveries = rows.map(r => ({
            id: r.id,
            webhook_id: r.webhook_id,
            url: r.url,
            payload: JSON.parse(r.payload) as Record<string, unknown>,
            status: r.status,
            attempt_count: r.attempt_count,
            next_retry_at: r.next_retry_at,
            created_at: r.created_at,
            last_attempted_at: r.last_attempted_at,
          }));
          return tagged(Response.json({ deliveries }), requestId);
        },
      },

      "/api/keys": {
        async POST(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/keys", "POST");
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return tagged(Response.json({ error: "Invalid JSON" }, { status: 400 }), requestId);
          }
          if (typeof body !== "object" || body === null) {
            return tagged(Response.json({ error: "Body must be an object" }, { status: 400 }), requestId);
          }
          const { name, scope } = body as Record<string, unknown>;
          if (typeof name !== "string" || !name.trim()) {
            return tagged(Response.json({ error: "name is required" }, { status: 400 }), requestId);
          }
          if (scope !== "read" && scope !== "write") {
            return tagged(Response.json({ error: "scope must be 'read' or 'write'" }, { status: 400 }), requestId);
          }
          try {
            const { token, key } = createApiKey(db, name.trim(), scope);
            log.info("api_key.created", { id: key.id, name: key.name, scope: key.scope, request_id: requestId });
            return tagged(Response.json({ ...key, token }, { status: 201 }), requestId);
          } catch {
            return tagged(Response.json({ error: "Key name already exists" }, { status: 409 }), requestId);
          }
        },
        GET(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/keys", "GET");
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          return tagged(Response.json({ keys: listApiKeys(db) }), requestId);
        },
      },

      "/api/keys/:id": {
        DELETE(req) {
          const requestId = getRequestId(req);
          trackRequest("/api/keys/:id", "DELETE");
          const authErr = rbac.requireWrite(req);
          if (authErr) return tagged(authErr, requestId);
          const id = parseInt(req.params.id, 10);
          if (!Number.isInteger(id) || id <= 0) {
            return tagged(Response.json({ error: "Invalid id" }, { status: 400 }), requestId);
          }
          const removed = deleteApiKey(db, id);
          if (!removed) {
            return tagged(Response.json({ error: "Key not found" }, { status: 404 }), requestId);
          }
          log.info("api_key.deleted", { id, request_id: requestId });
          return tagged(Response.json({ id }), requestId);
        },
      },

      "/api/docs": {
        GET(req) {
          const requestId = getRequestId(req);
          return tagged(Response.json(openApiSpec), requestId);
        },
      },

      "/api/docs/ui": {
        GET(req) {
          const requestId = getRequestId(req);
          return tagged(new Response(swaggerUiHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } }), requestId);
        },
      },

      "/ws": (req, server) => {
        if (server.upgrade(req)) return;
        const requestId = getRequestId(req);
        return tagged(errorJson("WebSocket upgrade failed", ErrorCode.WEBSOCKET_UPGRADE_FAILED, 400), requestId);
      },
    },

    error(err: Error): Response {
      log.error("unhandled", { error: String(err) });
      return errorJson("Internal server error", ErrorCode.INTERNAL_ERROR, 500);
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

  setInterval(() => {
    processWebhookRetries(db, deliverWebhookChecked).catch(err => {
      log.error("webhook.retry.background_error", { error: String(err) });
    });
  }, 5000);
}
