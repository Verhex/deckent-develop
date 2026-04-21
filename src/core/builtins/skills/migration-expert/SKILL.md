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
- Use `jscodeshift` for JavaScript/TypeScript AST transformations at scale.
- Use `ts-morph` for TypeScript-aware refactoring (preserves type information during transforms).
- Write codemods as idempotent transforms — running them twice should produce the same result.
- Test codemods against fixture files: input fixture -> transform -> compare with expected output.
- Always run codemods in a clean git state so changes can be reviewed and reverted.

## Version Upgrade Checklist
1. Read the full changelog and migration guide for every major version between current and target.
2. Identify all deprecated APIs currently in use — fix deprecation warnings before upgrading.
3. Update peer dependencies first (bottom-up), then the primary dependency.
4. Run the full test suite after each dependency bump — not just at the end.
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
- If rollback is triggered, run the full test suite against the reverted state to confirm stability.

## Testing During Migration
- Maintain parallel test suites during transition: old tests validate backward compatibility, new tests validate migrated behavior.
- Use snapshot tests to detect unintended changes in output format during migration.
- Integration tests are more valuable than unit tests during migration — they catch interaction bugs.
- Run performance benchmarks before and after migration to detect regressions.
