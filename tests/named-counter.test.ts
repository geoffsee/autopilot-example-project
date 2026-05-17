import { test, expect, describe, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  setupCounter,
  getNamedCount,
  incrementNamedCounter,
  handleNamedCounterPost,
} from "../src/counter";
import { createServer } from "../src/index";

describe("named counter DB functions", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    setupCounter(db);
  });

  afterEach(() => {
    db.close();
  });

  test("getNamedCount returns 0 for a new counter", () => {
    expect(getNamedCount(db, "myapp")).toBe(0);
  });

  test("getNamedCount auto-creates counter at 0", () => {
    getNamedCount(db, "visits");
    expect(getNamedCount(db, "visits")).toBe(0);
  });

  test("incrementNamedCounter creates and increments to 1", () => {
    expect(incrementNamedCounter(db, "clicks", 1)).toBe(1);
  });

  test("incrementNamedCounter accumulates successive calls", () => {
    incrementNamedCounter(db, "clicks", 5);
    expect(incrementNamedCounter(db, "clicks", 3)).toBe(8);
  });

  test("incrementNamedCounter with amount 0 is a no-op", () => {
    incrementNamedCounter(db, "hits", 4);
    expect(incrementNamedCounter(db, "hits", 0)).toBe(4);
  });

  test("different named counters are independent", () => {
    incrementNamedCounter(db, "clicks", 5);
    incrementNamedCounter(db, "views", 2);
    expect(getNamedCount(db, "clicks")).toBe(5);
    expect(getNamedCount(db, "views")).toBe(2);
  });

  test("named counter 'default' reflects same row as unnamed counter (id=1)", () => {
    incrementNamedCounter(db, "default", 7);
    expect(getNamedCount(db, "default")).toBe(7);
  });
});

describe("handleNamedCounterPost", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    setupCounter(db);
  });

  afterEach(() => {
    db.close();
  });

  function makeReq(name: string, body?: unknown, contentType = "application/json"): Request {
    if (body === undefined) {
      return new Request(`http://localhost/api/counter/${name}`, { method: "POST" });
    }
    return new Request(`http://localhost/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  test("no body increments by 1 and returns { name, value }", async () => {
    const { response, value } = await handleNamedCounterPost(makeReq("app"), db, "app");
    expect(response.status).toBe(200);
    const json = await response.json() as { name: string; value: number };
    expect(json.name).toBe("app");
    expect(json.value).toBe(1);
    expect(value).toBe(1);
  });

  test("{ increment: 5 } increments by 5", async () => {
    const { response } = await handleNamedCounterPost(makeReq("app", { increment: 5 }), db, "app");
    expect(response.status).toBe(200);
    const json = await response.json() as { name: string; value: number };
    expect(json.value).toBe(5);
  });

  test("returns 400 for negative increment", async () => {
    const { response } = await handleNamedCounterPost(makeReq("app", { increment: -1 }), db, "app");
    expect(response.status).toBe(400);
  });

  test("returns 400 for float increment", async () => {
    const { response } = await handleNamedCounterPost(makeReq("app", { increment: 1.5 }), db, "app");
    expect(response.status).toBe(400);
  });

  test("returns 400 for non-JSON content-type with body", async () => {
    const { response } = await handleNamedCounterPost(
      new Request("http://localhost/api/counter/app", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json",
      }),
      db,
      "app"
    );
    expect(response.status).toBe(400);
  });

  test("returns 400 for malformed JSON", async () => {
    const { response } = await handleNamedCounterPost(
      new Request("http://localhost/api/counter/app", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad}",
      }),
      db,
      "app"
    );
    expect(response.status).toBe(400);
  });
});

describe("named counter HTTP integration", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(() => {
    server = createServer(0);
    baseUrl = server.url.origin;
  });

  afterAll(async () => {
    await server.stop(true);
  });

  test("GET /api/counter/:name returns { name, value } auto-created at 0", async () => {
    const name = `fresh_${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/counter/${name}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; value: number };
    expect(body.name).toBe(name);
    expect(body.value).toBe(0);
  });

  test("POST /api/counter/:name increments and returns { name, value }", async () => {
    const name = `post_${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/counter/${name}`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; value: number };
    expect(body.name).toBe(name);
    expect(body.value).toBe(1);
  });

  test("POST /api/counter/:name with { increment } body", async () => {
    const name = `inc_${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 7 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; value: number };
    expect(body.value).toBe(7);
  });

  test("GET reflects value after POST", async () => {
    const name = `roundtrip_${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 3 }),
    });
    const res = await fetch(`${baseUrl}/api/counter/${name}`);
    const body = await res.json() as { name: string; value: number };
    expect(body.value).toBe(3);
  });

  test("different named counters are independent via HTTP", async () => {
    const ts = Date.now();
    const nameA = `ctr_a_${ts}`;
    const nameB = `ctr_b_${ts}`;

    await fetch(`${baseUrl}/api/counter/${nameA}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 3 }),
    });
    await fetch(`${baseUrl}/api/counter/${nameB}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ increment: 9 }),
    });

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/counter/${nameA}`),
      fetch(`${baseUrl}/api/counter/${nameB}`),
    ]);
    const bodyA = await resA.json() as { name: string; value: number };
    const bodyB = await resB.json() as { name: string; value: number };
    expect(bodyA.value).toBe(3);
    expect(bodyB.value).toBe(9);
  });

  test("GET /api/counter (unnamed) still works", async () => {
    const res = await fetch(`${baseUrl}/api/counter`);
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number };
    expect(typeof body.count).toBe("number");
  });

  test("POST /api/counter (unnamed) still works", async () => {
    const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number };
    expect(typeof body.count).toBe("number");
  });

  test("POST /api/counter/:name broadcasts WebSocket event", async () => {
    const name = `ws_${Date.now()}`;
    const ws = new WebSocket(`${baseUrl.replace("http://", "ws://")}/ws`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
    });

    const msgPromise = new Promise<{ type: string; name: string; value: number }>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timed out waiting for WS message")), 3000);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "counter" && msg.name === name) {
          clearTimeout(t);
          resolve(msg);
        }
      };
    });

    const postRes = await fetch(`${baseUrl}/api/counter/${name}`, { method: "POST" });
    const postBody = await postRes.json() as { name: string; value: number };

    const msg = await msgPromise;
    expect(msg.type).toBe("counter");
    expect(msg.name).toBe(name);
    expect(msg.value).toBe(postBody.value);

    await new Promise<void>(resolve => {
      ws.onclose = () => resolve();
      ws.close();
    });
  });
});
