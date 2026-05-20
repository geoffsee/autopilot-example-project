import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleHealthGet } from "../src/health";

type HealthBody = { status: string; uptime: number; db: string; version: string };

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  try { db.close(); } catch { /* already closed */ }
});

test("GET /api/health returns 200 with healthy payload when db is reachable", async () => {
  const res = handleHealthGet(db);
  expect(res.status).toBe(200);
  const body = await res.json() as HealthBody;
  expect(typeof body.uptime).toBe("number");
  expect(body.uptime).toBeGreaterThanOrEqual(0);
  expect(body.status).toBe("ok");
  expect(body.db).toBe("ok");
  expect(typeof body.version).toBe("string");
  expect(body.version.length).toBeGreaterThan(0);
});

test("GET /api/health returns 503 with db error when db is closed", async () => {
  db.close();
  const res = handleHealthGet(db);
  expect(res.status).toBe(503);
  const body = await res.json() as HealthBody;
  expect(body.status).toBe("error");
  expect(body.db).toBe("error");
  expect(typeof body.uptime).toBe("number");
  expect(body.uptime).toBeGreaterThanOrEqual(0);
  expect(typeof body.version).toBe("string");
  expect(body.version.length).toBeGreaterThan(0);
});
