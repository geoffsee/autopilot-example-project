import { test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { serve } from "bun";
import {
  setupCounter,
  getCounterValue,
  setupNamedCounters,
  getNamedCount,
  incrementNamedCounter,
  handleNamedCounterPost,
} from "../src/counter";

// --- Unit tests ---

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  setupCounter(db);
  setupNamedCounters(db);
});

afterEach(() => {
  db.close();
});

test("getNamedCount returns 0 for unseen name", () => {
  expect(getNamedCount(db, "foo")).toBe(0);
});

test("getNamedCount returns 0 for any unseen name", () => {
  expect(getNamedCount(db, "widgets")).toBe(0);
  expect(getNamedCount(db, "gadgets")).toBe(0);
});

test("incrementNamedCounter returns incremented value", () => {
  const result = incrementNamedCounter(db, "foo", 1);
  expect(result).toBe(1);
});

test("incrementNamedCounter accumulates across calls", () => {
  incrementNamedCounter(db, "foo", 3);
  incrementNamedCounter(db, "foo", 7);
  expect(getNamedCount(db, "foo")).toBe(10);
});

test("incrementNamedCounter by custom amount", () => {
  const result = incrementNamedCounter(db, "widgets", 5);
  expect(result).toBe(5);
});

test("multi-tenant isolation: foo and bar are independent", () => {
  incrementNamedCounter(db, "foo", 3);
  incrementNamedCounter(db, "bar", 7);
  expect(getNamedCount(db, "foo")).toBe(3);
  expect(getNamedCount(db, "bar")).toBe(7);
});

test("named counter is isolated from default counter", () => {
  incrementNamedCounter(db, "foo", 5);
  expect(getCounterValue(db)).toBe(0);
});

test("handleNamedCounterPost with no body increments by 1", async () => {
  const req = new Request("http://localhost/api/counter/foo", { method: "POST" });
  const { response, count, name } = await handleNamedCounterPost(req, db, "foo");
  expect(response.status).toBe(200);
  expect(count).toBe(1);
  expect(name).toBe("foo");
  const json = await response.json() as { count: number };
  expect(json.count).toBe(1);
});

test("handleNamedCounterPost with { increment: 5 } increments by 5", async () => {
  const req = new Request("http://localhost/api/counter/foo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ increment: 5 }),
  });
  const { response, count, name } = await handleNamedCounterPost(req, db, "foo");
  expect(response.status).toBe(200);
  expect(count).toBe(5);
  expect(name).toBe("foo");
});

test("handleNamedCounterPost with negative increment returns 400", async () => {
  const req = new Request("http://localhost/api/counter/foo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ increment: -1 }),
  });
  const { response } = await handleNamedCounterPost(req, db, "foo");
  expect(response.status).toBe(400);
  expect(response.ok).toBe(false);
});

test("handleNamedCounterPost with non-JSON content-type returns 400", async () => {
  const req = new Request("http://localhost/api/counter/foo", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "not json",
  });
  const { response } = await handleNamedCounterPost(req, db, "foo");
  expect(response.status).toBe(400);
});

test("handleNamedCounterPost isolates counters across names", async () => {
  const makeReq = (name: string) =>
    new Request(`http://localhost/api/counter/${name}`, { method: "POST" });

  await handleNamedCounterPost(makeReq("alice"), db, "alice");
  await handleNamedCounterPost(makeReq("alice"), db, "alice");
  await handleNamedCounterPost(makeReq("bob"), db, "bob");

  expect(getNamedCount(db, "alice")).toBe(2);
  expect(getNamedCount(db, "bob")).toBe(1);
});

// --- HTTP integration tests ---

let server: ReturnType<typeof serve>;
let baseUrl: string;
let integDb: Database;

beforeAll(() => {
  integDb = new Database(":memory:");
  setupCounter(integDb);
  setupNamedCounters(integDb);

  server = serve({
    port: 0,
    routes: {
      "/api/counter/:name": {
        GET(req) {
          return Response.json({ count: getNamedCount(integDb, req.params.name) });
        },
        async POST(req, srv) {
          const { response, count, name } = await handleNamedCounterPost(
            req,
            integDb,
            req.params.name
          );
          if (response.ok && typeof count === "number" && name !== undefined) {
            srv.publish("counter", JSON.stringify({ type: "counter", name, count }));
          }
          return response;
        },
      },
      "/ws": (req, srv) => {
        if (srv.upgrade(req)) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      },
    },
    websocket: {
      open(ws) { ws.subscribe("counter"); },
      message() {},
      close(ws) { ws.unsubscribe("counter"); },
    },
  });

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
  integDb.close();
});

test("GET /api/counter/:name returns 0 initially", async () => {
  const res = await fetch(`${baseUrl}/api/counter/widgets`);
  expect(res.status).toBe(200);
  const body = await res.json() as { count: number };
  expect(body.count).toBe(0);
});

test("POST /api/counter/:name increments the named counter", async () => {
  const res = await fetch(`${baseUrl}/api/counter/gadgets`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = await res.json() as { count: number };
  expect(body.count).toBe(1);
});

test("GET /api/counter/:name reflects previous increments", async () => {
  await fetch(`${baseUrl}/api/counter/clicks`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/clicks`, { method: "POST" });
  const res = await fetch(`${baseUrl}/api/counter/clicks`);
  const body = await res.json() as { count: number };
  expect(body.count).toBe(2);
});

test("named counters with different names are isolated via HTTP", async () => {
  await fetch(`${baseUrl}/api/counter/alpha`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/alpha`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/beta`, { method: "POST" });

  const alphaRes = await fetch(`${baseUrl}/api/counter/alpha`);
  const betaRes = await fetch(`${baseUrl}/api/counter/beta`);

  const alpha = await alphaRes.json() as { count: number };
  const beta = await betaRes.json() as { count: number };

  expect(alpha.count).toBe(2);
  expect(beta.count).toBe(1);
});

test("WebSocket broadcast from POST /api/counter/:name includes name and count", async () => {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  const msgPromise = new Promise<{ type: string; name: string; count: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for WS message")), 3000);
    ws.onmessage = (e) => {
      clearTimeout(t);
      resolve(JSON.parse(e.data as string));
    };
  });

  const postRes = await fetch(`${baseUrl}/api/counter/wstest`, { method: "POST" });
  const { count } = await postRes.json() as { count: number };

  const msg = await msgPromise;
  expect(msg).toEqual({ type: "counter", name: "wstest", count });

  ws.close();
});
