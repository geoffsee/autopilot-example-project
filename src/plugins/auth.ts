import type { PluginFactory } from "./types";

const plugin: PluginFactory = (_ctx) => ({
  "/api/auth/token": {
    async POST() {
      return Response.json({ error: "Not implemented" }, { status: 501 });
    },
  },
});

export default plugin;
