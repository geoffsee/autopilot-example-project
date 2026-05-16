import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/migrations";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

test("runMigrations creates _migrations tracking table", () => {
  runMigrations(db, MIGRATIONS_DIR);
  const tables = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
  ).all() as { name: string }[];
  expect(tables).toHaveLength(1);
});

test("runMigrations applies 001_initial creating counter table", () => {
  runMigrations(db, MIGRATIONS_DIR);
  const tables = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='counter'"
  ).all() as { name: string }[];
  expect(tables).toHaveLength(1);
});

test("runMigrations records migration version in _migrations", () => {
  runMigrations(db, MIGRATIONS_DIR);
  const rows = db.query("SELECT version FROM _migrations").all() as { version: string }[];
  expect(rows.some(r => r.version === "001_initial")).toBe(true);
});

test("idempotent — running runMigrations twice does not throw", () => {
  runMigrations(db, MIGRATIONS_DIR);
  expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow();
});

test("idempotent — second run does not duplicate _migrations rows", () => {
  runMigrations(db, MIGRATIONS_DIR);
  runMigrations(db, MIGRATIONS_DIR);
  const rows = db.query(
    "SELECT version FROM _migrations WHERE version = '001_initial'"
  ).all();
  expect(rows).toHaveLength(1);
});
