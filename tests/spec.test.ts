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

const EXPECTED_PATHS = [
  "/api/hello",
  "/api/hello/{name}",
  "/api/counter",
  "/api/activity",
  "/api/spec",
];

test("GET /api/spec returns 200 with JSON content-type", async () => {
  const res = await fetch(`${baseUrl}/api/spec`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
});

test("GET /api/spec returns valid OpenAPI 3.1 document", async () => {
  const res = await fetch(`${baseUrl}/api/spec`);
  const doc = await res.json() as Record<string, unknown>;
  expect(doc.openapi).toBe("3.1.0");
  expect(typeof (doc.info as Record<string, unknown>)?.title).toBe("string");
  expect(typeof (doc.info as Record<string, unknown>)?.version).toBe("string");
  expect(typeof doc.paths).toBe("object");
});

test("GET /api/spec covers all expected paths", async () => {
  const res = await fetch(`${baseUrl}/api/spec`);
  const doc = await res.json() as { paths: Record<string, unknown> };
  for (const path of EXPECTED_PATHS) {
    expect(doc.paths).toHaveProperty(path);
  }
});

test("GET /api/spec paths have at least one method with a 200 response", async () => {
  const res = await fetch(`${baseUrl}/api/spec`);
  const doc = await res.json() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
  for (const [, methods] of Object.entries(doc.paths)) {
    const methodEntries = Object.entries(methods);
    expect(methodEntries.length).toBeGreaterThan(0);
    for (const [, op] of methodEntries) {
      expect(op.responses).toHaveProperty("200");
    }
  }
});
