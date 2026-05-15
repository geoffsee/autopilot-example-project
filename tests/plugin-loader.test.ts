import { test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { setupCounter } from "../src/counter";
import { setupActivityTable } from "../src/activity";
import { loadPlugins } from "../src/plugin-loader";

let db: Database;
let routes: Awaited<ReturnType<typeof loadPlugins>>;

beforeAll(async () => {
  db = new Database(":memory:");
  setupCounter(db);
  setupActivityTable(db);
  routes = await loadPlugins({ db });
});

afterAll(() => {
  db.close();
});

test("loadPlugins returns routes for all expected paths", () => {
  expect("/*" in routes).toBe(true);
  expect("/api/hello" in routes).toBe(true);
  expect("/api/hello/:name" in routes).toBe(true);
  expect("/api/counter" in routes).toBe(true);
  expect("/api/activity" in routes).toBe(true);
  expect("/ws" in routes).toBe(true);
});

test("counter plugin provides GET and POST handlers", () => {
  const handler = routes["/api/counter"] as Record<string, (...args: unknown[]) => unknown>;
  expect(typeof handler["GET"]).toBe("function");
  expect(typeof handler["POST"]).toBe("function");
});

test("activity plugin provides GET handler", () => {
  const handler = routes["/api/activity"] as Record<string, (...args: unknown[]) => unknown>;
  expect(typeof handler["GET"]).toBe("function");
});

test("hello plugin provides GET and PUT handlers", () => {
  const handler = routes["/api/hello"] as Record<string, (...args: unknown[]) => unknown>;
  expect(typeof handler["GET"]).toBe("function");
  expect(typeof handler["PUT"]).toBe("function");
});

test("websocket plugin provides a function handler for /ws", () => {
  expect(typeof routes["/ws"]).toBe("function");
});
