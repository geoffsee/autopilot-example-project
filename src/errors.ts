export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
  INVALID_JSON: "INVALID_JSON",
  INVALID_BODY: "INVALID_BODY",
  INVALID_INCREMENT: "INVALID_INCREMENT",
  INVALID_URL: "INVALID_URL",
  INVALID_URL_SCHEME: "INVALID_URL_SCHEME",
  MISSING_FIELD: "MISSING_FIELD",
  COUNTER_NOT_FOUND: "COUNTER_NOT_FOUND",
  WEBHOOK_NOT_FOUND: "WEBHOOK_NOT_FOUND",
  WEBSOCKET_UPGRADE_FAILED: "WEBSOCKET_UPGRADE_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export function errorJson(
  message: string,
  code: ErrorCode,
  status: number,
  headers?: Record<string, string>,
): Response {
  return Response.json({ error: message, code }, { status, headers });
}
