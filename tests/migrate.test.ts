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
