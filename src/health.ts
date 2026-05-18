import { Database, type Statement } from "bun:sqlite";
import pkg from "../package.json" with { type: "json" };

const VERSION: string = pkg.version;
const pingStmts = new WeakMap<Database, Statement>();

export function handleHealthGet(db: Database): Response {
  let dbStatus: "ok" | "error" = "ok";
  try {
    if (!pingStmts.has(db)) pingStmts.set(db, db.prepare("SELECT 1"));
    pingStmts.get(db)!.get();
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
