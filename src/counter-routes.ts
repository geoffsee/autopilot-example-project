import { Database } from "bun:sqlite";
import type { Server } from "bun";
import { getCounterValue, handleCounterPost } from "./counter";

export function makeCounterRoutes(db: Database) {
  return {
    GET(_req: Request) {
      return Response.json({ count: getCounterValue(db) });
    },
    async POST(req: Request, server: Server) {
      const { response, count } = await handleCounterPost(req, db);
      if (count !== undefined) {
        server.publish(
          "counter",
          JSON.stringify({ type: "counter", count })
        );
      }
      return response;
    },
  };
}
