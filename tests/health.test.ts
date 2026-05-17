import { test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleHealthGet } from "../src/health";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

test("GET /api/health returns 200 with healthy payload when db is reachable", async () => {
  const res = handleHealthGet(db);
  expect(res.status).toBe(200);
  const body = await res.json() as { status: string; uptime: number; db: string; version: string };
  expect(body.status).toBe("ok");
  expect(typeof body.uptime).toBe("number");
  expect(body.uptime).toBeGreaterThanOrEqual(0);
  expect(body.db).toBe("ok");
  expect(typeof body.version).toBe("string");
  expect(body.version.length).toBeGreaterThan(0);
});

test("GET /api/health returns 503 with db error when db is closed", async () => {
  db.close();
  const res = handleHealthGet(db);
  expect(res.status).toBe(503);
  const body = await res.json() as { status: string; uptime: number; db: string; version: string };
  expect(body.status).toBe("error");
  expect(body.db).toBe("error");
  expect(typeof body.uptime).toBe("number");
  expect(typeof body.version).toBe("string");
});
