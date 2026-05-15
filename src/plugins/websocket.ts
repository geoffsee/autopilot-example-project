import type { Server } from "bun";
import type { PluginFactory } from "./types";

const plugin: PluginFactory = (_ctx) => ({
  "/ws": (req: Request, server: Server) => {
    if (server.upgrade(req)) return;
    return new Response("WebSocket upgrade failed", { status: 400 });
  },
});

export default plugin;
