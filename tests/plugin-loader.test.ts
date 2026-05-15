import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { setupCounter } from "../src/counter";
import { setupActivityTable } from "../src/activity";
import { loadPlugins } from "../src/plugin-loader";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  setupCounter(db);
  setupActivityTable(db);
});

afterEach(() => {
  db.close();
});

test("loadPlugins returns routes for all expected paths", async () => {
  const routes = await loadPlugins({ db });
  expect("/*" in routes).toBe(true);
  expect("/api/hello" in routes).toBe(true);
  expect("/api/hello/:name" in routes).toBe(true);
  expect("/api/counter" in routes).toBe(true);
  expect("/api/activity" in routes).toBe(true);
  expect("/ws" in routes).toBe(true);
});

test("counter plugin provides GET and POST handlers", async () => {
  const routes = await loadPlugins({ db });
  const handler = routes["/api/counter"] as Record<string, Function>;
  expect(typeof handler["GET"]).toBe("function");
  expect(typeof handler["POST"]).toBe("function");
});

test("activity plugin provides GET handler", async () => {
  const routes = await loadPlugins({ db });
  const handler = routes["/api/activity"] as Record<string, Function>;
  expect(typeof handler["GET"]).toBe("function");
});

test("hello plugin provides GET and PUT handlers", async () => {
  const routes = await loadPlugins({ db });
  const handler = routes["/api/hello"] as Record<string, Function>;
  expect(typeof handler["GET"]).toBe("function");
  expect(typeof handler["PUT"]).toBe("function");
});

test("websocket plugin provides a function handler for /ws", async () => {
  const routes = await loadPlugins({ db });
  expect(typeof routes["/ws"]).toBe("function");
});
