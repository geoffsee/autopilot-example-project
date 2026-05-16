import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createServer } from "../src/index";
import { resetMetrics } from "../src/metrics";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

beforeEach(() => {
  resetMetrics();
});

test("GET /api/metrics returns 200 with required JSON fields", async () => {
  const res = await fetch(`${baseUrl}/api/metrics`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(typeof body.requestCount).toBe("number");
  expect(typeof body.errorCount).toBe("number");
  expect(typeof body.p50Ms).toBe("number");
  expect(typeof body.p95Ms).toBe("number");
  expect(typeof body.uptimeSeconds).toBe("number");
});

test("requestCount increments after a request to another endpoint", async () => {
  await fetch(`${baseUrl}/api/hello`);
  const res = await fetch(`${baseUrl}/api/metrics`);
  const body = (await res.json()) as { requestCount: number };
  expect(body.requestCount).toBeGreaterThanOrEqual(1);
});

test("errorCount increments after a 4xx response", async () => {
  await fetch(`${baseUrl}/api/counter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ increment: -1 }),
  });
  const res = await fetch(`${baseUrl}/api/metrics`);
  const body = (await res.json()) as { errorCount: number };
  expect(body.errorCount).toBeGreaterThanOrEqual(1);
});

test("p50Ms and p95Ms are non-negative numbers", async () => {
  await fetch(`${baseUrl}/api/hello`);
  await fetch(`${baseUrl}/api/hello`);
  const res = await fetch(`${baseUrl}/api/metrics`);
  const body = (await res.json()) as { p50Ms: number; p95Ms: number };
  expect(body.p50Ms).toBeGreaterThanOrEqual(0);
  expect(body.p95Ms).toBeGreaterThanOrEqual(0);
});

test("uptimeSeconds is a non-negative integer", async () => {
  const res = await fetch(`${baseUrl}/api/metrics`);
  const body = (await res.json()) as { uptimeSeconds: number };
  expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(body.uptimeSeconds)).toBe(true);
});
