# ADR-079: Proof-of-Function DoD — Tier-0/Tier-1 Classification + Sprint-Inner Run-Verify Gate

**Status:** accepted

**Date:** 2026-06-01

**Accepted:** Sprint 216

---

## Context

### The Hollow-DONE Problem

Sprint 214 shipped "serve token-inject DONE" based on a mocked unit test. A real-binary run on 2026-06-01 (`node dist/cli/entry.js serve`) contradicted that verdict:

- Server boots, dashboard HTML returns HTTP 200 with correct `<title>`.
- On localhost, **no API token is auto-minted** — `__DECKENT_API_TOKEN__` is absent from the served HTML (log: "No API token configured").
- `/api/status` returns **401** — every dashboard data call fails.
- Result: dashboard is **non-functional despite a DONE stamp**.

The root cause was definitional: no distinction existed between *wiring proof* (the function is connected) and *user-working proof* (a real human running the binary gets a working experience). Mocked unit tests can only certify the former.

This gap extended beyond `serve`:
- `deckent chat` was "wired" (Path A backend connected) but had not been run-verified to produce a real round-trip response.
- Dashboard pages rendered but every data endpoint returned 401 — invisible behind the mocked-test curtain.

### Missing Classification Signal

`detectTaskType()` in `rubric-registry.ts` classified tasks as `audit`, `document-write`, or `code-development`. There was no signal indicating whether a task touched a **user-facing surface** (CLI command a human runs, dashboard page, API endpoint) versus an **internal structural concern** (provider registration, F5 callers, type fixes, refactors). Without this signal:

- User-surface tasks were evaluated by the same rubric as internal tasks — no run-verify requirement.
- The routing engine had no way to prefer surface-aware agents (`api-builder`, `frontend-designer`, `ci-guardian`) over the generic `refactorer` for UI/serve/CLI work.
- DIRECTIVES had no canonical slot for a real-binary smoke command.

### Prior Mitigations That Were Insufficient

- **disk-verify gate** (Sprint 138, ADR-035): verifies files exist on disk — does not boot a server or assert HTTP status.
- **ADR-076 Part B** (Sprint 214): intended to fix `serve` token injection via a mocked unit test — the test never asserted on real served HTML.
- **Sprint 215 `test:ci-sim`** (ADR-078): guards hermeticity (no local-state leakage) — not user-working verification.

---

## Decision

### Tier Classification — `isUserSurfaceTask()`

A new **parallel boolean** (not a 4th TaskType) `isUserSurfaceTask(task): boolean` is added to `rubric-registry.ts`. It inspects `scope.filesWrite` (and `scope.directories` as fallback) for the following prefixes:

- `src/cli/commands/` — CLI commands a human runs directly
- `src/dashboard/` — React dashboard pages and components
- `src/api/` — HTTP API endpoints (serve, chat-backend, memory-search, etc.)

Tasks matching any prefix are **Tier-1 (user-surface)**. All other tasks remain **Tier-0 (internal/structural)**. A single task can be both a `code-development` task and Tier-1 — the tiers are orthogonal to TaskType.

**Tier-0 DoD (unchanged):** unit test + `tsc --noEmit` + structural grep proof. The proof is externally verifiable without running a binary.

**Tier-1 DoD:** all Tier-0 criteria **plus** a recorded real-binary run. Mocked unit test alone = `GO_WITH_TECH_DEBT`, never `DONE`.

### `Smoke:` Directive Line

DIRECTIVES gains a mandatory `Smoke:` line for every Tier-1 task, alongside the existing `Kanıt:` and `Test:` lines:

```
**Smoke:** `node dist/cli/entry.js serve --port 3211 --no-terminal &` → `curl -s localhost:3211/ | grep -c __DECKENT_API_TOKEN__` ≥1 AND `curl -so/dev/null -w '%{http_code}' localhost:3211/api/status` = 200
```

`task-builder.ts` parses `- Smoke:` / `**Smoke:**` lines into `task.smoke = { command, expect }` — an optional field on the task JSON schema (`api-surface.md`).

### Sprint-Inner Smoke Gate — `proof-of-function.ts`

`src/orchestra/proof-of-function.ts` exports `verifyProofOfFunction(task, projectRoot, result)`:

1. Checks `isUserSurfaceTask(task)` — if Tier-0, returns `{ passed: true, skipped: true }` immediately (no-op).
2. Checks `task.smoke` — if absent (no `Smoke:` directive), returns `{ passed: true, skipped: true }` (gate is opt-in via DIRECTIVES authoring).
3. Executes the smoke command via **async `spawn`** (host-side, not inside the worker container).
4. Asserts the output against `task.smoke.expect` (regex or substring match).
5. Returns `{ passed, evidence, command }`.

`result-evaluator.ts` calls `verifyProofOfFunction` after `evaluateWithRubric`. On failure:
- Downgrades `selfAssessment` from `DONE` → `GO_WITH_TECH_DEBT`.
- Emits `PROOF_OF_FUNCTION_MISMATCH` on the audit channel (same channel as `DISK_VS_CLAIM_MISMATCH_CHANNEL`).
- Records evidence in the result notes so the next FIX iteration knows what failed.

Workers do **not** boot servers themselves — the gate runs in the Brain process where `localhost` binds reliably.

### Routing: Surface-Aware Domain Bonus

`routing-engine.ts` `getDomainMatchBonus()` gains a user-surface branch: when `isUserSurfaceTask` is true, domain bonuses are amplified so surface-aware agents beat the generic `refactorer`:

- `dashboard` / UI patterns → `frontend-designer` domain bonus boosted.
- `api/` / `serve` patterns → `api-builder` domain bonus boosted.
- `e2e` / test-harness patterns → `ci-guardian` domain bonus boosted.

The same `isUserSurfaceTask` signal is read from `TaskDNA` tags or derived from scope, ensuring routing and gate decisions are driven by the same source.

### Permanent Regression Guard

`scripts/test-e2e-surfaces.mjs` (`npm run test:e2e-surfaces`) boots the real `dist/cli/entry.js serve` binary on a random port (async spawn), asserts:
- HTTP root `/` returns 200.
- Served HTML contains `__DECKENT_API_TOKEN__`.
- `/api/status` returns 200.

Tears down the server in a `try/finally` block. Complements `test:ci-sim` (hermeticity guard) for the user-working axis.

---

## Consequences

**Positive:**
- Hollow-DONE stamps are structurally impossible for Tier-1 tasks: the gate runs in-sprint and auto-downgrades if the binary fails.
- Routing collapse (`refactorer` dominance on UI/serve tasks) is corrected — surface-aware agents are preferred without manual `forceAgent` overrides.
- `test:e2e-surfaces` provides a permanent regression guard analogous to `test:ci-sim` for hermeticity.
- `isUserSurfaceTask()` is a single, stable signal reused by rubric, gate, and routing — no duplication.
- Workers are not required to understand the classification — it is computed automatically from their declared `scope.filesWrite`.

**Negative:**
- Tier-1 gate adds latency at EVALUATE phase (smoke command execution). Mitigation: gate only runs when `task.smoke` is present; absent `Smoke:` lines result in an immediate no-op.
- Workers may forget to add the `Smoke:` directive line. Mitigation: `worker-default.md` anchors the rule; Brain FIX phase catches the missing smoke line through rubric pressure.
- Real-binary smoke requires a built `dist/` — gate skips (no-op) when `dist/cli/entry.js` is absent (e.g. fresh checkout without a build). Permanent guard `test:e2e-surfaces` has a dist-absent skip-guard for CI.
- The `Smoke:` format is freeform text parsed with a simple regex — edge cases (multi-line commands, Windows path separators) may require future normalization. V1 scope: single-line command on a Linux/macOS/WSL2 host.

---

## Alternatives Considered

**Post-sprint manual verification only** — Brain or Alperen runs smoke commands after the sprint. Rejected: manual gate depends on human discipline, not enforced automatically; the Sprint 214 hollow-DONE passed because no human re-ran the binary post-sprint.

**Add `run-proven` as a 4th TaskType** — classify tasks as `run-proven` instead of a parallel boolean. Rejected: a CLI task that fixes an auth bug is both `code-development` and Tier-1 user-surface. Orthogonal booleans compose correctly; a 4th type forces a choice.

**Always-on smoke (every task, regardless of `Smoke:` presence)** — gate runs even if no `Smoke:` directive is written. Rejected: tasks without a smoke command cannot be verified automatically; forcing the gate would create false NO_GO results for tasks that have no meaningful smoke command. Opt-in via `Smoke:` directive is the correct model.

**Worker-side smoke execution** — worker boots the server and curls it from inside the container. Rejected: containers in Docker backend cannot reliably bind and curl `localhost` (port namespace isolation, no host-network by default). Brain-side execution is the only reliable path.

**Separate post-sprint-smoke pipeline only** — no in-sprint gate, only a post-sprint audit. Rejected: post-sprint-smoke path (`post-sprint-smoke.ts`) exists and is useful for regression checks across all surfaces after a sprint; in-sprint gate is needed so a failed surface causes the *current task* to be reclassified before the retro, not discovered as a regression in the next sprint.

---

## References

- `src/orchestra/rubric-registry.ts` — `isUserSurfaceTask()`, `PROOF_OF_FUNCTION_CRITERION`
- `src/orchestra/proof-of-function.ts` — `verifyProofOfFunction()`, async spawn gate
- `src/orchestra/result-evaluator.ts` — wire: `verifyProofOfFunction` after `evaluateWithRubric`
- `src/orchestra/task-builder.ts` — `Smoke:` directive parse → `task.smoke`
- `src/core/routing-engine.ts` — `getDomainMatchBonus()` surface-aware domain bonus
- `scripts/test-e2e-surfaces.mjs` — permanent regression guard (`npm run test:e2e-surfaces`)
- `.claude/rules/karpathy-discipline.md` — "Proof-of-Function DoD" CUSTOM section
- `.claude/rules/worker-default.md` — "Proof-of-Function (Tier-1 user-surface)" section
- ADR-035 (Verification Protocol Standard) — prior art for multi-channel verification
- ADR-070 (Brain Evaluation Integrity) — zero-hard-code principle and signal-based coverage
- ADR-078 (CI-Hermeticity Standard) — parallel discipline: `test:ci-sim` guards hermeticity, `test:e2e-surfaces` guards user-working
- Sprint 216 evidence: `serve` localhost auto-mint landed (`src/api/server.ts:921-935`); `/api/status` confirmed 200 run-proven.
