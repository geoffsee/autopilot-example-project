import type { Database } from "bun:sqlite";
import type { Server } from "bun";

export interface PluginContext {
  db: Database;
}

type RouteHandler = (req: Request, server: Server) => Response | undefined | Promise<Response | undefined>;
type MethodMap = Partial<Record<"GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS", RouteHandler>>;
export type RouteValue = RouteHandler | MethodMap;

export type RouteManifest = Record<string, RouteValue>;

export type PluginFactory = (ctx: PluginContext) => RouteManifest;
