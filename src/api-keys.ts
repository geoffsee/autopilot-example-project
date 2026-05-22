import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";

export interface ApiKey {
  id: number;
  name: string;
  scope: "read" | "write";
  created_at: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createApiKey(
  db: Database,
  name: string,
  scope: "read" | "write"
): { token: string; key: ApiKey } {
  const token = randomBytes(32).toString("hex");
  const token_hash = hashToken(token);
  const created_at = new Date().toISOString();
  const key = db
    .query<ApiKey, [string, string, string, string]>(
      "INSERT INTO _api_keys (name, token_hash, scope, created_at) VALUES (?, ?, ?, ?) RETURNING id, name, scope, created_at"
    )
    .get(name, token_hash, scope, created_at)!;
  return { token, key };
}

export function listApiKeys(db: Database): ApiKey[] {
  return db
    .query<ApiKey, []>("SELECT id, name, scope, created_at FROM _api_keys ORDER BY id")
    .all();
}

export function deleteApiKey(db: Database, id: number): boolean {
  const result = db.run("DELETE FROM _api_keys WHERE id = ?", [id]);
  return result.changes > 0;
}

export function findApiKeyByToken(db: Database, token: string): ApiKey | null {
  if (!token) return null;
  const hash = hashToken(token);
  return (
    db
      .query<ApiKey, [string]>(
        "SELECT id, name, scope, created_at FROM _api_keys WHERE token_hash = ?"
      )
      .get(hash) ?? null
  );
}
