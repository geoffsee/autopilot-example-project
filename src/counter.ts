import { Database } from "bun:sqlite";

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

// --- Named counter support ---

export function setupNamedCounters(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS named_counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    )`
  );
}

export function getNamedCount(db: Database, name: string): number {
  const row = db
    .query("SELECT value FROM named_counters WHERE name = ?")
    .get(name) as { value: number } | null;
  return row?.value ?? 0;
}

export function incrementNamedCounter(db: Database, name: string, amount: number): number {
  const row = db
    .query(
      `INSERT INTO named_counters (name, value) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET value = value + excluded.value
       RETURNING value`
    )
    .get(name, amount) as { value: number };
  return row.value;
}

// --- Shared body parsing ---

async function parseCounterBody(req: Request): Promise<number | Response> {
  const text = await req.text();
  if (text.trim() === "") return 1;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json(
      { error: "Content-Type must be application/json" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Body must be an object" }, { status: 400 });
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
      return Response.json(
        { error: "increment must be a non-negative integer no greater than 1000000" },
        { status: 400 }
      );
    }
    return inc;
  }
  return 1;
}

export async function handleCounterPost(
  req: Request,
  db: Database
): Promise<{ response: Response; count?: number }> {
  const result = await parseCounterBody(req);
  if (result instanceof Response) return { response: result };

  const row = db
    .query("UPDATE counter SET value = value + ? WHERE id = 1 RETURNING value")
    .get(result) as { value: number } | null;
  if (!row) return { response: Response.json({ error: "Counter not found" }, { status: 500 }) };
  return { response: Response.json({ count: row.value }), count: row.value };
}

export async function handleNamedCounterPost(
  req: Request,
  db: Database,
  name: string
): Promise<{ response: Response; count?: number; name?: string }> {
  const result = await parseCounterBody(req);
  if (result instanceof Response) return { response: result };

  const value = incrementNamedCounter(db, name, result);
  return { response: Response.json({ count: value }), count: value, name };
}
