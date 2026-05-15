import { test, expect, mock } from "bun:test";
import { handleClaude } from "../src/claude";

mock.module("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      stream: (_params: unknown) => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Hello" },
            index: 0,
          };
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: " World" },
            index: 0,
          };
          yield { type: "message_stop" };
        },
        abort: () => {},
      }),
    };
  },
}));

test("POST /api/claude streams response from mocked SDK", async () => {
  const req = new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Say hello" }),
  });

  const res = await handleClaude(req);
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("text/plain");

  const text = await res.text();
  expect(text).toBe("Hello World");
});

test("POST /api/claude returns 400 for missing prompt", async () => {
  const req = new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const res = await handleClaude(req);
  expect(res.status).toBe(400);

  const body = await res.json();
  expect(body).toHaveProperty("error");
});

test("POST /api/claude returns 400 for empty prompt", async () => {
  const req = new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "" }),
  });

  const res = await handleClaude(req);
  expect(res.status).toBe(400);
});

test("POST /api/claude returns 400 for invalid JSON", async () => {
  const req = new Request("http://localhost/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json",
  });

  const res = await handleClaude(req);
  expect(res.status).toBe(400);
});
