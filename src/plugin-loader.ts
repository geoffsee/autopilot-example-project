import { Glob } from "bun";
import type { PluginContext, PluginFactory, RouteManifest } from "./plugins/types";

export async function loadPlugins(ctx: PluginContext): Promise<RouteManifest> {
  const pluginsDir = new URL("./plugins", import.meta.url).pathname;
  const NON_PLUGIN_FILES = new Set(["types.ts", "types.js"]);
  const files = [...new Glob("*.{ts,js}").scanSync(pluginsDir)]
    .filter((f) => !NON_PLUGIN_FILES.has(f))
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
