import { Database } from "bun:sqlite";
import { runMigrations } from "./migrations";

export async function createCounterDb(path = "counter.db"): Promise<Database> {
  const db = new Database(path);
  await setupCounter(db);
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

export async function setupCounter(db: Database): Promise<void> {
  // Rename legacy column before running SQL migrations that reference 'value'.
  const pragma = db.query("PRAGMA table_info(counter)");
  const cols = pragma.all() as { name: string }[];
  pragma.finalize();
  if (cols.some(c => c.name === "count")) {
    db.run(`ALTER TABLE counter RENAME COLUMN count TO value`);
  }
  await runMigrations(db);
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
): Promise<{ response: Response; count?: number }> {
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
    .query("UPDATE counter SET value = value + ? WHERE id = 1 RETURNING value")
    .get(increment) as { value: number } | null;
  if (!row) return { response: Response.json({ error: "Counter not found" }, { status: 500 }) };
  return { response: Response.json({ count: row.value }), count: row.value };
}
