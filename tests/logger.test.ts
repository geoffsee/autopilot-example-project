import { test, expect } from "bun:test";
import { withLogging } from "../src/logger";

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (data: string | Uint8Array) => {
    lines.push(typeof data === "string" ? data : new TextDecoder().decode(data));
    return true;
  };
  return {
    lines,
    restore: () => {
      process.stdout.write = original;
    },
  };
}

test("withLogging does not alter response body", async () => {
  const body = JSON.stringify({ hello: "world" });
  const handler = withLogging(async () => new Response(body, { status: 200 }));
  const res = await handler(new Request("http://localhost/api/test"));
  expect(res.status).toBe(200);
  expect(await res.text()).toBe(body);
});

test("withLogging does not alter response status codes", async () => {
  for (const status of [200, 201, 400, 404, 500]) {
    const handler = withLogging(async () => new Response(null, { status }));
    const res = await handler(new Request("http://localhost/api/test"));
    expect(res.status).toBe(status);
  }
});

test("withLogging emits one JSON log line per request", async () => {
  const { lines, restore } = captureStdout();
  try {
    const handler = withLogging(async () => new Response("ok", { status: 200 }));
    await handler(new Request("http://localhost/api/a"));
    await handler(new Request("http://localhost/api/b"));
    const jsonLines = lines.filter((l) => l.trim().startsWith("{"));
    expect(jsonLines.length).toBe(2);
  } finally {
    restore();
  }
});

test("withLogging log line contains required fields with correct types", async () => {
  const { lines, restore } = captureStdout();
  try {
    const handler = withLogging(async () => new Response("ok", { status: 201 }));
    await handler(new Request("http://localhost/api/items", { method: "POST" }));
    const jsonLine = lines.find((l) => l.trim().startsWith("{"));
    expect(jsonLine).toBeDefined();
    const log = JSON.parse(jsonLine!) as Record<string, unknown>;
    expect(log.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(log.method).toBe("POST");
    expect(log.path).toBe("/api/items");
    expect(log.status).toBe(201);
    expect(typeof log.durationMs).toBe("number");
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally {
    restore();
  }
});
