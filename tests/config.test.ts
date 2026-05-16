import { test, expect } from "bun:test";
import { buildConfig } from "../src/config";

test("buildConfig defaults NODE_ENV to development when not set", () => {
  const cfg = buildConfig({});
  expect(cfg.NODE_ENV).toBe("development");
  expect(cfg.isDevelopment).toBe(true);
});

test("buildConfig throws on invalid NODE_ENV", () => {
  expect(() => buildConfig({ NODE_ENV: "staging" })).toThrow(
    'Invalid NODE_ENV: "staging"'
  );
});

test("buildConfig throws when JWT_SECRET is missing in production", () => {
  expect(() => buildConfig({ NODE_ENV: "production" })).toThrow(
    "JWT_SECRET env var must be set in production"
  );
});

test("buildConfig accepts JWT_SECRET in production", () => {
  const cfg = buildConfig({ NODE_ENV: "production", JWT_SECRET: "prod-secret" });
  expect(cfg.NODE_ENV).toBe("production");
  expect(cfg.isDevelopment).toBe(false);
  expect(cfg.JWT_SECRET).toBe("prod-secret");
});

test("buildConfig uses default dev secret when JWT_SECRET is not set outside production", () => {
  const cfg = buildConfig({ NODE_ENV: "development" });
  expect(cfg.JWT_SECRET).toBe("dev-secret-change-in-production");
});

test("buildConfig accepts test environment", () => {
  const cfg = buildConfig({ NODE_ENV: "test" });
  expect(cfg.NODE_ENV).toBe("test");
  expect(cfg.isDevelopment).toBe(true);
});
