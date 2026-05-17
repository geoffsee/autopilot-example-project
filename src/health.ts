import { Database } from "bun:sqlite";

const VERSION = "0.1.0";

export function handleHealthGet(db: Database): Response {
  let dbStatus: "ok" | "error" = "ok";
  try {
    db.query("SELECT 1").get();
  } catch {
    dbStatus = "error";
  }

  return Response.json(
    {
      status: dbStatus === "ok" ? "ok" : "error",
      uptime: process.uptime(),
      db: dbStatus,
      version: VERSION,
    },
    { status: dbStatus === "ok" ? 200 : 503 }
  );
}
