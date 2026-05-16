import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../src/db/migrate";

const MIGRATIONS_DIR = join(import.meta.dir, "../src/db/migrations");

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

test("runMigrations creates counter table with seed row", () => {
  runMigrations(db, MIGRATIONS_DIR);
  const row = db.query("SELECT value FROM counter WHERE id = 1").get() as { value: number } | null;
  expect(row?.value).toBe(0);
});

test("runMigrations creates activity table", () => {
  runMigrations(db, MIGRATIONS_DIR);
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='activity'")
    .all() as { name: string }[];
  expect(tables.length).toBe(1);
});

test("runMigrations tracks applied migrations in _migrations table", () => {
  runMigrations(db, MIGRATIONS_DIR);
  const rows = db
    .query("SELECT filename FROM _migrations ORDER BY filename")
    .all() as { filename: string }[];
  expect(rows.map(r => r.filename)).toContain("001_counter.sql");
  expect(rows.map(r => r.filename)).toContain("002_activity.sql");
});

test("runMigrations is idempotent — second call does not throw or duplicate", () => {
  runMigrations(db, MIGRATIONS_DIR);
  expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow();
  const rows = db
    .query("SELECT filename FROM _migrations WHERE filename='001_counter.sql'")
    .all();
  expect(rows.length).toBe(1);
});

test("SKIP_MIGRATIONS=1 skips all migrations", () => {
  process.env.SKIP_MIGRATIONS = "1";
  try {
    runMigrations(db, MIGRATIONS_DIR);
  } finally {
    delete process.env.SKIP_MIGRATIONS;
  }
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='counter'")
    .all();
  expect(tables.length).toBe(0);
});
