import { serve } from "bun";
import { createCounterDb, namedCountersMigration } from "./counter";
import { setupActivityTable, getRecentActivity } from "./activity";
import { loadPlugins } from "./plugin-loader";
import { config as defaultConfig, buildConfig } from "./config";
import { runMigrations } from "./migrate";
import { logger } from "./logger";
import { initTracer, withSpan } from "./tracer";

type Config = ReturnType<typeof buildConfig>;

const db = createCounterDb();
setupActivityTable(db);
runMigrations(db, [namedCountersMigration]);

export async function createServer(port?: number, config: Config = defaultConfig) {
  const pluginRoutes = await loadPlugins({ db, config });
  return serve({
    port,
    routes: {
      ...pluginRoutes,
    },

    websocket: {
      async open(ws) {
        await withSpan("ws.open", async () => {
          ws.subscribe("counter");
          ws.subscribe("activity");
          const entries = getRecentActivity(db);
          ws.send(JSON.stringify({ type: "activity_history", entries }));
        });
      },
      message(_ws, _msg) {},
      async close(ws) {
        await withSpan("ws.close", async () => {
          ws.unsubscribe("counter");
          ws.unsubscribe("activity");
        });
      },
    },

    development: config.isDevelopment && {
      hmr: true,
      console: true,
    },
  });
}

if (import.meta.main) {
  initTracer();
  const server = await createServer();
  logger.info("server started", { url: server.url.toString() });
}
