import { test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { writeAuditEntry, getAuditEntries } from "../src/audit";
import { runMigrations } from "../src/migrate";
import type { createServer } from "../src/index";

let db: Database;

beforeEach(async () => {
  db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
});

afterEach(() => {
  db.close();
});

// --- Unit tests ---

test("writeAuditEntry inserts a row and returns it", () => {
  const entry = writeAuditEntry(db, "api", "hits", 0, 1);
  expect(entry.actor).toBe("api");
  expect(entry.counter_name).toBe("hits");
  expect(entry.old_value).toBe(0);
  expect(entry.new_value).toBe(1);
  expect(typeof entry.timestamp).toBe("string");
  expect(typeof entry.id).toBe("number");
});

test("getAuditEntries returns entries most-recent first", () => {
  writeAuditEntry(db, "api", "hits", 0, 1);
  writeAuditEntry(db, "api", "hits", 1, 2);
  writeAuditEntry(db, "api", "hits", 2, 3);
  const entries = getAuditEntries(db, {});
  expect(entries.length).toBe(3);
  expect(entries[0]!.new_value).toBe(3);
  expect(entries[2]!.new_value).toBe(1);
});

test("getAuditEntries filters by counter_name", () => {
  writeAuditEntry(db, "api", "hits", 0, 1);
  writeAuditEntry(db, "api", "views", 0, 1);
  writeAuditEntry(db, "api", "hits", 1, 2);
  const entries = getAuditEntries(db, { counter: "hits" });
  expect(entries.length).toBe(2);
  expect(entries.every((e) => e.counter_name === "hits")).toBe(true);
});

test("getAuditEntries supports limit and offset pagination", () => {
  for (let i = 0; i < 5; i++) {
    writeAuditEntry(db, "api", "hits", i, i + 1);
  }
  const page1 = getAuditEntries(db, { limit: 2, offset: 0 });
  const page2 = getAuditEntries(db, { limit: 2, offset: 2 });
  const page3 = getAuditEntries(db, { limit: 2, offset: 4 });
  expect(page1.length).toBe(2);
  expect(page2.length).toBe(2);
  expect(page3.length).toBe(1);
});

// --- Integration tests ---

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(async () => {
  // Explicitly open-auth mode — defer import so env vars are read before _rbac singleton initialises
  process.env.API_TOKEN = "";
  process.env.READ_TOKEN = "";
  const { createServer } = await import("../src/index");
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("GET /api/audit returns { entries: [] } initially", async () => {
  const res = await fetch(`${baseUrl}/api/audit`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { entries: unknown[] };
  expect(Array.isArray(body.entries)).toBe(true);
  expect(body.entries.length).toBe(0);
});

test("audit row appears after named counter increment", async () => {
  const name = `inc-${Date.now()}`;
  await fetch(`${baseUrl}/api/counter/${name}/increment`, { method: "POST" });
  const res = await fetch(`${baseUrl}/api/audit?counter=${name}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    entries: Array<{ counter_name: string; old_value: number; new_value: number }>;
  };
  expect(body.entries.length).toBe(1);
  const row = body.entries[0]!;
  expect(row.counter_name).toBe(name);
  expect(row.old_value).toBe(0);
  expect(row.new_value).toBe(1);
});

test("audit row appears after named counter reset (C7)", async () => {
  const name = `reset-${Date.now()}`;
  await fetch(`${baseUrl}/api/counter/${name}/increment`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/${name}/increment`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/${name}/reset`, { method: "POST" });

  const res = await fetch(`${baseUrl}/api/audit?counter=${name}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    entries: Array<{ counter_name: string; old_value: number; new_value: number }>;
  };
  // 2 increments + 1 reset
  expect(body.entries.length).toBe(3);
  // Most recent is reset (new_value = 0)
  expect(body.entries[0]!.new_value).toBe(0);
  expect(body.entries[0]!.old_value).toBe(2);
});

test("GET /api/audit?counter=:name filters by counter name", async () => {
  const nameA = `fa-${Date.now()}`;
  const nameB = `fb-${Date.now()}`;
  await fetch(`${baseUrl}/api/counter/${nameA}/increment`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/${nameB}/increment`, { method: "POST" });

  const res = await fetch(`${baseUrl}/api/audit?counter=${nameA}`);
  const body = (await res.json()) as { entries: Array<{ counter_name: string }> };
  expect(body.entries.length).toBeGreaterThan(0);
  expect(body.entries.every((e) => e.counter_name === nameA)).toBe(true);
});
