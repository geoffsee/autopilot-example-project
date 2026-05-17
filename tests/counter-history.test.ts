import { test, expect, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  setupCounter,
  incrementNamedCounter,
  getCounterHistory,
  type HistoryEntry,
} from "../src/counter";
import { createServer } from "../src/index";

describe("counter_history DB functions", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    setupCounter(db);
  });

  afterEach(() => {
    db.close();
  });

  test("counter_history table exists after setupCounter", () => {
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.some(t => t.name === "counter_history")).toBe(true);
  });

  test("incrementNamedCounter appends a row to counter_history", () => {
    incrementNamedCounter(db, "app", 3);
    const rows = db.query("SELECT * FROM counter_history WHERE name = 'app'").all() as HistoryEntry[];
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(3);
    expect(rows[0].new_value).toBe(3);
    expect(rows[0].name).toBe("app");
    expect(typeof rows[0].timestamp).toBe("string");
  });

  test("zero-amount increment does not append to history", () => {
    incrementNamedCounter(db, "app", 5);
    incrementNamedCounter(db, "app", 0);
    const rows = db.query("SELECT * FROM counter_history WHERE name = 'app'").all();
    expect(rows).toHaveLength(1);
  });

  test("getCounterHistory returns entries newest-first", () => {
    incrementNamedCounter(db, "app", 1);
    incrementNamedCounter(db, "app", 2);
    incrementNamedCounter(db, "app", 4);
    const entries = getCounterHistory(db, "app");
    expect(entries).toHaveLength(3);
    expect(entries[0].delta).toBe(4);
    expect(entries[1].delta).toBe(2);
    expect(entries[2].delta).toBe(1);
  });

  test("getCounterHistory respects limit", () => {
    incrementNamedCounter(db, "app", 1);
    incrementNamedCounter(db, "app", 2);
    incrementNamedCounter(db, "app", 3);
    const entries = getCounterHistory(db, "app", { limit: 2 });
    expect(entries).toHaveLength(2);
    expect(entries[0].delta).toBe(3);
  });

  test("getCounterHistory respects offset", () => {
    incrementNamedCounter(db, "app", 1);
    incrementNamedCounter(db, "app", 2);
    incrementNamedCounter(db, "app", 3);
    const entries = getCounterHistory(db, "app", { limit: 20, offset: 1 });
    expect(entries).toHaveLength(2);
    expect(entries[0].delta).toBe(2);
  });

  test("getCounterHistory returns empty array for unknown counter", () => {
    const entries = getCounterHistory(db, "nonexistent");
    expect(entries).toEqual([]);
  });

  test("history for different counters is isolated", () => {
    incrementNamedCounter(db, "alpha", 5);
    incrementNamedCounter(db, "beta", 10);
    expect(getCounterHistory(db, "alpha")).toHaveLength(1);
    expect(getCounterHistory(db, "beta")).toHaveLength(1);
    expect(getCounterHistory(db, "alpha")[0].delta).toBe(5);
  });

  test("getCounterHistory caps limit at 100", () => {
    for (let i = 0; i < 110; i++) {
      incrementNamedCounter(db, "app", 1);
    }
    const entries = getCounterHistory(db, "app", { limit: 200 });
    expect(entries).toHaveLength(100);
  });

  test("new_value in history reflects cumulative value", () => {
    incrementNamedCounter(db, "app", 5);
    incrementNamedCounter(db, "app", 3);
    const entries = getCounterHistory(db, "app");
    const [second, first] = entries; // newest first
    expect(first.new_value).toBe(5);
    expect(second.new_value).toBe(8);
  });
});

describe("counter history HTTP integration", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(() => {
    server = createServer(0);
    baseUrl = server.url.origin;
  });

  afterAll(async () => {
    await server.stop(true);
  });

  test("GET /api/counter/:name/history returns empty entries for new counter", async () => {
    const name = `hist_${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/counter/${name}/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; entries: unknown[] };
    expect(body.name).toBe(name);
    expect(body.entries).toEqual([]);
  });

  test("history entries appear after POST increments, newest-first", async () => {
    const name = `hist_post_${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 5 }),
    });
    await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 3 }),
    });
    const res = await fetch(`${baseUrl}/api/counter/${name}/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      name: string;
      entries: { delta: number; new_value: number; timestamp: string }[];
    };
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].delta).toBe(3); // newest first
    expect(body.entries[0].new_value).toBe(8);
    expect(body.entries[1].delta).toBe(5);
    expect(body.entries[1].new_value).toBe(5);
  });

  test("?limit= restricts result count", async () => {
    const name = `hist_lim_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/counter/${name}`, { method: "POST" });
    }
    const res = await fetch(`${baseUrl}/api/counter/${name}/history?limit=2`);
    const body = await res.json() as { entries: unknown[] };
    expect(body.entries).toHaveLength(2);
  });

  test("?limit= is capped at 100 server-side", async () => {
    const name = `hist_lim2_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/counter/${name}`, { method: "POST" });
    }
    const res = await fetch(`${baseUrl}/api/counter/${name}/history?limit=200`);
    const body = await res.json() as { entries: unknown[]; limit: number };
    expect(body.limit).toBeLessThanOrEqual(100);
  });

  test("?offset= skips entries", async () => {
    const name = `hist_off_${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/counter/${name}`, { method: "POST" });
    }
    const allRes = await fetch(`${baseUrl}/api/counter/${name}/history`);
    const allBody = await allRes.json() as { entries: { id: number }[] };

    const offsetRes = await fetch(`${baseUrl}/api/counter/${name}/history?offset=1`);
    const offsetBody = await offsetRes.json() as { entries: { id: number }[] };
    expect(offsetBody.entries).toHaveLength(2);
    expect(offsetBody.entries[0].id).toBe(allBody.entries[1].id);
  });

  test("GET /api/counter/:name still works after adding history route", async () => {
    const name = `compat_${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/counter/${name}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; value: number };
    expect(body.name).toBe(name);
    expect(body.value).toBe(0);
  });

  test("history entries include all expected fields", async () => {
    const name = `hist_fields_${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 7 }),
    });
    const res = await fetch(`${baseUrl}/api/counter/${name}/history`);
    const body = await res.json() as { entries: Record<string, unknown>[] };
    expect(body.entries).toHaveLength(1);
    const entry = body.entries[0];
    expect(typeof entry.id).toBe("number");
    expect(entry.name).toBe(name);
    expect(entry.delta).toBe(7);
    expect(entry.new_value).toBe(7);
    expect(typeof entry.timestamp).toBe("string");
  });
});
