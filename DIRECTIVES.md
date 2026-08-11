# DIRECTIVES — Sprint-B2c: six hardening slices, claude-weighted

## Goal

Six MASTER-PLAN rows advance: sprint-log terminal projection (3298), bot daemon
lifecycle honesty (3320), heartbeat template contract (110), MCP annotation truth
(490), xverify bounded targeting (340), clean-dashboard policy (3325). Every slice is
scope-disjoint; none writes a repository-root file, touches provider auth, or runs
build tooling. Codex-provider routing is unavailable for this run (row 3308
continuation defect); model hints below are Brain-assigned claude-tier choices under
the owner's weighting directive.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every task EXTENDS something present.
  A second parallel mechanism is a NO-GO in all three.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Sprint log projects terminal COMPLETE and ABORTED truth exactly once (row 3298)

- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/doc-updaters/sprint-log.ts, tests/orchestra/sprint-log-projection.test.ts
- Scope: src/orchestra/sprint-finalizer.ts, src/orchestra/doc-updaters/sprint-log.ts, tests/orchestra/sprint-log-projection.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 3298, EK-3 source trace): normal finalize invokes the sprint-log updater
while the sprint status is still RETROSPECTIVE, then terminal authority changes to
COMPLETE without reconciling the written section; `forceAbortSprint` publishes a fenced
ABORTED receipt but never invokes the updater at all (Sprint-489 is absent from the log).
This is projection completeness — canonical receipts are complete and stay authoritative.

Required: after terminal publication, `docs/SPRINT-LOG.md` contains exactly one
idempotently upserted section per sprint with the true terminal status (COMPLETE or
ABORTED); unrelated sections are byte-preserved; partial writes are impossible (use the
atomic write pattern the doc-updaters already use); the human projection never becomes
settlement authority. Hermetic test drives the updater against a tmpdir log fixture
through both paths (complete-after-retro and force-abort) and asserts single-section
idempotency on double invocation.

**Test:** `npx vitest run tests/orchestra/sprint-log-projection.test.ts`

**NO-GO:** deriving settlement state FROM the log, rewriting unrelated sections, or a
non-atomic write path.

---

## Task 2: Bot daemon lifecycle honesty — stop works under HOLD, SIGTERM cleans the pid (row 3320)

- Files: src/connectors/bot-daemon.ts, src/cli/commands/bot.ts, tests/connectors/bot-lifecycle-honesty.test.ts
- Scope: src/connectors/bot-daemon.ts, src/cli/commands/bot.ts, src/connectors/, tests/connectors/bot-lifecycle-honesty.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 3320, caught live 2026-08-01): the build-source-mismatch HOLD blocked the
very stop/recovery commands that would resolve the drift — the workaround was OS SIGTERM,
and the SIGTERM path leaves the bot pid file behind (ADR-G-013 pid hygiene).

Required: recovery-class commands (`deckent bot stop` at minimum) run under the
build-source-mismatch HOLD — exempt or carrying a typed override, following the
identity-guard's existing exemption pattern if one exists; the SIGTERM graceful-shutdown
path removes the pid file the process itself owns. Both behaviours carry hermetic tests
(simulated pid file + signal handling in tmpdir; no real daemon spawn needed if the
shutdown path is testable in-process).

**Test:** `npx vitest run tests/connectors/bot-lifecycle-honesty.test.ts`

**NO-GO:** exempting non-recovery commands from the guard, deleting a pid file the
process does not own (ownership check stays), or weakening the identity-guard for
start-class commands.

---

## Task 3: Resolve the heartbeat template vs metachar guard contradiction (row 110)

- Files: src/orchestra/heartbeat-daemon.ts, tests/orchestra/heartbeat-contract.test.ts
- Scope: src/orchestra/heartbeat-daemon.ts, src/orchestra/spawn-backend-docker.ts, tests/orchestra/heartbeat-contract.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 110): the default heartbeat template conflicts with the shell-metachar
guard — the guard rejects the very template the product emits by default. Read
`src/orchestra/heartbeat-daemon.ts` and the wrapper-template composition in
`src/orchestra/spawn-backend-docker.ts` first and state in the result notes WHICH side
is wrong before changing either.

Required: one coherent contract — the default template passes its own guard; empty-success
and exit semantics are explicit; no unsafe shell widening (the guard must not be loosened
to admit metacharacters it exists to reject). Regression test pins the default template
against the guard plus at least one genuinely-hostile template still rejected.

**Test:** `npx vitest run tests/orchestra/heartbeat-contract.test.ts`

**NO-GO:** widening the guard's accepted character class, changing wrapper runtime
behaviour beyond the contradiction, or a template fix that only works on one platform.

---

## Task 4: MCP tool annotations tell the true side-effect class (row 490)

- Files: src/mcp/tools/index.ts, src/mcp/tools/audit.ts, tests/mcp/annotation-parity.test.ts
- Scope: src/mcp/tools/index.ts, src/mcp/tools/audit.ts, src/mcp/tools/, tests/mcp/annotation-parity.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 490, security-critical, code-line verified): the audit tool declares
readOnlyHint true, destructiveHint false and idempotentHint true (src/mcp/tools/audit.ts
line ~33) while its gate path calls writeFileSync (line ~114) and retention with apply
performs a permanent, irreversible prune — all three hints are wrong. MCP clients trust
readOnlyHint to skip approval prompts. The models refresh tool (cache invalidate plus
remote fetch) is the second known mismatch.

Required: adopt the widest-side-effect annotation contract (a tool that CAN mutate
declares the mutating class — record this as the typed decision in the result notes),
fix every mismatched annotation across the 49 tools, and extend the existing annotations
guard suite into a full annotation-implementation parity gate that fails closed in the
scoped test run. Implementation behaviour of the tools themselves does not change.

**Test:** `npx vitest run tests/mcp/annotation-parity.test.ts`

**NO-GO:** changing tool behaviour, weakening the existing guard suite, or an annotation
"fixed" by documentation instead of the declared hint fields.

---

## Task 5: Xverify bounded targeting and actionable preflight (row 340)

- Files: src/cli/commands/xverify.ts, tests/cli/xverify-ux.test.ts
- Scope: src/cli/commands/xverify.ts, src/cli/helpers/, tests/cli/xverify-ux.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 340): the files flag contract is dishonest (accepted but not honored as
documented), an empty evidence set produces no actionable remedy, and large files cannot
be targeted by exact range or symbol without operator prompt hacks.

Required: the files flag filters exactly as documented or its help text tells the truth
(pick the smaller honest change and record which); empty evidence exits with a typed,
actionable remedy message through the i18n authority; bounded targeting accepts an exact
path plus line-range or symbol so a large file never needs manual prompt surgery. New
flags follow the file's existing option style; JSON output (if present) carries the same
fields.

**Test:** `npx vitest run tests/cli/xverify-ux.test.ts`

**NO-GO:** breaking existing xverify invocations, provider-call changes (targeting is
pre-provider input shaping only), or free-string user-facing text outside the i18n catalog.

---

## Task 6: One typed decision reconciles clean's dashboard-preserve policy with the dashboard build (row 3325)

- Files: scripts/build-dashboard.mjs, tests/scripts/clean-dashboard-policy.test.ts
- Scope: scripts/build-dashboard.mjs, scripts/clean.mjs, tests/scripts/clean-dashboard-policy.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3325, caught live 2026-08-01): clean preserves dist/dashboard by policy
while the dashboard build expects an empty output directory and dies with
E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY — the workaround was a manual removal. Two scripts
read two contradictory policies.

Required: one typed decision, defined once and consumed by both scripts. Read both
scripts first and record in the result notes which policy wins and why
(preserve-then-overwrite vs clean-slate) — the decision must remove the manual workaround
in both directions: a clean followed by the dashboard build succeeds. Touch
scripts/clean.mjs minimally — only the policy-read surface; its execution-authority
machinery is out of bounds.

**Test:** `npx vitest run tests/scripts/clean-dashboard-policy.test.ts`

**NO-GO:** modifying clean's execution-authority or admission code paths, deleting dist
content in the test process's real tree, or leaving either script reading a private
policy copy.
