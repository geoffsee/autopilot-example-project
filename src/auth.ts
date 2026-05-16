import { Database } from "bun:sqlite";

export const DEFAULT_DEV_API_KEY = "dev-secret-key";

export function setupApiKeysTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `);
  db.run(
    `INSERT OR IGNORE INTO api_keys (key, description) VALUES (?, ?)`,
    [DEFAULT_DEV_API_KEY, "Default dev key"]
  );
}

export function validateApiKey(db: Database, key: string): boolean {
  return db.query("SELECT 1 FROM api_keys WHERE key = ?").get(key) !== null;
}

export function requireApiKey(req: Request, db: Database): Response | null {
  const key = req.headers.get("x-api-key");
  if (!key || !validateApiKey(db, key)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
