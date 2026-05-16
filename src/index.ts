import { serve } from "bun";
import { Database } from "bun:sqlite";
import index from "./index.html";
import { getCount, handleCounterPost } from "./counter";
import { logActivity, getRecentActivity } from "./activity";
import { runMigrations } from "./db/migrate";
import { handleGetTodos, handleCreateTodo, handleUpdateTodo, handleDeleteTodo } from "./todo-routes";

const db = new Database("counter.db");
runMigrations(db);

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

      "/api/activity": {
        GET(_req) {
          return Response.json({ entries: getRecentActivity(db) });
        },
      },

      "/api/todos": {
        GET(_req) {
          return handleGetTodos(db);
        },
        async POST(req) {
          return handleCreateTodo(req, db);
        },
      },

      "/api/todos/:id": async (req) => {
        const id = parseInt(req.params.id, 10);
        if (req.method === "PATCH") {
          return handleUpdateTodo(req, db, id);
        }
        if (req.method === "DELETE") {
          return handleDeleteTodo(db, id);
        }
        return new Response("Method Not Allowed", { status: 405 });
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
