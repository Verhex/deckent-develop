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

## Vitest Patterns
- Use `describe` blocks for logical grouping. Nest for related scenarios.
- Use `it` or `test` with descriptive names: `it('returns 404 when user not found')`.
- Use `vi.fn()` for function mocks, `vi.spyOn()` for partial mocking of objects.
- Use `vi.useFakeTimers()` for time-dependent code. Call `vi.advanceTimersByTime()` to control progression.
- Use `vi.mock()` for module-level mocking. Place at the top of the file, before imports.
- Use `toMatchInlineSnapshot()` for small, readable snapshot assertions.

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
