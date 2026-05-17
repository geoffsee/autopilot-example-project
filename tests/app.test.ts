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

test("App.tsx uses WebSocket for real-time updates with no setInterval polling", async () => {
  const src = await Bun.file("src/App.tsx").text();
  expect(src).toContain("new WebSocket");
  expect(src).not.toContain("setInterval");
});

test("WebSocket /ws sends activity_history on connect (ActivityFeed initial load)", async () => {
  const ws = new WebSocket(`${wsBase}/ws`);

  const firstMsg = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for activity_history")), 3000);
    ws.onmessage = (e) => {
      clearTimeout(timer);
      resolve(JSON.parse(e.data as string));
    };
    ws.onerror = () => reject(new Error("WebSocket error"));
  });

  expect(firstMsg).toMatchObject({ type: "activity_history", entries: expect.any(Array) });
  ws.close();
});

test("WebSocket /ws sends { type: 'counter', count } on POST (LiveCounter real-time update)", async () => {
  const ws = new WebSocket(`${wsBase}/ws`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });

  const counterMsg = new Promise<{ type: string; count: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for counter message")), 3000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as { type: string; count: number };
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
  ws.close();
});
