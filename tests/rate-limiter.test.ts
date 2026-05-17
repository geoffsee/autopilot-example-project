import { test, expect, beforeAll, afterAll } from "bun:test";
import { RateLimiter } from "../src/rate-limiter";
import { createServer } from "../src/index";

// --- Unit tests for RateLimiter ---

test("allows up to rps requests from same IP before blocking", () => {
  let t = 0;
  const limiter = new RateLimiter(3, () => t);

  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(false); // 4th request blocked
});

test("different IPs have separate buckets", () => {
  let t = 0;
  const limiter = new RateLimiter(1, () => t);

  expect(limiter.check("1.1.1.1")).toBe(true);
  expect(limiter.check("2.2.2.2")).toBe(true);
  expect(limiter.check("1.1.1.1")).toBe(false);
  expect(limiter.check("2.2.2.2")).toBe(false);
});

test("tokens replenish after elapsed time", () => {
  let t = 0;
  const limiter = new RateLimiter(2, () => t);

  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(false);

  t = 1000; // 1 second later — 2 tokens replenished
  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(false);
});

test("tokens do not exceed rps cap", () => {
  let t = 0;
  const limiter = new RateLimiter(2, () => t);

  // exhaust bucket
  limiter.check("1.2.3.4");
  limiter.check("1.2.3.4");

  t = 10_000; // 10 seconds — but cap is still 2
  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(true);
  expect(limiter.check("1.2.3.4")).toBe(false);
});

// --- Integration tests via HTTP ---

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0, new RateLimiter(2));
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("POST /api/counter returns 429 when burst exceeds rate limit", async () => {
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/counter`, { method: "POST" })
    )
  );
  const statuses = responses.map((r) => r.status);
  expect(statuses.some((s) => s === 429)).toBe(true);
});

test("GET /api/counter is not rate limited", async () => {
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => fetch(`${baseUrl}/api/counter`))
  );
  expect(responses.every((r) => r.status === 200)).toBe(true);
});
