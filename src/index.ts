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

// Mutable reference so createServer can inject per-invocation config into plugin handlers at request time.
let activeConfig: Config = defaultConfig;
const pluginRoutes = await loadPlugins({
  db,
  get config(): Config { return activeConfig; },
});

/**
 * NOTE: `createServer` sets a module-level `activeConfig` so that plugin
 * handlers can read the active config at request time. Do not call
 * `createServer` concurrently — the last call wins and all running servers
 * will share the same config reference.
 */
export function createServer(port?: number, config: Config = defaultConfig) {
  activeConfig = config;
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

    development: activeConfig.isDevelopment && {
      hmr: true,
      console: true,
    },
  });
}

if (import.meta.main) {
  initTracer();
  const server = createServer();
  logger.info("server started", { url: server.url.toString() });
}
