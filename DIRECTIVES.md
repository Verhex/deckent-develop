# DIRECTIVES — A proven-live run must render its status, not a hold

## Goal

Close a measured observability defect. Throughout the 2026-08-09/10 campaign
`deckent status` answered `RUN_STATUS_READ_MODEL_UNAVAILABLE` while a run was
genuinely turning, so the main monitoring surface went dark exactly when an operator
needed it.

The authority itself is not the problem: `readCanonicalRunStatus` already resolves an
evidence-backed ACTIVE state. The hold comes from the CLI status gate, which requires a
republished read model before it will render — and during a live run that model is
frequently not yet republished.

The same class was already closed once for PAUSED (`RECOVERY-PAUSE-STATUS-001`, MASTER
row 3201). The comment above the gate records exactly why PAUSED was removed from it.
This task extends that precedent to a live run.

Provider, model, effort and effective concurrency are resolved exclusively from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission. No
instruction-level provider or model override exists.

## Execution Contract

- Behaviour outside this defect stays byte-identical. Every test that passes today must
  still pass, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass. If an existing
  test encodes the old contract, say so in the result notes instead of rewriting it.
- Read the PAUSED precedent in the gate's own comment before designing. Extend that
  mechanism; do not introduce a second parallel one.
- Fail closed where evidence is absent. This task removes a FALSE hold, never the concept
  of one.
- Workers must not run `npm run build`, `npm test`, a full suite, provider login or auth
  mutation, sprint lifecycle commands, git commit or cleanup.
- CLI option and command DESCRIPTIONS in this codebase are plain strings; match the
  surrounding file. Other new user-facing text goes through the i18n message authority.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Render a liveness-proven ACTIVE run instead of holding it

- Files: src/cli/commands/status.ts, tests/cli/status-json-contract.test.ts
- Scope: src/cli/commands/status.ts, tests/cli/status-json-contract.test.ts
- Dependencies: none

`requiresPersistedRunStatusReadModel` in `src/cli/commands/status.ts` currently returns
true for `authority.active`, `authority.resumable` and `lifecycle === 'ORPHANED'`. Its
own comment explains why PAUSED was taken out: a reconciled authority already carries
what the operator needs, so demanding a republished read model produced only
`RUN_STATUS_READ_MODEL_UNAVAILABLE` and hid the remedy.

A run whose ACTIVE state is proven by process liveness is in the same position — the
authority holds the evidence, and the hold serves nothing.

One distinction is load-bearing and must be preserved. An ACTIVE *claim* is not proven
liveness: a dead sprint can leave a stale ACTIVE state behind, which is precisely the
stale-sprint trap closed earlier in this campaign. Only a run whose liveness the
authority can actually prove may skip the read-model requirement. `ORPHANED` stays
gated — it is a CONTESTED state where the born-688 safety still earns its keep.

**Test:** `npx vitest run tests/cli/status-json-contract.test.ts`

**NO-GO:** A run renders as live without proven liveness, `ORPHANED` stops being gated,
the PAUSED behaviour changes, the fail-closed path disappears for genuinely unprovable
states, a second parallel mechanism is introduced, or an existing assertion is weakened
or deleted.
