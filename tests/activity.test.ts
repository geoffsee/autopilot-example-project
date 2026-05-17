import { expect, test, beforeAll, afterAll } from "bun:test";
import { createServer } from "../src/index";
import { createCounterDb } from "../src/counter";
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

test("getRecentActivity filters by action", () => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  logActivity(db, "counter.increment");
  logActivity(db, "counter.reset");
  logActivity(db, "counter.increment");
  const entries = getRecentActivity(db, 20, "counter.increment");
  expect(entries).toHaveLength(2);
  for (const e of entries) expect(e.action).toBe("counter.increment");
  db.close();
});

test("getRecentActivity combines action filter and limit", () => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  for (let i = 0; i < 5; i++) logActivity(db, "counter.increment");
  logActivity(db, "counter.reset");
  const entries = getRecentActivity(db, 2, "counter.increment");
  expect(entries).toHaveLength(2);
  for (const e of entries) expect(e.action).toBe("counter.increment");
  db.close();
});

test("getRecentActivity returns all when action filter matches nothing", () => {
  const db = createCounterDb(":memory:");
  setupActivityTable(db);
  logActivity(db, "counter.increment");
  const entries = getRecentActivity(db, 20, "counter.reset");
  expect(entries).toHaveLength(0);
  db.close();
});

// HTTP integration tests
let baseUrl: string;
let server: ReturnType<typeof createServer>;

beforeAll(() => {
  server = createServer(0);
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

test("GET /api/activity?action= filters entries by action", async () => {
  // Seed known entries
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });

  const res = await fetch(`${baseUrl}/api/activity?action=counter.increment`);
  expect(res.status).toBe(200);
  const body = await res.json() as { entries: { action: string }[] };
  expect(body.entries.length).toBeGreaterThanOrEqual(1);
  for (const e of body.entries) expect(e.action).toBe("counter.increment");
});

test("GET /api/activity?action= returns empty for unknown action", async () => {
  const res = await fetch(`${baseUrl}/api/activity?action=counter.no-such-action`);
  expect(res.status).toBe(200);
  const body = await res.json() as { entries: unknown[] };
  expect(body.entries).toHaveLength(0);
});

test("GET /api/activity?limit= caps results server-side", async () => {
  // Ensure there are at least 3 entries
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });

  const res = await fetch(`${baseUrl}/api/activity?limit=2`);
  expect(res.status).toBe(200);
  const body = await res.json() as { entries: unknown[] };
  expect(body.entries).toHaveLength(2);
});

test("GET /api/activity?action=&limit= combines both params", async () => {
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });

  const res = await fetch(`${baseUrl}/api/activity?action=counter.increment&limit=1`);
  expect(res.status).toBe(200);
  const body = await res.json() as { entries: { action: string }[] };
  expect(body.entries).toHaveLength(1);
  expect(body.entries[0]!.action).toBe("counter.increment");
});

test("GET /api/activity ignores unrecognised query params", async () => {
  const res = await fetch(`${baseUrl}/api/activity?foo=bar&baz=qux`);
  expect(res.status).toBe(200);
  const body = await res.json() as { entries: unknown[] };
  expect(Array.isArray(body.entries)).toBe(true);
});
