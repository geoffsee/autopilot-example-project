import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/migrate";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

test("runMigrations creates _migrations table", () => {
  runMigrations(db, []);
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];
  expect(tables.some(t => t.name === "_migrations")).toBe(true);
});

test("runMigrations applies a migration", () => {
  runMigrations(db, [
    { version: 1, name: "create-foo", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY)" },
  ]);
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='foo'")
    .all();
  expect(tables).toHaveLength(1);
});

test("runMigrations applies migrations in version order regardless of array order", () => {
  runMigrations(db, [
    { version: 2, name: "second", sql: "CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id))" },
    { version: 1, name: "first", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY)" },
  ]);
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name != '_migrations' ORDER BY name")
    .all() as { name: string }[];
  expect(tables.map(t => t.name)).toEqual(["a", "b"]);
});

test("runMigrations is idempotent - does not re-apply migrations", () => {
  const m = { version: 1, name: "create-foo", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY)" };
  runMigrations(db, [m]);
  runMigrations(db, [m]);
  const rows = db.query("SELECT * FROM _migrations").all();
  expect(rows).toHaveLength(1);
});

test("runMigrations records version and name of applied migrations", () => {
  runMigrations(db, [
    { version: 1, name: "first", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY)" },
    { version: 2, name: "second", sql: "CREATE TABLE b (id INTEGER PRIMARY KEY)" },
  ]);
  const rows = db
    .query("SELECT version, name FROM _migrations ORDER BY version")
    .all() as { version: number; name: string }[];
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ version: 1, name: "first" });
  expect(rows[1]).toMatchObject({ version: 2, name: "second" });
});

test("runMigrations only applies new migrations on subsequent calls", () => {
  runMigrations(db, [
    { version: 1, name: "first", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY)" },
  ]);
  runMigrations(db, [
    { version: 1, name: "first", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY)" },
    { version: 2, name: "second", sql: "CREATE TABLE b (id INTEGER PRIMARY KEY)" },
  ]);
  const rows = db.query("SELECT version FROM _migrations ORDER BY version").all() as { version: number }[];
  expect(rows.map(r => r.version)).toEqual([1, 2]);
});
