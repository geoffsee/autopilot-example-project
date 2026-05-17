import { test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createCounterDb,
  setupNamedCounters,
  getNamedCount,
  incrementNamedCounter,
  resetNamedCounter,
  handleNamedCounterPost,
} from "../src/counter";
import { createServer } from "../src/index";

// --- Unit tests ---

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  setupNamedCounters(db);
});

afterEach(() => {
  db.close();
});

test("getNamedCount returns 0 for a new counter name", () => {
  expect(getNamedCount(db, "foo")).toBe(0);
  expect(getNamedCount(db, "bar")).toBe(0);
});

test("incrementNamedCounter starts at 0 and increments", () => {
  expect(incrementNamedCounter(db, "foo", 1)).toBe(1);
  expect(incrementNamedCounter(db, "foo", 3)).toBe(4);
});

test("named counters are independent", () => {
  incrementNamedCounter(db, "foo", 5);
  incrementNamedCounter(db, "bar", 2);
  expect(getNamedCount(db, "foo")).toBe(5);
  expect(getNamedCount(db, "bar")).toBe(2);
});

test("resetNamedCounter sets counter to 0 and returns 0", () => {
  incrementNamedCounter(db, "foo", 10);
  expect(resetNamedCounter(db, "foo")).toBe(0);
  expect(getNamedCount(db, "foo")).toBe(0);
});

test("resetNamedCounter on foo does not affect bar", () => {
  incrementNamedCounter(db, "foo", 5);
  incrementNamedCounter(db, "bar", 3);
  resetNamedCounter(db, "foo");
  expect(getNamedCount(db, "bar")).toBe(3);
});

function makeNamedPostRequest(name: string, body?: unknown, contentType = "application/json"): Request {
  if (body === undefined) {
    return new Request(`http://localhost/api/counter/${name}`, { method: "POST" });
  }
  return new Request(`http://localhost/api/counter/${name}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("handleNamedCounterPost increments by 1 with no body", async () => {
  const { response, count } = await handleNamedCounterPost(makeNamedPostRequest("foo"), db, "foo");
  expect(response.status).toBe(200);
  expect(count).toBe(1);
  const json = (await response.json()) as { name: string; count: number };
  expect(json.name).toBe("foo");
  expect(json.count).toBe(1);
});

test("handleNamedCounterPost increments by custom amount", async () => {
  const { response, count } = await handleNamedCounterPost(
    makeNamedPostRequest("foo", { increment: 5 }),
    db,
    "foo"
  );
  expect(response.status).toBe(200);
  expect(count).toBe(5);
  const json = (await response.json()) as { name: string; count: number };
  expect(json.count).toBe(5);
});

test("handleNamedCounterPost: two named counters are independent", async () => {
  await handleNamedCounterPost(makeNamedPostRequest("foo", { increment: 3 }), db, "foo");
  await handleNamedCounterPost(makeNamedPostRequest("bar", { increment: 7 }), db, "bar");
  expect(getNamedCount(db, "foo")).toBe(3);
  expect(getNamedCount(db, "bar")).toBe(7);
});

test("handleNamedCounterPost returns 400 for invalid increment", async () => {
  const { response } = await handleNamedCounterPost(
    makeNamedPostRequest("foo", { increment: -1 }),
    db,
    "foo"
  );
  expect(response.status).toBe(400);
});

test("handleNamedCounterPost returns 400 for non-integer increment", async () => {
  const { response } = await handleNamedCounterPost(
    makeNamedPostRequest("foo", { increment: 1.5 }),
    db,
    "foo"
  );
  expect(response.status).toBe(400);
});

test("handleNamedCounterPost returns 400 for increment exceeding 1000000", async () => {
  const { response } = await handleNamedCounterPost(
    makeNamedPostRequest("foo", { increment: 1_000_001 }),
    db,
    "foo"
  );
  expect(response.status).toBe(400);
});

// --- Integration tests ---

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0, createCounterDb(":memory:"));
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop(true);
});

test("GET /api/counter/:name returns 200 with name and count=0", async () => {
  const res = await fetch(`${baseUrl}/api/counter/mytest`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; count: number };
  expect(body.name).toBe("mytest");
  expect(body.count).toBe(0);
});

test("POST /api/counter/:name increments the named counter", async () => {
  const res = await fetch(`${baseUrl}/api/counter/named1`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; count: number };
  expect(body.name).toBe("named1");
  expect(body.count).toBe(1);
});

test("GET /api/counter/:name reflects incremented value", async () => {
  await fetch(`${baseUrl}/api/counter/named2`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/named2`, { method: "POST" });
  const res = await fetch(`${baseUrl}/api/counter/named2`);
  const body = (await res.json()) as { name: string; count: number };
  expect(body.count).toBe(2);
});

test("multiple named counters are independent", async () => {
  await fetch(`${baseUrl}/api/counter/alpha99`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/alpha99`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/beta99`, { method: "POST" });

  const alphaRes = await fetch(`${baseUrl}/api/counter/alpha99`);
  const betaRes = await fetch(`${baseUrl}/api/counter/beta99`);

  const alpha = (await alphaRes.json()) as { count: number };
  const beta = (await betaRes.json()) as { count: number };

  expect(alpha.count).toBe(2);
  expect(beta.count).toBe(1);
});

test("GET /api/counter/default returns a valid named counter", async () => {
  const res = await fetch(`${baseUrl}/api/counter/default`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { name: string; count: number };
  expect(body.name).toBe("default");
  expect(typeof body.count).toBe("number");
});

test("existing GET /api/counter route still works (backwards compat)", async () => {
  const res = await fetch(`${baseUrl}/api/counter`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe("number");
});

test("POST /api/counter/:name broadcasts counter update with name over WebSocket", async () => {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  // Install a single handler that first waits for activity_history, then captures the counter broadcast.
  // Setting it up before the fetch eliminates the race window between the two assignments.
  let activityHistorySeen = false;
  const msgPromise = new Promise<{ type: string; name: string; count: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for WS broadcast")), 3000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as { type: string; name?: string; count: number };
      if (msg.type === "activity_history") {
        activityHistorySeen = true;
        return;
      }
      if (activityHistorySeen && msg.type === "counter" && msg.name !== undefined) {
        clearTimeout(t);
        resolve(msg as { type: string; name: string; count: number });
      }
    };
  });

  await fetch(`${baseUrl}/api/counter/wstest`, { method: "POST" });

  const msg = await msgPromise;
  expect(msg.type).toBe("counter");
  expect(msg.name).toBe("wstest");
  expect(typeof msg.count).toBe("number");

  await new Promise<void>((resolve) => { ws.onclose = () => resolve(); ws.close(); });
});
