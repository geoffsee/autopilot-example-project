import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { createRateLimiter } from "../src/rate-limit";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS _rate_limits (
      ip           TEXT PRIMARY KEY,
      count        INTEGER NOT NULL,
      window_start INTEGER NOT NULL
    )
  `);
  return db;
}

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

test("persistent: throttled client remains throttled after simulated restart", () => {
  const db = makeDb();
  const now = Date.now();

  const limiter1 = createRateLimiter({ max: 2, windowMs: 10_000, db });
  expect(limiter1("10.0.0.1", now)).toBeNull();
  expect(limiter1("10.0.0.1", now)).toBeNull();
  expect(limiter1("10.0.0.1", now)?.status).toBe(429);

  // Simulate restart: new limiter backed by same DB, same window still active
  const limiter2 = createRateLimiter({ max: 2, windowMs: 10_000, db });
  expect(limiter2("10.0.0.1", now)?.status).toBe(429);
});

test("persistent: stale windows are pruned from DB on startup", () => {
  const db = makeDb();
  const windowMs = 1_000;
  const staleStart = Date.now() - windowMs - 100;

  // Pre-seed an entry whose window has already expired
  db.run("INSERT INTO _rate_limits (ip, count, window_start) VALUES (?, ?, ?)",
    ["10.0.0.2", 10, staleStart]);

  // createRateLimiter prunes stale entries on startup
  const limiter = createRateLimiter({ max: 2, windowMs, db });

  // Stale entry is pruned; IP starts a fresh window
  expect(limiter("10.0.0.2")).toBeNull();

  const row = db.query<{ count: number }, []>(
    "SELECT count FROM _rate_limits WHERE ip = '10.0.0.2'"
  ).get();
  expect(row?.count).toBe(1);
});

test("persistent: expired window is cleaned from DB on next access", () => {
  const db = makeDb();
  const windowMs = 1_000;
  const now = Date.now();

  const limiter = createRateLimiter({ max: 2, windowMs, db });
  expect(limiter("10.0.0.3", now)).toBeNull();
  expect(limiter("10.0.0.3", now)).toBeNull();
  expect(limiter("10.0.0.3", now)?.status).toBe(429);

  // After window expires, request is allowed and DB reflects fresh window
  const later = now + windowMs + 1;
  expect(limiter("10.0.0.3", later)).toBeNull();

  const row = db.query<{ count: number; window_start: number }, []>(
    "SELECT count, window_start FROM _rate_limits WHERE ip = '10.0.0.3'"
  ).get();
  expect(row?.count).toBe(1);
  expect(row?.window_start).toBe(later);
});
