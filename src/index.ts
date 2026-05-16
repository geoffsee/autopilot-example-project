import { serve } from "bun";
import index from "./index.html";
import { createCounterDb, getCount, handleCounterPost } from "./counter";
import { setupActivityTable, logActivity, getRecentActivity } from "./activity";
import { withLogging } from "./logger";

const db = createCounterDb();
setupActivityTable(db);

export function createServer(port?: number) {
  return serve({
    port,
    routes: {
      "/*": index,

      "/api/hello": {
        GET: withLogging(async () => Response.json({ message: "Hello, world!", method: "GET" })),
        PUT: withLogging(async () => Response.json({ message: "Hello, world!", method: "PUT" })),
      },

      "/api/hello/:name": withLogging(async (req) =>
        Response.json({ message: `Hello, ${req.params.name}!` })
      ),

      "/api/counter": {
        GET: withLogging(() => Response.json({ count: getCount(db) })),
        POST: withLogging(async (req, server) => {
          const { response, count } = await handleCounterPost(req, db);
          if (response.ok && typeof count === "number") {
            server!.publish("counter", JSON.stringify({ type: "counter", count }));
            const entry = logActivity(db, "counter.increment");
            server!.publish("activity", JSON.stringify({ type: "activity", entry }));
          }
          return response;
        }),
      },

      "/api/activity": {
        GET: withLogging(() => Response.json({ entries: getRecentActivity(db) })),
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
