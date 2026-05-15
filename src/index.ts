import { serve } from "bun";
import { Database } from "bun:sqlite";
import index from "./index.html";
import { setupCounter } from "./counter";
import { makeCounterRoutes } from "./counter-routes";

const db = new Database("counter.db");
setupCounter(db);

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(_req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(_req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      return Response.json({
        message: `Hello, ${req.params.name}!`,
      });
    },

    "/api/counter": makeCounterRoutes(db),

    "/ws": (req, server) => {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    },
  },

  websocket: {
    open(ws) {
      ws.subscribe("counter");
    },
    message(_ws, _msg) {},
    close(ws) {
      ws.unsubscribe("counter");
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
