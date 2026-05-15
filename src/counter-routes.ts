import { Database } from "bun:sqlite";
import { getCount, increment } from "./counter";

export function makeCounterRoutes(db: Database) {
  return {
    GET(_req: Request) {
      return Response.json({ count: getCount(db) });
    },
    POST(_req: Request) {
      return Response.json({ count: increment(db) });
    },
  };
}
