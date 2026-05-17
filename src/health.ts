import type { Statement } from "bun:sqlite";

export function handleHealthGet(ping: Statement, startTime: number): Response {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  try {
    ping.get();
    return Response.json({ status: "ok", db: "ok", uptime });
  } catch {
    return Response.json({ status: "degraded", db: "error", uptime }, { status: 503 });
  }
}
