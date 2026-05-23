import { log } from "./logger";

const REQUIRED_VARS = ["API_TOKEN"] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(name => !process.env[name]);
  if (missing.length === 0) return;
  log.error("startup.env.missing", { missing });
  process.exit(1);
}
