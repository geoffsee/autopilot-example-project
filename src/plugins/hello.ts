import type { PluginFactory } from "./types";
import { withSpan } from "../tracer";

const plugin: PluginFactory = (_ctx) => ({
  "/api/hello": {
    async GET(_req: Request) {
      return withSpan("GET /api/hello", async () =>
        Response.json({ message: "Hello, world!", method: "GET" })
      );
    },
    async PUT(_req: Request) {
      return withSpan("PUT /api/hello", async () =>
        Response.json({ message: "Hello, world!", method: "PUT" })
      );
    },
  },
  "/api/hello/:name": async (req: Request & { params: Record<string, string> }) => {
    return withSpan("GET /api/hello/:name", async () =>
      Response.json({ message: `Hello, ${req.params["name"]}!` })
    );
  },
});

export default plugin;
