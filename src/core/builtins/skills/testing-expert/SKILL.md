---
doc_rank: 50
status: active
last_updated: 2026-06-04
content_hash: sha256:a9b7e2df919667ab98787c46097561a05139344e5ed48c144175ef29b9d97fdc
---

# Testing Expert

## Test Pyramid
- Unit tests form the base: fast, isolated, no I/O. Aim for 70% of total tests.
- Integration tests in the middle: test module boundaries, database queries, API endpoints. Aim for 20%.
- E2E tests at the top: critical user flows only. Aim for 10%. Keep these minimal and stable.
- If a bug can be caught by a unit test, do not write an integration test for it. Push tests down the pyramid.

## Arrange-Act-Assert (AAA)
- Structure every test with three clear sections:
  - Arrange: set up preconditions, create test data, configure mocks.
  - Act: execute the code under test. One action per test.
  - Assert: verify the expected outcome. Prefer specific assertions over generic truthiness checks.
- Keep each section focused. If Arrange is complex, extract a helper or fixture.
- One logical assertion per test. Multiple `expect` calls are fine if they verify the same behavior.

## Test Isolation
- Each test must be independent: no shared mutable state between tests.
- Use `beforeEach` for setup, `afterEach` for cleanup. Avoid `beforeAll` for mutable state.
- Reset mocks between tests: `vi.restoreAllMocks()` or `jest.restoreAllMocks()`.
- Use in-memory databases or test containers for database tests. Never hit production data.
- Use deterministic data (fixed dates, seeded random) to prevent flaky tests.

## Mocking Boundaries
- Mock at module boundaries: external APIs, databases, file system, time, randomness.
- Never mock the code under test. Mock its dependencies.
- Use dependency injection to make code testable without mocking internals.
- Prefer fakes (in-memory implementations) over mocks for complex dependencies.
- Verify mock interactions sparingly. Test outcomes, not implementation details.

## Coverage
- Aim for 80%+ line coverage as a baseline. Higher for critical business logic.
- Coverage measures code execution, not correctness. High coverage with weak assertions is meaningless.
- Exclude generated code, type declarations, and barrel exports from coverage metrics.
- Use coverage reports to find untested paths, not as a quality metric by itself.
- Run coverage in CI and fail the build if it drops below the threshold.

## Framework-Specific Patterns

Use the test framework matching your project's stack. The principles are the same; only the API differs.

### Vitest / Jest (TypeScript / Node.js)
- Use `describe` blocks for logical grouping. Nest for related scenarios.
- Use `it` or `test` with descriptive names: `it('returns 404 when user not found')`.
- `vi.fn()` / `jest.fn()` for function mocks, `vi.spyOn()` / `jest.spyOn()` for partial mocking.
- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for time-dependent code (never real `setTimeout`).
- Module mocking is hoisted — use factory function for explicit control.
- `toMatchInlineSnapshot()` for small, readable snapshot assertions.

### pytest (Python)
- Use `pytest.fixture` for setup/teardown; prefer function scope over session scope.
- `@pytest.mark.parametrize` for data-driven tests instead of loops.
- `freezegun` for time-dependent tests; `mocker.patch` for mocking.

### Go testing
- Co-locate test files: `foo.go` → `foo_test.go`; use `_test` package for black-box testing.
- `t.Parallel()` for independent cases; `testify/assert` or `require` for readable assertions.

## Snapshot Testing
- Use snapshots for UI component output and serialized data structures.
- Review snapshot changes carefully in code review. Do not blindly update.
- Keep snapshots small. Large snapshots are unreadable and fragile.
- Use inline snapshots for small values. Use file snapshots only when inline is impractical.

## CI Integration
- Run the full test suite on every pull request. Block merging on test failure.
- Parallelize test execution across workers for speed.
- Cache dependencies and build artifacts to reduce CI time.
- Run slow tests (E2E, integration) on a separate schedule or only for merge commits.
- Report test results and coverage as PR comments or status checks.

## Anti-Patterns to Avoid
- Testing implementation details (internal method calls, private state) — test observable behavior.
- Writing tests after the fact to hit a coverage number — coverage without intent is noise.
- One giant test that covers multiple behaviors — split into focused tests with descriptive names.
- `beforeAll` with mutable shared state — tests become order-dependent and flaky.
- Mocking the module under test — mock its dependencies, never the subject itself.
- `expect(true).toBe(true)` style assertions — they pass even when code is broken.
- Resetting mocks manually in each test — use `vi.restoreAllMocks()` in `afterEach`.
- Real timers in tests (`setTimeout`, `Date.now()`) — use fake timers for determinism.

## Karpathy Notes
- **Simplicity first:** Three focused unit tests beat one complex integration test. Add complexity only when the unit test cannot catch the bug.
- **Goal-driven:** Coverage is a means, not an end. Ask "what behavior am I protecting?" before writing each test.
- **Surgical:** A failing test is a specification. Read it carefully before changing it — the test may be right and the code wrong.
