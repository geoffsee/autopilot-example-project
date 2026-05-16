import { serve } from "bun";
import { createCounterDb, namedCountersMigration } from "./counter";
import { setupActivityTable, getRecentActivity } from "./activity";
import { loadPlugins } from "./plugin-loader";
import { config as defaultConfig, buildConfig } from "./config";
import { runMigrations } from "./migrate";

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

export function createServer(port?: number, config: Config = defaultConfig) {
  activeConfig = config;
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

    development: activeConfig.isDevelopment && {
      hmr: true,
      console: true,
    },
  });
}

if (import.meta.main) {
  const server = createServer();
  console.log(`🚀 Server running at ${server.url}`);
}
