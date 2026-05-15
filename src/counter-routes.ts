import { Database } from "bun:sqlite";
import { getCounterValue, handleCounterPost } from "./counter";

export function makeCounterRoutes(db: Database) {
  return {
    GET(_req: Request) {
      return Response.json({ count: getCounterValue(db) });
    },
    POST(req: Request) {
      return handleCounterPost(req, db);
    },
  };
}
