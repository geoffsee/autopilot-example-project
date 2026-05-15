import { serve } from "bun";
import { createCounterDb } from "./counter";
import { setupActivityTable, getRecentActivity } from "./activity";
import { loadPlugins } from "./plugin-loader";

const db = createCounterDb();
setupActivityTable(db);

const pluginRoutes = await loadPlugins({ db });

export function createServer(port?: number) {
  return serve({
    port,
    routes: {
      ...pluginRoutes,
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
