import { Database, type Statement } from "bun:sqlite";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;
const pingStmts = new WeakMap<Database, Statement>();

export function handleHealthGet(db: Database): Response {
  let dbStatus: "ok" | "error" = "ok";
  try {
    const stmt = pingStmts.get(db) ?? db.prepare("SELECT 1");
    if (!pingStmts.has(db)) pingStmts.set(db, stmt);
    stmt.get();
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
