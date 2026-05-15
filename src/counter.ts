import { Database } from "bun:sqlite";

export function createCounterDb(path: string = "counter.db"): Database {
  const db = new Database(path);
  db.run(
    `CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)`
  );
  db.run(`INSERT OR IGNORE INTO counter (id, count) VALUES (1, 0)`);
  return db;
}

export function getCount(db: Database): number {
  const row = db
    .query<{ count: number }, []>("SELECT count FROM counter WHERE id = 1")
    .get();
  return row?.count ?? 0;
}

export function increment(db: Database): number {
  db.run("UPDATE counter SET count = count + 1 WHERE id = 1");
  return getCount(db);
}
