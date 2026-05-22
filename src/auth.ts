import { timingSafeEqual } from "node:crypto";
import { errorJson, ErrorCode } from "./errors";

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
    if (provided === null) return errorJson("Unauthorized", ErrorCode.UNAUTHORIZED, 401);
    if (!tokenMatches(provided, writeToken)) return errorJson("Forbidden", ErrorCode.FORBIDDEN, 403);
    return null;
  }

  function requireRead(req: Request): Response | null {
    if (!readToken) return null;
    const provided = extractBearer(req);
    if (provided === null) return errorJson("Unauthorized", ErrorCode.UNAUTHORIZED, 401);
    if (tokenMatches(provided, readToken)) return null;
    if (writeToken && tokenMatches(provided, writeToken)) return null;
    return errorJson("Forbidden", ErrorCode.FORBIDDEN, 403);
  }

  return { requireWrite, requireRead };
}
