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

const AUTH_LEVEL_KEY = Symbol("authLevel");
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

type AnyHandler = (req: any, ...rest: any[]) => Response | Promise<Response>;

function tagHandler<T extends AnyHandler>(fn: T, level: "read" | "write" | "public"): T {
  (fn as any)[AUTH_LEVEL_KEY] = level;
  return fn;
}

function getHandlerAuthLevel(fn: AnyHandler): string | undefined {
  return (fn as any)[AUTH_LEVEL_KEY];
}

export function createAuthMiddleware(rbac: ReturnType<typeof createRBAC>) {
  function withRead<T extends AnyHandler>(handler: T): T {
    const wrapped = ((req: Request, ...rest: any[]) => {
      const authErr = rbac.requireRead(req);
      if (authErr) return authErr;
      return handler(req, ...rest);
    }) as unknown as T;
    return tagHandler(wrapped, "read");
  }

  function withWrite<T extends AnyHandler>(handler: T): T {
    const wrapped = ((req: Request, ...rest: any[]) => {
      const authErr = rbac.requireWrite(req);
      if (authErr) return authErr;
      return handler(req, ...rest);
    }) as unknown as T;
    return tagHandler(wrapped, "write");
  }

  function withPublic<T extends AnyHandler>(handler: T): T {
    return tagHandler(handler, "public");
  }

  function applyDefaultAuth(routes: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [path, entry] of Object.entries(routes)) {
      if (typeof entry === "function") {
        result[path] =
          getHandlerAuthLevel(entry) !== undefined ? entry : withRead(entry as AnyHandler);
      } else if (
        entry &&
        typeof entry === "object" &&
        Object.keys(entry).some((k) => HTTP_METHODS.has(k))
      ) {
        const methods: Record<string, any> = {};
        for (const [method, fn] of Object.entries(entry)) {
          if (HTTP_METHODS.has(method) && typeof fn === "function") {
            methods[method] =
              getHandlerAuthLevel(fn as AnyHandler) !== undefined
                ? fn
                : withRead(fn as AnyHandler);
          } else {
            methods[method] = fn;
          }
        }
        result[path] = methods;
      } else {
        result[path] = entry;
      }
    }
    return result;
  }

  return { withRead, withWrite, withPublic, applyDefaultAuth };
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

