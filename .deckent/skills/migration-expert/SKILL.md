# Migration Expert

## Migration Strategies
- **Strangler Fig**: Incrementally replace legacy modules behind a facade. New code handles new requests; old code is gradually deprecated.
- **Branch by Abstraction**: Introduce an abstraction layer, swap implementations behind it, remove the old implementation when the new one is stable.
- **Big Bang**: Replace everything at once. Only viable for small codebases or isolated subsystems. Requires comprehensive test coverage before starting.
- Always prefer incremental migration over big bang — it reduces risk and allows continuous delivery.

## Breaking Change Categories
- **API changes**: Renamed exports, removed functions, changed signatures, altered return types.
- **Behavior changes**: Same API but different runtime behavior (stricter validation, different defaults, changed error types).
- **Dependency changes**: Peer dependency version bumps, removed transitive dependencies, Node.js version requirements.
- **Configuration changes**: Renamed config keys, changed file formats, moved config locations.
- Document every breaking change in a migration guide before starting implementation.

## Codemod Tools

Choose based on the project's language. All codemods must be idempotent (running twice produces same result).

- **JavaScript/TypeScript**: `jscodeshift` (AST transforms), `ts-morph` (TypeScript-aware with type info)
- **Python**: `libcst` or `rope` for AST transforms; `2to3` for Python 2→3 migrations
- **Go**: `gofmt -r` rewrite rules, `gorename`, or `go/ast`-based scripts
- **Rust**: `sed`/`awk` for simple renames; compiler error messages guide most mechanical changes
- **Java/Kotlin**: `OpenRewrite` recipes, IntelliJ structural search/replace
- **General (any language)**: `comby` — language-agnostic structural search and replace

Common rules for all codemod tools:
- Test codemods against fixture files: input fixture → transform → compare with expected output
- Always run in a clean git state so changes can be reviewed and reverted
- Run the project's static analysis / type check after transform to catch errors

## Version Upgrade Checklist
1. Read the full changelog and migration guide for every major version between current and target.
2. Identify all deprecated APIs currently in use — fix deprecation warnings before upgrading.
3. Update peer dependencies first (bottom-up), then the primary dependency.
4. Run the project-configured verify scope (targeted test files by default) after each dependency bump — not just at the end.
5. Check for community-maintained codemods before writing custom transforms.

## Backward Compatibility
- Use adapter patterns to maintain old API signatures that delegate to new implementations.
- Export deprecated functions with `@deprecated` JSDoc tags and console warnings during transition.
- Maintain dual-format support (CJS + ESM) during module system migrations using conditional exports in package.json.
- Version your APIs (URL prefix, header-based) to allow gradual consumer migration.

## Feature Flags for Gradual Rollout
- Gate migrated code paths behind feature flags so old and new implementations coexist safely.
- Use environment variables or a feature flag service — never hardcode boolean toggles.
- Remove feature flags and dead code paths within one sprint of full rollout.
- Test both flag states (on and off) in CI to prevent regression in either path.

## Rollback Procedures
- Every migration must have a documented rollback plan before deployment.
- Keep the old implementation available (behind a flag or in a tagged release) for at least one release cycle.
- Database migrations must be backward-compatible: add columns before removing old ones, use expand-contract pattern.
- If rollback is triggered, run the project-configured verify scope (targeted test files by default) against the reverted state to confirm stability.

## Testing During Migration
- Maintain parallel test suites during transition: old tests validate backward compatibility, new tests validate migrated behavior.
- Use snapshot tests to detect unintended changes in output format during migration.
- Integration tests are more valuable than unit tests during migration — they catch interaction bugs.
- Run performance benchmarks before and after migration to detect regressions.

## Anti-Patterns to Avoid
- Big-bang rewrite when incremental is possible — prefer strangler-fig / branch-by-abstraction; big-bang only for small, well-tested subsystems.
- A migration with no documented rollback plan — every change needs a tested path back before deploy.
- Non-idempotent codemods — running twice must produce the same result; test against input→expected fixtures.
- Upgrading the primary dependency before its peers — bump bottom-up and run the suite after each step, not just at the end.
- Removing the old code path the moment the new one ships — keep it (behind a flag or tag) for at least one release cycle.
- Hardcoding migration toggles as booleans — gate behind feature flags and test both states in CI.
- Skipping the changelog for intermediate major versions — breaking changes hide between your version and the target.

## Karpathy Notes
- **Think before coding:** Catalog every breaking change (API / behavior / dependency / config) and write the migration guide before touching code.
- **Surgical:** Migrate behind an abstraction so old and new coexist. Each step stays reversible and independently shippable.
- **Goal-driven:** Integration tests catch the interaction bugs unit tests miss during migration — weight them heavily, and benchmark before/after.
