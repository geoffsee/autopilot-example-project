import { Database } from "bun:sqlite";
import type { Server } from "bun";
import { getCounterValue, handleCounterPost } from "./counter";

export function makeCounterRoutes(db: Database) {
  return {
    GET(_req: Request) {
      return Response.json({ count: getCounterValue(db) });
    },
    async POST(req: Request, server: Server) {
      const res = await handleCounterPost(req, db);
      if (res.status === 200) {
        const { count } = (await res.clone().json()) as { count: number };
        server.publish(
          "counter",
          JSON.stringify({ type: "counter", count })
        );
      }
      return res;
    },
  };
}
