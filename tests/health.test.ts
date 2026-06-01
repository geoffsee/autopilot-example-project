import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleHealthGet } from "../src/health";

type HealthBody = { status: "ok" | "degraded"; db: "ok" | "error"; uptime_seconds: number };

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  try { db.close(); } catch { /* already closed */ }
});

test("GET /api/health returns 200 with status ok when db is reachable", async () => {
  const res = handleHealthGet(db);
  expect(res.status).toBe(200);
  const body = await res.json() as HealthBody;
  expect(body.status).toBe("ok");
  expect(body.db).toBe("ok");
  expect(typeof body.uptime_seconds).toBe("number");
  expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
});

test("GET /api/health returns 503 with status degraded when db is closed", async () => {
  db.close();
  const res = handleHealthGet(db);
  expect(res.status).toBe(503);
  const body = await res.json() as HealthBody;
  expect(body.status).toBe("degraded");
  expect(body.db).toBe("error");
  expect(typeof body.uptime_seconds).toBe("number");
  expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
});
