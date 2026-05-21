import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { setupNamedCounters, incrementNamedCounter } from "../src/counter";
import { handleMetricsGet, trackRequest, resetRequestCounts } from "../src/metrics";
import { createRateLimiter } from "../src/rate-limit";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  setupNamedCounters(db);
  resetRequestCounts();
});

afterEach(() => {
  try { db.close(); } catch { /* already closed */ }
});

test("GET /metrics returns 200 with content-type text/plain; version=0.0.4", () => {
  const res = handleMetricsGet(db);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4");
});

test("GET /metrics body contains valid Prometheus format with HELP, TYPE, and metric lines", async () => {
  const res = handleMetricsGet(db);
  const text = await res.text();
  expect(text).toContain("# HELP counter_value");
  expect(text).toContain("# TYPE counter_value gauge");
  expect(text).toContain("# HELP http_requests_total");
  expect(text).toContain("# TYPE http_requests_total counter");
  expect(text).toContain("# HELP process_uptime_seconds");
  expect(text).toContain("# TYPE process_uptime_seconds gauge");
  expect(text).toMatch(/^process_uptime_seconds \d/m);
});

test("counter_value reflects named counter value after increment", async () => {
  incrementNamedCounter(db, "hits");
  incrementNamedCounter(db, "hits");
  incrementNamedCounter(db, "hits");
  incrementNamedCounter(db, "misses");
  const res = handleMetricsGet(db);
  const text = await res.text();
  expect(text).toContain('counter_value{name="hits"} 3');
  expect(text).toContain('counter_value{name="misses"} 1');
});

test("http_requests_total reflects tracked request counts per route and method", async () => {
  trackRequest("/api/counter", "GET");
  trackRequest("/api/counter", "GET");
  trackRequest("/api/health", "GET");
  const res = handleMetricsGet(db);
  const text = await res.text();
  expect(text).toContain('http_requests_total{route="/api/counter",method="GET"} 2');
  expect(text).toContain('http_requests_total{route="/api/health",method="GET"} 1');
});

test("process_uptime_seconds is a non-negative number that increases over time", async () => {
  const res1 = handleMetricsGet(db);
  const text1 = await res1.text();
  const match1 = text1.match(/^process_uptime_seconds (\d+\.?\d*)/m);
  expect(match1).not.toBeNull();
  const uptime1 = parseFloat(match1![1]);
  expect(uptime1).toBeGreaterThanOrEqual(0);

  await Bun.sleep(20);

  const res2 = handleMetricsGet(db);
  const text2 = await res2.text();
  const match2 = text2.match(/^process_uptime_seconds (\d+\.?\d*)/m);
  expect(match2).not.toBeNull();
  const uptime2 = parseFloat(match2![1]);
  expect(uptime2).toBeGreaterThanOrEqual(uptime1);
});

test("rate_limit_active_clients gauge appears in metrics output", async () => {
  const res = handleMetricsGet(db);
  const text = await res.text();
  expect(text).toContain("# HELP rate_limit_active_clients");
  expect(text).toContain("# TYPE rate_limit_active_clients gauge");
  expect(text).toMatch(/^rate_limit_active_clients \d+/m);
});

test("rate_limit_active_clients reflects current tracked client count", async () => {
  const limiter = createRateLimiter({ max: 5, windowMs: 5000 });
  limiter("1.2.3.4");
  limiter("5.6.7.8");

  const res = handleMetricsGet(db, limiter);
  const text = await res.text();
  expect(text).toContain("rate_limit_active_clients 2");
});
