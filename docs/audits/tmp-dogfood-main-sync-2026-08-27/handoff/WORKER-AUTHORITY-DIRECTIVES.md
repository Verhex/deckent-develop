# WORKER AUTHORITY PROJECTION + HEARTBEAT BINDING REPAIR — live dogfood evidence (2026-08-27)

## Goal

Make the canonical worker rule template agree with the accepted runtime contracts and bind the
actual host-created attempt identity into every Docker worker prompt before provider execution.
Prove semantic projection parity instead of accepting structural provider parity alone.

## Execution contract

- Confirmed live evidence: sprint-005 task 005-002 received `HEARTBEAT_IDENTITY_HOLD`, then wrote
  a legacy/custom `.hb` object over the host projection. The Docker backend nevertheless owned an
  exact settlement attempt ID and later repaired the file at terminal observation.
- Confirmed disk evidence: all four generated worker rules still instruct workers to consult
  `.brain/memory.db`, inspect `.locks/`, use the legacy existence-only heartbeat, and emit obsolete
  snake_case result fields. The existing 132-test worker battery did not detect this drift.
- Preserve worker result ingress as current camelCase claims, keep product memory behind admitted
  public capability, keep file admission/locks host-owned, require `docImpact` when docs are out of
  scope, and use ADR-G-020 as the live authority name.
- The spawn boundary must bind the exact settlement attempt that the backend will execute. Never
  invent an attempt from a filename and never retain `HEARTBEAT_IDENTITY_HOLD` when the backend has
  already allocated exact identity.
- Do not run `npm run build`, full-suite tests, commit, push, kill, or raw-delete `.tasks` content.

## Task 1: Close canonical worker template and Docker attempt binding
- Files: src/core/rule-templates/worker-default.template.md, src/orchestra/sprint-spawner.ts, tests/core/rule-generator.test.ts, tests/docs/rules-parity.test.ts, tests/orchestra/worker-identity-hostbound.test.ts, tests/orchestra/sprint-spawner.test.ts
- Reads: src/core/worker-activity-heartbeat.ts, src/core/worker-heartbeat-authority-store.ts, src/core/task-result-settlement.ts, src/orchestra/prompt-god-template.ts, src/orchestra/spawn-backend.ts, src/orchestra/spawn-backend-docker.ts, .deckent/workspace/WORKER-GUIDE.md, .tasks/task-005-002.result
- Priority: HIGH
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/rule-generator.test.ts tests/docs/rules-parity.test.ts tests/orchestra/worker-identity-hostbound.test.ts tests/orchestra/sprint-spawner.test.ts
### Description
Replace the stale top-level canonical worker template clauses with the accepted authority contract:
ADR context is delivered by Brain or queried through an admitted public Deckent capability; the
worker never opens product-memory internals; planning is silent and no plan file is written; host
scheduling owns locks/file admission and workers never inspect or mutate `.locks`; heartbeat uses
the strict schema rendered from exact host-bound attempt/backend identity; result ingress is current
camelCase with promptCompilePlanId, typed verification/criteria evidence and one-string notes; an
out-of-scope documentation need is reported as `docImpact:`. Keep Karpathy and Proof-of-Function
sections aligned with current policy.

For Docker normal execution, allocate or reuse the exact task-result settlement reference before
prompt binding, bind that same attempt ID with backend=`docker`, and pass the identical reference to
the backend. Preserve approval-bound attempts and subprocess/tmux behavior. Add a regression at the
real spawner/backend call boundary proving a no-approval Docker dispatch contains neither
`HEARTBEAT_IDENTITY_HOLD` nor a different attempt ID, while the backend receives the same settlement
reference. Add semantic tests that fail on each obsolete worker-template clause, not merely provider
body equality. Report any generated-projection refresh as a post-settlement obligation; do not
hand-edit generated rule files.
