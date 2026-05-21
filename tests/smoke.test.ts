import { beforeAll, afterAll, test, expect } from "bun:test";
import { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("GET /api/hello returns { message: string }", async () => {
  const res = await fetch(`${baseUrl}/api/hello`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: string; method: string };
  expect(body.message).toBe("Hello, world!");
  expect(body.method).toBe("GET");
});

test("PUT /api/hello returns { message: string }", async () => {
  const res = await fetch(`${baseUrl}/api/hello`, { method: "PUT" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: string; method: string };
  expect(body.message).toBe("Hello, world!");
  expect(body.method).toBe("PUT");
});

test("GET /api/hello/:name returns greeting for name", async () => {
  const res = await fetch(`${baseUrl}/api/hello/caretta`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("Hello, caretta!");
});

test("GET /metrics returns 200 with Prometheus text format", async () => {
  const res = await fetch(`${baseUrl}/metrics`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4");
  const text = await res.text();
  expect(text).toContain("# HELP http_requests_total");
  expect(text).toContain("# TYPE http_requests_total counter");
  expect(text).toMatch(/^http_requests_total\{/m);
  expect(text).toContain("# HELP process_uptime_seconds");
  expect(text).toMatch(/^process_uptime_seconds \d/m);
  expect(text).toContain("# HELP rate_limit_active_clients");
  expect(text).toMatch(/^rate_limit_active_clients \d+/m);
});
