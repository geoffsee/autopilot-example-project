import { Database } from "bun:sqlite";

export function handleHealthGet(db: Database): Response {
  let dbStatus: "ok" | "error" = "ok";
  try {
    db.query("SELECT 1").run();
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  return Response.json(
    {
      status,
      db: dbStatus,
      uptime_seconds: process.uptime(),
    },
    { status: dbStatus === "ok" ? 200 : 503 }
  );
}
