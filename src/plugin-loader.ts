import { readdirSync } from "node:fs";
import type { PluginContext, PluginFactory, RouteManifest } from "./plugins/types";

export async function loadPlugins(ctx: PluginContext): Promise<RouteManifest> {
  const pluginsDir = new URL("./plugins", import.meta.url).pathname;
  const files = readdirSync(pluginsDir)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .sort();

  const routes: RouteManifest = {};
  for (const file of files) {
    const name = file.replace(/\.(ts|js)$/, "");
    const mod = await import(`./plugins/${name}`);
    const factory = mod.default as PluginFactory;
    if (typeof factory === "function") {
      Object.assign(routes, factory(ctx));
    }
  }
  return routes;
}
