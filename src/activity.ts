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

export function getActivityBefore(db: Database, beforeId: number, limit: number): ActivityEntry[] {
  return db
    .query<ActivityEntry, [number, number]>(
      "SELECT id, action, timestamp FROM activity WHERE id < ? ORDER BY id DESC LIMIT ?"
    )
    .all(beforeId, limit);
}

export function getActivityCount(db: Database): number {
  const row = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM activity").get();
  return row?.count ?? 0;
}

export function handleHistoryRequest(db: Database, req: Request): Response {
  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const rawBefore = url.searchParams.get("before");
  const beforeId = rawBefore != null ? parseInt(rawBefore, 10) : null;
  const entries = beforeId != null && !isNaN(beforeId)
    ? getActivityBefore(db, beforeId, limit)
    : getRecentActivity(db, limit);
  const total = getActivityCount(db);
  return Response.json({ entries, total, limit });
}
