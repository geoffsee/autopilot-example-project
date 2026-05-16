import { test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "../src/index";
import { DEFAULT_DEV_API_KEY } from "../src/auth";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

// Write endpoint: POST /api/counter — must require X-API-Key

test("POST /api/counter returns 401 without X-API-Key", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  expect(res.status).toBe(401);
});

test("POST /api/counter returns 401 with invalid X-API-Key", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, {
    method: "POST",
    headers: { "X-API-Key": "wrong-key" },
  });
  expect(res.status).toBe(401);
});

test("POST /api/counter returns 200 with valid X-API-Key", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, {
    method: "POST",
    headers: { "X-API-Key": DEFAULT_DEV_API_KEY },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe("number");
});

// Read endpoint: GET /api/counter — must remain unauthenticated

test("GET /api/counter returns 200 without X-API-Key (unaffected)", async () => {
  const res = await fetch(`${baseUrl}/api/counter`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe("number");
});

// Other read endpoints must remain unauthenticated

test("GET /api/activity returns 200 without X-API-Key", async () => {
  const res = await fetch(`${baseUrl}/api/activity`);
  expect(res.status).toBe(200);
});

test("GET /api/openapi.json returns 200 without X-API-Key", async () => {
  const res = await fetch(`${baseUrl}/api/openapi.json`);
  expect(res.status).toBe(200);
});
