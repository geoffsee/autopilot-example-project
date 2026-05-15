import { expect, test, beforeAll, afterAll } from "bun:test";
import { serve } from "bun";
import { createCounterDb, getCount, increment } from "../src/counter";

// Unit tests for counter DB functions
test("getCount returns 0 on fresh in-memory DB", () => {
  const db = createCounterDb(":memory:");
  expect(getCount(db)).toBe(0);
  db.close();
});

test("increment increases count by 1 each time", () => {
  const db = createCounterDb(":memory:");
  expect(increment(db)).toBe(1);
  expect(increment(db)).toBe(2);
  expect(increment(db)).toBe(3);
  db.close();
});

// HTTP integration tests
let baseUrl: string;
let server: ReturnType<typeof serve>;

beforeAll(() => {
  const db = createCounterDb(":memory:");

  server = serve({
    port: 0,
    routes: {
      "/api/counter": {
        GET(_req) {
          return Response.json({ count: getCount(db) });
        },
        POST(_req) {
          const count = increment(db);
          return Response.json({ count }, { status: 200 });
        },
      },
    },
  });

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
});

test("GET /api/counter returns { count: 0 } initially", async () => {
  const res = await fetch(`${baseUrl}/api/counter`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ count: 0 });
});

test("POST /api/counter increments count", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ count: 1 });
});

test("GET /api/counter reflects incremented count", async () => {
  const res = await fetch(`${baseUrl}/api/counter`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ count: 1 });
});

test("POST /api/counter increments again", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ count: 2 });
});
