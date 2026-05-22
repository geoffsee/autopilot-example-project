import { timingSafeEqual } from "node:crypto";
import type { Database } from "bun:sqlite";
import { findApiKeyByToken } from "./api-keys";

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

function tokenMatches(provided: string, expected: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export function createRBAC(
  writeToken = process.env.API_TOKEN,
  readToken = process.env.READ_TOKEN,
  db?: Database,
) {
  function requireWrite(req: Request): Response | null {
    if (!writeToken) return null;
    const provided = extractBearer(req);
    if (provided === null) return unauthorized();
    if (tokenMatches(provided, writeToken)) return null;
    if (db) {
      const key = findApiKeyByToken(db, provided);
      if (key?.scope === "write") return null;
    }
    return forbidden();
  }

  function requireRead(req: Request): Response | null {
    if (!readToken) return null;
    const provided = extractBearer(req);
    if (provided === null) return unauthorized();
    if (tokenMatches(provided, readToken)) return null;
    if (writeToken && tokenMatches(provided, writeToken)) return null;
    if (db) {
      const key = findApiKeyByToken(db, provided);
      if (key) return null;
    }
    return forbidden();
  }

  function resolveActor(req: Request): string | null {
    if (!db) return null;
    const provided = extractBearer(req);
    if (!provided) return null;
    const key = findApiKeyByToken(db, provided);
    if (!key) return null;
    return `key:${key.name}`;
  }

  return { requireWrite, requireRead, resolveActor };
}
