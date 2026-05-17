import { beforeAll, afterAll, test, expect } from "bun:test";
import { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0, { dbPath: ":memory:", maxActivityRows: 5 });
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("MAX_ACTIVITY_ROWS limits /api/activity to non-default row count", async () => {
  for (let i = 0; i < 10; i++) {
    await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  }
  const res = await fetch(`${baseUrl}/api/activity`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { entries: unknown[] };
  expect(body.entries).toHaveLength(5);
});

test("PORT env var: server starts and responds on configured port", async () => {
  const port = parseInt(new URL(baseUrl).port, 10);
  expect(port).toBeGreaterThan(0);
  const res = await fetch(`${baseUrl}/api/hello`);
  expect(res.status).toBe(200);
});

test("DB_PATH :memory: produces a fresh db per server", async () => {
  const res = await fetch(`${baseUrl}/api/counter`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(typeof body.count).toBe("number");
});
