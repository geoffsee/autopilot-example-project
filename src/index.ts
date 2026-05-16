import { serve } from "bun";
import index from "./index.html";
import { Database } from "bun:sqlite";
import {
  createCounterDb,
  getCount,
  handleCounterPost,
  resetCounter,
  setupNamedCounters,
  getNamedCount,
  handleNamedCounterPost,
} from "./counter";
import { setupActivityTable, logActivity, getRecentActivity, clearActivity } from "./activity";

export function createServer(port?: number, database?: Database) {
  const db = database ?? createCounterDb();
  setupActivityTable(db);
  setupNamedCounters(db);
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

      "/api/counter/reset": {
        POST(_req, server) {
          resetCounter(db);
          clearActivity(db);
          server.publish("counter", JSON.stringify({ type: "counter", count: 0 }));
          return Response.json({ count: 0 });
        },
      },

      "/api/counter/:name": {
        GET(req) {
          const { name } = req.params;
          return Response.json({ name, count: getNamedCount(db, name) });
        },
        async POST(req, server) {
          const { name } = req.params;
          const { response, count } = await handleNamedCounterPost(req, db, name);
          if (response.ok && typeof count === "number") {
            server.publish("counter", JSON.stringify({ type: "counter", name, count }));
            const entry = logActivity(db, `counter.increment.${name}`);
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
