import { randomUUID } from "node:crypto";

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id")?.slice(0, 128) ?? randomUUID();
}

export function tagged(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
