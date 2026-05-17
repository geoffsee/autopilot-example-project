import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/migrations";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const FIXTURE_SQL = `CREATE TABLE IF NOT EXISTS counter (
  id    INTEGER PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0);
`;

let db: Database;
let tmpDir: string;

beforeEach(async () => {
  db = new Database(":memory:");
  tmpDir = await mkdtemp(join(tmpdir(), "migrations-test-"));
  await writeFile(join(tmpDir, "001_initial.sql"), FIXTURE_SQL);
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true });
});

test("runMigrations creates _migrations tracking table", async () => {
  await runMigrations(db, tmpDir);
  const tables = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
  ).all() as { name: string }[];
  expect(tables).toHaveLength(1);
});

test("runMigrations applies 001_initial creating counter table", async () => {
  await runMigrations(db, tmpDir);
  const tables = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='counter'"
  ).all() as { name: string }[];
  expect(tables).toHaveLength(1);
});

test("runMigrations records migration version in _migrations", async () => {
  await runMigrations(db, tmpDir);
  const rows = db.query("SELECT version FROM _migrations").all() as { version: string }[];
  expect(rows.some(r => r.version === "001_initial")).toBe(true);
});

test("idempotent — running runMigrations twice does not throw", async () => {
  await runMigrations(db, tmpDir);
  await runMigrations(db, tmpDir);
});

test("idempotent — second run does not duplicate _migrations rows", async () => {
  await runMigrations(db, tmpDir);
  await runMigrations(db, tmpDir);
  const rows = db.query(
    "SELECT version FROM _migrations WHERE version = '001_initial'"
  ).all();
  expect(rows).toHaveLength(1);
});

test("applies multiple migrations in lexicographic order", async () => {
  await writeFile(join(tmpDir, "002_second.sql"), "CREATE TABLE second (id INTEGER PRIMARY KEY);");
  await runMigrations(db, tmpDir);
  const rows = db.query("SELECT version FROM _migrations ORDER BY version").all() as { version: string }[];
  expect(rows.map(r => r.version)).toEqual(["001_initial", "002_second"]);
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='second'").all();
  expect(tables).toHaveLength(1);
});

test("throws when migrations directory does not exist", async () => {
  await expect(runMigrations(db, "/nonexistent/path")).rejects.toThrow("Migrations directory not found");
});
