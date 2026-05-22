import { randomUUID } from "node:crypto";

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

export function tagged(response: Response, requestId: string): Response {
  response.headers.set("X-Request-ID", requestId);
  return response;
}
