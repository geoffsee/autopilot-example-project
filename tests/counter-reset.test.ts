import { test, expect, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { setupCounter, incrementNamedCounter, resetNamedCounter } from "../src/counter";
import { setupActivityTable, getRecentActivity } from "../src/activity";
import { createServer } from "../src/index";

// ── Unit tests ──────────────────────────────────────────────────────────────

describe("resetNamedCounter DB function", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    setupCounter(db);
  });

  afterEach(() => {
    db.close();
  });

  test("returns null for unknown counter (does not auto-create)", () => {
    expect(resetNamedCounter(db, "nonexistent")).toBeNull();
  });

  test("does not create the counter when it does not exist", () => {
    resetNamedCounter(db, "ghost");
    // Querying directly should not show a row for 'ghost'
    const row = db.query("SELECT value FROM counter WHERE name = ?").get("ghost") as { value: number } | null;
    expect(row).toBeNull();
  });

  test("resets an existing counter to 0 and returns 0", () => {
    incrementNamedCounter(db, "hits", 10);
    expect(resetNamedCounter(db, "hits")).toBe(0);
  });

  test("value is 0 in DB after reset", () => {
    incrementNamedCounter(db, "hits", 5);
    resetNamedCounter(db, "hits");
    const row = db.query("SELECT value FROM counter WHERE name = ?").get("hits") as { value: number };
    expect(row.value).toBe(0);
  });

  test("counter can be incremented again after reset", () => {
    incrementNamedCounter(db, "hits", 7);
    resetNamedCounter(db, "hits");
    incrementNamedCounter(db, "hits", 3);
    const row = db.query("SELECT value FROM counter WHERE name = ?").get("hits") as { value: number };
    expect(row.value).toBe(3);
  });

  test("resetting one counter does not affect another", () => {
    incrementNamedCounter(db, "a", 5);
    incrementNamedCounter(db, "b", 8);
    resetNamedCounter(db, "a");
    const rowB = db.query("SELECT value FROM counter WHERE name = ?").get("b") as { value: number };
    expect(rowB.value).toBe(8);
  });
});

// ── HTTP integration tests ───────────────────────────────────────────────────

describe("DELETE /api/counter/:name HTTP", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(() => {
    server = createServer(0);
    baseUrl = server.url.origin;
  });

  afterAll(async () => {
    await server.stop(true);
  });

  test("DELETE unknown counter returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/counter/never_existed_${Date.now()}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  test("DELETE existing counter returns 200 with { name, value: 0 }", async () => {
    const name = `reset_${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 5 }),
    });

    const res = await fetch(`${baseUrl}/api/counter/${name}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; value: number };
    expect(body.name).toBe(name);
    expect(body.value).toBe(0);
  });

  test("GET after DELETE shows value 0", async () => {
    const name = `reset_get_${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 3 }),
    });
    await fetch(`${baseUrl}/api/counter/${name}`, { method: "DELETE" });

    const res = await fetch(`${baseUrl}/api/counter/${name}`);
    const body = await res.json() as { name: string; value: number };
    expect(body.value).toBe(0);
  });

  test("DELETE logs a 'reset' activity entry", async () => {
    const name = `reset_log_${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${name}`, { method: "POST" });
    await fetch(`${baseUrl}/api/counter/${name}`, { method: "DELETE" });

    const afterRes = await fetch(`${baseUrl}/api/activity`);
    const { entries: after } = await afterRes.json() as { entries: { action: string }[] };

    // The most recent entry must be the reset we just triggered
    expect(after[0]!.action).toBe("counter.reset");
  });

  test("DELETE broadcasts WebSocket reset event", async () => {
    const name = `ws_reset_${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 4 }),
    });

    const ws = new WebSocket(`${baseUrl.replace("http://", "ws://")}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
    });

    // Drain initial activity_history burst
    await new Promise<void>((resolve) => {
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "activity_history") resolve();
      };
    });

    const eventPromise = new Promise<{ type: string; name: string; value: number }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timed out waiting for WS reset event")), 3000);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "counter" && msg.name === name) {
          clearTimeout(t);
          resolve(msg);
        }
      };
    });

    await fetch(`${baseUrl}/api/counter/${name}`, { method: "DELETE" });

    const msg = await eventPromise;
    expect(msg.type).toBe("counter");
    expect(msg.name).toBe(name);
    expect(msg.value).toBe(0);

    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
      ws.close();
    });
  });
});
