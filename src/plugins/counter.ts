import type { Server } from "bun";
import type { PluginFactory } from "./types";
import { getCount, handleCounterPost } from "../counter";
import { logActivity } from "../activity";

const plugin: PluginFactory = ({ db }) => ({
  "/api/counter": {
    GET(_req: Request) {
      return Response.json({ count: getCount(db) });
    },
    async POST(req: Request, server: Server) {
      const { response, count } = await handleCounterPost(req, db);
      if (response.ok && typeof count === "number") {
        server.publish("counter", JSON.stringify({ type: "counter", count }));
        const entry = logActivity(db, "counter.increment");
        server.publish("activity", JSON.stringify({ type: "activity", entry }));
      }
      return response;
    },
  },
});

export default plugin;
