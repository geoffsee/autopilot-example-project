import type { PluginFactory } from "./types";
import { getRecentActivity } from "../activity";

const plugin: PluginFactory = ({ db }) => ({
  "/api/activity": {
    GET(_req: Request) {
      return Response.json({ entries: getRecentActivity(db) });
    },
  },
});

export default plugin;
