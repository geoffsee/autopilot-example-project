import { serve } from "bun";
import index from "./index.html";
import { createCounterDb, getCount, handleCounterPost } from "./counter";
import { setupActivityTable, logActivity, getRecentActivity } from "./activity";
import { setupApiKeysTable, requireApiKey } from "./auth";
import { RateLimiter, createRateLimiter, applyRateLimit } from "./rate-limit";
import openapiSpec from "./openapi.json";

const db = createCounterDb();
setupActivityTable(db);
setupApiKeysTable(db);

export function createServer(port?: number, rateLimiter?: RateLimiter) {
  const limiter = rateLimiter ?? createRateLimiter();
  return serve({
    port,
    routes: {
      "/*": index,

      "/api/hello": {
        async GET(_req) {
          return Response.json({ message: "Hello, world!", method: "GET" });
        },
        async PUT(_req) {
          return Response.json({ message: "Hello, world!", method: "PUT" });
        },
      },

      "/api/hello/:name": async (req) => {
        return Response.json({ message: `Hello, ${req.params.name}!` });
      },

      "/api/counter": {
        GET(_req) {
          return Response.json({ count: getCount(db) });
        },
        async POST(req, server) {
          const ip = server.requestIP(req)?.address ?? "unknown";
          const rateError = applyRateLimit(limiter, ip);
          if (rateError) return rateError;
          const authError = requireApiKey(req, db);
          if (authError) return authError;
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
        GET(_req) {
          return Response.json({ entries: getRecentActivity(db) });
        },
      },

      "/api/openapi.json": {
        GET(_req) {
          return Response.json(openapiSpec);
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
  console.log(`🚀 Server running at ${server.url}`);
}
