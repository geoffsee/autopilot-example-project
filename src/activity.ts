import { Database } from "bun:sqlite";

export type ActivityEntry = { id: number; action: string; timestamp: string; label: string | null };

export function setupActivityTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      action    TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      label     TEXT
    )
  `);
  // Migrate existing tables that lack the label column.
  const cols = db.query("PRAGMA table_info(activity)").all() as { name: string }[];
  if (!cols.some(c => c.name === "label")) {
    db.run("ALTER TABLE activity ADD COLUMN label TEXT");
  }
}

export function logActivity(db: Database, action: string): ActivityEntry {
  const timestamp = new Date().toISOString();
  const result = db.run("INSERT INTO activity (action, timestamp) VALUES (?, ?)", [action, timestamp]);
  return { id: Number(result.lastInsertRowid), action, timestamp, label: null };
}

export function updateActivityLabel(db: Database, id: number, label: string): void {
  db.run("UPDATE activity SET label = ? WHERE id = ?", [label, id]);
}

export function getRecentActivity(db: Database, limit = 20): ActivityEntry[] {
  return db
    .query<ActivityEntry, [number]>(
      "SELECT id, action, timestamp, label FROM activity ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
}
