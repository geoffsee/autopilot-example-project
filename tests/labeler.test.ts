import { expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { setupCounter } from "../src/counter";
import { setupActivityTable, logActivity, getRecentActivity, updateActivityLabel } from "../src/activity";
import { generateLabel } from "../src/labeler";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  setupCounter(db);
  setupActivityTable(db);
});

afterEach(() => {
  db.close();
});

test("generateLabel returns null when ANTHROPIC_API_KEY is not set", async () => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const label = await generateLabel("counter.increment", 1);
  expect(label).toBeNull();
  if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
});

test("updateActivityLabel persists label to database", () => {
  const entry = logActivity(db, "counter.increment");
  updateActivityLabel(db, entry.id, "milestone");
  const entries = getRecentActivity(db);
  expect(entries[0]!.label).toBe("milestone");
});

test("getRecentActivity includes label field in entries", () => {
  logActivity(db, "counter.increment");
  const entries = getRecentActivity(db);
  expect(entries[0]).toHaveProperty("label");
});

test("new activity entries have null label by default", () => {
  logActivity(db, "counter.increment");
  const entries = getRecentActivity(db);
  expect(entries[0]!.label).toBeNull();
});
