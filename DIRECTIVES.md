# DIRECTIVES — Dirty-tree test-truth repair canary

## Goal

Restore the current main worktree's acceptance truth after fail-closed remote execution-budget
admission made legacy fixtures stop before the behavior they were written to test. This is a
three-worker, test-focused Deckent dogfood canary: preserve production admission and exact model
identity, repair only hermetic fixture authority, and leave the mixed historical source/SSOT
ownership slices untouched.

## Global Negative Space

- Do not weaken, bypass, reorder, mock away, or add a default around production execution-budget,
  pricing, provider, reachability, settlement, or fallback admission.
- Do not edit `src/**`, config, docs, Brain exports, runtime logs, `.tasks` artefacts belonging to
  another task, `stash@{0}`, repo history, dependencies, generated `dist/**`, or user state.
- Do not run `npm run build`, `npm run build:all`, `npm run test:ci-sim`, `/login`, publish, push,
  cleanup, recover, kill, or a provider probe inside the sprint.
- Do not replace exact API model IDs with aliases such as `sonnet`, `opus`, `haiku`, or `gpt-5`.
- Do not classify `unknown`, `unmetered`, or missing pricing as free/available.
- Do not make a test pass by asserting the admission HOLD itself when the test's written purpose
  is to exercise a downstream auth, routing, image, scheduler, or CLI behavior.
- Concrete violation: removing the production `Remote execution budget is required` guard so an
  old Docker auth fixture reaches its assertion would turn a test repair into a runaway-cost
  product regression.

## Governing Contracts

- ADR-G-006 / current owner policy: every remote fake or real dispatch must carry a finite,
  measurable execution budget; fake backends used after admission must truthfully declare their
  test-owned measured-stream capability.
- ADR-G-036: runtime model identity is the exact provider API ID.
- Test Infrastructure & Hermeticity ADR: tmpdir-owned fixtures, environment restoration, async
  subprocess seams, fresh-checkout behavior.
- Alp Discipline v1.0.3 and `.codex/rules/karpathy-discipline.md` are mandatory for every worker.
- This batch is `bounded coherent change`; the obstacle blocks stale test approaches, not the
  fail-closed product goal.

## Task 1: Docker auth and provider-image fixture budget parity

- Agent: ci-guardian
- Provider: claude
- Model: claude-sonnet-5
- Backend: docker
- Auth: subscription
- Effort: normal
- Files: tests/orchestra/docker-auth-precedence.test.ts, tests/orchestra/docker-multicli-buildarg.test.ts, tests/orchestra/docker-provider-auth.test.ts, tests/orchestra/docker-provider-cli.test.ts, tests/orchestra/f1014-auth-isolation.test.ts, tests/orchestra/wm5-auth-guard.test.ts, tests/orchestra/worker-auth-isolation.test.ts
- Scope: tests/orchestra/docker-auth-precedence.test.ts, tests/orchestra/docker-multicli-buildarg.test.ts, tests/orchestra/docker-provider-auth.test.ts, tests/orchestra/docker-provider-cli.test.ts, tests/orchestra/f1014-auth-isolation.test.ts, tests/orchestra/wm5-auth-guard.test.ts, tests/orchestra/worker-auth-isolation.test.ts
- Dependencies: none

### Description

Update only these legacy Docker fixtures so each intended remote spawn reaches the auth,
provider-command, image-preflight, and secret-isolation behavior under the current owner-authored
execution-budget contract. Reuse the canonical finite test-budget and measured-stream fixture
pattern already present in current green tests. Keep expected downstream error precedence intact:
image/CLI/auth tests must still test image/CLI/auth behavior after valid admission, not merely expect
an earlier budget HOLD.

### goNogo

- goCriteria: every fixture uses exact API model IDs; every intended remote spawn has a finite
  task-owned budget and a truthful measured fake backend/stream seam; all seven files pass together;
  production files are byte-identical; no environment or filesystem state leaks after tests.
- nogo: production admission is weakened; an unmetered fake is mislabeled measured; assertions are
  rewritten to accept the unrelated budget HOLD; any file outside the seven-file scope changes.
- Kanıt: `npx vitest run tests/orchestra/docker-auth-precedence.test.ts tests/orchestra/docker-multicli-buildarg.test.ts tests/orchestra/docker-provider-auth.test.ts tests/orchestra/docker-provider-cli.test.ts tests/orchestra/f1014-auth-isolation.test.ts tests/orchestra/wm5-auth-guard.test.ts tests/orchestra/worker-auth-isolation.test.ts`

## Task 2: Scheduler, adapter, MCP and pricing fixture admission parity

- Agent: ci-guardian
- Provider: claude
- Model: claude-sonnet-5
- Backend: docker
- Auth: subscription
- Effort: normal
- Files: tests/orchestra/scheduler-driver-composition.test.ts, tests/orchestra/spawn-routing-adapter.test.ts, tests/cli/spawn-multiprovider.test.ts, tests/mcp/run-tool-parity.test.ts
- Scope: tests/orchestra/scheduler-driver-composition.test.ts, tests/orchestra/spawn-routing-adapter.test.ts, tests/cli/spawn-multiprovider.test.ts, tests/mcp/run-tool-parity.test.ts
- Dependencies: none

### Description

Repair the four cross-surface fixtures so they pass the same owner budget/pricing gates as
production, then continue to exercise their written scheduler, adapter, MCP exact-model, and
unknown-pricing behavior. Register parametric/OpenRouter fixture identity and pricing evidence in
the same order production requires; do not turn catalog presence into pricing or reachability
proof. Preserve the reducer cost-HOLD assertions and exact provider/model propagation.

### goNogo

- goCriteria: reducer and legacy scheduler assertions reach their intended spawn seam with finite
  fixture budgets; adapter fakes declare only capabilities they actually simulate; MCP canonical
  model success includes owner policy evidence; unknown OpenRouter pricing fails with the canonical
  pricing error before provider work; all four files pass together.
- nogo: a model is silently registered as priced/reachable; local Ollama is hardcoded as a remote
  exception or vice versa; fallback/routing order changes; production files change; any assertion
  is weakened to accept an unrelated early HOLD.
- Kanıt: `npx vitest run tests/orchestra/scheduler-driver-composition.test.ts tests/orchestra/spawn-routing-adapter.test.ts tests/cli/spawn-multiprovider.test.ts tests/mcp/run-tool-parity.test.ts`

## Task 3: CLI dry-run and color hermeticity contract

- Agent: ci-guardian
- Provider: claude
- Model: claude-sonnet-5
- Backend: docker
- Auth: subscription
- Effort: low
- Files: tests/cli/commands/plan.test.ts, tests/cli/helpers/output.test.ts
- Scope: tests/cli/commands/plan.test.ts, tests/cli/helpers/output.test.ts
- Dependencies: none

### Description

Make the CLI tests hermetic against the current command composition. The plan dry-run fixture must
mock the canonical `generatePlanPreview` path and prove no draft cleanup, no task write, no approval
prompt, a visible dry-run notice, and a stable plan digest. Color assertions must explicitly own and
restore `NO_COLOR`, argv, and related environment triggers rather than depend on the invoking
shell. Do not change the production output or command implementation.

### goNogo

- goCriteria: both files pass with `NO_COLOR=1` inherited and with `NO_COLOR` absent; dry-run uses
  the preview service and performs zero mutation/approval; color tests restore all process state;
  production files remain byte-identical.
- nogo: tests globally delete caller environment without restoration; production output is changed
  to satisfy a fixture; dry-run is allowed to clean/write/approve; files outside the two-file scope
  change.
- Kanıt: `npx vitest run tests/cli/commands/plan.test.ts tests/cli/helpers/output.test.ts` and
  `env -u NO_COLOR npx vitest run tests/cli/commands/plan.test.ts tests/cli/helpers/output.test.ts`

## Batch Acceptance

- Exactly 3 non-overlapping workers; maximum concurrency 3.
- Structured planner; no extra Brain model call.
- Owner budget policy remains active: worker default maximum 5,000,000 cache-read tokens and
  32 turns, but workers must finish as soon as the scoped tests are green.
- Root acceptance after the sprint closes: disk attribution, all 41 current dirty tests, full lint,
  then `npm run build:all`; only after those pass may a real-binary canary be considered.
- No commit or push inside the sprint. Brain evaluates every result from disk evidence.
