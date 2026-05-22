import { Database } from "bun:sqlite";

export function createCounterDb(path = "counter.db"): Database {
  return new Database(path);
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
  db.run(
    `CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`
  );
  // Migrate existing databases that still use the old column name.
  const cols = db.query("PRAGMA table_info(counter)").all() as { name: string }[];
  if (cols.some(c => c.name === "count")) {
    db.run(`ALTER TABLE counter RENAME COLUMN count TO value`);
  }
  db.run(`INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0)`);
}

export function getCounterValue(db: Database): number {
  const row = db.query("SELECT value FROM counter WHERE id = 1").get() as {
    value: number;
  } | null;
  return row?.value ?? 0;
}

export function setupNamedCounters(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`
  );
}

export function getNamedCounter(db: Database, name: string): { name: string; value: number } {
  db.run(`INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)`, [name]);
  const row = db.query<{ value: number }, [string]>(
    "SELECT value FROM counters WHERE name = ?"
  ).get(name);
  return { name, value: row?.value ?? 0 };
}

export function resetNamedCounter(
  db: Database,
  name: string
): { name: string; value: number; oldValue: number } | null {
  const existing = db.query<{ value: number }, [string]>(
    "SELECT value FROM counters WHERE name = ?"
  ).get(name);
  if (!existing) return null;
  db.run("UPDATE counters SET value = 0 WHERE name = ?", [name]);
  return { name, value: 0, oldValue: existing.value };
}

export function incrementNamedCounter(db: Database, name: string): { name: string; value: number } {
  db.run(`INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)`, [name]);
  const row = db.query<{ value: number }, [string]>(
    "UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value"
  ).get(name);
  return { name, value: row?.value ?? 0 };
}

export function incrementNamedCounterTracked(
  db: Database,
  name: string
): { name: string; value: number; oldValue: number } {
  db.run(`INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)`, [name]);
  // RETURNING value is the post-update value; value - 1 is the pre-update value
  const row = db.query<{ value: number; old_value: number }, [string]>(
    "UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value, value - 1 AS old_value"
  ).get(name);
  return { name, value: row?.value ?? 0, oldValue: row?.old_value ?? 0 };
}

export async function handleCounterPost(
  req: Request,
  db: Database
): Promise<{ response: Response; count?: number; oldCount?: number }> {
  const text = await req.text();
  let increment = 1;

  if (text.trim() !== "") {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        response: Response.json(
          { error: "Content-Type must be application/json" },
          { status: 400 }
        ),
      };
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { response: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { response: Response.json({ error: "Body must be an object" }, { status: 400 }) };
    }

    const obj = body as Record<string, unknown>;
    if ("increment" in obj) {
      const inc = obj.increment;
      if (
        typeof inc !== "number" ||
        !Number.isInteger(inc) ||
        inc < 0 ||
        inc > 1_000_000
      ) {
        return {
          response: Response.json(
            { error: "increment must be a non-negative integer no greater than 1000000" },
            { status: 400 }
          ),
        };
      }
      increment = inc;
    }
  }

  const row = db
    .query("UPDATE counter SET value = value + ? WHERE id = 1 RETURNING value, value - ? AS old_value")
    .get(increment, increment) as { value: number; old_value: number } | null;
  if (!row) return { response: Response.json({ error: "Counter not found" }, { status: 500 }) };
  return { response: Response.json({ count: row.value }), count: row.value, oldCount: row.old_value };
}
