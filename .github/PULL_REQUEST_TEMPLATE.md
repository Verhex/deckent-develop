## Summary

<!-- 1-3 bullet points describing what this PR does and why. -->

- 
- 

## Related Issues

<!-- Reference related issues: "Closes #123", "Fixes #456", "Part of #789" -->

Closes #

## Changes

<!-- List the notable changes. Group by area if the PR is large. -->

### Core changes

- [ ] 

### Tests

- [ ] 

### Documentation

- [ ] 

## Test Plan

<!-- How did you verify this works? Include commands to run. -->

```bash
# Verify lint passes
npm run lint

# Run full test suite
npm test

# Run targeted test file(s) touched by this PR
npx vitest run tests/...
```

- [ ] `npm run lint` passes (`tsc --noEmit`, zero type errors)
- [ ] `npm test` passes (no new test failures vs. `main`)
- [ ] New code has tests (minimum 3 per task — happy path, edge case, error path)
- [ ] `npm run build` succeeds (dist/ compiles cleanly)
- [ ] `npm run lint:link` passes (no dead doc links)
- [ ] `npm run docs:stats:check && npm run docs:ref:check` pass (or regenerated with `npm run docs:stats && docs:ref`)

## Breaking Changes

<!-- Does this change the public API, CLI interface, config schema, or MCP tool signatures? -->

- [ ] No breaking changes
- [ ] Breaking change — describe migration path below:

<!-- migration path -->

## ADR Compliance

<!-- Does this PR touch architectural patterns governed by an ADR? -->

- [ ] No ADRs affected
- [ ] ADRs affected (list IDs): <!-- e.g. ADR-008, ADR-012 -->
  - New or amended ADR proposed: <!-- link or "N/A" -->

## Checklist

- [ ] Code follows project conventions (TypeScript strict, ESM `.js` imports, `node:` prefix)
- [ ] No new `any` types introduced (use `unknown` + narrowing instead)
- [ ] Worker scope boundaries respected (no writes outside `scope.filesWrite`)
- [ ] No circular dependencies added (`npm run lint:adr` clean)
- [ ] New public functions have JSDoc comments
- [ ] `DIRECTIVES.md` updated if this PR changes sprint scope or approach

## Sprint Context (Deckent maintainers)

<!-- Internal: leave blank for community PRs -->

- Sprint: <!-- e.g. sprint-190 -->
- Task: <!-- e.g. 190-001 -->
- Self-assessment: <!-- DONE / GO_WITH_TECH_DEBT -->
