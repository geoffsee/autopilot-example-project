import { test, expect } from "bun:test";
import { createServer } from "../src/index";

test("GET /api/openapi.json returns 200 with valid OpenAPI 3.1 document", async () => {
  const server = createServer(0);
  try {
    const res = await fetch(`${server.url}api/openapi.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBeDefined();
    expect(body.openapi).toMatch(/^3\.1\./);
  } finally {
    server.stop();
  }
});

test("GET /api/openapi.json describes required endpoints", async () => {
  const server = createServer(0);
  try {
    const res = await fetch(`${server.url}api/openapi.json`);
    const body = await res.json();
    const paths = Object.keys(body.paths ?? {});
    expect(paths).toContain("/api/counter");
    expect(paths).toContain("/api/todos");
    expect(paths).toContain("/api/metrics");
  } finally {
    server.stop();
  }
});
