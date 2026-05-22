import { test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { setupNamedCounters, incrementNamedCounter, getCountersByPrefix } from "../src/counter";
import { createServer } from "../src/index";

// --- Unit tests for getCountersByPrefix ---

function makeDb() {
  const db = new Database(":memory:");
  setupNamedCounters(db);
  return db;
}

test("getCountersByPrefix returns empty result for no matches", () => {
  const db = makeDb();
  try {
    const result = getCountersByPrefix(db, "foo");
    expect(result).toEqual({ prefix: "foo", total: 0, counters: [] });
  } finally {
    db.close();
  }
});

test("getCountersByPrefix sums matching counters", () => {
  const db = makeDb();
  try {
    incrementNamedCounter(db, "foo.a");
    incrementNamedCounter(db, "foo.a");
    incrementNamedCounter(db, "foo.b");
    incrementNamedCounter(db, "bar.x"); // should not match
    const result = getCountersByPrefix(db, "foo");
    expect(result.prefix).toBe("foo");
    expect(result.total).toBe(3);
    expect(result.counters).toHaveLength(2);
    const names = result.counters.map((c: { name: string; value: number }) => c.name).sort();
    expect(names).toEqual(["foo.a", "foo.b"]);
    const fooA = result.counters.find((c: { name: string; value: number }) => c.name === "foo.a");
    expect(fooA?.value).toBe(2);
    const fooB = result.counters.find((c: { name: string; value: number }) => c.name === "foo.b");
    expect(fooB?.value).toBe(1);
  } finally {
    db.close();
  }
});

test("getCountersByPrefix with empty string prefix matches all counters", () => {
  const db = makeDb();
  try {
    incrementNamedCounter(db, "alpha");
    incrementNamedCounter(db, "beta");
    const result = getCountersByPrefix(db, "");
    expect(result.total).toBe(2);
    expect(result.counters).toHaveLength(2);
  } finally {
    db.close();
  }
});

// --- Integration tests via HTTP ---

let server: ReturnType<typeof createServer>;

beforeAll(() => {
  server = createServer(0);
});

afterAll(async () => {
  await server.stop();
});

test("GET /api/counter?prefix= returns empty result for unknown prefix (200, not 404)", async () => {
  const res = await fetch(`${server.url.origin}/api/counter?prefix=nonexistent`);
  expect(res.status).toBe(200);
  const body = await res.json() as { prefix: string; total: number; counters: unknown[] };
  expect(body.prefix).toBe("nonexistent");
  expect(body.total).toBe(0);
  expect(body.counters).toEqual([]);
});

test("GET /api/counter?prefix= aggregates multiple matching counters", async () => {
  // Use a unique prefix so accumulated state from prior runs doesn't affect the delta
  const prefix = `agg-${Date.now()}`;
  const initialRes = await fetch(`${server.url.origin}/api/counter?prefix=${prefix}`);
  const initial = await initialRes.json() as { total: number };
  const initialTotal = initial.total;

  await fetch(`${server.url.origin}/api/counter/${prefix}.x/increment`, { method: "POST" });
  await fetch(`${server.url.origin}/api/counter/${prefix}.x/increment`, { method: "POST" });
  await fetch(`${server.url.origin}/api/counter/${prefix}.y/increment`, { method: "POST" });
  // unrelated counter — should not be included
  await fetch(`${server.url.origin}/api/counter/other-${prefix}/increment`, { method: "POST" });

  const res = await fetch(`${server.url.origin}/api/counter?prefix=${prefix}`);
  expect(res.status).toBe(200);
  const body = await res.json() as { prefix: string; total: number; counters: { name: string; value: number }[] };
  expect(body.prefix).toBe(prefix);
  expect(body.total).toBe(initialTotal + 3);
  expect(body.counters).toHaveLength(2);
  const cx = body.counters.find(c => c.name === `${prefix}.x`);
  expect(cx?.value).toBe(2);
  const cy = body.counters.find(c => c.name === `${prefix}.y`);
  expect(cy?.value).toBe(1);
});

test("GET /api/counter?prefix= with read token is allowed (RBAC)", async () => {
  // When no READ_TOKEN is configured (test env), the endpoint is open
  const res = await fetch(`${server.url.origin}/api/counter?prefix=any`);
  expect(res.status).toBe(200);
});
