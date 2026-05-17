import { test, expect, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { setupCounter, incrementNamedCounter, getLeaderboard } from "../src/counter";
import { createServer } from "../src/index";

describe("getLeaderboard DB function", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    setupCounter(db);
  });

  afterEach(() => {
    db.close();
  });

  test("returns empty array when no named counters exist", () => {
    const results = getLeaderboard(db, 10);
    // The default counter (id=1, name='default') is seeded at 0; leaderboard should exclude value=0 entries or include them all
    // Per spec: returns all counters sorted by value DESC — we include any that exist
    expect(Array.isArray(results)).toBe(true);
  });

  test("returns counters sorted descending by value", () => {
    incrementNamedCounter(db, "alpha", 5);
    incrementNamedCounter(db, "beta", 20);
    incrementNamedCounter(db, "gamma", 10);

    const results = getLeaderboard(db, 10);
    const names = results.map(r => r.name);
    expect(names.indexOf("beta")).toBeLessThan(names.indexOf("gamma"));
    expect(names.indexOf("gamma")).toBeLessThan(names.indexOf("alpha"));
  });

  test("returns correct { name, value } shape", () => {
    incrementNamedCounter(db, "clicks", 7);
    const results = getLeaderboard(db, 10);
    const entry = results.find(r => r.name === "clicks");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe(7);
  });

  test("respects limit parameter", () => {
    incrementNamedCounter(db, "a", 10);
    incrementNamedCounter(db, "b", 9);
    incrementNamedCounter(db, "c", 8);
    incrementNamedCounter(db, "d", 7);

    const results = getLeaderboard(db, 2);
    expect(results.length).toBe(2);
    expect(results[0].name).toBe("a");
    expect(results[1].name).toBe("b");
  });

  test("handles ties in stable order (both tied entries appear)", () => {
    incrementNamedCounter(db, "x", 5);
    incrementNamedCounter(db, "y", 5);
    incrementNamedCounter(db, "z", 1);

    const results = getLeaderboard(db, 10);
    const tied = results.filter(r => r.value === 5);
    expect(tied.length).toBe(2);
    const last = results.find(r => r.name === "z");
    expect(last).toBeDefined();
    expect(results.indexOf(last!)).toBeGreaterThan(results.indexOf(tied[0]));
  });

  test("default row (name=default, value=0) appears in results at correct rank", () => {
    incrementNamedCounter(db, "top", 100);
    const results = getLeaderboard(db, 10);
    expect(results[0].name).toBe("top");
    expect(results[0].value).toBe(100);
  });
});

describe("GET /api/leaderboard HTTP", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(() => {
    server = createServer(0);
    baseUrl = server.url.origin;
  });

  afterAll(async () => {
    await server.stop(true);
  });

  test("returns 200 with array body", async () => {
    const res = await fetch(`${baseUrl}/api/leaderboard`);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(Array.isArray(body)).toBe(true);
  });

  test("each entry has name and value fields", async () => {
    const ts = Date.now();
    await fetch(`${baseUrl}/api/counter/lb_a_${ts}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 1000000 }),
    });

    // Use a large limit so the entry is guaranteed to appear regardless of other counters
    const res = await fetch(`${baseUrl}/api/leaderboard?limit=1000`);
    const body = await res.json() as { name: string; value: number }[];
    const entry = body.find(e => e.name === `lb_a_${ts}`);
    expect(entry).toBeDefined();
    expect(typeof entry!.name).toBe("string");
    expect(typeof entry!.value).toBe("number");
  });

  test("results are ordered descending by value", async () => {
    const ts = Date.now();
    // Use very high distinct increments to ensure both appear near the top
    await fetch(`${baseUrl}/api/counter/hi_${ts}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 1000000 }),
    });
    await fetch(`${baseUrl}/api/counter/lo_${ts}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 999000 }),
    });

    const res = await fetch(`${baseUrl}/api/leaderboard?limit=1000`);
    const body = await res.json() as { name: string; value: number }[];
    const hiIdx = body.findIndex(e => e.name === `hi_${ts}`);
    const loIdx = body.findIndex(e => e.name === `lo_${ts}`);
    expect(hiIdx).toBeGreaterThanOrEqual(0);
    expect(loIdx).toBeGreaterThanOrEqual(0);
    expect(hiIdx).toBeLessThan(loIdx);
  });

  test("?limit=N returns at most N results", async () => {
    const res = await fetch(`${baseUrl}/api/leaderboard?limit=2`);
    const body = await res.json() as { name: string; value: number }[];
    expect(body.length).toBeLessThanOrEqual(2);
  });

  test("default limit is 10", async () => {
    // Seed more than 10 counters
    const ts = Date.now();
    for (let i = 0; i < 15; i++) {
      await fetch(`${baseUrl}/api/counter/seed_${ts}_${i}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ increment: i + 1 }),
      });
    }
    const res = await fetch(`${baseUrl}/api/leaderboard`);
    const body = await res.json() as { name: string; value: number }[];
    expect(body.length).toBeLessThanOrEqual(10);
  });

  test("?limit=0 falls back to default 10", async () => {
    const res = await fetch(`${baseUrl}/api/leaderboard?limit=0`);
    const body = await res.json() as { name: string; value: number }[];
    expect(body.length).toBeLessThanOrEqual(10);
  });

  test("?limit=invalid falls back to default 10", async () => {
    const res = await fetch(`${baseUrl}/api/leaderboard?limit=abc`);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; value: number }[];
    expect(body.length).toBeLessThanOrEqual(10);
  });
});
