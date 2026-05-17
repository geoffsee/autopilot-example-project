import { beforeEach, afterEach, test, expect } from "bun:test";
import { createServer, shutdown } from "../src/index";
import { createCounterDb } from "../src/counter";
import { setupActivityTable } from "../src/activity";
import { Database } from "bun:sqlite";

let server: ReturnType<typeof createServer>;
let db: Database;

beforeEach(() => {
  db = createCounterDb(":memory:");
  setupActivityTable(db);
  server = createServer(0, db);
});

afterEach(async () => {
  try { await server.stop(true); } catch (_e) { /* already stopped by shutdown() */ }
  try { db.close(); } catch (_e) { /* already closed by shutdown() */ }
});

test("shutdown closes the database", async () => {
  await shutdown(server, db);
  expect(() => db.query("SELECT 1").get()).toThrow();
});

test("shutdown stops the server so new requests are rejected", async () => {
  const url = server.url.origin;
  const before = await fetch(`${url}/api/hello`);
  expect(before.status).toBe(200);

  await shutdown(server, db);

  await expect(fetch(`${url}/api/hello`)).rejects.toThrow();
});

test("SIGTERM causes process to exit with code 0", async () => {
  const proc = Bun.spawn(["bun", "src/index.ts"], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NODE_ENV: "production" },
  });

  // Read the server URL from stdout (the startup log line contains it).
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let serverUrl = "";
  while (!serverUrl) {
    const { value } = await reader.read();
    const match = decoder.decode(value).match(/http:\/\/\S+/);
    if (match) serverUrl = match[0].replace(/\/$/, "");
  }
  reader.releaseLock();

  // Poll until the server responds rather than sleeping a fixed amount.
  let ready = false;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${serverUrl}/api/hello`);
      if (res.ok) { ready = true; break; }
    } catch (_e) { /* not ready yet */ }
    await Bun.sleep(100);
  }
  expect(ready).toBe(true);

  proc.kill("SIGTERM");

  const exitCode = await proc.exited;
  expect(exitCode).toBe(0);
}, 5000);
