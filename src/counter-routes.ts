import { Database } from "bun:sqlite";
import type { Server } from "bun";
import { getCount, increment } from "./counter";

export function makeCounterRoutes(db: Database) {
  return {
    GET(_req: Request) {
      return Response.json({ count: getCount(db) });
    },
    async POST(_req: Request, server: Server) {
      const count = increment(db);
      server.publish("counter", JSON.stringify({ type: "counter", count }));
      return Response.json({ count }, { status: 200 });
    },
  };
}
