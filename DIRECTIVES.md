# MASTER 4031: OPERATION-COVERAGE-MODEL-001

> Owner-admitted 2026-08-29 child of `4030 OPERATION-001`. Exact outcome capsule:
> `docs/execution/active/OPERATION-COVERAGE-MODEL-001.md`. This run has one product outcome,
> one atomic implementation task, and exactly three product write paths.

## Goal

Upgrade the existing operation-ingress audit from file/count heuristics to a deterministic,
site-granular semantic action/effect coverage model. Every coverage claim must carry AST binding
provenance and a stable call-site identity. The audit must fail closed against file-level
promotion, dead resolves, aggregate compensation, call-site substitution, unknown taxonomy, and
ambiguous attribution. This child measures coverage; it does not grant permission or migrate
runtime effects.

## Execution Contract

- One task only. Do not split, parallelize, or create follow-up/FIX work outside this task's
  exact three-file authority.
- No new file or dependency. Preserve all unrelated worktree changes.
- Hermetic test: isolated temp roots, asynchronous child process, no `spawnSync`, network,
  external service, shared mutable fixture, or repository-source mutation.
- Scope exclusions are binding: no permission/capability (`4040`), approval (`4050`), catalog
  convergence (`4032`), invocation/effect context (`4033`/`4034`), registry/ingress wiring, or
  durable-effect migrations.
- Do not treat an operation lookup as authorization. Do not lower, reset, aggregate, or hide
  the current unmatched baseline to make the gate pass.
- Any required write outside the exact files, new dependency, live second writer, or excluded
  semantic is `NO_GO/HOLD`; do not self-expand scope.

## Task 1: Semantic operation coverage model, baseline contract, and hermetic proof
- Files: scripts/audit-operation-ingress.mjs, scripts/operation-ingress-baseline.json, tests/scripts/audit-operation-ingress.test.ts
- Reads: package.json, scripts/script-registry.json, scripts/lint-operation-catalog.mjs, src/core/operation-catalog.ts, src/core/operation-catalog.v1.json, src/core/operation-catalog.generated.ts
- Priority: CRITICAL
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/audit-operation-ingress.test.ts --reporter=dot
### Description
Use the existing audit and repository compiler dependencies to build one canonical semantic
inventory. Each counted site has a deterministic stable identity derived from normalized
repository-relative location plus semantic call/binding identity, not a file-level credit.
Binding provenance distinguishes direct imports, namespace/member access, aliases and shadowed
locals. A dead `resolveOperation` call cannot cover an unrelated effect. One covered site cannot
compensate for or substitute another.

Expose separate, closed taxonomies for `fs-read`, `fs-write`, `fs-delete`, `db-memory`,
`process`, `provider-network`, and `tool`; ambiguous or unknown sites fail closed with exact site
diagnostics. Evolve the tracked baseline to site-granular expectations while preserving live
unmatched debt honestly and deterministically.

Tests must cover every taxonomy and positive binding form, repeated-run identity stability,
shadowing, moved/substituted sites, file-level promotion, dead resolve, aggregate compensation,
unknown taxonomy and per-site failure diagnostics. Verify the real script entrypoint with
`node scripts/audit-operation-ingress.mjs --check`. Final integrated proof also requires
`npm run lint` after the sprint is terminal; build is not run while the sprint is active.

### goNogo
- goCriteria: The audit emits one deterministic site-granular semantic inventory whose stable identities bind normalized repository-relative locations to semantic call and binding provenance across direct imports, namespace/member access, aliases, and shadowed locals; Coverage is attributed independently per action/effect site so file presence, dead resolves, aggregate counts, and other call sites cannot promote, compensate for, or substitute the covered site; The closed taxonomy contains fs-read, fs-write, fs-delete, db-memory, process, provider-network, and tool, while ambiguous or unknown attribution fails closed with the exact site identity and diagnostic; The tracked site-granular baseline preserves current live unmatched debt without lowering, resetting, aggregating, or hiding it, and the hermetic suite proves every required positive and adversarial case plus repeated-run identity stability through the real script entrypoint
- nogo: Any file-level credit, dead resolve, aggregate compensation, moved-site substitution, shadowed-local misbinding, ambiguous attribution, or unknown taxonomy is accepted as covered; Any unmatched debt is lowered, reset, aggregated, suppressed, or hidden merely to make the gate pass; The implementation grants permission or approval, changes runtime effects, expands into 4032, 4033, 4034, 4040, or 4050 semantics, adds a dependency or file, or writes outside the exact three-file scope
- techDebtAcceptable: None; no placeholder taxonomy, heuristic fallback, nondeterministic identity, silent ambiguity, fixture-local reimplementation, skipped adversarial case, or deferred production wiring is acceptable
