import { serve } from "bun";
import index from "./index.html";
import { createCounterDb, getCount, handleCounterPost } from "./counter";
import { setupActivityTable, logActivity, getRecentActivity } from "./activity";
import { logger } from "./logger";
import { initTracer, withSpan } from "./tracer";

const db = createCounterDb();
setupActivityTable(db);

export function createServer(port?: number) {
  return serve({
    port,
    routes: {
      "/*": index,

      "/api/hello": {
        async GET(_req) {
          return withSpan("GET /api/hello", async () =>
            Response.json({ message: "Hello, world!", method: "GET" })
          );
        },
        async PUT(_req) {
          return withSpan("PUT /api/hello", async () =>
            Response.json({ message: "Hello, world!", method: "PUT" })
          );
        },
      },

      "/api/hello/:name": async (req) => {
        return withSpan("GET /api/hello/:name", async () =>
          Response.json({ message: `Hello, ${req.params.name}!` })
        );
      },

      "/api/counter": {
        async GET(_req) {
          return withSpan("GET /api/counter", async () =>
            Response.json({ count: getCount(db) })
          );
        },
        async POST(req, server) {
          return withSpan("POST /api/counter", async () => {
            const { response, count } = await handleCounterPost(req, db);
            if (response.ok && typeof count === "number") {
              server.publish("counter", JSON.stringify({ type: "counter", count }));
              const entry = logActivity(db, "counter.increment");
              server.publish("activity", JSON.stringify({ type: "activity", entry }));
            }
            return response;
          });
        },
      },

      "/api/activity": {
        async GET(_req) {
          return withSpan("GET /api/activity", async () =>
            Response.json({ entries: getRecentActivity(db) })
          );
        },
      },

      "/ws": (req, server) => {
        if (server.upgrade(req)) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      },
    },

    websocket: {
      async open(ws) {
        await withSpan("ws.open", async () => {
          ws.subscribe("counter");
          ws.subscribe("activity");
          const entries = getRecentActivity(db);
          ws.send(JSON.stringify({ type: "activity_history", entries }));
        }, undefined, 1);
      },
      message(_ws, _msg) {},
      async close(ws) {
        await withSpan("ws.close", async () => {
          ws.unsubscribe("counter");
          ws.unsubscribe("activity");
        }, undefined, 1);
      },
    },

    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });
}

if (import.meta.main) {
  initTracer();
  const server = createServer();
  logger.info("server started", { url: server.url.toString() });
}
