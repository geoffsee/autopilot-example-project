import { Database } from "bun:sqlite";

export type HistoryEntry = {
  id: number;
  name: string;
  delta: number;
  new_value: number;
  timestamp: string;
};

export function createCounterDb(path = "counter.db"): Database {
  const db = new Database(path);
  setupCounter(db);
  return db;
}

export function getCount(db: Database): number {
  return getCounterValue(db);
}

export function incrementCounter(db: Database): number {
  const row = db
    .query("UPDATE counter SET value = value + 1 WHERE id = 1 RETURNING value")
    .get() as { value: number };
  return row.value;
}

export function setupCounter(db: Database): void {
  db.run("PRAGMA journal_mode=WAL");
  db.run(
    `CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`
  );
  // Migrate existing databases that still use the old column name.
  const cols = db.query("PRAGMA table_info(counter)").all() as { name: string }[];
  if (cols.some(c => c.name === "count")) {
    db.run(`ALTER TABLE counter RENAME COLUMN count TO value`);
  }
  db.run(`INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0)`);
  // Add name column for named counters if not present.
  const updatedCols = db.query("PRAGMA table_info(counter)").all() as { name: string }[];
  if (!updatedCols.some(c => c.name === "name")) {
    db.run(`ALTER TABLE counter ADD COLUMN name TEXT`);
    db.run(`UPDATE counter SET name = 'default' WHERE id = 1`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_counter_name ON counter(name) WHERE name IS NOT NULL`);
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS counter_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      delta     INTEGER NOT NULL,
      new_value INTEGER NOT NULL,
      timestamp TEXT    NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_counter_history_name ON counter_history(name)`);
}

export function getCounterValue(db: Database): number {
  const row = db.query("SELECT value FROM counter WHERE id = 1").get() as {
    value: number;
  } | null;
  return row?.value ?? 0;
}

export function getNamedCount(db: Database, name: string): number {
  const row = db.query("SELECT value FROM counter WHERE name = ?").get(name) as {
    value: number;
  } | null;
  return row?.value ?? 0;
}

export function incrementNamedCounter(db: Database, name: string, amount: number): number {
  return db.transaction(() => {
    db.run("INSERT OR IGNORE INTO counter (name, value) VALUES (?, 0)", [name]);
    const row = db
      .query("UPDATE counter SET value = value + ? WHERE name = ? RETURNING value")
      .get(amount, name) as { value: number } | null;
    const newValue = row?.value ?? 0;
    if (amount !== 0) {
      db.run(
        "INSERT INTO counter_history (name, delta, new_value, timestamp) VALUES (?, ?, ?, ?)",
        [name, amount, newValue, new Date().toISOString()]
      );
    }
    return newValue;
  })();
}

export function getCounterHistory(
  db: Database,
  name: string,
  options: { limit?: number; offset?: number } = {}
): HistoryEntry[] {
  const limit = Math.min((options.limit && options.limit > 0) ? options.limit : 20, 100);
  const offset = options.offset ?? 0;
  return db
    .query<HistoryEntry, [string, number, number]>(
      "SELECT id, name, delta, new_value, timestamp FROM counter_history WHERE name = ? ORDER BY id DESC LIMIT ? OFFSET ?"
    )
    .all(name, limit, offset);
}

async function parseIncrementBody(req: Request): Promise<{ increment: number } | { error: string; status: number }> {
  const text = await req.text();
  if (text.trim() === "") return { increment: 1 };

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { error: "Content-Type must be application/json", status: 400 };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Invalid JSON", status: 400 };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Body must be an object", status: 400 };
  }

  const obj = body as Record<string, unknown>;
  if ("increment" in obj) {
    const inc = obj.increment;
    if (typeof inc !== "number" || !Number.isInteger(inc) || inc < 0 || inc > 1_000_000) {
      return { error: "increment must be a non-negative integer no greater than 1000000", status: 400 };
    }
    return { increment: inc };
  }

  return { increment: 1 };
}

export async function handleCounterPost(
  req: Request,
  db: Database
): Promise<{ response: Response; count?: number }> {
  const parsed = await parseIncrementBody(req);
  if ("error" in parsed) {
    return { response: Response.json({ error: parsed.error }, { status: parsed.status }) };
  }

  const row = db
    .query("UPDATE counter SET value = value + ? WHERE id = 1 RETURNING value")
    .get(parsed.increment) as { value: number } | null;
  if (!row) return { response: Response.json({ error: "Counter not found" }, { status: 500 }) };
  return { response: Response.json({ count: row.value }), count: row.value };
}

export function resetNamedCounter(db: Database, name: string): number | null {
  const result = db
    .query("UPDATE counter SET value = 0 WHERE name = ? RETURNING id")
    .get(name) as { id: number } | null;
  return result === null ? null : 0;
}

export function getLeaderboard(db: Database, limit: number): { name: string; value: number }[] {
  return db
    .query("SELECT name, value FROM counter WHERE name IS NOT NULL ORDER BY value DESC LIMIT ?")
    .all(limit) as { name: string; value: number }[];
}

export async function handleNamedCounterPost(
  req: Request,
  db: Database,
  name: string
): Promise<{ response: Response; value?: number }> {
  const parsed = await parseIncrementBody(req);
  if ("error" in parsed) {
    return { response: Response.json({ error: parsed.error }, { status: parsed.status }) };
  }

  const value = incrementNamedCounter(db, name, parsed.increment);
  return { response: Response.json({ name, value }), value };
}
