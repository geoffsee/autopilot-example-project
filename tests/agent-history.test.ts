import { test, expect, beforeAll, afterAll } from "bun:test";
import { parseGitLog, getAgentHistory } from "../src/agent-history";
import { createServer } from "../src/index";

// Unit tests for parseGitLog
test("parseGitLog returns empty array for empty string", () => {
  expect(parseGitLog("")).toEqual([]);
});

test("parseGitLog returns empty array for whitespace-only string", () => {
  expect(parseGitLog("   \n  \n")).toEqual([]);
});

test("parseGitLog parses a single commit line", () => {
  const sha = "abc123def456abc123def456abc123def456abc1";
  const author = "Alice";
  const timestamp = "2026-05-15T10:00:00+00:00";
  const message = "feat: add new feature";
  const line = `${sha}\x1f${author}\x1f${timestamp}\x1f${message}`;
  const result = parseGitLog(line);
  expect(result).toHaveLength(1);
  expect(result[0]).toEqual({ sha, author, timestamp, message });
});

test("parseGitLog skips malformed lines with fewer than 4 fields", () => {
  const goodLine = `abc123def456abc123def456abc123def456abc1\x1fAlice\x1f2026-05-15T10:00:00+00:00\x1fgood commit`;
  const badLine = `just-a-sha\x1fonly-two-fields`;
  const emptyLine = "";
  const result = parseGitLog([goodLine, badLine, emptyLine].join("\n"));
  expect(result).toHaveLength(1);
  expect(result[0]!.sha).toBe("abc123def456abc123def456abc123def456abc1");
});

test("parseGitLog parses multiple commits in order", () => {
  const lines = [
    `sha1111111111111111111111111111111111111\x1fAlice\x1f2026-05-15T10:00:00+00:00\x1ffirst commit`,
    `sha2222222222222222222222222222222222222\x1fBob\x1f2026-05-14T10:00:00+00:00\x1fsecond commit`,
  ].join("\n");
  const result = parseGitLog(lines);
  expect(result).toHaveLength(2);
  expect(result[0]!.sha).toBe("sha1111111111111111111111111111111111111");
  expect(result[0]!.author).toBe("Alice");
  expect(result[1]!.sha).toBe("sha2222222222222222222222222222222222222");
  expect(result[1]!.author).toBe("Bob");
});

test("parseGitLog handles message with embedded separator gracefully", () => {
  const sha = "abc123def456abc123def456abc123def456abc1";
  // A message that has extra \x1f inside (unlikely but robust)
  const line = `${sha}\x1fAlice\x1f2026-05-15T10:00:00+00:00\x1ffeat: something\x1fextra`;
  const result = parseGitLog(line);
  expect(result).toHaveLength(1);
  // extra segment joined back
  expect(result[0]!.message).toBe("feat: something\x1fextra");
});

// Live git repo integration test
test("getAgentHistory returns an array from the live repo", async () => {
  const history = await getAgentHistory(5);
  expect(Array.isArray(history)).toBe(true);
  if (history.length > 0) {
    const entry = history[0]!;
    expect(typeof entry.sha).toBe("string");
    expect(entry.sha.length).toBeGreaterThan(0);
    expect(typeof entry.author).toBe("string");
    expect(typeof entry.timestamp).toBe("string");
    expect(typeof entry.message).toBe("string");
  }
});

// HTTP endpoint integration tests
let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(() => {
  server = createServer(0);
  baseUrl = server.url.origin;
});

afterAll(async () => {
  await server.stop();
});

test("GET /api/agents/history returns 200", async () => {
  const res = await fetch(`${baseUrl}/api/agents/history`);
  expect(res.status).toBe(200);
});

test("GET /api/agents/history response body has history array", async () => {
  const res = await fetch(`${baseUrl}/api/agents/history`);
  const body = (await res.json()) as { history: unknown[] };
  expect(Array.isArray(body.history)).toBe(true);
});

test("GET /api/agents/history entries have required fields", async () => {
  const res = await fetch(`${baseUrl}/api/agents/history`);
  const body = (await res.json()) as {
    history: { sha: string; author: string; timestamp: string; message: string }[];
  };
  for (const entry of body.history) {
    expect(typeof entry.sha).toBe("string");
    expect(typeof entry.author).toBe("string");
    expect(typeof entry.timestamp).toBe("string");
    expect(typeof entry.message).toBe("string");
  }
});

test("GET /api/activity is unaffected by agent history endpoint", async () => {
  const res = await fetch(`${baseUrl}/api/activity`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { entries: unknown[] };
  expect(Array.isArray(body.entries)).toBe(true);
});
