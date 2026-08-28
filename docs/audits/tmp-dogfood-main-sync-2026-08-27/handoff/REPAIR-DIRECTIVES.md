# POST-FINALIZATION PROJECTION INTEGRITY REPAIR — confirmed dogfood blocker (2026-08-27)

## Goal

Prevent a sprint finalizer running an older compiled runtime from overwriting projection files
with stale templates or content generators after workers have changed their canonical sources.
Restore the accepted host-rule and worker-guide projections, then prove the final disk state rather
than trusting pre-finalization worker tests.

## Execution contract

- Confirmed evidence: canonical source templates changed at 11:31, `dist` templates remained at
  11:10, and finalization rewrote host projections at 11:45. Independent verification then failed
  30/520 tests even though workers reported green.
- Preserve ordinary installed-package behavior. A consumer project without Deckent source files is
  not a development checkout and must continue using packaged templates.
- A coherence failure must be detected before the first affected projection write, preserve the
  existing projection byte-for-byte, and surface a typed non-success that prevents terminal
  `COMPLETE`; logging a swallowed hook error is insufficient.
- Do not run `npm run build` or a full test suite inside workers. Do not commit, push, kill, or raw
  delete `.tasks` content. User-facing text requires `getMessage` EN/TR parity.

## Task 1: Fence stale-runtime post-finalization projection writes
- Files: src/core/rule-generator.ts, src/core/identity-generator.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/managed-docs/managed-doc-runner.ts, tests/core/rule-generator.test.ts, tests/orchestra/sprint-finalizer.test.ts, tests/orchestra/managed-docs-content-generators.test.ts, tests/orchestra/finalizer-projection-coherence.test.ts
- Reads: src/cli/worktree-binary-authority.ts, scripts/copy-assets.mjs, dist/.deckent-build-identity.json, src/orchestra/workspace-artifacts.ts, src/orchestra/managed-docs/doc-updaters.ts, src/orchestra/sprint-controller.ts
- Priority: HIGH
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/rule-generator.test.ts tests/orchestra/sprint-finalizer.test.ts tests/orchestra/managed-docs-content-generators.test.ts tests/orchestra/finalizer-projection-coherence.test.ts
### Description
Implement a narrow, fail-closed source/build coherence boundary for development checkouts. If the
runtime asset or content generator that would author a managed host-rule/workspace projection is
older or content-divergent from its canonical source, detect that before any affected projection
write and preserve the existing file. Propagate a typed integrity HOLD through post-finalization so
the finalizer cannot publish terminal COMPLETE while a required projection is stale. Do not turn
all ordinary source changes into a HOLD and do not penalize installed consumer projects that lack
Deckent source. Pin atomic no-write behavior, the typed failure path, installed-package behavior,
and successful coherent regeneration with hermetic tests. Reuse existing build-identity/digest
patterns rather than inventing an mtime-only authority.

## Task 2: Restore canonical projections and close independent failures
- Dependencies: Task 1
- Files: .claude/rules/brain.md, .claude/rules/worker-default.md, .claude/rules/karpathy-discipline.md, .codex/rules/brain.md, .codex/rules/worker-default.md, .codex/rules/karpathy-discipline.md, .cursor/rules/brain.mdc, .cursor/rules/worker-default.mdc, .cursor/rules/karpathy-discipline.mdc, .gemini/rules/brain.md, .gemini/rules/worker-default.md, .gemini/rules/karpathy-discipline.md, .deckent/workspace/WORKER-GUIDE.md, scripts/lint-stale-adr.mjs, tests/scripts/lint-stale-adr.test.ts, tests/docs/rules-parity.test.ts, tests/docs/proof-of-function-rule.test.ts, tests/docs/karpathy-rule-presence.test.ts, tests/orchestra/workspace-artifacts.test.ts
- Reads: src/core/rule-templates/brain.template.md, src/core/rule-templates/worker-default.template.md, src/core/rule-generator.ts, src/orchestra/workspace-artifacts.ts, src/cli/helpers/messages.ts, dist/core/rule-generator.js, dist/orchestra/workspace-artifacts.js, .brain/memory.db
- Priority: HIGH
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/lint-stale-adr.test.ts tests/core/rule-generator.test.ts tests/docs/rules-parity.test.ts tests/docs/proof-of-function-rule.test.ts tests/docs/karpathy-rule-presence.test.ts tests/orchestra/workspace-artifacts.test.ts
### Description
Use the currently coherent built canonical rule generator and workspace-artifact application
service to restore every host projection; do not maintain a hand-copied variant. The projections
must contain proposal-only Brain authority, public-capability wording, dogfood/product memory
separation, no worker plan file, current Proof-of-Function/Karpathy parity, current camelCase result
ingress, strict heartbeat identity, host-owned locks, `docImpact`, and ADR-G-020. Fix any real stale
ADR lint defect without widening the immutable-history allowlist. Run the declared independent
tests after restoration and report exact pass/fail counts.
