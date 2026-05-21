import { Database } from "bun:sqlite";

export interface AuditEntry {
  id: number;
  actor: string;
  counter_name: string;
  old_value: number;
  new_value: number;
  timestamp: string;
}

export function setupAudit(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS _audit (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      actor        TEXT NOT NULL,
      counter_name TEXT NOT NULL,
      old_value    INTEGER NOT NULL,
      new_value    INTEGER NOT NULL,
      timestamp    TEXT NOT NULL
    )
  `);
}

export function writeAuditEntry(
  db: Database,
  actor: string,
  counterName: string,
  oldValue: number,
  newValue: number
): AuditEntry {
  const timestamp = new Date().toISOString();
  const row = db
    .query<AuditEntry, [string, string, number, number, string]>(
      "INSERT INTO _audit (actor, counter_name, old_value, new_value, timestamp) VALUES (?, ?, ?, ?, ?) RETURNING *"
    )
    .get(actor, counterName, oldValue, newValue, timestamp);
  return row!;
}

export function getAuditEntries(
  db: Database,
  options: { counter?: string; limit?: number; offset?: number }
): AuditEntry[] {
  const { counter, limit = 50, offset = 0 } = options;
  if (counter) {
    return db
      .query<AuditEntry, [string, number, number]>(
        "SELECT * FROM _audit WHERE counter_name = ? ORDER BY id DESC LIMIT ? OFFSET ?"
      )
      .all(counter, limit, offset);
  }
  return db
    .query<AuditEntry, [number, number]>(
      "SELECT * FROM _audit ORDER BY id DESC LIMIT ? OFFSET ?"
    )
    .all(limit, offset);
}
