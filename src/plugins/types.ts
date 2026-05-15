import type { Database } from "bun:sqlite";

export interface PluginContext {
  db: Database;
}

export type RouteManifest = Record<string, unknown>;

export type PluginFactory = (ctx: PluginContext) => RouteManifest;
