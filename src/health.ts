import { Database } from "bun:sqlite";

export function handleHealthGet(db: Database, startTime: number): Response {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  try {
    db.query("SELECT 1").get();
    return Response.json({ status: "ok", db: "ok", uptime });
  } catch {
    return Response.json({ status: "degraded", db: "error", uptime }, { status: 503 });
  }
}
