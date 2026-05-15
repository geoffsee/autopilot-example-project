import { serve } from "bun";
import index from "./index.html";
import { createCounterDb, getCount, handleCounterPost, getNamedCount, incrementNamedCounter } from "./counter";
import { setupActivityTable, logActivity, getRecentActivity } from "./activity";
import { config as defaultConfig, buildConfig } from "./config";
import { verifyJwt, extractBearer } from "./auth";

const db = createCounterDb();
setupActivityTable(db);

type Config = ReturnType<typeof buildConfig>;

export function createServer(port?: number, config: Config = defaultConfig) {
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
          const { response, count } = await handleCounterPost(req, db);
          if (response.ok && typeof count === "number") {
            server.publish("counter", JSON.stringify({ type: "counter", count }));
            const entry = logActivity(db, "counter.increment");
            server.publish("activity", JSON.stringify({ type: "activity", entry }));
          }
          return response;
        },
      },

      "/api/counter/:name": {
        GET(req) {
          return Response.json({ count: getNamedCount(db, req.params.name) });
        },
        async POST(req) {
          const bearer = extractBearer(req);
          if (!bearer) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          try {
            await verifyJwt(bearer, config.JWT_SECRET);
          } catch {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          const count = incrementNamedCounter(db, req.params.name);
          return Response.json({ count });
        },
      },

      "/api/activity": {
        GET(_req) {
          return Response.json({ entries: getRecentActivity(db) });
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

    development: config.isDevelopment && {
      hmr: true,
      console: true,
    },
  });
}

if (import.meta.main) {
  const server = createServer();
  console.log(`🚀 Server running at ${server.url}`);
}
