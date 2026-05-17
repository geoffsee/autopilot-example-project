import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../src/migrate";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");

test("runMigrations applies 001_init.sql and records it in _migrations", () => {
  const db = new Database(":memory:");
  runMigrations(db, MIGRATIONS_DIR);

  const rows = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations ORDER BY filename")
    .all();
  expect(rows.length).toBeGreaterThanOrEqual(1);
  expect(rows[0]!.filename).toBe("001_init.sql");

  const tableNames = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map(r => r.name);
  expect(tableNames).toContain("counter");
  expect(tableNames).toContain("activity");

  db.close();
});

test("runMigrations second run is a no-op", () => {
  const db = new Database(":memory:");
  runMigrations(db, MIGRATIONS_DIR);

  const countAfterFirst = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations")
    .all().length;

  runMigrations(db, MIGRATIONS_DIR);

  const countAfterSecond = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations")
    .all().length;

  expect(countAfterSecond).toBe(countAfterFirst);

  db.close();
});

test("runMigrations throws on non-existent directory", () => {
  const db = new Database(":memory:");
  expect(() => runMigrations(db, "/tmp/does-not-exist-migrations-dir")).toThrow();
  db.close();
});

test("runMigrations throws and rolls back on invalid SQL", () => {
  const db = new Database(":memory:");
  const tmpDir = require("node:fs").mkdtempSync(require("node:os").tmpdir() + "/migrate-test-");
  require("node:fs").writeFileSync(require("node:path").join(tmpDir, "002_bad.sql"), "THIS IS NOT VALID SQL;;;");

  expect(() => runMigrations(db, tmpDir)).toThrow();

  // migration should not have been recorded
  const rows = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations")
    .all();
  expect(rows.length).toBe(0);

  require("node:fs").rmSync(tmpDir, { recursive: true });
  db.close();
});
