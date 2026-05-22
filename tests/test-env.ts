// Relaxed defaults for the full test suite against a single shared in-process limiter (::1).
process.env.RATE_LIMIT_MAX ??= "10000";
