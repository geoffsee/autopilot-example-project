# Error Codes

All error responses use the following envelope:

```json
{ "error": "<human-readable message>", "code": "<SCREAMING_SNAKE_CASE>" }
```

This applies to all API error responses.

## Code Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | No `Authorization: Bearer <token>` header supplied when one is required. |
| `FORBIDDEN` | 403 | Token was supplied but does not match the required credential. |
| `TOO_MANY_REQUESTS` | 429 | Client has exceeded the rate limit. Check the `Retry-After` response header. |
| `INVALID_CONTENT_TYPE` | 400 | Request body was supplied but `Content-Type` was not `application/json`. |
| `INVALID_JSON` | 400 | Request body could not be parsed as JSON. |
| `INVALID_BODY` | 400 | Request body is valid JSON but not an object (e.g. an array or string). |
| `INVALID_INCREMENT` | 400 | The `increment` field is not a non-negative integer ≤ 1 000 000. |
| `INVALID_URL` | 400 | The `url` field is not a valid URL. |
| `INVALID_URL_SCHEME` | 400 | The `url` field is valid but uses a scheme other than `http` or `https`. |
| `MISSING_FIELD` | 400 | A required field is absent from the request body (e.g. `url` on webhook registration). |
| `COUNTER_NOT_FOUND` | 404 / 500 | The named counter does not exist (404) or the global counter row is missing (500). |
| `WEBHOOK_NOT_FOUND` | 404 | No webhook is registered for the given counter name. |
| `WEBSOCKET_UPGRADE_FAILED` | 400 | The server could not upgrade the connection to WebSocket. |
| `INTERNAL_ERROR` | 500 | An unexpected internal error occurred. |
