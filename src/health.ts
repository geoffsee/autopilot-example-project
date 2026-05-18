import { Database, type Statement } from "bun:sqlite";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;
const pingStmts = new WeakMap<Database, Statement>();

export function handleHealthGet(db: Database): Response {
  let dbStatus: "ok" | "error" = "ok";
  try {
    let stmt = pingStmts.get(db);
    if (!stmt) { stmt = db.prepare("SELECT 1"); pingStmts.set(db, stmt); }
    stmt.run();
  } catch {
    dbStatus = "error";
  }

  return Response.json(
    {
      uptime: process.uptime(),
      db: dbStatus,
      version: VERSION,
    },
    { status: dbStatus === "ok" ? 200 : 503 }
  );
}
