import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { setupCounter, getCounterValue, handleCounterPost } from "../src/counter";

let db: Database;

function makePostRequest(body?: unknown, contentType = "application/json"): Request {
  if (body === undefined) {
    return new Request("http://localhost/api/counter", { method: "POST" });
  }
  return new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  db = new Database(":memory:");
  setupCounter(db);
});

afterEach(() => {
  db.close();
});

// --- GET helper ---

test("GET returns initial count of 0", () => {
  expect(getCounterValue(db)).toBe(0);
});

// --- Happy paths ---

test("POST with no body increments by 1", async () => {
  const res = await handleCounterPost(makePostRequest(), db);
  expect(res.status).toBe(200);
  const json = await res.json() as { count: number };
  expect(json.count).toBe(1);
});

test("POST with empty body increments by 1", async () => {
  const res = await handleCounterPost(
    new Request("http://localhost/api/counter", { method: "POST", body: "" }),
    db
  );
  expect(res.status).toBe(200);
  const json = await res.json() as { count: number };
  expect(json.count).toBe(1);
});

test("POST with {} increments by 1 (default)", async () => {
  const res = await handleCounterPost(makePostRequest({}), db);
  expect(res.status).toBe(200);
  const json = await res.json() as { count: number };
  expect(json.count).toBe(1);
});

test("POST with { increment: 5 } increments by 5", async () => {
  const res = await handleCounterPost(makePostRequest({ increment: 5 }), db);
  expect(res.status).toBe(200);
  const json = await res.json() as { count: number };
  expect(json.count).toBe(5);
});

test("POST with { increment: 0 } is valid (no-op increment)", async () => {
  const res = await handleCounterPost(makePostRequest({ increment: 0 }), db);
  expect(res.status).toBe(200);
  const json = await res.json() as { count: number };
  expect(json.count).toBe(0);
});

// --- 400 paths ---

test("POST with non-JSON content-type and body returns 400", async () => {
  const res = await handleCounterPost(
    new Request("http://localhost/api/counter", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not json",
    }),
    db
  );
  expect(res.status).toBe(400);
  const json = await res.json() as { error: string };
  expect(typeof json.error).toBe("string");
});

test("POST with malformed JSON returns 400", async () => {
  const res = await handleCounterPost(
    new Request("http://localhost/api/counter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad json}",
    }),
    db
  );
  expect(res.status).toBe(400);
  const json = await res.json() as { error: string };
  expect(typeof json.error).toBe("string");
});

test("POST with JSON array returns 400", async () => {
  const res = await handleCounterPost(makePostRequest([1, 2, 3]), db);
  expect(res.status).toBe(400);
});

test("POST with JSON string returns 400", async () => {
  const res = await handleCounterPost(
    new Request("http://localhost/api/counter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '"just a string"',
    }),
    db
  );
  expect(res.status).toBe(400);
});

test("POST with negative increment returns 400", async () => {
  const res = await handleCounterPost(makePostRequest({ increment: -1 }), db);
  expect(res.status).toBe(400);
  const json = await res.json() as { error: string };
  expect(typeof json.error).toBe("string");
});

test("POST with float increment returns 400", async () => {
  const res = await handleCounterPost(makePostRequest({ increment: 1.5 }), db);
  expect(res.status).toBe(400);
  const json = await res.json() as { error: string };
  expect(typeof json.error).toBe("string");
});

test("POST with string increment returns 400", async () => {
  const res = await handleCounterPost(makePostRequest({ increment: "5" }), db);
  expect(res.status).toBe(400);
  const json = await res.json() as { error: string };
  expect(typeof json.error).toBe("string");
});

test("successive increments accumulate", async () => {
  await handleCounterPost(makePostRequest({ increment: 3 }), db);
  await handleCounterPost(makePostRequest({ increment: 7 }), db);
  expect(getCounterValue(db)).toBe(10);
});
