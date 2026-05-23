import { expect, test, beforeAll, afterAll } from "bun:test";
import { createServer } from "../src/index";
import { setLogHook } from "../src/logger";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(() => {
  server.stop(true);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test("GET /api/health includes X-Request-ID header", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
});

test("GET /api/hello includes X-Request-ID header", async () => {
  const res = await fetch(`${baseUrl}/api/hello`);
  expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
});

test("GET /api/counter includes X-Request-ID header", async () => {
  const res = await fetch(`${baseUrl}/api/counter`);
  expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
});

test("POST /api/counter includes X-Request-ID header", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
});

test("GET /metrics includes X-Request-ID header", async () => {
  const res = await fetch(`${baseUrl}/metrics`);
  expect(res.headers.get("x-request-id")).toMatch(UUID_RE);
});

test("caller-provided X-Request-ID is echoed back", async () => {
  const customId = "caller-provided-id-12345";
  const res = await fetch(`${baseUrl}/api/health`, {
    headers: { "x-request-id": customId },
  });
  expect(res.headers.get("x-request-id")).toBe(customId);
});

test("caller-provided X-Request-ID is echoed on POST /api/counter", async () => {
  const customId = "my-request-id-abc";
  const res = await fetch(`${baseUrl}/api/counter`, {
    method: "POST",
    headers: { "x-request-id": customId },
  });
  expect(res.headers.get("x-request-id")).toBe(customId);
});

test("log correlation: request_id appears in structured log for webhook registration", async () => {
  const captured: string[] = [];
  setLogHook((line) => captured.push(line));

  const requestId = "log-correlation-test-id-789";
  await fetch(`${baseUrl}/api/webhook/log-test-counter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({ url: "http://example.com/webhook" }),
  });

  setLogHook(null);

  const logLine = captured.find((l) => {
    try {
      const parsed = JSON.parse(l) as Record<string, unknown>;
      return parsed.msg === "webhook.registered";
    } catch {
      return false;
    }
  });

  expect(logLine).toBeDefined();
  const parsed = JSON.parse(logLine!) as Record<string, unknown>;
  expect(parsed.request_id).toBe(requestId);
});
