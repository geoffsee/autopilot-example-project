import { expect, test, beforeAll, afterAll } from "bun:test";
import { serve } from "bun";
import { createCounterDb, handleCounterPost } from "../src/counter";
import { setupActivityTable, logActivity, getRecentActivity } from "../src/activity";
import { createServer } from "../src/index";
import type { ActivityEntry } from "../src/activity";

// Smoke test: verify the route is registered in the real server
let mainServer: ReturnType<typeof createServer>;

beforeAll(() => {
  mainServer = createServer(0);
});

afterAll(async () => {
  await mainServer.stop();
});

test("GET /api/counter/history exists in createServer and returns 200", async () => {
  const res = await fetch(`${mainServer.url.origin}/api/counter/history`);
  expect(res.status).toBe(200);
  const body = await res.json() as ActivityEntry[];
  expect(Array.isArray(body)).toBe(true);
});

// Behavioural tests against an isolated in-memory server
function makeIsolatedServer() {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  const server = serve({
    port: 0,
    routes: {
      "/api/counter/history": {
        GET(_req) {
          return Response.json(getRecentActivity(db));
        },
      },
      "/api/counter": {
        async POST(req) {
          const { response } = await handleCounterPost(req, db);
          if (response.ok) logActivity(db, "counter.increment");
          return response;
        },
      },
    },
  });
  return { server, db };
}

test("GET /api/counter/history returns empty array on fresh database", async () => {
  const { server, db } = makeIsolatedServer();
  try {
    const res = await fetch(`http://localhost:${server.port}/api/counter/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as ActivityEntry[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  } finally {
    server.stop();
    db.close();
  }
});

test("GET /api/counter/history returns single entry after one increment", async () => {
  const { server, db } = makeIsolatedServer();
  try {
    await fetch(`http://localhost:${server.port}/api/counter`, { method: "POST" });
    const res = await fetch(`http://localhost:${server.port}/api/counter/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as ActivityEntry[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]!.action).toBe("counter.increment");
    expect(typeof body[0]!.timestamp).toBe("string");
    expect(typeof body[0]!.id).toBe("number");
  } finally {
    server.stop();
    db.close();
  }
});

test("GET /api/counter/history returns multiple entries in descending order", async () => {
  const { server, db } = makeIsolatedServer();
  try {
    await fetch(`http://localhost:${server.port}/api/counter`, { method: "POST" });
    await fetch(`http://localhost:${server.port}/api/counter`, { method: "POST" });
    await fetch(`http://localhost:${server.port}/api/counter`, { method: "POST" });
    const res = await fetch(`http://localhost:${server.port}/api/counter/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as ActivityEntry[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    for (let i = 0; i < body.length - 1; i++) {
      expect(body[i]!.id).toBeGreaterThan(body[i + 1]!.id);
    }
  } finally {
    server.stop();
    db.close();
  }
});
