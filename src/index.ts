import { serve } from "bun";
import index from "./index.html";
import { createCounterDb, getCount, handleCounterPost, getNamedCount, handleNamedCounterPost, getCounterHistory, resetNamedCounter, getLeaderboard } from "./counter";
import { setupActivityTable, logActivity, getRecentActivity } from "./activity";

const db = createCounterDb();
setupActivityTable(db);

export function createServer(port?: number) {
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

      "/api/counter/:name/history": {
        GET(req) {
          const name = req.params.name;
          const url = new URL(req.url);
          const limitParam = parseInt(url.searchParams.get("limit") ?? "0", 10);
          const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);
          const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;
          const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
          const entries = getCounterHistory(db, name, { limit, offset });
          return Response.json({ name, entries });
        },
      },

      "/api/counter/:name": {
        GET(req) {
          const name = req.params.name;
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) {
            return Response.json({ error: "Invalid counter name" }, { status: 400 });
          }
          const value = getNamedCount(db, name);
          return Response.json({ name, value });
        },
        async POST(req, server) {
          const name = req.params.name;
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) {
            return Response.json({ error: "Invalid counter name" }, { status: 400 });
          }
          const { response, value } = await handleNamedCounterPost(req, db, name);
          if (response.ok && typeof value === "number") {
            server.publish("counter", JSON.stringify({ type: "counter", name, value }));
            const entry = logActivity(db, "counter.increment");
            server.publish("activity", JSON.stringify({ type: "activity", entry }));
          }
          return response;
        },
        DELETE(req, server) {
          const name = req.params.name;
          const result = resetNamedCounter(db, name);
          if (result === null) {
            return Response.json({ error: "Counter not found" }, { status: 404 });
          }
          const entry = logActivity(db, "counter.reset");
          server.publish("counter", JSON.stringify({ type: "counter", name, value: 0 }));
          server.publish("activity", JSON.stringify({ type: "activity", entry }));
          return Response.json({ name, value: 0 });
        },
      },

      "/api/leaderboard": {
        GET(req) {
          const url = new URL(req.url);
          const raw = parseInt(url.searchParams.get("limit") ?? "", 10);
          const limit = Math.min(raw > 0 ? raw : 10, 100);
          return Response.json(getLeaderboard(db, limit));
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
