# AUTONOMOUS ARTIFACT AUTHORITY + CANONICAL ROOT SCOPE

## Goal

Close the live dogfood defects F-025 and F-031 without weakening canonical scope or cleanup
integrity. A Process task approved through Autonomous must compile the same valid project-root
scope as one-shot Run, and Autonomous lifecycle cleanup must never delete another surface's
`task-run-*` evidence. Artifact disposition is exact-owner, terminal-authority, archive-first and
receipt-backed across Linux, macOS, Windows native and WSL adapters.

## Execution contract

- This is one bounded recovery/safety outcome in the isolated tmp worktree. Do not touch main,
  commit, push, merge, provider auth, or external systems.
- i18n-FIRST: every user-facing string goes through `getMessage` in en/tr. Mechanism modules are
  string-free where the existing pattern permits caller-injected labels.
- No filename-prefix ownership, raw unlink cleanup, mtime authority, symlink following, absolute
  archive paths, shell-specific path semantics, or silent per-file error swallowing.
- Planning is silent; do not write a plan file. Locks and strict heartbeat are host-owned. Use the
  current camelCase TaskResult ingress and exact Docker settlement attempt from the host prompt.
- `npm run build` is forbidden while the sprint is active. Run only each task's exact tests.
- A foundation task is not DONE unless the dependent production/CLI closure task also settles.

## Task 1: Canonical project-root scope and exact Autonomous task lineage

- Files: src/core/execution-write-scope-policy.ts, src/orchestra/execution-request-builder.ts, src/orchestra/task-mode-runner.ts, src/orchestra/autonomous/execute-dispatcher.ts, src/cli/commands/run.ts, tests/core/execution-write-scope-policy.test.ts, tests/orchestra/task-mode-runner.test.ts, tests/orchestra/autonomous/execute-dispatcher.test.ts, tests/cli/run.test.ts
- Reads: src/orchestra/prompt-god-template.ts, src/core/work-model.ts, src/orchestra/process-controller.ts, src/cli/helpers/process-runtime.ts, tests/orchestra/prompt-god-template.test.ts
- Priority: CRITICAL
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/execution-write-scope-policy.test.ts tests/orchestra/task-mode-runner.test.ts tests/orchestra/autonomous/execute-dispatcher.test.ts tests/cli/run.test.ts

### Description

Implement one canonical, portable project-root selector rather than normalizing `./` into the
currently invalid `.` path. The scope compiler must distinguish a directory project-root selector
from empty/absolute/traversing exact-file inputs, retain casefold/symlink/collision safety, and emit
one stable manifest/digest representation. Run, TaskMode, Process and Autonomous must use this same
authority; no adapter-local fallback literals. Preserve ingress origin/correlation and separately
persist the orchestrator-owned exact task lineage needed by cleanup. The backlog's terminal result
must carry the exact returned `taskId` and settlement reference/digest when available; a pre-dispatch
failure honestly carries no task ownership. Replays/recurring entries must not alias a prior attempt.

GO: root selector compiles identically from Run and Autonomous/Process; absolute/traversing/ambiguous
paths still HOLD; exact task lineage survives terminal backlog writeback; no broadening through an
empty scope. NO_GO: special-casing Deckent's directory names, weakening scope checks, or deriving
ownership from `task-run-*` filenames.

## Task 2: Archive-first Autonomous artifact settlement and safe CLI cleanup

- Dependencies: Task 1
- Files: src/orchestra/autonomous/artifact-settlement.ts, src/orchestra/autonomous/backlog.ts, src/orchestra/autonomous/backlog-types.ts, src/orchestra/autonomous/execute-dispatcher.ts, src/cli/commands/autonomous.ts, src/cli/helpers/messages.ts, src/core/cli-command-contract.ts, tests/orchestra/autonomous/artifact-settlement.test.ts, tests/orchestra/autonomous/backlog.test.ts, tests/orchestra/autonomous/execute-dispatcher.test.ts, tests/cli/autonomous-command.test.ts
- Reads: src/core/sprint-archive.ts, src/core/task-artifact-classifier.ts, src/core/task-result-settlement.ts, src/core/invocation-receipt-store.ts, src/cli/commands/cleanup.ts
- Priority: CRITICAL
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/autonomous/artifact-settlement.test.ts tests/orchestra/autonomous/backlog.test.ts tests/orchestra/autonomous/execute-dispatcher.test.ts tests/cli/autonomous-command.test.ts
- Smoke: after host post-sprint build, `node dist/cli/entry.js autonomous cleanup --dry-run --json --root <isolated-project>` returns a stable plan and leaves foreign one-shot Run bytes unchanged; apply requires that exact plan digest and archives only terminal Autonomous-owned evidence.

### Description

Replace `cleanupAutonomousArtifacts` prefix deletion in post-item, loop-finally and manual cleanup
with one production settlement service. Discovery begins from durable terminal Autonomous backlog
lineage authored in Task 1, fresh-reads the exact Task JSON/result/settlement/invocation evidence,
groups only that task's regular files, rejects symlink/junction/path escape and concurrent identity
change, then publishes under a project-relative `.deckent/archive/autonomous/<entry>/<attempt>/`
namespace. Write hashes, byte counts, ownership evidence, preserved/held reasons and a canonical plan
digest; fsync/atomic publication precedes source removal. Apply is CAS/idempotent: same digest replays
as deduplicated; changed authority HOLDs. Foreign Run/Sprint/unknown files are always preserved and
reported. CLI cleanup gains dry-run and JSON projection plus `--apply --plan-digest`; it never deletes
on an unpreviewed call. Implicit lifecycle cleanup may apply only an internally fresh exact plan and
must persist the same receipt. Remove silent error swallowing; failures become typed HOLD evidence
without changing the already settled work verdict.

GO: regression test reproduces two foreign one-shot Run artifacts plus one terminal Autonomous
attempt, proves dry-run mutation-free, apply archives only the owned attempt, preserves foreign bytes,
emits/verifies receipt hashes, and is idempotent. Loop teardown uses the same service. NO_GO: any raw
prefix unlink remains, active/unsettled evidence moves, CLI apply works without exact plan digest, or
user-facing strings are hardcoded.

## Host post-settlement verification

After the sprint is inactive: build once, run both exact task batteries, run the Smoke in a fresh
tmp project, run `git diff --check`, and then start one bounded Process→Autonomous read-only task to
prove the real binary preserves a seeded foreign Run artifact while settling/archiving its own exact
attempt. Archive terminal verification and final-disk diff remain independent gates.
