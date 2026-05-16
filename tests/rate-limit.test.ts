import { test, expect, beforeAll, afterAll } from "bun:test";
import { RateLimiter, createRateLimiter, applyRateLimit } from "../src/rate-limit";
import { createServer } from "../src/index";

// --- Unit tests: RateLimiter ---

test("requests below the limit are allowed", () => {
  const limiter = new RateLimiter(3);
  for (let i = 0; i < 3; i++) {
    expect(applyRateLimit(limiter, "1.2.3.4")).toBeNull();
  }
});

test("request exceeding limit returns 429", async () => {
  const limiter = new RateLimiter(3);
  for (let i = 0; i < 3; i++) applyRateLimit(limiter, "1.2.3.4");
  const result = applyRateLimit(limiter, "1.2.3.4");
  expect(result).not.toBeNull();
  expect(result!.status).toBe(429);
  const body = await result!.json() as { error: string };
  expect(typeof body.error).toBe("string");
});

test("rate limit is per-IP — other IPs retain their quota", () => {
  const limiter = new RateLimiter(2);
  for (let i = 0; i < 2; i++) applyRateLimit(limiter, "1.1.1.1");
  // 1.1.1.1 is now rate-limited
  expect(applyRateLimit(limiter, "1.1.1.1")!.status).toBe(429);
  // 2.2.2.2 has a fresh window
  expect(applyRateLimit(limiter, "2.2.2.2")).toBeNull();
});

test("sliding window resets after windowMs expires", async () => {
  const limiter = new RateLimiter(2, 100); // 100 ms window for test speed
  for (let i = 0; i < 2; i++) applyRateLimit(limiter, "1.2.3.4");
  // Should be rate-limited now
  expect(applyRateLimit(limiter, "1.2.3.4")!.status).toBe(429);
  // Wait for the window to expire
  await Bun.sleep(120);
  // Old timestamps have slid out — new request should be allowed
  expect(applyRateLimit(limiter, "1.2.3.4")).toBeNull();
});

test("RATE_LIMIT_RPM env var sets the limit", () => {
  const prev = process.env.RATE_LIMIT_RPM;
  process.env.RATE_LIMIT_RPM = "42";
  const limiter = createRateLimiter();
  expect(limiter.rpm).toBe(42);
  if (prev === undefined) delete process.env.RATE_LIMIT_RPM;
  else process.env.RATE_LIMIT_RPM = prev;
});

test("createRateLimiter defaults to 60 RPM when env var is absent", () => {
  const prev = process.env.RATE_LIMIT_RPM;
  delete process.env.RATE_LIMIT_RPM;
  const limiter = createRateLimiter();
  expect(limiter.rpm).toBe(60);
  if (prev !== undefined) process.env.RATE_LIMIT_RPM = prev;
});

// --- HTTP integration tests ---

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  // rpm=2 so we can trigger a 429 with minimal requests
  server = createServer(0, new RateLimiter(2));
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("POST /api/counter returns 429 after exceeding per-IP rate limit", async () => {
  const headers = { "x-api-key": "dev-secret-key", "Content-Type": "application/json" };
  // Exhaust the quota (rpm=2)
  await fetch(`${baseUrl}/api/counter`, { method: "POST", headers });
  await fetch(`${baseUrl}/api/counter`, { method: "POST", headers });
  // Third request should be rate-limited
  const res = await fetch(`${baseUrl}/api/counter`, { method: "POST", headers });
  expect(res.status).toBe(429);
  const body = await res.json() as { error: string };
  expect(typeof body.error).toBe("string");
});
