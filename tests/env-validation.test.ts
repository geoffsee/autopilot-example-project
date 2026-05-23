import { test, expect } from "bun:test";
import { validateEnv } from "../src/env";

function mockProcessForEnvTest() {
  let exitCode: number | undefined;
  let exited = false;
  let stderrOut = "";

  const origExit = process.exit;
  const origWrite = process.stderr.write.bind(process.stderr);

  (process as NodeJS.Process).exit = ((code?: number) => { exitCode = code; exited = true; }) as typeof process.exit;
  (process.stderr as NodeJS.WriteStream).write = ((chunk: unknown) => {
    stderrOut += typeof chunk === "string" ? chunk : String(chunk);
    return true;
  }) as typeof process.stderr.write;

  return {
    get exitCode() { return exitCode; },
    get exited() { return exited; },
    get stderrOut() { return stderrOut; },
    restore() {
      process.exit = origExit;
      (process.stderr as NodeJS.WriteStream).write = origWrite;
    },
  };
}

test("validateEnv: exits 1 and logs missing API_TOKEN", () => {
  const saved = process.env.API_TOKEN;
  delete process.env.API_TOKEN;

  const mocks = mockProcessForEnvTest();
  try {
    validateEnv();
  } finally {
    mocks.restore();
    if (saved !== undefined) process.env.API_TOKEN = saved;
  }

  expect(mocks.exitCode).toBe(1);
  expect(mocks.stderrOut).toContain("startup.env.missing");
  expect(mocks.stderrOut).toContain("API_TOKEN");
});

test("validateEnv: exits 1 when API_TOKEN is empty string", () => {
  const saved = process.env.API_TOKEN;
  process.env.API_TOKEN = "";

  const mocks = mockProcessForEnvTest();
  try {
    validateEnv();
  } finally {
    mocks.restore();
    if (saved !== undefined) process.env.API_TOKEN = saved;
    else delete process.env.API_TOKEN;
  }

  expect(mocks.exitCode).toBe(1);
  expect(mocks.stderrOut).toContain("startup.env.missing");
  expect(mocks.stderrOut).toContain("API_TOKEN");
});

test("validateEnv: does not exit when API_TOKEN is set", () => {
  const saved = process.env.API_TOKEN;
  process.env.API_TOKEN = "test-token";

  const mocks = mockProcessForEnvTest();
  try {
    validateEnv();
  } finally {
    mocks.restore();
    if (saved !== undefined) process.env.API_TOKEN = saved;
    else delete process.env.API_TOKEN;
  }

  expect(mocks.exited).toBe(false);
});
