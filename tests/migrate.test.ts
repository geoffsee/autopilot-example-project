import { test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/migrate";
import type { Migration } from "../src/migrate";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

const migrationA: Migration = {
  version: 1,
  name: "create-foo",
  sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY)",
};

const migrationB: Migration = {
  version: 2,
  name: "create-bar",
  sql: "CREATE TABLE bar (id INTEGER PRIMARY KEY)",
};

test("runMigrations applies a migration and creates the _migrations table", () => {
  runMigrations(db, [migrationA]);
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain("foo");
  expect(names).toContain("_migrations");
});

test("runMigrations is idempotent — running twice does not error or duplicate entries", () => {
  runMigrations(db, [migrationA]);
  runMigrations(db, [migrationA]);
  const rows = db.query("SELECT version FROM _migrations").all() as { version: number }[];
  expect(rows.filter((r) => r.version === 1)).toHaveLength(1);
});

test("runMigrations applies multiple migrations in version order regardless of input order", () => {
  runMigrations(db, [migrationB, migrationA]);
  const rows = db
    .query("SELECT version FROM _migrations ORDER BY version")
    .all() as { version: number }[];
  expect(rows.map((r) => r.version)).toEqual([1, 2]);
});

test("runMigrations skips already-applied migrations on a subsequent call", () => {
  runMigrations(db, [migrationA]);
  runMigrations(db, [migrationA, migrationB]);
  const rows = db.query("SELECT version FROM _migrations").all() as { version: number }[];
  expect(rows).toHaveLength(2);
});

test("runMigrations records the migration name in _migrations", () => {
  runMigrations(db, [migrationA]);
  const row = db
    .query("SELECT name FROM _migrations WHERE version = 1")
    .get() as { name: string };
  expect(row.name).toBe("create-foo");
});
