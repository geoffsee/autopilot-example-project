# Agent Behavioral Constraints

Behavioral constraints for autopilot agents working in this repository.

## Test-First Rule

**Every task must write a failing test before touching implementation.**

1. Write the test.
2. Run `bun test` — confirm it fails.
3. Implement the feature or fix.
4. Run `bun test` — confirm it passes.

No implementation code may be merged without a corresponding test written first.

## Test Runner

Use `bun test` exclusively. Do not use Jest, Vitest, or any other test runner.

## CI Enforcement

All tests run automatically on every push via GitHub Actions. A failing `bun test` blocks merge.

## Scope Constraints

- Do not modify `.github/workflows/**` from sprint/tracker issue branches.
- Do not update shared tracker or status files (`ISSUES.md`, `STATUS.md`) from implementation branches.
- Keep changes minimal and focused — implement only what the issue authorizes.
