# Issues Reference

Last updated: 2026-05-30

## Strategic Direction

| Issue | Type | Title |
|---|---|---|
| [#207](https://github.com/geoffsee/autopilot-example-project/issues/207) | Strategic Review | Strategic Review: 2026-05-30 — Bounded State, Atomic Operations, and Developer Discoverability |
| [#228](https://github.com/geoffsee/autopilot-example-project/issues/228) | UXR Synthesis | UXR Synthesis: 2026-05-30 — Atomic Operations and Bounded State Are the Next Reliability Frontier |
| [#227](https://github.com/geoffsee/autopilot-example-project/issues/227) | Ideation | Ideation: 2026-05-30 — Counter Richness, Operational Completeness, and Developer Experience |
| [#226](https://github.com/geoffsee/autopilot-example-project/issues/226) | Housekeeping | Housekeeping: 2026-05-30 — No cleanup required, project state is clean |

## Strategic Review Summary

The current strategic review (#207) recommends, in priority order:

1. **F5 — Pagination** for `/api/audit`, `/api/webhooks`, `/api/counter` (unbounded list risk)
2. **C1+C2 — Delta increment/decrement** (bidirectional counter gap)
3. **F4 — Health check with DB probing** (orchestrator routing correctness)
4. **C9 — Bulk counter batch** (atomic multi-counter mutations)
5. **F3 — Rate limit state persistence** (crash-restart bypass risk)
6. **F1 — OpenAPI 3.0 spec** (integrator discoverability)
7. **P3 — Audit retention policy** (ADR then implementation)

Sprint planning converts these recommendations into trackable sprint issues. Do not file individual recommendation issues here — use #207 as the single living strategic-direction artifact.

## Sprint: Bounded State, Atomic Operations, and Developer Discoverability — #238

**Tracker:** [#238](https://github.com/geoffsee/autopilot-example-project/issues/238)
**Planned:** 2026-05-30

### Task Dependency Hierarchy

| Issue | Depends On | Depended On By | Layer | Status |
|-------|-----------|----------------|-------|--------|
| [#230](https://github.com/geoffsee/autopilot-example-project/issues/230) F5: Pagination for list endpoints | — | — | 0 | 🔴 Not Started |
| [#231](https://github.com/geoffsee/autopilot-example-project/issues/231) C1+C2: Counter delta increment/decrement | — | #236 | 0 | 🔴 Not Started |
| [#232](https://github.com/geoffsee/autopilot-example-project/issues/232) F4: Health check with DB probing | — | — | 0 | 🔴 Not Started |
| [#233](https://github.com/geoffsee/autopilot-example-project/issues/233) F3: Rate limit state persistence | — | — | 0 | 🔴 Not Started |
| [#234](https://github.com/geoffsee/autopilot-example-project/issues/234) F1: OpenAPI 3.0 spec at /api/docs | — | — | 0 | 🔴 Not Started |
| [#235](https://github.com/geoffsee/autopilot-example-project/issues/235) P3-ADR: Audit retention ADR | — | #237 | 0 | 🔴 Not Started |
| [#236](https://github.com/geoffsee/autopilot-example-project/issues/236) C9: Bulk counter batch | #231 | — | 1 | 🔴 Not Started |
| [#237](https://github.com/geoffsee/autopilot-example-project/issues/237) P3-impl: Audit retention implementation | #235 | — | 1 | 🔴 Not Started |
