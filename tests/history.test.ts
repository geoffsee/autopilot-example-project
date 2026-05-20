import { expect, test, beforeAll, afterAll } from "bun:test";
import { serve } from "bun";
import { createCounterDb, handleCounterPost, setupCounter } from "../src/counter";
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
  const body = await res.json() as { entries: ActivityEntry[] };
  expect(Array.isArray(body.entries)).toBe(true);
});

// Behavioural tests against an isolated in-memory server
function makeIsolatedServer() {
  const db = createCounterDb(":memory:");
  setupCounter(db);
  setupActivityTable(db);
  const server = serve({
    port: 0,
    routes: {
      "/api/counter/history": {
        GET(_req) {
          return Response.json({ entries: getRecentActivity(db) });
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
    const body = await res.json() as { entries: ActivityEntry[] };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries).toHaveLength(0);
  } finally {
    await server.stop();
    db.close();
  }
});

test("GET /api/counter/history returns single entry after one increment", async () => {
  const { server, db } = makeIsolatedServer();
  try {
    await fetch(`http://localhost:${server.port}/api/counter`, { method: "POST" });
    const res = await fetch(`http://localhost:${server.port}/api/counter/history`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: ActivityEntry[] };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.action).toBe("counter.increment");
    expect(typeof body.entries[0]!.timestamp).toBe("string");
    expect(typeof body.entries[0]!.id).toBe("number");
  } finally {
    await server.stop();
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
    const body = await res.json() as { entries: ActivityEntry[] };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries).toHaveLength(3);
    for (let i = 0; i < body.entries.length - 1; i++) {
      expect(body.entries[i]!.id).toBeGreaterThan(body.entries[i + 1]!.id);
    }
  } finally {
    await server.stop();
    db.close();
  }
});
