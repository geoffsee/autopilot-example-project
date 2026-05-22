import { timingSafeEqual } from "node:crypto";

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
) {
  function requireWrite(req: Request): Response | null {
    if (!writeToken) return null;
    const provided = extractBearer(req);
    if (provided === null) return unauthorized();
    if (!tokenMatches(provided, writeToken)) return forbidden();
    return null;
  }

  function requireRead(req: Request): Response | null {
    if (!readToken) return null;
    const provided = extractBearer(req);
    if (provided === null) return unauthorized();
    if (tokenMatches(provided, readToken)) return null;
    if (writeToken && tokenMatches(provided, writeToken)) return null;
    return forbidden();
  }

  return { requireWrite, requireRead };
}

// Tokens are read once at import time; use createRBAC(token, ...) directly in tests
// that need to control tokens without relying on process.env mutation after import.
const rbac = createRBAC();
export const requireWriteAuth = rbac.requireWrite;
export const requireReadAuth = rbac.requireRead;
