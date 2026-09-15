# Dirt disposition

Measured 2026-09-15T20:24:50.669761+00:00. File-level inventory (untracked directories expanded). All rows currently uncommitted; K0/K1 gates block landing. Commit numbers are intended classes, not completed commits.

| Path | Class | Reason | Intended commit |
|---|---|---|---|
| .codex/skills/deckent-authority-bootstrap/SKILL.md | POLICY-DOC | Inherited policy/tooling changes require review | 5 |
| .codex/skills/deckent-readonly-audit/SKILL.md | POLICY-DOC | Inherited policy/tooling changes require review | 5 |
| .deckent/run-gate.json | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| .deckent/runtime/sprint-525-bootstrap-seam.json | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| .deckent/settings/features-manifest.json | POLICY-DOC | Inherited policy/tooling changes require review | 5 |
| .deckent/workspace/TOOLS.md | POLICY-DOC | Inherited policy/tooling changes require review | 5 |
| .test/shared.txt | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| .test/sleep-result.txt | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| .test/sprint-168-smoke-directives.md | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| AGENTS.md | POLICY-MODE | K0 requested projection; policy gate RED | 1 |
| CLAUDE.md | POLICY-MODE | K0 requested projection; policy gate RED | 1 |
| DIRECTIVES.md | POLICY-DOC | Inherited policy/tooling changes require review | 5 |
| deckent-test-12092026.md | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| docs/CHANGELOG.md | DOCS/GENERATED | Documentation/projection; regenerate canonical outputs | 6 |
| docs/MASTER-PLAN.md | DOCS/GENERATED | Documentation/projection; regenerate canonical outputs | 6 |
| docs/SPRINT-LOG.md | DOCS/GENERATED | Documentation/projection; regenerate canonical outputs | 6 |
| docs/generated/master-plan-active.json | DOCS/GENERATED | Documentation/projection; regenerate canonical outputs | 6 |
| docs/generated/master-plan-active.md | DOCS/GENERATED | Documentation/projection; regenerate canonical outputs | 6 |
| durum-raporu.md | DOCS/GENERATED | Documentation/projection; regenerate canonical outputs | 6 |
| follow-up-works/current-flow.md | DOCS/GENERATED | Documentation/projection; regenerate canonical outputs | 6 |
| follow-up-works/cursor-7099-cli-help-matrix.md | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| follow-up-works/fable-7104-sync-async.md | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| follow-up-works/research-terminal-ecosystem-7114.md | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| native/exec-authority/src/custody_posix.c | NATIVE | Native proof required | 2 |
| proof/cursor-cli-help-matrix-v4/ARCHIVE.md | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| proof/cursor-cli-help-matrix-v4/manifest.json | UNRELATED-DELETE | Inherited deletion; no runtime cleanup performed; effect review pending | 4 |
| src/cli/commands/recover.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/cli/helpers/messages.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/cli/repl/run.tsx | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| src/core/execution-effect-persistence-contract.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/core/file-lock.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/core/task-attempt-custody-store.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/core/task-types.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/core/verdict-types.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/exact-docker-command-transport.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/exact-docker-container-observation.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/execution-continuation-runner.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/execution-effect-landing-coordinator.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/execution-effect-native-adapter.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/execution-effect-store-adapter.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/ipc-registry.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/result-collector.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/result-evaluator.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/scheduler-effects.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/spawn-backend-docker.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/spawn-backend.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/sprint-controller.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/sprint-lifecycle.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/sprint-phases.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/sprint-recovery-operation.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/sprint-spawner.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/task-result-authority.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| tests/cli/repl-errorboundary-i18n.test.ts | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl-i18n-flip.test.ts | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl-legacy-loop-lang-wire.test.ts | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl/app-picker-mutex.test.ts | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl/approval-keyboard-transition.test.tsx | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl/input-debug-wire.test.tsx | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl/native-permission-round.test.tsx | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl/operator-strip-lifecycle.test.tsx | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl/picker.test.ts | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/cli/repl/slash-menu-more-labels.test.tsx | UNRELATED-MODIFIED | Terminal custody; attribution and independent verification unresolved; excluded | 3 |
| tests/core/execution-effect-persistence-contract.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/core/task-attempt-custody-store.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/core/task-execution-fence.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/exact-controller-terminal-fanin.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/exact-docker-observation.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/execution-effect-landing-coordinator.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/execution-effect-native-adapter.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/production-wiring-outer-barrier.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/result-collector-settlement-authority.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/result-collector.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/scheduler-spawn-executor.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/spawn-backend-docker-ipc-authority.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/spawn-backend-docker-mounts.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/sprint-recovery-operation.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| docs/execution/active/DOGFOOD-CROSS-SURFACE-ANALYSIS-PLAN.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/DOGFOOD-UNIFIED-AUDIT-20260913/INVENTORY.jsonl | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/DOGFOOD-UNIFIED-AUDIT-20260913/MANIFEST.json | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/DOGFOOD-UNIFIED-AUDIT-20260913/PLAN.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/DOGFOOD-UNIFIED-AUDIT-20260913/REPORT.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/DOGFOOD-UNIFIED-AUDIT-20260913/UNTRACKED.json | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/dogfood-comparison/single/result/ANALYSIS.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/dogfood-comparison/twenty/task-01/ANALYSIS.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/dogfood-comparison/twenty/task-03/ANALYSIS.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/parallel-4-post-recovery-762/settlement/ANALYSIS.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/active/parallel-4-post-recovery-762/startup/ANALYSIS.md | UNCLASSIFIED-ACTIVE-DOC | Not assigned a K2 commit class; retain, do not silently include | — |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/752-read-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/753-live-read-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/754-inspect-contention-after.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/754-inspect-contention.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/observe-start-resources.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/task-753-001.hb | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/chain-752-repair/task-753-001.result | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/cursor-entry-233.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r10/baseline/src/core/custody-read-snapshot.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r10/baseline/src/core/task-attempt-custody-store.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r10/baseline/tests/core/custody-read-snapshot.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r10/baseline/tests/core/task-attempt-custody-store.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r10/candidate-after.cpuprofile | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r10/candidate-before.cpuprofile | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r10/profile-candidate.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r11/baseline/src/core/task-attempt-custody-posix-adapter.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r11/baseline/tests/core/task-attempt-custody-posix-adapter.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r11/native-read-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r13/baseline/src/core/run-status-read-model.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r13/baseline/tests/core/run-status-read-model.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r13/first-snapshot-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/TIMING-CORRECTION.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/baseline/src/orchestra/exact-docker-container-observation.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/baseline/src/orchestra/execution-effect-docker-lifecycle.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/baseline/src/orchestra/spawn-backend-docker.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/baseline/tests/orchestra/exact-docker-observation.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/baseline/tests/orchestra/execution-effect-docker-lifecycle.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/population-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r14/task-760-001.result | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r15/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r15/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r15/depth-profile.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r15/depth-profile.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r15/native-read-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r15/native-read-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/cpu-profile-reference.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/profile-summary.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/terminal-authority-counts.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/terminal-authority-counts.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/terminal-authority-profile.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/terminal-authority-profile.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/terminal-authority-snapshot.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/terminal-authority-snapshot.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/LANDING.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/SCOPE.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/build-main.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/ANALYSIS.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/EXIT.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/START.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/job.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/monitor.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/resources.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/sprint-761-events.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/sprint-761-terminal-receipt.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/start.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/status-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/task-761-001.accepted-result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/task-761-001.result | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/r17-public-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/r17-public-proof.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/repeat-1.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/repeat-2.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/repeat-3.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/LANDING.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/PARTIAL-RECOVERY-CONTRACT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/PREFIX-LANDING.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/RECOVERY-GUARD-SCOPE.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/SCOPE.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/attempt-1.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/build-all-result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/build-all.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/post-build.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/post-status.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/recover.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/recovery-result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/aborted-retention/scope.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/build-isolated.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/build-main.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/final-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/final-tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/force-finalize/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/force-finalize/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/force-finalize/archive-verification.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/force-finalize/before.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/force-finalize/command.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/force-finalize/post-status.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/force-finalize/result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/prefix-final-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/prefix-tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/recovery-dry-run.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/recovery-dry-run.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/recovery-guard-build.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/recovery-guard-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/recovery-guard-tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/repaired-recovery-diagnostic-exit.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/repaired-recovery-diagnostic.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/repaired-recovery-diagnostic.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/repro-nested.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/snapshot-candidate.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r18/snapshot-candidate.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/LANDING.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/SCOPE.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/binary-identity.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/build-all-result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/build-all.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/initial-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/isolated-build.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r19/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/COMMAND-EXITS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/before-retention-command.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/before-retention-entries.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/before-retention-result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/command.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/entries.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/retain-001.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/retain-002.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/retain-004.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/retained-001.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r20/retained-004.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/COMMAND-EXITS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/LANDING.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/SCOPE.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/binary-identity.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/build-all-result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/build-all.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/isolated-build.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/isolated-live-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/main-live-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/tests-first.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/tests-second.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/tsc-first.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r21/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/COMMAND-EXITS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/LANDING.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/SCOPE.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/binary-identity.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/build-all-result.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/build-all.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/isolated-build.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/isolated-live-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/main-live-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/tests-dist-drift.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/tests-first.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/tests-two-files.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r22/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/COMMAND-EXITS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/DIRECTIVES-before.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/DIRECTIVES-next.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/LANDING.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/SCOPE.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/binary-identity.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/conflicting-mode.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/conflicting-mode.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/conflicting-mode.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/directive-change.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/EXIT.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/START.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/EXIT.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/START.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/final-status.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/monitor.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/observation-120s.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/observations.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/process-io.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/resources.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/acknowledged-paths/start.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/monitor.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/post-scope-status.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/resources.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/scope-diagnosis.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/sprint-763.snapshot.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/dogfood/start.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/health.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/isolated-build.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/isolated-dry-run.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/isolated-dry-run.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/isolated-dry-run.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/main-build.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/main-build.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/main-build.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/main-retain.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/main-retain.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/main-retain.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/production-health.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/production-health.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/production-health.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/run-command.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/tsc-first.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/wrong-transaction.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/wrong-transaction.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r23/wrong-transaction.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/before-fix-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/main-build.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/main-build.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/main-build.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/preflight.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/red.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/run-command.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r24/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/COMMAND-EXITS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/DAG.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/DIRECTIVES-single.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/DIRECTIVES-twenty.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/admissions.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/attempts.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/attempts.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/attempts.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/diagnostics.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/diagnostics.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/errors-764.txt | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/inspect.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/parsed-single.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/parsed-twenty.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/plans.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/recovery-002-dryrun.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/recovery-002-dryrun.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/run764/EXIT.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/run764/START.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/run764/admitted-status.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/run764/first-worker-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/run764/monitor.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/run764/resources.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/run764/start.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r25/work-authority-diagnostic.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/attempts.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/finalize.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/finalize.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/finalize.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/post-finalize-attempts.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/run-command.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r26/status.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/DIRECTIVES-before.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/accept-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/accept.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/accept.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/accept.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/accept.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/attempts-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/attempts.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/build.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/build.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/build.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/cold-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/cold-proof.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/cold-proof.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/debts-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/debts-before.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/effect.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/effect.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/effect.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/reader-proof.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/reader-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release-before.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release-preview.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release-preview.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/release.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/retention-preview.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/retention-preview.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/retention-preview.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/run-command.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/tests-final.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/tests-verified.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r27/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/DAG.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/DIRECTIVES-twenty.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/build.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/build.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/build.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/finalize.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/finalize.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/finalize.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/parsed-twenty.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/run-command.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/scope.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/single-765/EXIT.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/single-765/START.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/single-765/findings.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/single-765/monitor.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/single-765/resources.jsonl | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/single-765/start.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/single-765/status-observed.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/status-after-finalize.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/tests-final.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r28/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/base-head.txt | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/closure.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/dirty-numstat.txt | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/finalize.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/finalize.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r30/finalize.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/build.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/build.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/build.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/proof.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/real-docker.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/real-docker.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/real-docker.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/run-command.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/suite.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/tests-final.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r31/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r32/FABLE-ANALYSIS.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/FABLE-FOLLOWUP.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/MANIFEST.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/accept-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/accept.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/accept.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/accept.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/accept.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/attempts-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/attempts.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/build.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/build.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/build.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/cold-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/cold-proof.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/cold-proof.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/debt.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/release-after.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/release-before.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/release.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/release.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/release.stderr | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/release.stdout | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/run-command.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tests-compensation.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tests-final.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tsc-compensation.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tsc-final.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tsc-next.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tsc-repaired.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r33/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r34/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r34/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r34/e3-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r34/store-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r34/tsc-final.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r35/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r35/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r35/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r35/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r36/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r36/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r36/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r36/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r37/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r37/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r37/abc-first-failure.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r37/checks-before-abc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r37/final-collector-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r37/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r38/IPC-RETRY-ANALYSIS.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r38/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r38/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r38/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r38/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r39/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r39/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r39/collector-port-tests-before-negative.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r39/ipc-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r39/port-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r39/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r40/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r40/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r40/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r40/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r41/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r41/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r41/initial-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r41/prior-expectation-failure.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r41/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r41/tsc.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/FABLE-TIMEOUT-ANALYSIS.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/binary.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/build.exit | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/build.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/inspect-proof.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r42/inspect-proof.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r43/FABLE-OWNERSHIP-CLARIFICATION.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r43/IMPLEMENTATION-CONTRACT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r43/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r44/RESULT.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r44/SCOPE.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r44/SOURCE-DIGESTS.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r44/binary.json | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r44/build.exit | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r44/build.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r44/tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/CUTOVER-PACKAGE.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/branches-before.txt | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/consolidated-tests.exit | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/consolidated-tests.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/lint.exit | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/lint.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/policy-gate.exit | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/policy-gate.log | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/status-before.txt | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/worktrees-before.txt | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r6/timeline.py | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r7/B-capture-blocked.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r7/B-capture-isolated.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r7/B-capture-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r7/B-capture-window.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r7/B-command-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/api/status-reconcile.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/cli/commands/status.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/cli/helpers/run-state-feed.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/core/run-status-read-model.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/mcp/tools/status.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/orchestra/result-collector.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/orchestra/sprint-controller.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/src/orchestra/sprint-lifecycle.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/tests/cli/status-terminal-publication-race.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/tests/core/run-status-read-model.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/baseline/tests/orchestra/result-collector-settlement-authority.test.ts | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r9/compiled-status-probe.mjs | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/resources-revised.jsonl.frozen-before-relocation | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/start-revised.log.frozen-before-relocation | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/astra-recovery-20260912/start-exact-repair/task-752-001.result | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-environment-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-events-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-history-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-resources-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-scheduler-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-status-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-supervision-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| docs/execution/evidence/parallel-start-20260913/parallel-timers-analysis-20260913.md | EVIDENCE | Retained recovery evidence, not closure | 7 |
| src/orchestra/exact-docker-execution-worker.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| src/orchestra/exact-docker-release-outcome.ts | RECOVERY-SRC | Recovery baseline; K1 gate required | 2 |
| tests/orchestra/exact-docker-release-recovery.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/exact-held-containment-barrier.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/result-evaluator-derived-directory.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| tests/orchestra/terminal-authority-snapshot-boundary.test.ts | RECOVERY-TEST | Recovery verification; K1 gate required | 2 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/3178-prior-evidence.md | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/BRANCH-WORKTREE-INVENTORY.md | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/DIRT-DISPOSITION.md | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/EVIDENCE-INDEX.md | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/FINAL-SOURCE-DIGESTS.json | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/HANDOFF.json | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/OPEN-ITEMS.md | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/RESULT.md | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/RUNTIME-HYGIENE.md | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/binary.json | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/build.exit | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/build.log | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/closure.exit | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/closure.log | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/docker-ps.txt | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/master-projection.exit | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/master-projection.log | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/native-build.log | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/run-gate-references.txt | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
| docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r45/runtime-build-admission.json | EVIDENCE | Created during cutover; uncommitted, landing gates RED | 7 |
