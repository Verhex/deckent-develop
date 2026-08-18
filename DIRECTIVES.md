# DIRECTIVES — 7083 NATIVE-RUNFLOW-BOOTSTRAP: propose_run provider bootstrap + session-budget renewal (Qwen live-trial fixes)

## Goal

MASTER 7083 (owner admission 2026-08-18, live Qwen trial evidence; owner picked
"ikisi birlikte"). Two defects killed the owner's live native-terminal trial:
(1) `deckent_propose_run` is broken on the native REPL — it is the ONLY entry point
that never calls `bootstrapProviders`, so run-flow planning dies
`ProviderNotFoundError: "claude"` on an empty provider registry (proof chain:
native-tool-registry.ts:588 → run-flow-plan-service.ts:627 → run-proposal-compiler →
planner.ts resolveAdapter → provider.ts empty registry; every other entry point —
do.ts:238, mcp plan/start, spawn.ts:397-405 lazy pattern, serve.ts — bootstraps).
(2) When the session budget exhausts, the session falls into a PERMANENT dead loop:
every subsequent turn returns "[Oturum süre bütçesi tükendi.]" in 0.0s forever —
session.ts creates ONE NativeBudgetState and no renewal path exists. The owner's
contract: typed exhaustion signal, then an explicit RENEWAL offer (renewable working
epoch — billing/usage/audit counters NEVER reset) or honest closure; never a dead end.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Parallel execution ADMITTED; single-writer chokepoints: ONLY task 1 writes
  src/agent/session.ts and src/agent/guards/recursion.ts; ONLY task 2 writes
  src/cli/repl/native-agent-bridge.ts, src/cli/repl/run.tsx and
  src/cli/helpers/messages.ts; ONLY task 3 writes src/cli/repl/native-tool-registry.ts.
- Billing/usage/cost/audit counters NEVER reset by any renewal — only the WORKING
  budget epoch renews, and ONLY on an explicit typed user action (no auto-renew, no
  silent grant). Fail-closed stays fail-closed.
- Mechanism modules string-free; user-visible text via getMessage en+tr; hermetic
  tmpdir tests only; use worker comms (sharedNotes + handoff notes).
- Echo the policy digest in your .result as runPolicyEvidence exactly as the prompt's
  Result contract instructs.

## Task 1: session budget-exhaustion truth + renewable working epoch (core authority)
- Files: src/agent/session.ts, src/agent/guards/recursion.ts, tests/agent/session-budget-renewal.test.ts
- Scope: src/agent/, tests/agent/
- Provider: codex
- Model: gpt-5.6-sol

### Description
1. EXHAUSTION TRUTH: when a turn terminates with any `native-budget.*` terminal code,
   the AgentSession records a typed exhausted state {code, at, epoch}. A send() on an
   exhausted session does NOT run the loop; it yields exactly ONE typed event
   `session-budget-exhausted` carrying {code, epoch, renewalHint: true} and turn-end —
   cheap, honest, and never the old silent 0.0s dead loop that re-enters the loop
   only to die at round-start.
2. RENEWABLE EPOCH: new session API `renewBudgetEpoch(): { epoch: number }` — creates
   a FRESH NativeBudgetState (working counters only: rounds/toolCalls/wallTime start/
   cumulativeTokens/noProgress/checkpoint cadence state), increments an epoch counter,
   clears the exhausted state. Explicitly out of renewal: costGuard accrual, usage
   totals, audit — assert in tests that the cost guard object is untouched by renewal.
   Loop wiring: the session passes its CURRENT epoch's state into runAgentTurn (the
   existing deps.nativeBudgetState seam — no loop change needed).
3. recursion.ts: NativeBudgetState gains an optional creation helper accepting a start
   time (already exists) — add nothing beyond what task needs; if no change is
   genuinely required, leave the file byte-identical and say so in notes.
4. Tests: terminal code → exhausted state; exhausted send() yields the single typed
   event without invoking the adapter (spy: adapter.send never called); renew → next
   send() runs normally with fresh working counters; cost guard identity/values
   survive renewal untouched; epoch increments; double-renew idempotent-safe.

GO: suite green; tsc 0; adapter-never-called-when-exhausted proven; renewal restores
a working turn; billing/cost objects byte-untouched by renewal.
NO_GO: any auto-renew path, any reset of cost/usage/audit accounting, or the dead
loop surviving.

## Task 2: REPL renewal surface — typed offer + /renew command (depends on Task 1)
- Files: src/cli/repl/native-agent-bridge.ts, src/cli/repl/run.tsx, src/cli/helpers/messages.ts, tests/cli/native-budget-renewal-surface.test.ts
- Scope: src/cli/repl/, src/cli/helpers/, tests/cli/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. The bridge consumes Task 1's `session-budget-exhausted` event and renders ONE
   user-facing offer line via new i18n keys (en+tr): which budget dimension exhausted
   + "continue with `/renew` (billing continues; working limits restart) or close the
   session" — localized through getMessage, mechanism text stays typed codes.
2. ReplEngine gains optional `renewBudgetEpoch?: () => { epoch: number }` threading
   session.renewBudgetEpoch (same optional-member pattern as setApprovalMode/close).
3. run.tsx registers a `/renew` slash command on the native path only: calls the
   engine seam, prints a typed confirmation line (i18n en+tr, includes new epoch
   number). Legacy loop path: `/renew` prints an honest not-available line.
4. Tests: exhausted event → exactly one offer line per exhaustion (dedup across
   repeated sends); /renew → engine seam called + confirmation with epoch; non-native
   path honest message; i18n keys exist in both languages (getMessage returns
   non-key).

GO: suite green; tsc 0; offer-once + renew-roundtrip proven on a fake session.
NO_GO: hardcoded user-facing strings, auto-renew, or offer spam on every send.

## Task 3: propose_run lazy provider bootstrap on the native path
- Files: src/cli/repl/native-tool-registry.ts, tests/cli/native-propose-run-bootstrap.test.ts
- Scope: src/cli/repl/, tests/cli/
- Provider: claude
- Model: claude-sonnet-5

### Description
1. The `deckent_propose_run` handler (native-tool-registry.ts:588 region) performs the
   lazy, idempotent `bootstrapProviders(cfg, root)` before `controller.proposeRun` —
   copy spawn.ts:397-405's exact pattern (dynamic import, loadConfig, best-effort
   try/catch that falls through to the existing honest `[mcp-error]` path on fault;
   never a new failure mode, never a retry loop). A registry that already has
   providers must skip re-bootstrap work (bootstrapProviders is idempotent — assert,
   do not re-implement).
2. Hermetic test: a fake controller whose proposeRun records invocation order proves
   (a) with an empty registry the handler invokes the bootstrap seam BEFORE
   proposeRun (inject the bootstrap via a seam or module spy — no network, no real
   providers), (b) bootstrap fault → the existing `[mcp-error] deckent_propose_run:`
   honest error, no throw escape, (c) second call does not double-bootstrap
   (idempotency observed at the seam).
3. Smoke line for the host (do NOT run it yourself): real-binary native REPL
   `deckent_propose_run` produces a plan preview instead of ProviderNotFoundError.

GO: suite green; tsc 0; bootstrap-before-propose proven at a seam; fault path stays
the existing typed [mcp-error].
NO_GO: an unconditional re-bootstrap per call doing real work, or a new error shape.
