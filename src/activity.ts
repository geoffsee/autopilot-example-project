import { Database } from "bun:sqlite";

export type ActivityEntry = { id: number; action: string; timestamp: string };

export function setupActivityTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      action    TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);
}

export function logActivity(db: Database, action: string): ActivityEntry {
  const timestamp = new Date().toISOString();
  const result = db.run("INSERT INTO activity (action, timestamp) VALUES (?, ?)", [action, timestamp]);
  return { id: Number(result.lastInsertRowid), action, timestamp };
}

export function getRecentActivity(db: Database, limit = 20): ActivityEntry[] {
  return db
    .query<ActivityEntry, [number]>(
      "SELECT id, action, timestamp FROM activity ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
}
