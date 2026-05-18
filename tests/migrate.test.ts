import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../src/migrate";

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations");

test("runMigrations applies 001_init.sql and records it in _migrations", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, MIGRATIONS_DIR);

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

test("runMigrations second run is a no-op", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, MIGRATIONS_DIR);

  const countAfterFirst = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations")
    .all().length;

  await runMigrations(db, MIGRATIONS_DIR);

  const countAfterSecond = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations")
    .all().length;

  expect(countAfterSecond).toBe(countAfterFirst);

  db.close();
});

test("runMigrations throws on non-existent directory", async () => {
  const db = new Database(":memory:");
  await expect(runMigrations(db, "/tmp/does-not-exist-migrations-dir")).rejects.toThrow();
  db.close();
});

test("runMigrations throws and rolls back on invalid SQL", async () => {
  const db = new Database(":memory:");
  const tmpDir = mkdtempSync(tmpdir() + "/migrate-test-");
  writeFileSync(join(tmpDir, "002_bad.sql"), "THIS IS NOT VALID SQL;;;");

  try {
    await expect(runMigrations(db, tmpDir)).rejects.toThrow();

    // migration should not have been recorded
    const rows = db
      .query<{ filename: string }, []>("SELECT filename FROM _migrations")
      .all();
    expect(rows.length).toBe(0);
  } finally {
    rmSync(tmpDir, { recursive: true });
    db.close();
  }
});
