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
  try { await server.stop(true); } catch {}
  try { db.close(); } catch {}
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

  await Bun.sleep(500);
  proc.kill("SIGTERM");

  const exitCode = await proc.exited;
  expect(exitCode).toBe(0);
}, 5000);
