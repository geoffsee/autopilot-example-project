import { expect, test, beforeAll, afterAll } from "bun:test";
import { serve } from "bun";
import { Database } from "bun:sqlite";
import { setupCounter } from "../src/counter";
import { makeCounterRoutes } from "../src/counter-routes";

const db = new Database(":memory:");
await setupCounter(db);
let testServer: ReturnType<typeof serve>;

beforeAll(() => {
  testServer = serve({
    port: 0,
    routes: {
      "/api/counter": makeCounterRoutes(db),
      "/ws": (req, server) => {
        if (server.upgrade(req, { data: undefined })) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      },
    },
    websocket: {
      open(ws: Bun.ServerWebSocket<undefined>) {
        ws.subscribe("counter");
      },
      message(_ws: Bun.ServerWebSocket<undefined>, _msg: string | Buffer<ArrayBuffer>) {},
      close(ws: Bun.ServerWebSocket<undefined>) {
        ws.unsubscribe("counter");
      },
    },
  });
});

afterAll(() => {
  testServer.stop();
});

test("WebSocket connects to /ws", async () => {
  const ws = new WebSocket(`ws://localhost:${testServer.port}/ws`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  expect(ws.readyState).toBe(WebSocket.OPEN);
  ws.close();
});

test("WebSocket receives counter update on POST /api/counter", async () => {
  const ws = new WebSocket(`ws://localhost:${testServer.port}/ws`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  const msgPromise = new Promise<{ type: string; count: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for WS message")), 3000);
    ws.onmessage = (e) => { clearTimeout(t); resolve(JSON.parse(e.data as string)); };
  });

  const postRes = await fetch(
    `http://localhost:${testServer.port}/api/counter`,
    { method: "POST" }
  );
  const { count } = (await postRes.json()) as { count: number };

  const msg = await msgPromise;
  expect(msg).toEqual({ type: "counter", count });

  ws.close();
});

test("multiple WebSocket clients receive the same broadcast", async () => {
  const ws1 = new WebSocket(`ws://localhost:${testServer.port}/ws`);
  const ws2 = new WebSocket(`ws://localhost:${testServer.port}/ws`);

  await Promise.all([
    new Promise<void>((resolve, reject) => {
      ws1.onopen = () => resolve();
      ws1.onerror = () => reject(new Error("ws1 connection failed"));
    }),
    new Promise<void>((resolve, reject) => {
      ws2.onopen = () => resolve();
      ws2.onerror = () => reject(new Error("ws2 connection failed"));
    }),
  ]);

  const msg1Promise = new Promise<{ type: string; count: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws1 timed out")), 3000);
    ws1.onmessage = (e) => { clearTimeout(t); resolve(JSON.parse(e.data as string)); };
  });
  const msg2Promise = new Promise<{ type: string; count: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws2 timed out")), 3000);
    ws2.onmessage = (e) => { clearTimeout(t); resolve(JSON.parse(e.data as string)); };
  });

  await fetch(`http://localhost:${testServer.port}/api/counter`, {
    method: "POST",
  });

  const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);
  expect(msg1.type).toBe("counter");
  expect(msg2.type).toBe("counter");
  expect(msg1.count).toBe(msg2.count);

  ws1.close();
  ws2.close();
});
