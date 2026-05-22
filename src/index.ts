import { serve } from "bun";
import { join } from "node:path";
import index from "./index.html";
import { createCounterDb, getCount, handleCounterPost, getNamedCounter, incrementNamedCounter, resetNamedCounter } from "./counter";
import { logActivity, getRecentActivity } from "./activity";
import { runMigrations } from "./migrate";
import { handleHealthGet } from "./health";
import { handleMetricsGet, trackRequest } from "./metrics";
import { log } from "./logger";
import { rateLimiter } from "./rate-limit";
import { requireWriteAuth, requireReadAuth } from "./auth";

const db = createCounterDb();
await runMigrations(db, join(import.meta.dir, "../migrations"));

export function createServer(port?: number) {
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
          return Response.json({ count: getCount(db) });
        },
        async POST(req, server) {
          trackRequest("/api/counter", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return authErr;
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return limited;
          const { response, count } = await handleCounterPost(req, db);
          if (response.ok && typeof count === "number") {
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
          log.info("counter.reset", {
            actor: server.requestIP(req)?.address ?? "unknown",
            counter: name,
            old_value: result.oldValue,
            timestamp: new Date().toISOString(),
          });
          return Response.json({ name: result.name, value: result.value });
        },
      },

      "/api/counter/:name/increment": {
        POST(req, server) {
          trackRequest("/api/counter/:name/increment", "POST");
          const authErr = requireWriteAuth(req);
          if (authErr) return authErr;
          const ip = server.requestIP(req)?.address ?? "unknown";
          const limited = rateLimiter(ip);
          if (limited) return limited;
          return Response.json(incrementNamedCounter(db, req.params.name));
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
