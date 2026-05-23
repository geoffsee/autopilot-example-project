import { test, expect } from "bun:test";
import { validateEnv } from "../src/env";

test("validateEnv: exits 1 and logs missing API_TOKEN", () => {
  const saved = process.env.API_TOKEN;
  delete process.env.API_TOKEN;

  let exitCode: number | undefined;
  const origExit = process.exit;
  (process as NodeJS.Process).exit = ((code?: number) => { exitCode = code; }) as typeof process.exit;

  let stderrOut = "";
  const origWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as NodeJS.WriteStream).write = ((chunk: unknown) => {
    stderrOut += typeof chunk === "string" ? chunk : String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    validateEnv();
  } finally {
    process.exit = origExit;
    (process.stderr as NodeJS.WriteStream).write = origWrite;
    if (saved !== undefined) process.env.API_TOKEN = saved;
  }

  expect(exitCode).toBe(1);
  expect(stderrOut).toContain("startup.env.missing");
  expect(stderrOut).toContain("API_TOKEN");
});

test("validateEnv: exits 1 when API_TOKEN is empty string", () => {
  const saved = process.env.API_TOKEN;
  process.env.API_TOKEN = "";

  let exitCode: number | undefined;
  const origExit = process.exit;
  (process as NodeJS.Process).exit = ((code?: number) => { exitCode = code; }) as typeof process.exit;

  let stderrOut = "";
  const origWrite = process.stderr.write.bind(process.stderr);
  (process.stderr as NodeJS.WriteStream).write = ((chunk: unknown) => {
    stderrOut += typeof chunk === "string" ? chunk : String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    validateEnv();
  } finally {
    process.exit = origExit;
    (process.stderr as NodeJS.WriteStream).write = origWrite;
    if (saved !== undefined) process.env.API_TOKEN = saved;
    else delete process.env.API_TOKEN;
  }

  expect(exitCode).toBe(1);
  expect(stderrOut).toContain("startup.env.missing");
  expect(stderrOut).toContain("API_TOKEN");
});

test("validateEnv: does not exit when API_TOKEN is set", () => {
  const saved = process.env.API_TOKEN;
  process.env.API_TOKEN = "test-token";

  let exited = false;
  const origExit = process.exit;
  (process as NodeJS.Process).exit = (() => { exited = true; }) as typeof process.exit;

  try {
    validateEnv();
  } finally {
    process.exit = origExit;
    if (saved !== undefined) process.env.API_TOKEN = saved;
    else delete process.env.API_TOKEN;
  }

  expect(exited).toBe(false);
});
