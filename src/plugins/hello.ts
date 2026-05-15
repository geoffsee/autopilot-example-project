import type { PluginFactory } from "./types";

const plugin: PluginFactory = (_ctx) => ({
  "/api/hello": {
    async GET(_req: Request) {
      return Response.json({ message: "Hello, world!", method: "GET" });
    },
    async PUT(_req: Request) {
      return Response.json({ message: "Hello, world!", method: "PUT" });
    },
  },
  "/api/hello/:name": async (req: Request & { params: Record<string, string> }) => {
    return Response.json({ message: `Hello, ${req.params["name"]}!` });
  },
});

export default plugin;
