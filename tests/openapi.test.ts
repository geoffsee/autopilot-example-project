import { expect, test, beforeAll, afterAll } from "bun:test";
import { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(() => {
  server.stop(true);
});

test("GET /api/docs returns valid OpenAPI 3.0 JSON document", async () => {
  const res = await fetch(`${baseUrl}/api/docs`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  const doc = await res.json() as Record<string, unknown>;
  expect(typeof doc.openapi).toBe("string");
  expect((doc.openapi as string).startsWith("3.0.")).toBe(true);
  expect(doc.info).toBeDefined();
  expect(doc.paths).toBeDefined();
});

test("GET /api/docs documents all core API paths", async () => {
  const res = await fetch(`${baseUrl}/api/docs`);
  const doc = await res.json() as { paths: Record<string, unknown> };
  const paths = Object.keys(doc.paths);
  expect(paths).toContain("/api/health");
  expect(paths).toContain("/api/counter");
  expect(paths).toContain("/api/audit");
  expect(paths).toContain("/api/webhooks");
  expect(paths).toContain("/api/keys");
});

test("GET /api/docs/ui returns Swagger UI HTML", async () => {
  const res = await fetch(`${baseUrl}/api/docs/ui`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const text = await res.text();
  expect(text.toLowerCase()).toContain("swagger");
  expect(text).toContain("/api/docs");
});
