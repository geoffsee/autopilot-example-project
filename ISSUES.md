# Issues Reference

_Last updated: 2026-05-20_

## Strategic Direction

| Issue | Title | Type |
|-------|-------|------|
| [#134](https://github.com/geoffsee/autopilot-example-project/issues/134) | Strategic Review: 2026-05-20 — Named counters and observability lead the next cycle | Strategic Review (living document) |

## UXR Synthesis

| Issue | Title | Type |
|-------|-------|------|
| [#152](https://github.com/geoffsee/autopilot-example-project/issues/152) | UXR Synthesis: 2026-05-20 — Five features shipped; C3/F4/C4 are the clear next priorities | UXR Synthesis |

## Sprint: Named counters, observability, and security hardening

**Tracker:** [#157](https://github.com/geoffsee/autopilot-example-project/issues/157)

### Task Dependency Hierarchy

| Issue | Depends On | Depended On By | Layer | Status |
|-------|-----------|----------------|-------|--------|
| [#153](https://github.com/geoffsee/autopilot-example-project/issues/153) C3: Named counters | — | #154 | 0 | 🔴 Not Started |
| [#154](https://github.com/geoffsee/autopilot-example-project/issues/154) F4: Prometheus /metrics | #153 | — | 1 | 🔴 Not Started |
| [#155](https://github.com/geoffsee/autopilot-example-project/issues/155) C4: Rate limiting | — | #156 | 1 | 🔴 Not Started |
| [#156](https://github.com/geoffsee/autopilot-example-project/issues/156) C5: Bearer token auth | #155 | — | 2 | 🔴 Not Started |

**Manual control-plane follow-up (excluded from executable sprint scope):**
- F5 — p50/p95 CI latency baseline: requires `.github/workflows/**` changes; human review required before action.

## Notes

- The strategic review (#134) is a **living document** — it is edited in place each cycle, not replaced.
- Sprint planning consumes the "Recommended Path Forward" section of #134 and creates trackable sprint issues from it.
- Do not add per-recommendation tracking issues here; that is the responsibility of the sprint planning workflow.
