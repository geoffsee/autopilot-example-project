import { test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { setupNamedCounters, getNamedCounter, incrementNamedCounter } from "../src/counter";
import { createServer } from "../src/index";

function makeDb() {
  const db = new Database(":memory:");
  setupNamedCounters(db);
  return db;
}

test("getNamedCounter creates counter at 0 if absent", () => {
  const db = makeDb();
  try {
    expect(getNamedCounter(db, "foo")).toEqual({ name: "foo", value: 0 });
  } finally {
    db.close();
  }
});

test("incrementNamedCounter increments the named counter and returns updated value", () => {
  const db = makeDb();
  try {
    expect(incrementNamedCounter(db, "foo")).toEqual({ name: "foo", value: 1 });
    expect(incrementNamedCounter(db, "foo")).toEqual({ name: "foo", value: 2 });
  } finally {
    db.close();
  }
});

test("named counters are isolated: incrementing one does not affect another", () => {
  const db = makeDb();
  try {
    incrementNamedCounter(db, "foo");
    incrementNamedCounter(db, "foo");
    incrementNamedCounter(db, "bar");
    expect(getNamedCounter(db, "foo")).toEqual({ name: "foo", value: 2 });
    expect(getNamedCounter(db, "bar")).toEqual({ name: "bar", value: 1 });
  } finally {
    db.close();
  }
});

// Integration test: history route still works after named-counter migration
let server: ReturnType<typeof createServer>;

beforeAll(() => {
  server = createServer(0);
});

afterAll(async () => {
  await server.stop();
});

test("GET /api/counter/history still works after named-counter migration", async () => {
  const res = await fetch(`${server.url.origin}/api/counter/history`);
  expect(res.status).toBe(200);
  const body = await res.json() as { entries: unknown[] };
  expect(Array.isArray(body.entries)).toBe(true);
});

test("POST /api/counter/:name/increment returns 401 without auth", async () => {
  const res = await fetch(`${server.url.origin}/api/counter/hits/increment`, { method: "POST" });
  expect(res.status).toBe(401);
});
