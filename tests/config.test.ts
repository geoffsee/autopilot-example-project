import { test, expect } from "bun:test";
import { buildConfig } from "../src/config";

test("defaults NODE_ENV to development when not set", () => {
  const cfg = buildConfig({});
  expect(cfg.NODE_ENV).toBe("development");
  expect(cfg.isDevelopment).toBe(true);
});

test("accepts NODE_ENV=production", () => {
  const cfg = buildConfig({ NODE_ENV: "production" });
  expect(cfg.NODE_ENV).toBe("production");
  expect(cfg.isDevelopment).toBe(false);
});

test("accepts NODE_ENV=development", () => {
  const cfg = buildConfig({ NODE_ENV: "development" });
  expect(cfg.NODE_ENV).toBe("development");
  expect(cfg.isDevelopment).toBe(true);
});

test("accepts NODE_ENV=test", () => {
  const cfg = buildConfig({ NODE_ENV: "test" });
  expect(cfg.NODE_ENV).toBe("test");
  expect(cfg.isDevelopment).toBe(true);
});

test("throws for invalid NODE_ENV value", () => {
  expect(() => buildConfig({ NODE_ENV: "staging" })).toThrow(/Invalid NODE_ENV/);
});
