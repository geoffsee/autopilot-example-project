import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../src/migrate";
import { purgeExpiredRecords } from "../src/retention";

let db: Database;

beforeEach(async () => {
  db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
});

afterEach(() => {
  db.close();
});

function insertAuditRow(db: Database, timestamp: string): number {
  const result = db.run(
    "INSERT INTO _audit (actor, counter_name, old_value, new_value, timestamp) VALUES (?, ?, ?, ?, ?)",
    ["api", "hits", 0, 1, timestamp]
  );
  return result.lastInsertRowid as number;
}

function insertDeliveryRow(db: Database, createdAt: string, status: string): number {
  const result = db.run(
    `INSERT INTO _webhook_deliveries (webhook_id, url, payload, status, attempt_count, next_retry_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["wh1", "https://example.com/hook", "{}", status, 0, null, createdAt]
  );
  return result.lastInsertRowid as number;
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function countAudit(db: Database): number {
  return (db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM _audit").get()!).c;
}

function countDeliveries(db: Database): number {
  return (db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM _webhook_deliveries").get()!).c;
}

test("purgeExpiredRecords deletes _audit rows older than retention window", () => {
  insertAuditRow(db, daysAgo(100));
  insertAuditRow(db, daysAgo(91));
  insertAuditRow(db, daysAgo(89));
  insertAuditRow(db, daysAgo(1));

  const result = purgeExpiredRecords(db, 90);

  expect(result.auditDeleted).toBe(2);
  expect(countAudit(db)).toBe(2);
});

test("purgeExpiredRecords preserves _audit rows within the retention window", () => {
  insertAuditRow(db, daysAgo(45));
  insertAuditRow(db, daysAgo(0));

  const result = purgeExpiredRecords(db, 90);

  expect(result.auditDeleted).toBe(0);
  expect(countAudit(db)).toBe(2);
});

test("purgeExpiredRecords deletes terminal webhook deliveries older than retention window", () => {
  insertDeliveryRow(db, daysAgo(100), "success");
  insertDeliveryRow(db, daysAgo(95), "failed");
  insertDeliveryRow(db, daysAgo(45), "success");

  const result = purgeExpiredRecords(db, 90);

  expect(result.deliveriesDeleted).toBe(2);
  expect(countDeliveries(db)).toBe(1);
});

test("purgeExpiredRecords never deletes pending webhook deliveries regardless of age", () => {
  insertDeliveryRow(db, daysAgo(200), "pending");
  insertDeliveryRow(db, daysAgo(100), "success");

  const result = purgeExpiredRecords(db, 90);

  expect(result.deliveriesDeleted).toBe(1);
  // pending row survives
  const remaining = db
    .query<{ status: string }, []>("SELECT status FROM _webhook_deliveries")
    .all();
  expect(remaining.length).toBe(1);
  expect(remaining[0]!.status).toBe("pending");
});

test("purgeExpiredRecords returns zero counts when nothing is eligible", () => {
  insertAuditRow(db, daysAgo(10));
  insertDeliveryRow(db, daysAgo(10), "success");

  const result = purgeExpiredRecords(db, 90);

  expect(result.auditDeleted).toBe(0);
  expect(result.deliveriesDeleted).toBe(0);
});

test("purgeExpiredRecords respects a custom retention window", () => {
  insertAuditRow(db, daysAgo(10));
  insertAuditRow(db, daysAgo(2));

  const result = purgeExpiredRecords(db, 7);

  expect(result.auditDeleted).toBe(1);
  expect(countAudit(db)).toBe(1);
});
