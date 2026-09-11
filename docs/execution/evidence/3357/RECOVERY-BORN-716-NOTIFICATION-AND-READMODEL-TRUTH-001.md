# RECOVERY-BORN-716-NOTIFICATION-AND-READMODEL-TRUTH-001 — IMPLEMENTED_PRODUCTION_VERIFIED

OUTCOME_ID: RECOVERY-BORN-716-NOTIFICATION-AND-READMODEL-TRUTH-001  
DOGFOOD_MODE: ON  
DOGFOOD_HEALTH: DEGRADED  
RECOVERY_SEAM: ADR-D-007  
BASE_SHA: ff2e47564232d05656b8645f4c3fd3449b322dc9  
BRANCH: main  
WORKSPACE_MODE: MAIN  
PARENT_MASTER_ID: 3357  
TRIGGER_RUN: sprint-716  
OWNER_DECISION_REF: owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete  

## Exact outcome

Make every owner-facing start/FIX/status claim derive from execution evidence rather than a phase
transition or detached-process acceptance. Sprint-716 emitted “started/execution underway” after a
zero-work spawn skip and “repair tasks are being dispatched” before the retry-held decision, then a
stale read model projected the dead coordinator as active.

This is a separate outcome from workspace admission, terminal digest, and model provenance. It
does not alter scheduling eligibility, provider routing, retry budgets, or settlement rules.

## Host-computed admission receipt

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-716-NOTIFICATION-TRUTH-01",
  "outcomeId": "RECOVERY-BORN-716-NOTIFICATION-AND-READMODEL-TRUTH-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T23:14:30+03:00",
  "consumedAt": "2026-09-04T23:14:30+03:00",
  "baseSha": "ff2e47564232d05656b8645f4c3fd3449b322dc9",
  "branch": "main",
  "policyDigest": "sha256:f65334ba14584c2a7a8d451fa20e4c0aaf39bd4ad5383c3fa84cac0070375f14",
  "currentScopeDigest": "sha256:13d6cf041d56f03c911234c4512f03a2aa194c3b02e47c8787e3d34d8a5d1204",
  "scopeCount": 13,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete",
  "recoverySeam": "ADR-D-007"
}
```

The scope digest binds all pre-existing dirty bytes in the hot files and `null` for the absent new
test. One writer owns the full scope and must preserve unrelated prior recovery changes.

## Exact write scope

- `src/orchestra/sprint-spawner.ts`
- `src/orchestra/sprint-phases.ts`
- `src/orchestra/sprint-controller.ts`
- `src/cli/helpers/messages.ts`
- `src/cli/helpers/run-state-feed.ts`
- `src/cli/helpers/live-footer.ts`
- `src/cli/repl/run.tsx`
- `src/core/run-status-authority.ts`
- `tests/orchestra/spawn-spawner-wire.test.ts`
- `tests/orchestra/sprint-notification-truth.test.ts` (new)
- `tests/cli/run-state-feed.test.ts`
- `tests/cli/live-footer.test.ts`
- `tests/cli/repl/live-footer-labels.test.ts`

## Required behavior and proof

1. Pre-SPAWN plan acceptance never emits an event named or worded as worker execution start.
2. Exact Docker start notification requires actual `spawned` evidence; provider release count is
   reported separately and never inferred from task status.
3. Zero-work/NOT_DISPATCHED produces a truthful i18n HOLD/no-worker message and cannot claim
   execution underway.
4. FIX dispatch notification is emitted once, only after an actual repair spawn admission.
5. A stale ACTIVE/FIXING persisted read model loses to canonical ABORTED/ORPHANED + dead-process
   authority. Terminal/TUI cannot render running elapsed/workers/next from stale state.
6. All user-facing text comes from the message catalog in English and Turkish; no raw provider,
   backend, path, prompt, or secret detail reaches connectors.
7. Failing-first tests cover zero-work, real dispatch, FIX admission, connector-safe messages, and
   stale canonical fallback. Real compiled Terminal/Telegram-equivalent delivery is required at
   final fan-in; tests alone are not completion.

Negative scope: no workspace-admission, finalizer/digest, model provenance, scheduler eligibility,
agent manifest, heartbeat, log cleanup, auth, provider, runtime, `.tasks`, `.deckent`, `.brain`,
`.brain/memory.db`, MASTER, ledger, build, bot, cleanup, kill, commit, push, or `/tmp` mutation.

Finite budget: one implementation pass and one evidence-changing repair. Unchanged failures settle
HOLD. Return boundary: locally verified notification/read-model production wiring, pending the one
compiled real-main terminal settlement shared by the recovery closure.

## Local settlement candidate

- The connector-facing pre-SPAWN live notification was removed. Internal Nervous
  `SPRINT_STARTED` remains a PLAN→SPAWN lifecycle event and is not treated as worker evidence.
- Initial and FIX owner notifications now use a shared pure projection driven only by concrete
  dispatch evidence. Exact provider release count is separate; zero initial evidence produces a
  HOLD/no-worker message and zero FIX evidence produces no dispatch claim.
- Dispatch evidence is attempt-local, so a contained failed attempt cannot leak a false start claim
  into a later zero-work retry.
- Existing canonical status wiring was adopted and extended: dead ABORTED/ORPHANED authority wins
  over stale ACTIVE/FIXING read-model fields and suppresses running-only footer detail.
- Independent scoped verification: `5` test files, `69/69` tests passed; scoped
  `git diff --check` passed. The implementation lane also reported full `tsc --noEmit` success.
- Compiled real-main `sprint-717` produced no worker/provider execution. Instead of a false
  “execution underway” message, the connector durably delivered
  `sprint-dispatch-held:sprint-717` (“worker gönderimi kabul edilmedi”), followed by terminal truth
  `COMPLETE — 0/1 DONE, 1 NO_GO`. Canonical status then resolved sprint-717 with coordinator absent,
  no conflict, and the observed terminal receipt. No `/tmp`, MASTER, closure-ledger,
  `.brain/memory.db`, commit, or push mutation occurred.
