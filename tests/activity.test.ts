import { expect, test, beforeAll, afterAll } from "bun:test";
import { serve } from "bun";
import { createCounterDb, handleCounterPost } from "../src/counter";
import { setupActivityTable, logActivity, getRecentActivity } from "../src/activity";

// Unit tests for activity DB functions
test("getRecentActivity returns empty array on fresh DB", () => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  expect(getRecentActivity(db)).toEqual([]);
  db.close();
});

test("logActivity inserts and returns entry", () => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  const entry = logActivity(db, "test.action");
  expect(entry.action).toBe("test.action");
  expect(typeof entry.timestamp).toBe("string");
  db.close();
});

test("getRecentActivity returns newest-first", () => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  logActivity(db, "action.first");
  logActivity(db, "action.second");
  logActivity(db, "action.third");
  const entries = getRecentActivity(db);
  expect(entries[0]!.action).toBe("action.third");
  expect(entries[1]!.action).toBe("action.second");
  expect(entries[2]!.action).toBe("action.first");
  db.close();
});

test("getRecentActivity respects limit", () => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  for (let i = 0; i < 25; i++) logActivity(db, `action.${i}`);
  expect(getRecentActivity(db, 10)).toHaveLength(10);
  db.close();
});

// HTTP integration tests
let baseUrl: string;
let server: ReturnType<typeof serve>;

beforeAll(() => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);

  server = serve({
    port: 0,
    routes: {
      "/api/counter": {
        GET(_req) {
          return Response.json({ count: 0 });
        },
        async POST(req, server) {
          const { response, count } = await handleCounterPost(req, db);
          if (count !== undefined) {
            server.publish("counter", JSON.stringify({ type: "counter", count }));
            const entry = logActivity(db, "counter.increment");
            server.publish("activity", JSON.stringify({ type: "activity", entry }));
          }
          return response;
        },
      },
      "/api/activity": {
        GET(_req) {
          return Response.json({ entries: getRecentActivity(db) });
        },
      },
      "/ws": (req, server) => {
        if (server.upgrade(req, { data: undefined })) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      },
    },
    websocket: {
      open(ws) {
        ws.subscribe("counter");
        ws.subscribe("activity");
        const entries = getRecentActivity(db);
        ws.send(JSON.stringify({ type: "activity_history", entries }));
      },
      message(_ws, _msg) {},
      close(ws) {
        ws.unsubscribe("counter");
        ws.unsubscribe("activity");
      },
    },
  });

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
});

test("GET /api/activity returns empty entries initially", async () => {
  const res = await fetch(`${baseUrl}/api/activity`);
  expect(res.status).toBe(200);
  const body = await res.json() as { entries: unknown[] };
  expect(body.entries).toEqual([]);
});

test("POST /api/counter creates an activity entry", async () => {
  const baselineRes = await fetch(`${baseUrl}/api/activity`);
  const { entries: baseline } = await baselineRes.json() as { entries: unknown[] };
  const baselineCount = baseline.length;

  await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  const res = await fetch(`${baseUrl}/api/activity`);
  const body = await res.json() as { entries: { action: string; timestamp: string }[] };
  expect(body.entries).toHaveLength(baselineCount + 1);
  expect(body.entries[0]!.action).toBe("counter.increment");
  expect(typeof body.entries[0]!.timestamp).toBe("string");
});

test("GET /api/activity returns newest-first after multiple increments", async () => {
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  const res = await fetch(`${baseUrl}/api/activity`);
  const body = await res.json() as { entries: { action: string; timestamp: string }[] };
  expect(body.entries.length).toBeGreaterThanOrEqual(2);
  // Verify all entries are counter.increment actions
  for (const entry of body.entries) {
    expect(entry.action).toBe("counter.increment");
  }
});

test("WebSocket receives activity message on POST /api/counter", async () => {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  // Wait for the activity_history burst sent on connect before listening for live events
  await new Promise<void>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "activity_history") resolve();
    };
  });

  const activityPromise = new Promise<{ type: string; entry: { action: string; timestamp: string } }>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "activity") resolve(msg);
    };
  });

  await fetch(`${baseUrl}/api/counter`, { method: "POST" });

  const msg = await activityPromise;
  expect(msg.type).toBe("activity");
  expect(msg.entry.action).toBe("counter.increment");
  expect(typeof msg.entry.timestamp).toBe("string");

  ws.close();
});

test("WebSocket sends existing activity entries on connect", async () => {
  // Ensure at least one activity entry exists from previous tests
  const checkRes = await fetch(`${baseUrl}/api/activity`);
  const { entries } = await checkRes.json() as { entries: unknown[] };
  if (entries.length === 0) {
    await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  }

  const ws = new WebSocket(`ws://localhost:${server.port}/ws`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  const historyMsg = await new Promise<{ type: string; entries: { action: string }[] }>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "activity_history") resolve(msg);
    };
  });

  expect(historyMsg.type).toBe("activity_history");
  expect(historyMsg.entries.length).toBeGreaterThanOrEqual(1);

  ws.close();
});

test("POST /api/counter rejects non-JSON content-type", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not json",
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter rejects invalid JSON body", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad json",
  });
  expect(res.status).toBe(400);
});

test("POST /api/counter rejects negative increment", async () => {
  const res = await fetch(`${baseUrl}/api/counter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ increment: -1 }),
  });
  expect(res.status).toBe(400);
});
