import { log } from "./logger";

const REQUIRED_VARS = ["API_TOKEN"] as const;

const RETENTION_DAYS_MIN = 7;
const RETENTION_DAYS_DEFAULT = 90;

export function getRetentionDays(): number {
  const raw = process.env.AUDIT_RETENTION_DAYS;
  if (!raw) return RETENTION_DAYS_DEFAULT;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < RETENTION_DAYS_MIN) {
    log.error("startup.env.invalid", { var: "AUDIT_RETENTION_DAYS", value: raw, reason: `must be an integer >= ${RETENTION_DAYS_MIN}` });
    process.exit(1);
  }
  return parsed;
}

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(name => !process.env[name]);
  if (missing.length > 0) {
    log.error("startup.env.missing", { missing });
    process.exit(1);
  }
  getRetentionDays();
}
