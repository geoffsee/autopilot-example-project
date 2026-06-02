import { Database } from "bun:sqlite";
import { errorJson, ErrorCode } from "./errors";

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

export function getCountersByPrefix(
  db: Database,
  prefix: string,
  opts: { limit?: number; offset?: number } = {}
): { prefix: string; total: number; counters: { name: string; value: number }[] } {
  const end = prefix + "\xff";
  const { limit, offset = 0 } = opts;

  const totalRow = db
    .query<{ total: number }, [string, string]>(
      "SELECT COALESCE(SUM(value), 0) AS total FROM counters WHERE name >= ? AND name < ?"
    )
    .get(prefix, end);
  const total = totalRow?.total ?? 0;

  const counters =
    limit !== undefined
      ? db
          .query<{ name: string; value: number }, [string, string, number, number]>(
            "SELECT name, value FROM counters WHERE name >= ? AND name < ? ORDER BY name ASC LIMIT ? OFFSET ?"
          )
          .all(prefix, end, limit, offset)
      : db
          .query<{ name: string; value: number }, [string, string]>(
            "SELECT name, value FROM counters WHERE name >= ? AND name < ? ORDER BY name ASC"
          )
          .all(prefix, end);

  return { prefix, total, counters };
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


export function incrementNamedCounterByDelta(
  db: Database,
  name: string,
  delta: number
): { name: string; value: number; oldValue: number; delta: number } {
  db.run(`INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)`, [name]);
  const row = db.query<{ value: number; old_value: number }, [number, string, number]>(
    "UPDATE counters SET value = value + ? WHERE name = ? RETURNING value, value - ? AS old_value"
  ).get(delta, name, delta);
  return { name, value: row?.value ?? 0, oldValue: row?.old_value ?? 0, delta };
}

export function decrementNamedCounterByDelta(
  db: Database,
  name: string,
  delta: number
): { name: string; value: number; oldValue: number; delta: number } {
  db.run(`INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)`, [name]);
  const row = db.query<{ value: number; old_value: number }, [number, string, number]>(
    "UPDATE counters SET value = value - ? WHERE name = ? RETURNING value, value + ? AS old_value"
  ).get(delta, name, delta);
  return { name, value: row?.value ?? 0, oldValue: row?.old_value ?? 0, delta: -delta };
}

export interface BatchOperation {
  name: string;
  delta: number;
}

export interface BatchResult {
  name: string;
  value: number;
  oldValue: number;
  delta: number;
}

export function batchCounterOperations(
  db: Database,
  operations: BatchOperation[]
): BatchResult[] {
  const results: BatchResult[] = [];
  const txn = db.transaction(() => {
    for (const op of operations) {
      db.run(`INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)`, [op.name]);
      const row = db.query<{ value: number; old_value: number }, [number, string, number]>(
        "UPDATE counters SET value = value + ? WHERE name = ? RETURNING value, value - ? AS old_value"
      ).get(op.delta, op.name, op.delta);
      results.push({ name: op.name, value: row?.value ?? 0, oldValue: row?.old_value ?? 0, delta: op.delta });
    }
  });
  txn();
  return results;
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
        response: errorJson(
          "Content-Type must be application/json",
          ErrorCode.INVALID_CONTENT_TYPE,
          400,
        ),
      };
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { response: errorJson("Invalid JSON", ErrorCode.INVALID_JSON, 400) };
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { response: errorJson("Body must be an object", ErrorCode.INVALID_BODY, 400) };
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
          response: errorJson(
            "increment must be a non-negative integer no greater than 1000000",
            ErrorCode.INVALID_INCREMENT,
            400,
          ),
        };
      }
      increment = inc;
    }
  }

  const row = db
    .query("UPDATE counter SET value = value + ? WHERE id = 1 RETURNING value, value - ? AS old_value")
    .get(increment, increment) as { value: number; old_value: number } | null;
  if (!row) {
    return { response: errorJson("Counter not found", ErrorCode.COUNTER_NOT_FOUND, 500) };
  }
  return {
    response: Response.json({ count: row.value }),
    count: row.value,
    oldCount: row.old_value,
  };
}
