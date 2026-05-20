import { Database } from "bun:sqlite";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;

export function handleHealthGet(db: Database): Response {
  let dbStatus: "ok" | "error" = "ok";
  try {
    db.query("SELECT 1").run();
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
