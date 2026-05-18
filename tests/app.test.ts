import { expect, test, beforeAll, afterAll } from "bun:test";
import { createServer } from "../src/index";

let server: ReturnType<typeof createServer>;
let baseUrl: string;
let wsBase: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
  wsBase = baseUrl.replace(/^http/, "ws");
});

afterAll(() => {
  server.stop(true);
});

test("WebSocket /ws is reachable", async () => {
  const ws = new WebSocket(`${wsBase}/ws`);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
    });
    expect(ws.readyState).toBe(WebSocket.OPEN);
  } finally {
    ws.close();
  }
});

test("WebSocket /ws sends activity_history on connect (ActivityFeed initial load)", async () => {
  const ws = new WebSocket(`${wsBase}/ws`);

  try {
    const firstMsg = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for activity_history")), 3000);
      ws.onmessage = (e) => {
        clearTimeout(timer);
        const raw = typeof e.data === "string" ? e.data : String(e.data);
        resolve(JSON.parse(raw));
      };
      ws.onerror = () => reject(new Error("WebSocket error"));
    });

    expect(firstMsg).toMatchObject({ type: "activity_history", entries: expect.any(Array) });
  } finally {
    ws.close();
  }
});

test("WebSocket /ws sends { type: 'counter', count } on POST (LiveCounter real-time update)", async () => {
  const ws = new WebSocket(`${wsBase}/ws`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  try {
    const counterMsg = new Promise<{ type: string; count: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for counter message")), 3000);
      ws.onmessage = (e) => {
        const raw = typeof e.data === "string" ? e.data : String(e.data);
        const msg = JSON.parse(raw) as { type: string; count: number };
        if (msg.type === "counter") {
          clearTimeout(timer);
          resolve(msg);
        }
      };
    });

    const res = await fetch(`${baseUrl}/api/counter`, { method: "POST" });
    const { count } = (await res.json()) as { count: number };
    const msg = await counterMsg;
    expect(msg).toEqual({ type: "counter", count });
  } finally {
    ws.close();
  }
});
