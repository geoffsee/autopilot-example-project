import { serve } from "bun";
import index from "./index.html";
import { createCounterDb, getCount, handleCounterPost } from "./counter";
import { setupActivityTable, logActivity, updateActivityLabel, getRecentActivity } from "./activity";
import { RateLimiter } from "./rate-limiter";
import { generateLabel } from "./labeler";

const db = createCounterDb();
setupActivityTable(db);

export function createServer(port?: number) {
  const rateLimit = parseInt(process.env.COUNTER_RATE_LIMIT ?? "10", 10);
  const rateLimiter = new RateLimiter(rateLimit);

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

          if (!rateLimiter.check(ip)) {
            const resetAt = rateLimiter.resetAt(ip);
            const retryAfter = Math.max(1, resetAt - Math.floor(Date.now() / 1000));
            return new Response(JSON.stringify({ error: "Too Many Requests" }), {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "X-RateLimit-Limit": String(rateLimiter.limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": String(resetAt),
                "Retry-After": String(retryAfter),
              },
            });
          }

          const remaining = rateLimiter.remaining(ip);
          const { response, count } = await handleCounterPost(req, db);

          const headers = new Headers(response.headers);
          headers.set("X-RateLimit-Limit", String(rateLimiter.limit));
          headers.set("X-RateLimit-Remaining", String(remaining));
          headers.set("X-RateLimit-Reset", String(rateLimiter.resetAt(ip)));
          const ratedResponse = new Response(response.body, { status: response.status, headers });

          if (ratedResponse.ok && typeof count === "number") {
            server.publish("counter", JSON.stringify({ type: "counter", count }));
            const entry = logActivity(db, "counter.increment");
            server.publish("activity", JSON.stringify({ type: "activity", entry }));
            generateLabel(entry.action, count).then((label) => {
              if (label) {
                updateActivityLabel(db, entry.id, label);
                server.publish("activity", JSON.stringify({ type: "activity_label", id: entry.id, label }));
              }
            });
          }
          return ratedResponse;
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
