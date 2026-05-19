import { Database, type Statement } from "bun:sqlite";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;
let pingStmt: Statement | undefined;

export function handleHealthGet(db: Database): Response {
  let dbStatus: "ok" | "error" = "ok";
  try {
    if (!pingStmt) {
      pingStmt = db.prepare("SELECT 1");
    }
    pingStmt.run();
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
