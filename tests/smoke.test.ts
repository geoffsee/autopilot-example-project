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
  const body = (await res.json()) as { message: unknown };
  expect(body.message).toBe("Hello, world!");
});

test("PUT /api/hello returns { message: string }", async () => {
  const res = await fetch(`${baseUrl}/api/hello`, { method: "PUT" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: unknown };
  expect(body.message).toBe("Hello, world!");
});

test("GET /api/hello/:name returns greeting for name", async () => {
  const res = await fetch(`${baseUrl}/api/hello/caretta`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: unknown };
  expect(body.message).toBe("Hello, caretta!");
});
