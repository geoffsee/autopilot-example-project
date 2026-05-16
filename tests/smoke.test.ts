import { beforeAll, afterAll, test, expect } from "bun:test";
import { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop(true);
});

test("GET /api/hello returns { message: string }", async () => {
  const res = await fetch(`${baseUrl}/api/hello`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: string; method: string };
  expect(body.message).toBe("Hello, world!");
  expect(body.method).toBe("GET");
});

test("PUT /api/hello returns { message: string }", async () => {
  const res = await fetch(`${baseUrl}/api/hello`, { method: "PUT" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: string; method: string };
  expect(body.message).toBe("Hello, world!");
  expect(body.method).toBe("PUT");
});

test("GET /api/hello/:name returns greeting for name", async () => {
  const res = await fetch(`${baseUrl}/api/hello/caretta`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("Hello, caretta!");
});

test("POST /api/counter/reset returns 200 with count 0", async () => {
  const res = await fetch(`${baseUrl}/api/counter/reset`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { count: number };
  expect(body.count).toBe(0);
});

test("reset then increment yields count = 1", async () => {
  await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  await fetch(`${baseUrl}/api/counter/reset`, { method: "POST" });
  const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
  const body = (await res.json()) as { count: number };
  expect(body.count).toBe(1);
});

test("POST /api/counter/reset broadcasts counter=0 over WebSocket", async () => {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  // drain the activity_history burst sent on connect
  await new Promise<void>((resolve) => {
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as { type: string };
      if (msg.type === "activity_history") resolve();
    };
  });

  const msgPromise = new Promise<{ type: string; count: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for WS reset broadcast")), 3000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as { type: string; count: number };
      if (msg.type === "counter") { clearTimeout(t); resolve(msg); }
    };
  });

  await fetch(`${baseUrl}/api/counter/reset`, { method: "POST" });

  const msg = await msgPromise;
  expect(msg.type).toBe("counter");
  expect(msg.count).toBe(0);
  await new Promise<void>((resolve) => { ws.onclose = () => resolve(); ws.close(); });
});
