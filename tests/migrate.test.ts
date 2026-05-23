import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations, rollbackLastMigration } from "../src/migrate";

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
  await expect(runMigrations(db, join(tmpdir(), `migrate-nonexistent-${Date.now()}`))).rejects.toThrow();
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

test("rollbackLastMigration returns null when no migrations applied", async () => {
  const db = new Database(":memory:");
  const tmpDir = mkdtempSync(tmpdir() + "/migrate-down-empty-");
  try {
    const result = await rollbackLastMigration(db, tmpDir);
    expect(result).toBeNull();
  } finally {
    rmSync(tmpDir, { recursive: true });
    db.close();
  }
});

test("rollbackLastMigration applies and rolls back a migration, verifying schema state", async () => {
  const db = new Database(":memory:");
  const tmpDir = mkdtempSync(tmpdir() + "/migrate-down-basic-");
  writeFileSync(
    join(tmpDir, "001_test.sql"),
    [
      "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
      "",
      "-- down:",
      "DROP TABLE IF EXISTS test_table;",
    ].join("\n"),
  );

  try {
    await runMigrations(db, tmpDir);

    const tablesBefore = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
      )
      .all();
    expect(tablesBefore.length).toBe(1);

    const rolledBack = await rollbackLastMigration(db, tmpDir);
    expect(rolledBack).toBe("001_test.sql");

    const tablesAfter = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'",
      )
      .all();
    expect(tablesAfter.length).toBe(0);

    const rows = db
      .query<{ filename: string }, []>("SELECT filename FROM _migrations")
      .all();
    expect(rows.length).toBe(0);
  } finally {
    rmSync(tmpDir, { recursive: true });
    db.close();
  }
});

test("rollbackLastMigration rolls back only the most recent migration", async () => {
  const db = new Database(":memory:");
  const tmpDir = mkdtempSync(tmpdir() + "/migrate-down-order-");
  writeFileSync(
    join(tmpDir, "001_first.sql"),
    [
      "CREATE TABLE first_table (id INTEGER PRIMARY KEY);",
      "",
      "-- down:",
      "DROP TABLE IF EXISTS first_table;",
    ].join("\n"),
  );
  writeFileSync(
    join(tmpDir, "002_second.sql"),
    [
      "CREATE TABLE second_table (id INTEGER PRIMARY KEY);",
      "",
      "-- down:",
      "DROP TABLE IF EXISTS second_table;",
    ].join("\n"),
  );

  try {
    await runMigrations(db, tmpDir);

    const rolled1 = await rollbackLastMigration(db, tmpDir);
    expect(rolled1).toBe("002_second.sql");

    expect(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='second_table'",
        )
        .all().length,
    ).toBe(0);
    expect(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='first_table'",
        )
        .all().length,
    ).toBe(1);

    const rolled2 = await rollbackLastMigration(db, tmpDir);
    expect(rolled2).toBe("001_first.sql");

    expect(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='first_table'",
        )
        .all().length,
    ).toBe(0);
  } finally {
    rmSync(tmpDir, { recursive: true });
    db.close();
  }
});

test("all existing migration files have a -- down: section and can be rolled back", async () => {
  const db = new Database(":memory:");
  await runMigrations(db, MIGRATIONS_DIR);

  const applied = db
    .query<{ filename: string }, []>(
      "SELECT filename FROM _migrations ORDER BY applied_at DESC, filename DESC",
    )
    .all()
    .map(r => r.filename);

  expect(applied.length).toBeGreaterThan(0);

  for (const _ of applied) {
    const rolledBack = await rollbackLastMigration(db, MIGRATIONS_DIR);
    expect(rolledBack).not.toBeNull();
  }

  const remaining = db
    .query<{ filename: string }, []>("SELECT filename FROM _migrations")
    .all();
  expect(remaining.length).toBe(0);

  db.close();
});
