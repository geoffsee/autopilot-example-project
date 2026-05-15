import { Database } from "bun:sqlite";

export function createCounterDb(path = "counter.db"): Database {
  const db = new Database(path);
  setupCounter(db);
  return db;
}

export function getCount(db: Database): number {
  return getCounterValue(db);
}

export function increment(db: Database): number {
  db.run("UPDATE counter SET value = value + 1 WHERE id = 1");
  return getCounterValue(db);
}

export function setupCounter(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`
  );
  // Migrate existing databases that still use the old column name.
  try {
    db.run(`ALTER TABLE counter RENAME COLUMN count TO value`);
  } catch {
    // Column already named 'value' — no migration needed.
  }
  db.run(`INSERT OR IGNORE INTO counter (id, value) VALUES (1, 0)`);
}

export function getCounterValue(db: Database): number {
  const row = db.query("SELECT value FROM counter WHERE id = 1").get() as {
    value: number;
  } | null;
  return row?.value ?? 0;
}

export async function handleCounterPost(
  req: Request,
  db: Database
): Promise<Response> {
  const text = await req.text();
  let increment = 1;

  if (text.trim() !== "") {
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
      if (typeof inc !== "number" || !Number.isInteger(inc) || inc < 0) {
        return Response.json(
          { error: "increment must be a non-negative integer" },
          { status: 400 }
        );
      }
      increment = inc;
    }
  }

  db.run("UPDATE counter SET value = value + ? WHERE id = 1", [increment]);
  return Response.json({ count: getCounterValue(db) });
}
