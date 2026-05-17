import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { handleHealthGet } from "../src/health";

test("healthy path: 200 with status ok, db ok, and numeric uptime", async () => {
  const db = new Database(":memory:");
  const ping = db.prepare("SELECT 1");
  const startTime = Date.now() - 3000;
  const res = handleHealthGet(ping, startTime);
  db.close();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string; db: string; uptime: number };
  expect(body.status).toBe("ok");
  expect(body.db).toBe("ok");
  expect(typeof body.uptime).toBe("number");
  expect(body.uptime).toBeGreaterThanOrEqual(3);
});

test("degraded path: 503 when DB ping fails", async () => {
  const db = new Database(":memory:");
  const ping = db.prepare("SELECT 1");
  db.close();
  const res = handleHealthGet(ping, Date.now());
  expect(res.status).toBe(503);
  const body = (await res.json()) as { status: string; db: string; uptime: number };
  expect(body.status).toBe("degraded");
  expect(body.db).toBe("error");
  expect(typeof body.uptime).toBe("number");
});
