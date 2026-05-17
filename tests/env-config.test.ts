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

test("PORT env var: server binds to the port specified in process.env.PORT", async () => {
  const prev = process.env.PORT;
  const targetPort = 19876;
  process.env.PORT = String(targetPort);
  const s = createServer(undefined, { dbPath: ":memory:" });
  try {
    const assignedPort = parseInt(new URL(s.url.origin).port, 10);
    expect(assignedPort).toBe(targetPort);
  } finally {
    await s.stop();
    if (prev === undefined) delete process.env.PORT;
    else process.env.PORT = prev;
  }
});

test("DB_PATH :memory: produces a fresh isolated db per server", async () => {
  const s = createServer(0, { dbPath: ":memory:" });
  try {
    const res = await fetch(`${s.url.origin}/api/counter`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(0);
  } finally {
    await s.stop();
  }
});
