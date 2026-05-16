import type { PluginFactory } from "./types";
import { getRecentActivity } from "../activity";
import { withSpan } from "../tracer";

const plugin: PluginFactory = ({ db }) => ({
  "/api/activity": {
    async GET(_req: Request) {
      return withSpan("GET /api/activity", async () =>
        Response.json({ entries: getRecentActivity(db) })
      );
    },
  },
});

export default plugin;
