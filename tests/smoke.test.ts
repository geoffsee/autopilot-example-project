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

test("GET /api/counter returns { count: number }", async () => {
  const res = await fetch(`${baseUrl}/api/counter`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe("number");
});

test("POST /api/counter increments count and returns new value", async () => {
  const beforeRes = await fetch(`${baseUrl}/api/counter`);
  const { count: before } = (await beforeRes.json()) as { count: number };

  const postRes = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  expect(postRes.status).toBe(200);
  const { count: after } = (await postRes.json()) as { count: number };

  expect(after).toBe(before + 1);
});

test("POST /api/counter count persists across requests", async () => {
  const res1 = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  const { count: c1 } = (await res1.json()) as { count: number };

  const res2 = await fetch(`${baseUrl}/api/counter`);
  const { count: c2 } = (await res2.json()) as { count: number };

  expect(c2).toBe(c1);
});
