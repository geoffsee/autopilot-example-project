import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { RateLimiter } from "../src/rate-limiter";
import { createServer } from "../src/index";

// --- Unit tests ---

describe("RateLimiter unit", () => {
  test("allows requests within limit", () => {
    const rl = new RateLimiter(3);
    expect(rl.check("1.2.3.4")).toBe(true);
    expect(rl.check("1.2.3.4")).toBe(true);
    expect(rl.check("1.2.3.4")).toBe(true);
  });

  test("blocks request that exceeds limit", () => {
    const rl = new RateLimiter(3);
    rl.check("1.2.3.4");
    rl.check("1.2.3.4");
    rl.check("1.2.3.4");
    expect(rl.check("1.2.3.4")).toBe(false);
  });

  test("tracks different IPs independently", () => {
    const rl = new RateLimiter(1);
    expect(rl.check("1.1.1.1")).toBe(true);
    expect(rl.check("2.2.2.2")).toBe(true);
    expect(rl.check("1.1.1.1")).toBe(false);
    expect(rl.check("2.2.2.2")).toBe(false);
  });

  test("remaining decrements after each allowed request", () => {
    const rl = new RateLimiter(5);
    expect(rl.remaining("1.2.3.4")).toBe(5);
    rl.check("1.2.3.4");
    expect(rl.remaining("1.2.3.4")).toBe(4);
    rl.check("1.2.3.4");
    expect(rl.remaining("1.2.3.4")).toBe(3);
  });

  test("remaining is 0 when limit exhausted", () => {
    const rl = new RateLimiter(2);
    rl.check("1.2.3.4");
    rl.check("1.2.3.4");
    expect(rl.remaining("1.2.3.4")).toBe(0);
  });

  test("window resets after windowMs elapses", async () => {
    const rl = new RateLimiter(1, 50);
    expect(rl.check("1.2.3.4")).toBe(true);
    expect(rl.check("1.2.3.4")).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(rl.check("1.2.3.4")).toBe(true);
  });

  test("resetAt returns a future unix timestamp", () => {
    const rl = new RateLimiter(2);
    rl.check("1.2.3.4");
    const now = Math.floor(Date.now() / 1000);
    expect(rl.resetAt("1.2.3.4")).toBeGreaterThan(now);
  });
});

// --- Integration tests (HTTP) ---

describe("POST /api/counter rate limiting HTTP", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(() => {
    process.env.COUNTER_RATE_LIMIT = "3";
    server = createServer(0);
    baseUrl = server.url.origin;
  });

  afterAll(async () => {
    await server.stop();
    delete process.env.COUNTER_RATE_LIMIT;
  });

  test("successful POST includes X-RateLimit headers", async () => {
    const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res.headers.get("X-RateLimit-Remaining")).not.toBeNull();
    expect(res.headers.get("X-RateLimit-Reset")).not.toBeNull();
  });

  test("exceeding limit returns 429 with Retry-After and X-RateLimit-* headers", async () => {
    let got429 = false;
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
      if (res.status === 429) {
        got429 = true;
        expect(res.headers.get("Retry-After")).not.toBeNull();
        expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
        expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
        expect(res.headers.get("X-RateLimit-Reset")).not.toBeNull();
        const body = (await res.json()) as { error: string };
        expect(typeof body.error).toBe("string");
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
