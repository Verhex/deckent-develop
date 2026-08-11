# DIRECTIVES — Sprint-B6: five slices, codex at scale

## Goal

Five MASTER-PLAN rows advance: FIX-spawn observability (3309), provider-observation
retirement (3296), the bot-stop HOLD exemption debt (3320 residue), dependency
supply-chain defense evaluation (7100), and the OWASP agentic-security baseline (4190).
Every slice is scope-disjoint; none touches provider auth or runs build tooling.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every code task EXTENDS something
  present. A second parallel mechanism is a NO-GO.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: A queued FIX task spawns observably or publishes a typed reason (row 3309)

- Files: src/orchestra/sprint-phases.ts, src/orchestra/scheduler-effects.ts, tests/orchestra/fix-spawn-observability.test.ts
- Scope: src/orchestra/sprint-phases.ts, src/orchestra/scheduler-effects.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/fix-spawn-observability.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3309, sprint-507 disk evidence): 507-002-fix sat Queued while the
scheduler-shadow journal recorded 92 consecutive watcher decisions with empty
spawnedTaskIds between 00:38 and 00:43 — the FIX worker's heartbeat, pid and log never
came into existence, and nothing anywhere said why. Sprints 508 and later DID spawn
their FIX workers, so the gap is conditional, not constant.

Required: root-cause first — trace the path from a FIX task being enqueued to a worker
being spawned, and identify every condition under which the scheduler loop can skip a
queued FIX task silently (admission, concurrency, dependency, phase state — whatever
the code shows); record the inventory in the result notes. Then: any skip of a
spawnable queued task on a scheduler pass publishes a typed reason into the existing
scheduler journal (extend the journal record, no new file family), so a stuck queue is
diagnosable from disk. A regression test drives a fixture scheduler pass with a queued
FIX task and asserts either a spawn decision or a typed skip reason — never a silent
empty pass.

**Test:** `npx vitest run tests/orchestra/fix-spawn-observability.test.ts`

**NO-GO:** changing spawn admission semantics themselves (this slice makes skips
VISIBLE, not different), a new journal file family, or forcing a spawn that admission
legitimately refuses.

---

## Task 2: Terminal retirement closes or scopes historical provider execution intervals (row 3296)

- Files: src/core/provider-execution-observation-store.ts, src/orchestra/sprint-finalizer.ts, tests/core/provider-observation-retirement.test.ts
- Scope: src/core/provider-execution-observation-store.ts, src/orchestra/sprint-finalizer.ts, tests/core/provider-observation-retirement.test.ts
- Model: claude-opus-5
- Dependencies: none

Measured (row 3296): sprint-490's COMPLETE and exact cleanup correctly projected
currentAttained=0, but the canonical read-model retained four open intervals outside
the exact current task set as unresolved-provider-observation. The evidence is
truthful; the ownership/retirement policy is incomplete. The live store today carries
50+ legacy intervals across ten days. Negative scope (binding, from the row): never
erase provider history, never infer closure from USD=0, and the v1-to-v2 schema
migration is owner-gated and OUT of this slice.

Required: COMPLETE and cleanup reconcile every interval owned by the exact run/attempt
generation being settled — close them with a typed retirement reason; foreign or
historical intervals remain forensic and MUST NOT impose an admission HOLD on an
unrelated IDLE or current run; reconciliation is idempotent and tenant/provider
fenced. Hermetic test drives a tmpdir store through settle-with-open-intervals and
asserts owned intervals retire, foreign intervals survive untouched, and a second
reconciliation is a no-op.

**Test:** `npx vitest run tests/core/provider-observation-retirement.test.ts`

**NO-GO:** deleting observation rows, touching the schema version or migration,
retiring an interval the settling generation does not own, or closure inferred from
cost values.

---

## Task 3: Recovery-class bot stop runs under the binary-identity HOLD (row 3320 residue)

- Files: src/cli/worktree-binary-authority.ts, src/cli/commands/bot.ts, tests/cli/bot-stop-hold-exemption.test.ts
- Scope: src/cli/worktree-binary-authority.ts, src/cli/commands/bot.ts, tests/cli/bot-stop-hold-exemption.test.ts
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 3320's remaining debt, carried honestly through two sprints): the
build-source-mismatch HOLD lives in src/cli/worktree-binary-authority.ts and blocked
the very `deckent bot stop` that would resolve the drift — the live workaround on
2026-08-01 was an OS signal. The sprint-512 debt attempt correctly refused to touch
this file because it was outside its granted scope; it is IN scope now.

Required: the binary-identity authority gains a typed recovery-class exemption seam —
an explicit allowlist of recovery-class operations (bot stop at minimum) that may
proceed under the mismatch HOLD with a typed warning instead of a block. The seam is
narrow and declarative: an operation must declare itself recovery-class at its call
site; nothing becomes exempt implicitly, and start-class operations stay guarded
exactly as today. Regression test pins: bot stop proceeds-with-typed-warning under a
simulated mismatch, bot start stays blocked, and an undeclared operation stays blocked.

**Test:** `npx vitest run tests/cli/bot-stop-hold-exemption.test.ts`

**NO-GO:** weakening the guard for any non-declared operation, an implicit or
pattern-based exemption, or removing the mismatch warning from the exempted path.

---

## Task 4: Evaluate npm supply-chain defense as a product feature (row 7100)

- Files: docs/analysis/dep-supply-defense-2026-08-11.md
- Scope: docs/analysis/dep-supply-defense-2026-08-11.md, docs/analysis/
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 7100): deckent spawns workers that run `npm ci` and arbitrary provider
CLIs inside containers, and its own CI installs hundreds of packages; the row asks for
a product-level evaluation of npm dependency supply-chain defense across the worker
and CI ingress surfaces.

Required: a single analysis document (the file named in Files — NEW) that inventories
the ACTUAL ingress surfaces from the repo (worker container npm usage, CI workflows'
install steps, the allowScripts posture visible in the build logs, the dependency
policy in ADR-D-005), maps concrete threat classes (install-script execution, typo-
squat/update-hijack, lockfile drift, transitive compromise) to those surfaces, and
proposes a phased defense design with decision points for the owner — each phase named,
bounded and justified from the codebase reality, not generic advice. No production
code, no config changes, no new dependencies — analysis artifact only.

**Test:** the document exists at the exact path with every section above present;
`npm run lint:links` passes if the repo exposes it.

**NO-GO:** generic security boilerplate unanchored to this repo's real surfaces,
production or config edits, or recommendations without owner decision points.

---

## Task 5: OWASP Agentic Top 10 self-assessment baseline (row 4190)

- Files: docs/security/owasp-asi-baseline-2026-08-11.md
- Scope: docs/security/owasp-asi-baseline-2026-08-11.md, docs/security/
- Model: gpt-5.6-terra
- Dependencies: none

Measured (row 4190): the 2026-08-05 code-truth scan opened this row for an OWASP
Agentic Security (ASI01-ASI10, 2026) self-assessment; the repo already carries the
owner's prompt material for it at CODEX-OWASP-ASI-PROMPT.md (read it first) and the
scan's two concrete findings landed as rows 7031 (plugin sandbox — since wired,
flag-gated) and 4091 (spend gate — since enforced, flag-gated).

Required: a single baseline document (the file named in Files — NEW; create the
directory if absent) that assesses each ASI risk class against deckent's ACTUAL
mechanisms with file-level evidence — the capability/tool authority chain, scope
enforcement, plugin pipeline, spend gates, approval flows, memory/audit chains —
stating per risk: covered / partially covered / open, the evidence path, and the
existing MASTER row that owns the gap where one exists. Honest OPEN verdicts are
required where coverage is missing; inventing coverage is the one unforgivable
failure. No production code or config edits — assessment artifact only.

**Test:** the document exists at the exact path with a verdict row per ASI01-ASI10;
`npm run lint:links` passes if the repo exposes it.

**NO-GO:** claiming coverage without a file-level evidence path, production or config
edits, or softening an open gap into partially-covered without evidence.
