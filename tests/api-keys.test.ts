import { test, expect, beforeEach, afterEach, beforeAll, afterAll, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runMigrations } from "../src/migrate";
import { createApiKey, listApiKeys, deleteApiKey, findApiKeyByToken } from "../src/api-keys";
import type { createServer } from "../src/index";

// --- Unit tests ---

let db: Database;

beforeEach(async () => {
  db = new Database(":memory:");
  await runMigrations(db, join(import.meta.dir, "../migrations"));
});

afterEach(() => {
  db.close();
});

test("createApiKey returns a plaintext token and a key record without token_hash", () => {
  const { token, key } = createApiKey(db, "my-key", "write");
  expect(typeof token).toBe("string");
  expect(token.length).toBeGreaterThan(0);
  expect(key.name).toBe("my-key");
  expect(key.scope).toBe("write");
  expect(typeof key.id).toBe("number");
  expect(typeof key.created_at).toBe("string");
  expect(key).not.toHaveProperty("token_hash");
});

test("createApiKey: token is not stored in plaintext (hash differs from token)", () => {
  const { token } = createApiKey(db, "hash-check", "write");
  const row = db.query<{ token_hash: string }, []>("SELECT token_hash FROM _api_keys LIMIT 1").get();
  expect(row).not.toBeNull();
  expect(row!.token_hash).not.toBe(token);
});

test("createApiKey supports read scope", () => {
  const { key } = createApiKey(db, "read-key", "read");
  expect(key.scope).toBe("read");
});

test("createApiKey: duplicate name throws", () => {
  createApiKey(db, "dup", "write");
  expect(() => createApiKey(db, "dup", "read")).toThrow();
});

test("listApiKeys returns all keys without token_hash", () => {
  createApiKey(db, "k1", "write");
  createApiKey(db, "k2", "read");
  const keys = listApiKeys(db);
  expect(keys.length).toBe(2);
  for (const k of keys) {
    expect(k).not.toHaveProperty("token_hash");
    expect(k).toHaveProperty("id");
    expect(k).toHaveProperty("name");
    expect(k).toHaveProperty("scope");
    expect(k).toHaveProperty("created_at");
  }
});

test("listApiKeys returns empty array when no keys", () => {
  expect(listApiKeys(db)).toEqual([]);
});

test("deleteApiKey removes the key and returns true", () => {
  const { key } = createApiKey(db, "to-delete", "write");
  const removed = deleteApiKey(db, key.id);
  expect(removed).toBe(true);
  expect(listApiKeys(db).length).toBe(0);
});

test("deleteApiKey returns false for non-existent id", () => {
  expect(deleteApiKey(db, 9999)).toBe(false);
});

test("findApiKeyByToken returns the key for a valid token", () => {
  const { token, key } = createApiKey(db, "found-key", "write");
  const found = findApiKeyByToken(db, token);
  expect(found).not.toBeNull();
  expect(found!.id).toBe(key.id);
  expect(found!.name).toBe("found-key");
  expect(found!.scope).toBe("write");
  expect(found).not.toHaveProperty("token_hash");
});

test("findApiKeyByToken returns null for an invalid token", () => {
  createApiKey(db, "some-key", "write");
  expect(findApiKeyByToken(db, "wrong-token")).toBeNull();
});

test("findApiKeyByToken returns null for empty string", () => {
  expect(findApiKeyByToken(db, "")).toBeNull();
});

// --- Integration tests ---

let server: ReturnType<typeof createServer>;
let baseUrl: string;
const WRITE_TOKEN = "test-write-token-215";

beforeAll(async () => {
  process.env.API_TOKEN = WRITE_TOKEN;
  process.env.READ_TOKEN = "";
  const { createServer } = await import("../src/index");
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
  delete process.env.API_TOKEN;
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${WRITE_TOKEN}` };
}

describe("POST /api/keys", () => {
  test("creates a key and returns token once", async () => {
    const name = `integration-key-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "write" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.token).toBe("string");
    expect((body.token as string).length).toBeGreaterThan(0);
    expect(body.name).toBe(name);
    expect(body.scope).toBe("write");
    expect(typeof body.id).toBe("number");
    expect(typeof body.created_at).toBe("string");
  });

  test("requires write auth (no token → 401)", async () => {
    const res = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "no-auth-key", scope: "write" }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 400 for missing name", async () => {
    const res = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "write" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid scope", async () => {
    const res = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "bad-scope-key", scope: "admin" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 409 for duplicate name", async () => {
    const name = `dup-${Date.now()}`;
    await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "write" }),
    });
    const res = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "read" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("GET /api/keys", () => {
  test("lists keys without token values", async () => {
    const name = `list-key-${Date.now()}`;
    await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "read" }),
    });
    const res = await fetch(`${baseUrl}/api/keys`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(Array.isArray(body.keys)).toBe(true);
    const found = body.keys.find((k) => k.name === name);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty("token");
    expect(found).not.toHaveProperty("token_hash");
    expect(found).toHaveProperty("id");
    expect(found).toHaveProperty("scope");
    expect(found).toHaveProperty("created_at");
  });

  test("requires write auth", async () => {
    const res = await fetch(`${baseUrl}/api/keys`);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/keys/:id", () => {
  test("revokes a key", async () => {
    const name = `del-key-${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "write" }),
    });
    const created = (await createRes.json()) as { id: number };
    const delRes = await fetch(`${baseUrl}/api/keys/${created.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(delRes.status).toBe(200);
    const body = (await delRes.json()) as { id: number };
    expect(body.id).toBe(created.id);
  });

  test("returns 404 for non-existent id", async () => {
    const res = await fetch(`${baseUrl}/api/keys/99999`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  test("requires write auth", async () => {
    const res = await fetch(`${baseUrl}/api/keys/1`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

describe("Auth with DB-backed keys", () => {
  test("DB write key accepted on write-protected route", async () => {
    const name = `db-write-${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "write" }),
    });
    const { token } = (await createRes.json()) as { token: string };

    const counterRes = await fetch(`${baseUrl}/api/counter/${name}/increment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(counterRes.status).toBe(200);
  });

  test("DB read key rejected on write-protected route", async () => {
    const name = `db-read-${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "read" }),
    });
    const { token } = (await createRes.json()) as { token: string };

    const counterRes = await fetch(`${baseUrl}/api/counter/${name}/increment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(counterRes.status).toBe(403);
  });

  test("revoked DB key is rejected after deletion", async () => {
    const name = `revoked-${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "write" }),
    });
    const { token, id } = (await createRes.json()) as { token: string; id: number };

    await fetch(`${baseUrl}/api/keys/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const counterRes = await fetch(`${baseUrl}/api/counter/${name}/increment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(counterRes.status).toBe(403);
  });
});

describe("Audit log actor attribution", () => {
  test("audit actor is key name when using a DB key", async () => {
    const name = `audit-actor-${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/keys`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, scope: "write" }),
    });
    const { token } = (await createRes.json()) as { token: string };

    const counterName = `cnt-${Date.now()}`;
    await fetch(`${baseUrl}/api/counter/${counterName}/increment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const auditRes = await fetch(`${baseUrl}/api/audit?counter=${counterName}`, {
      headers: authHeaders(),
    });
    const body = (await auditRes.json()) as { items: Array<{ actor: string }>; next_cursor: string | null };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]!.actor).toBe(`key:${name}`);
  });
});
