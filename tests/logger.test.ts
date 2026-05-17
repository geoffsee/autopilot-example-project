import { test, expect, spyOn } from "bun:test";
import { log } from "../src/logger";

test("log.info writes valid JSON with level=info to stdout", () => {
  const lines: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  });

  log.info("server started");
  spy.mockRestore();

  expect(lines.length).toBe(1);
  const parsed = JSON.parse(lines[0]) as { level: string; msg: string; timestamp: string };
  expect(parsed.level).toBe("info");
  expect(parsed.msg).toBe("server started");
  expect(typeof parsed.timestamp).toBe("string");
  expect(() => new Date(parsed.timestamp)).not.toThrow();
});

test("log.error writes valid JSON with level=error to stderr", () => {
  const lines: string[] = [];
  const spy = spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  });

  log.error("something failed");
  spy.mockRestore();

  expect(lines.length).toBe(1);
  const parsed = JSON.parse(lines[0]) as { level: string; msg: string; timestamp: string };
  expect(parsed.level).toBe("error");
  expect(parsed.msg).toBe("something failed");
  expect(typeof parsed.timestamp).toBe("string");
});

test("log.info includes extra fields in JSON output", () => {
  const lines: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  });

  log.info("server started", { port: 3000, url: "http://localhost:3000" });
  spy.mockRestore();

  const parsed = JSON.parse(lines[0]) as { level: string; msg: string; timestamp: string; port: number; url: string };
  expect(parsed.port).toBe(3000);
  expect(parsed.url).toBe("http://localhost:3000");
});
