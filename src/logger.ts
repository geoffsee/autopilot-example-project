import type { Server } from "bun";

export interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  timestamp: string;
}

export type HttpHandler<Req extends Request = Request> = (
  req: Req,
  server?: Server
) => Response | Promise<Response>;

export function withLogging<Req extends Request = Request>(
  handler: HttpHandler<Req>
): HttpHandler<Req> {
  return async (req: Req, server?: Server): Promise<Response> => {
    const start = performance.now();
    const requestId = crypto.randomUUID();
    const response = await handler(req, server);
    const log: RequestLog = {
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: response.status,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(log) + "\n");
    return response;
  };
}
