import type { Server } from "bun";
import type { PluginFactory } from "./types";
import { getCount, handleCounterPost } from "../counter";
import { logActivity } from "../activity";
import { withSpan } from "../tracer";

const plugin: PluginFactory = ({ db }) => ({
  "/api/counter": {
    async GET(_req: Request) {
      return withSpan("GET /api/counter", async () =>
        Response.json({ count: getCount(db) })
      );
    },
    async POST(req: Request, server: Server) {
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
});

export default plugin;
