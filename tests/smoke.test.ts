import { beforeAll, afterAll, test, expect } from "bun:test";
import { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(() => {
  server.stop();
});

test("GET /api/hello returns { message: string }", async () => {
  const res = await fetch(`${baseUrl}/api/hello`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: unknown };
  expect(typeof body.message).toBe("string");
});
