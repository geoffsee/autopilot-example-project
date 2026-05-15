import { test, expect, spyOn } from "bun:test";
import { logger } from "../src/logger";

test("logger.info emits valid JSON line with required fields", () => {
  const lines: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation((str: unknown) => {
    lines.push(str as string);
    return true;
  });

  logger.info("server started", { port: 3000 });
  spy.mockRestore();

  expect(lines.length).toBe(1);
  const entry = JSON.parse(lines[0]);
  expect(entry.level).toBe("info");
  expect(entry.msg).toBe("server started");
  expect(typeof entry.ts).toBe("string");
  expect(entry.port).toBe(3000);
});

test("logger.error emits level=error", () => {
  const lines: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation((str: unknown) => {
    lines.push(str as string);
    return true;
  });

  logger.error("something failed", { code: 500 });
  spy.mockRestore();

  expect(lines.length).toBe(1);
  const entry = JSON.parse(lines[0]);
  expect(entry.level).toBe("error");
  expect(entry.msg).toBe("something failed");
  expect(entry.code).toBe(500);
});

test("logger output ends with newline", () => {
  const lines: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation((str: unknown) => {
    lines.push(str as string);
    return true;
  });

  logger.info("test");
  spy.mockRestore();

  expect(lines[0].endsWith("\n")).toBe(true);
});

test("logger.warn and logger.debug emit correct levels", () => {
  const lines: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation((str: unknown) => {
    lines.push(str as string);
    return true;
  });

  logger.warn("low disk");
  logger.debug("trace point");
  spy.mockRestore();

  expect(JSON.parse(lines[0]).level).toBe("warn");
  expect(JSON.parse(lines[1]).level).toBe("debug");
});
