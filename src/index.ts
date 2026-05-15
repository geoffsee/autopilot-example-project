import { serve } from "bun";
import { Database } from "bun:sqlite";
import index from "./index.html";
import { setupCounter, getCounterValue, handleCounterPost } from "./counter";

const db = new Database("counter.db");
setupCounter(db);

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/counter": {
      GET(_req) {
        return Response.json({ count: getCounterValue(db) });
      },
      POST(req) {
        return handleCounterPost(req, db);
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
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
