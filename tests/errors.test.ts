import { test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { createRBAC } from "../src/auth";
import { createRateLimiter } from "../src/rate-limit";
import { handleCounterPost, setupCounter } from "../src/counter";
import { createServer } from "../src/index";

// --- Auth: structured error codes ---

test("RBAC unauthorized response has code UNAUTHORIZED", async () => {
  const { requireWrite } = createRBAC("secret", undefined);
  const req = new Request("http://localhost/api/counter", { method: "POST" });
  const res = requireWrite(req)!;
  expect(res.status).toBe(401);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("UNAUTHORIZED");
});

test("RBAC forbidden response has code FORBIDDEN", async () => {
  const { requireWrite } = createRBAC("secret", undefined);
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { Authorization: "Bearer wrong" },
  });
  const res = requireWrite(req)!;
  expect(res.status).toBe(403);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("FORBIDDEN");
});

test("RBAC unauthorized response body has code UNAUTHORIZED", async () => {
  const { requireRead } = createRBAC("w", "r");
  const req = new Request("http://localhost/api/counter", { method: "GET" });
  const res = requireRead(req)!;
  expect(res.status).toBe(401);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("UNAUTHORIZED");
});

// --- Rate limiter: structured error codes ---

test("rate limiter 429 response has code TOO_MANY_REQUESTS", async () => {
  const check = createRateLimiter({ max: 1, windowMs: 10_000 });
  check("1.2.3.4");
  const res = check("1.2.3.4")!;
  expect(res.status).toBe(429);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("TOO_MANY_REQUESTS");
});

// --- Counter POST: structured error codes ---

test("counter POST non-JSON content-type returns INVALID_CONTENT_TYPE", async () => {
  const db = new Database(":memory:");
  setupCounter(db);
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "not json",
  });
  const { response: res } = await handleCounterPost(req, db);
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_CONTENT_TYPE");
  db.close();
});

test("counter POST malformed JSON returns INVALID_JSON", async () => {
  const db = new Database(":memory:");
  setupCounter(db);
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad}",
  });
  const { response: res } = await handleCounterPost(req, db);
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_JSON");
  db.close();
});

test("counter POST non-object body returns INVALID_BODY", async () => {
  const db = new Database(":memory:");
  setupCounter(db);
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "[1,2]",
  });
  const { response: res } = await handleCounterPost(req, db);
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_BODY");
  db.close();
});

test("counter POST invalid increment returns INVALID_INCREMENT", async () => {
  const db = new Database(":memory:");
  setupCounter(db);
  const req = new Request("http://localhost/api/counter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ increment: -5 }),
  });
  const { response: res } = await handleCounterPost(req, db);
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_INCREMENT");
  db.close();
});

// --- Integration: webhook and counter-reset error codes ---

const TEST_TOKEN = "err-test-token";
let server: ReturnType<typeof createServer>;
let origin: string;
let savedToken: string | undefined;

beforeAll(() => {
  savedToken = process.env.API_TOKEN;
  process.env.API_TOKEN = TEST_TOKEN;
  server = createServer(0);
  origin = server.url.origin;
});

afterAll(async () => {
  if (savedToken === undefined) delete process.env.API_TOKEN;
  else process.env.API_TOKEN = savedToken;
  await server.stop();
});

test("POST /api/counter/:name/reset on non-existent counter returns COUNTER_NOT_FOUND", async () => {
  const res = await fetch(`${origin}/api/counter/no-such-counter/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(404);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("COUNTER_NOT_FOUND");
});

test("POST /api/webhook/:name with invalid JSON returns INVALID_JSON", async () => {
  const res = await fetch(`${origin}/api/webhook/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: "not-json",
  });
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_JSON");
});

test("POST /api/webhook/:name without url returns MISSING_FIELD", async () => {
  const res = await fetch(`${origin}/api/webhook/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("MISSING_FIELD");
});

test("POST /api/webhook/:name with non-string url returns INVALID_URL", async () => {
  const res = await fetch(`${origin}/api/webhook/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TEST_TOKEN}` },
    body: JSON.stringify({ url: 123 }),
  });
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_URL");
});

test("POST /api/webhook/:name with invalid URL returns INVALID_URL", async () => {
  const res = await fetch(`${origin}/api/webhook/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ url: "not-a-url" }),
  });
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_URL");
});

test("POST /api/webhook/:name with non-http URL returns INVALID_URL_SCHEME", async () => {
  const res = await fetch(`${origin}/api/webhook/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
    body: JSON.stringify({ url: "ftp://example.com/hook" }),
  });
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("INVALID_URL_SCHEME");
});

test("DELETE /api/webhook/:name on unknown counter returns WEBHOOK_NOT_FOUND", async () => {
  const res = await fetch(`${origin}/api/webhook/no-such-webhook-xyz`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  expect(res.status).toBe(404);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("WEBHOOK_NOT_FOUND");
});

test("401 response from auth includes code UNAUTHORIZED", async () => {
  const res = await fetch(`${origin}/api/counter`, { method: "POST" });
  expect(res.status).toBe(401);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("UNAUTHORIZED");
});

test("403 response from auth includes code FORBIDDEN", async () => {
  const res = await fetch(`${origin}/api/counter`, {
    method: "POST",
    headers: { Authorization: "Bearer wrongtoken" },
  });
  expect(res.status).toBe(403);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("FORBIDDEN");
});

test("GET /ws without Upgrade header returns WEBSOCKET_UPGRADE_FAILED", async () => {
  const res = await fetch(`${origin}/ws`);
  expect(res.status).toBe(400);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("WEBSOCKET_UPGRADE_FAILED");
});
