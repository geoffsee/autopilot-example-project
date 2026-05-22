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
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAuth(token = process.env.API_TOKEN) {
  const configuredToken = token;

  return function requireAuth(req: Request): Response | null {
    if (!configuredToken) return null;

    const header = req.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) {
      return unauthorized();
    }
    const expected = Buffer.from(`Bearer ${configuredToken}`);
    const actual = Buffer.from(header);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return forbidden();
    }
    return null;
  };
}

export function createRBAC(
  writeToken = process.env.API_TOKEN,
  readToken = process.env.READ_TOKEN,
) {
  function requireWrite(req: Request): Response | null {
    if (!writeToken) return null;
    const provided = extractBearer(req);
    if (provided === null) return unauthorized();
    if (readToken && tokenMatches(provided, readToken)) return forbidden();
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

// Tokens are captured once at module load. Tests that need different token values
// must set process.env vars before this module is first imported (use a dynamic
// import inside beforeAll/beforeEach, not a top-level static import).
const _rbac = createRBAC();

export function requireWriteAuth(req: Request): Response | null {
  return _rbac.requireWrite(req);
}

export function requireReadAuth(req: Request): Response | null {
  return _rbac.requireRead(req);
}
