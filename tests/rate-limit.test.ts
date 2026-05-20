import { test, expect } from "bun:test";
import { createRateLimiter } from "../src/rate-limit";

test("under limit: all requests within limit return null (allowed)", () => {
  const check = createRateLimiter({ max: 3, windowMs: 10_000 });
  expect(check("1.2.3.4")).toBeNull();
  expect(check("1.2.3.4")).toBeNull();
  expect(check("1.2.3.4")).toBeNull();
});

test("at limit: exceeding the limit returns 429 with Retry-After header", () => {
  const check = createRateLimiter({ max: 2, windowMs: 10_000 });
  expect(check("1.2.3.4")).toBeNull();
  expect(check("1.2.3.4")).toBeNull();
  const res = check("1.2.3.4");
  expect(res).not.toBeNull();
  expect(res!.status).toBe(429);
  const retryAfter = Number(res!.headers.get("Retry-After"));
  expect(retryAfter).toBeGreaterThan(0);
});

test("window reset: after window expires, requests are allowed again", () => {
  const check = createRateLimiter({ max: 2, windowMs: 1_000 });
  const now = Date.now();
  expect(check("1.2.3.4", now)).toBeNull();
  expect(check("1.2.3.4", now)).toBeNull();
  expect(check("1.2.3.4", now)?.status).toBe(429);
  expect(check("1.2.3.4", now + 1_001)).toBeNull();
});

test("different IPs have independent rate limits", () => {
  const check = createRateLimiter({ max: 1, windowMs: 10_000 });
  expect(check("1.2.3.4")).toBeNull();
  expect(check("1.2.3.4")?.status).toBe(429);
  expect(check("5.6.7.8")).toBeNull();
});

test("Retry-After is the ceiling of seconds until the window resets", () => {
  const check = createRateLimiter({ max: 1, windowMs: 5_000 });
  const now = 1_000_000;
  check("1.2.3.4", now);
  const res = check("1.2.3.4", now + 1);
  expect(res?.status).toBe(429);
  expect(res?.headers.get("Retry-After")).toBe("5");
});
