# Crisis Stabilization Initiative — Master Spec

- **Status:** spec
- **Decided:** 2026-05-21 (Alperen + Claude post-Sprint-176 dogfood crisis)
- **Target sprints:** Sprint 177–180
- **Constraint:** June 1 2026 OSS beta gate (10 days)
- **Predecessors:** Sub-project #1 (Sprint 175, terminal, PR #16 merged 2026-05-20); Sub-project #2 spec (2026-05-21, planner hygiene + self-security) — **superseded by this master spec**
- **Successor:** Sub-project #3 (multi-tenant + k8s + mTLS impl, post-beta)

---

## 1. Context — Why This Master Spec Exists

Sub-project #2 sprint 176 dogfood produced 8 simultaneous failure modes ([documented in](../audits/sprint-176/dogfood-evidence.md)):

1. **Worker rollback gap** — NO_GO workers wrote source code (advisory ADR-037, not enforced); `.tasks/` cleanup did not revert `src/`. Sprint 176 left 30+ uncommitted file changes after 25 NO_GO verdicts.
2. **`deckent kill` cascade gap** — kill stopped workers (8 killed) but left controller PID alive (43 min), metadata files orphan, tmux socket lingering. Required manual `rm -f` + process forensics.
3. **Tmux backend rot** — sockets accumulate, windows close inconsistently, heartbeat freezes when window dies. Sprint 176 ran tmux due to config drift; the backend itself proved fragile.
4. **Config template-regen drift** — `.deckent/config.json` `git rm --cached` (PR #16 hygiene) led to template-based regen losing `spawn_backend`, `model_strategy`, `dependency_pipeline_enabled`, `haiku_allowed`, `brain_planning` fields. Sprint 176 ran on the wrong backend (tmux) with AI planning + dependency-pipeline-true. [feedback_config_json_git_rm_yasak](../../.claude/projects/.../memory/feedback_config_json_git_rm_yasak.md)
5. **`nervous_system.directives_protection.auto_restore` baseline drift** — after kill+cleanup the protection auto-restored DIRECTIVES.md from Sprint 176 back to Sprint 175, causing `deckent_plan` to emit 21 Sprint 175 task ids instead of 13 Sprint 176 ids. Required manual `auto_restore: false`.
6. **CI/CD modernization shallow** — Node 24/26 matrix bumped in `package.json` + workflows, but test files, docs, and `engines.node` consumer code still reference 18-20-22 in places.
7. **Sub-project #2 original scope (12 task)** — planner state-hygiene 7 + self-security 5 — unfinished. ~9 task code written by Sprint 176 workers but stashed (untested, possibly low quality due to config drift).
8. **Nervous system not production-ready** — `directives_protection` lacks a "baseline update on `deckent_set_directives` success" hook; manual baseline management required.

The Sub-project #2 spec (2026-05-21) only addressed item 7. **This master spec covers all 8 + remaining feature backlog**, decomposed into 4 sprints with beta-gate prioritization.

### Two Locked Stabilization Decisions (Alperen 2026-05-21)

- **Worker rollback strategy:** `git stash --include-untracked` snapshot-on-spawn. NO_GO → drop stash (revert). GO/GO_WITH_TECH_DEBT → drop stash (worker's commits already accepted). Memory.db tracks snapshot id per task.
- **Tmux backend disposition:** **Deprecate.** Sprint 177 marks tmux as `@deprecated` with runtime warning when selected. Sprint 178 removes the code path entirely. Docker (default) + subprocess (CI/headless) remain the only supported backends. Reason: sub-project #1 already delivered an embedded interactive terminal, so tmux's "interactive" niche is filled by a properly-isolated WS-PTY layer.

---

## 2. Inventory: 8 Items × Sprint Mapping

| # | Item | Sprint | Beta-blocker? |
|---|------|--------|---------------|
| 1 | Worker rollback (git stash snapshot-on-spawn) | **177** | ✅ MUST (without it sprints corrupt state) |
| 2 | `deckent kill` cascade fix (worker → controller → metadata) | **177** | ✅ MUST (recovery is broken) |
| 3 | Tmux backend deprecate path (warning + scoping) | **177** | ✅ MUST (config-default docker, tmux is foot-gun) |
| 4a | Config template-regen prevention (`.deckent/config.json` track guard) | **177** | ✅ MUST (one-shot fix in init template + recovery doc) |
| 4b | `last_sprint_id` + project-specific fields in init template | 177 | ✅ MUST |
| 5 | `directives_protection` baseline-update hook (set_directives → baseline refresh) | **177** | ⚠️ MUST (auto_restore=true is the default; without the hook, sprints corrupt) |
| 6a | Node 24/26 test assertions sweep (4-5 test files reference 18-20-22) | 178 | ⚠️ SHOULD |
| 6b | Doc updates: README, DECKENT.md, engines section | 178 | ⚠️ SHOULD |
| 6c | Tmux code removal (Sprint 177 deprecate path follow-up) | 178 | (Defensive cleanup, no user impact) |
| 6d | CI flaky test fix (orphan-cleaner-ipc + archive-debt, originally sub-project #2 Task 7) | 178 | (Already in main as backlog #7) |
| 7a | Sub-project #2 original — planner state-hygiene W1-W3 (5 task: auto-debt, re-plan orphan, DEP0190 shell, coverage split, doctor cascade) | **179** | ⚠️ SHOULD (planner UX + ADR governance) |
| 7b | Sub-project #2 original — frontend W3-5 (dashboard TS + root lint) | 179 | (TypeScript correctness) |
| 7c | **Sub-project #2 original — self-security W4-W5 (5 task: prompt-guard, command-guard, outbound-limiter, mTLS hook, audit HMAC chain)** | **179** | ✅ **MUST (RCE surface — terminal feature is live)** |
| 8a | `nervous_system.enabled` defaults to true after stabilization (config-policy decision) | 180 | (Post-beta) |
| 8b | Dashboard nervous notifications panel | 180 | (Post-beta feature) |
| 8c | Feature backlog (TBD list — to be enumerated in Sprint 180 spec) | 180 | (Post-beta) |

**Beta gate (June 1) MUST satisfy:** Items 1, 2, 3, 4a-b, 5, 7c. Other items can ship Sprint 178–180.

---

## 3. Sprint 177 — Critical Runtime Stability (Detailed)

**Goal:** Close the four runtime gaps that made Sprint 176 corrupt itself — worker rollback, kill cascade, tmux deprecate, config + nervous baseline. Without these the next sprint is unsafe to launch.

**Scope:** 5 tasks (was "3 task minimal critical" pre-spec-writing; expanded by 2 because items 4 + 5 are tightly coupled to runtime safety and cost ~30 lines each).

**Brain planning:** mode `structured`, sequential dispatch (self-modifying detector triggers), max_workers 2, `dependency_pipeline_enabled: false` (Brain manual gates), provider `claude`.

**Worker contract:**

- TDD ZORUNLU (each task RED→GREEN, no exceptions)
- ESM `.js` imports (Node16 resolution)
- **memory.db** additive ALTER only — DROP/rebuild YASAK (`feedback_db_silmek_yasak`)
- `.tasks/task-<id>.result` must contain truthful `selfAssessment`, `coverage`, `filesChanged`, `testsPassed` from real `vitest run` output (no honest-gate fakery)
- **Worker rollback engaged from Task 177-001 onward** — once Task 1 lands, every subsequent task spawn snapshots and rollback-on-NO_GO

### Task Breakdown

#### Task 177-001 — Worker rollback: git-stash snapshot-on-spawn
- Model: opus
- Effort: high
- Skills: typescript-expert, git-expert
- Agent: bug-fixer
- Files: `src/agents/worker.ts`, `src/orchestra/result-evaluator.ts`, `src/core/memory-types.ts` (add `snapshot_stash_id` to TaskRecord), `tests/agents/worker-rollback.test.ts` (new)
- Scope: `src/agents/`, `src/orchestra/`, `src/core/`, `tests/agents/`

**Description:**

On worker spawn, run `git stash push --include-untracked --keep-index --message "deckent-worker-{taskId}-{spawn-iso}"` and capture the stash ref into the TaskRecord (memory.db). Worker writes source code as usual. When `result-evaluator` reaches a verdict:

- `DONE` or `GO_WITH_TECH_DEBT` → `git stash drop {ref}` (worker's changes stay; they were captured in stash but kept-index means they're also in the working tree, so drop is metadata cleanup).
- `NO_GO` → revert path: `git checkout HEAD -- $changedFiles` for files in worker's `scope.filesWrite`; `git clean -fd $changedDirs` for untracked under scope; then `git stash drop {ref}`. Result: working tree restored to pre-spawn baseline for the worker's scope.
- Out-of-scope writes (advisory ADR-037 violation) → **also reverted** during NO_GO (worker didn't have authority anyway).

**GO criteria:** A test scenario spawns a fake worker, makes it write `src/test-file.ts` + return `selfAssessment: NO_GO`, then asserts `src/test-file.ts` does not exist after rollback. Same scenario with `DONE` keeps the file.

**NO_GO criteria:** Rollback leaves files behind; stash leak (orphan refs); rollback overwrites unrelated uncommitted work outside worker scope.

**Test:** TDD — 4 tests (DONE keeps + NO_GO reverts + out-of-scope NO_GO reverts + concurrent worker isolation).

#### Task 177-002 — `deckent kill` cascade fix
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: `src/cli/commands/kill.ts`, `src/orchestra/sprint-controller.ts`, `src/orchestra/tmux.ts`, `src/orchestra/spawn-backend.ts`, `tests/cli/kill-cascade.test.ts` (new)
- Scope: `src/cli/`, `src/orchestra/`, `tests/cli/`

**Description:**

`deckent kill --all` must cascade:
1. SIGTERM all workers (already done).
2. SIGTERM the sprint controller PID (read from `.deckent/pids/sprint-{id}.pid`; Sprint 176 left `1799599` alive for 43 minutes).
3. Wait 5s grace, then SIGKILL stragglers.
4. Remove sprint metadata files: `.deckent/sprint-state.json`, `.deckent/pids/sprint-{id}.pid`, `.deckent/sprint-{id}-checkpoint.json`, `.deckent/sprint-{id}-gate.json`.
5. Clean tmux socket if backend is tmux (best effort; tmux is deprecated anyway — see Task 177-003).
6. Emit a single structured event `BRAIN→*:SPRINT_KILLED` with payload `{sprintId, killedWorkers, killedController, removedMetadata}`.

**GO criteria:** Integration test launches a long-running dummy sprint (subprocess backend with sleep workers), calls `deckent kill --all`, then asserts: zero deckent-related processes, zero sprint metadata files, zero tmux sockets in `/tmp/tmux-*/`.

**NO_GO criteria:** Any stale process, metadata, or socket remains after the kill returns.

**Test:** TDD — 3 tests (full cascade + controller-only stale scenario + tmux-socket cleanup).

#### Task 177-003 — Tmux backend deprecate path
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Agent: refactorer
- Files: `src/orchestra/tmux.ts` (add deprecation banner), `src/orchestra/spawn-backend.ts` (resolveBackend logs deprecation when tmux), `src/core/config.ts` (DEFAULT_CONFIG sets spawn_backend default to 'docker' explicitly if null), `docs/guide/troubleshooting.md` (or new — document deprecation + migration), `tests/orchestra/tmux-deprecation.test.ts` (new)
- Scope: `src/orchestra/`, `src/core/`, `docs/guide/`, `tests/orchestra/`

**Description:**

When `resolveBackend()` returns `'tmux'` (either explicit or auto-fallback), emit:
- `stderr.write('[deckent] WARNING: tmux backend is deprecated and will be removed in Sprint 178. Set spawn_backend: "docker" in .deckent/config.json. See docs/guide/troubleshooting.md#tmux-deprecation.\n')` once per sprint
- audit log entry: `{event: 'tmux_deprecation_warning', sprintId, configValue}`

Also: change `resolveBackend()` default from `'auto' → 'tmux'` to `'auto' → 'docker'` (when docker available; subprocess fallback otherwise). Sprint 176 ran tmux because the default was tmux — this swap prevents future config-drift sprints from landing on the broken backend.

`DEFAULT_CONFIG.spawn_backend` set to `'docker'` literal (not undefined) so the regen template (item 4a) carries it forward.

**GO criteria:** With `spawn_backend` undefined, `resolveBackend()` returns `'docker'`. With explicit `'tmux'`, the deprecation banner appears once. Tests pass on both paths.

**NO_GO criteria:** Default still resolves to tmux; banner missing or emitted per task instead of once per sprint.

**Test:** TDD — 3 tests (default→docker + explicit tmux → warning + warning once per sprint).

#### Task 177-004 — Config template-regen guard + restore docs
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Agent: devops-engineer
- Files: `src/cli/commands/init-templates/config.json.template` (or wherever the template lives — verify), `src/core/config.ts` (loadConfig: when regenerating from template, log a CRITICAL warning + back up the regen to `.deckent/config.json.bak.regen-{iso}`), `docs/guide/config-recovery.md` (new — restore-from-backup recipe), `tests/core/config-regen-guard.test.ts` (new)
- Scope: `src/cli/`, `src/core/`, `docs/guide/`, `tests/core/`

**Description:**

Template-regen of `.deckent/config.json` must:
1. **Never overwrite** an existing file silently; instead, if config exists but is missing required fields (`spawn_backend`, `model_strategy`, etc.), prepend missing fields rather than replacing the whole document.
2. Add the template's defaults `spawn_backend: 'docker'`, `dependency_pipeline_enabled: false` (for self-dogfooding projects — separate flag for new-user projects), `haiku_allowed: false`, `brain_planning: 'structured'`, plus `model_strategy` block.
3. When a regen would lose user fields, log `CRITICAL: config.json regen would drop fields [list]; backed up to .deckent/config.json.bak.regen-{iso}` and refuse to overwrite (require manual `deckent config reset --confirm`).
4. Document the recovery flow in `docs/guide/config-recovery.md` (cp from `.bak`, restart sprint).

**GO criteria:** A test simulates a partial config (only `mode` field), runs the regen, then asserts the merged config contains all required fields + a `.bak.regen-{iso}` exists.

**NO_GO criteria:** Regen silently drops fields without backup or warning.

**Test:** TDD — 3 tests (full regen merge + missing-field add + backup created on overwrite attempt).

#### Task 177-005 — `nervous_system.directives_protection` baseline-update hook
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Agent: api-builder
- Files: `src/nervous/observer.ts` (or `src/nervous/detector-registry.ts` — locate `directives_protection`), `src/mcp/tools/set-directives.ts` (after successful write, emit `BASELINE_UPDATE` event), `src/orchestra/sprint-controller.ts` (on new sprint start, refresh baseline), `tests/nervous/directives-protection-baseline.test.ts` (new)
- Scope: `src/nervous/`, `src/mcp/`, `src/orchestra/`, `tests/nervous/`

**Description:**

`directives_protection` currently:
- Has `auto_restore: true` in default config
- Restores DIRECTIVES.md from its frozen baseline whenever it detects an "unexpected" change
- Sprint 176 evidence: after `deckent_kill + deckent_cleanup`, the detector restored DIRECTIVES.md from Sprint 175 over the user's Sprint 176 content

Fix:
- Add `updateBaseline(content)` method to the detector
- Wire it into the success path of `deckent_set_directives` MCP tool (emit `DIRECTIVES→NERVOUS:BASELINE_UPDATE` event; detector subscribes)
- Wire it into sprint-controller's `startSprint()` (when a new sprintId is bound, refresh baseline from current DIRECTIVES.md)
- Manual escape: `deckent nervous baseline-refresh` CLI command (also useful for ops)

Once Task 177-005 lands, `auto_restore` can stay `true` safely because intentional sprint-boundary changes update the baseline atomically with the change.

**GO criteria:** Test scenario: write DIRECTIVES.md content A → set_directives content B → kill+cleanup → assert DIRECTIVES.md is still content B (not restored to A).

**NO_GO criteria:** Baseline not refreshed on set_directives; rollback to old content still happens.

**Test:** TDD — 3 tests (set_directives baseline refresh + sprint-controller baseline refresh + CLI baseline refresh).

### Sprint 177 GO/NO_GO

- **GATE-1 (after Task 177-001):** Worker rollback test green; `git stash list` clean after sprint test; out-of-scope NO_GO also reverted.
- **GATE-2 (after Task 177-002):** Integration test: dummy sprint + kill --all → no stale processes/metadata/sockets.
- **GATE-3 (after Task 177-003):** Default `spawn_backend` resolves to docker; deprecation warning emitted.
- **GATE-4 (after Task 177-004):** Partial config regen preserves user fields + backs up on overwrite.
- **GATE-5 (after Task 177-005):** Sprint-boundary DIRECTIVES change not auto-restored.

**Sprint verdict:**
- GO = 5/5 DONE
- GO_WITH_TECH_DEBT = 4/5 DONE + 1 GWT (only if the GWT task is NOT 177-001 or 177-002 — worker rollback and kill cascade are non-negotiable runtime safety)
- NO_GO = 177-001 or 177-002 fail

---

## 4. Sprint 178 — Modernization Yayılma + CI/CD Yeşil (4 task)

**Scope:** Items 6a-d (Node 24/26 spread across tests/docs, tmux code removal follow-up, CI flaky test fix).

(Detailed task breakdown deferred to Sprint 178 spec — written after Sprint 177 retro. Outline only:)

- Task 178-001: Node 24/26 test assertion sweep (4-5 test files reference 18-20-22 strings — find + replace + verify)
- Task 178-002: Doc updates — README.md, DECKENT.md, docs/guide/*.md engines.node references
- Task 178-003: Tmux code removal (Sprint 177 deprecation path → actual deletion of `src/orchestra/tmux.ts` + removal of tmux branch in `spawn-backend.ts`; tests pruned)
- Task 178-004: CI flaky test fix (original sub-project #2 Task 7 — orphan-cleaner-ipc PID portability + archive-debt mock hygiene)

**Sprint 178 detailed spec will be written by 2026-05-25 after Sprint 177 retro reveals what shifted.**

---

## 5. Sprint 179 — Sub-project #2 Original Scope (12 task)

**Scope:** Items 7a-c (planner state-hygiene + frontend + self-security).

This sprint references the existing [sub-project #2 design spec](2026-05-21-sub-project-2-design.md) which **is not superseded** — it remains the canonical reference for tasks 7a-c. Sprint 179 simply executes that plan with the same 12-task breakdown:

- W1: Auto-debt scope inheritance + re-plan orphan cleanup (2 task — planner P0)
- W2: DEP0190 shell:true + coverage gate split + CI flakes (3 task — discipline gate)
- W3: Dashboard TS + doctor cascade (2 task — Memory V2 cleanup + frontend)
- W4: Prompt guard + command guard + outbound limiter (3 task — self-security core, **invariants I1-I3, I5 — beta MUST**)
- W5: mTLS hook + audit HMAC chain (2 task — self-security advanced, **invariant I4 — beta MUST**)

Sprint 179 launches AFTER Sprint 177's worker rollback (Task 1) is live — without it, the planner-hijyen tasks would risk corrupting sprint-planner.ts further as Sprint 176 did.

**Sprint 179 detailed plan reuses [docs/superpowers/plans/2026-05-21-sub-project-2.md](../plans/2026-05-21-sub-project-2.md) with task IDs re-slotted to `179-*` and dependency edges updated.**

---

## 6. Sprint 180 — Nervous System Production + Feature Backlog (post-beta)

**Scope:** Items 8a-c (nervous defaults, dashboard panel, feature backlog).

To be specced after Sprint 179 retro. Beta cut-off is June 1; Sprint 180 lands post-beta (June 2+).

---

## 7. Beta Gate Analysis (June 1 2026)

| Sprint | Days est. | MUST tasks (beta blocker) | SHOULD tasks | Status |
|--------|-----------|----------------------------|--------------|--------|
| 177 | 2-3 | All 5 tasks | — | **In progress (this spec)** |
| 178 | 2-3 | None (defensive cleanup) | 4 | Pending 177 retro |
| 179 | 4-5 | W4-W5 (5 self-security tasks) | W1-W3 (7 planner+frontend tasks) | Pending 178 retro |
| 180 | post-beta | — | — | Pending 179 retro |

**Total beta-required:** Sprint 177 (5) + Sprint 179 W4-W5 (5) = 10 task in ~7 days. With worker rollback live from Task 177-001 onward, sprint quality should be reliable.

**Risk:** If Sprint 177 takes >3 days, Sprint 179 self-security may slip past June 1. Mitigation: keep Sprint 178 small (defensive only); shift Sprint 178's MUST tasks (none currently) to Sprint 179 if needed.

---

## 8. Sub-project Renumbering

The original sub-project decomposition (#1-#4) is preserved but reframed:

- **#1** — Embedded web terminal — ✅ shipped (Sprint 175)
- **#2 (original)** — Planner state-hygiene + self-security — **subsumed into this initiative as Sprint 179**
- **#2 (revised) = Crisis Stabilization Initiative** — Sprint 177-180 (this spec)
- **#3** — Multi-tenant + k8s + mTLS impl — unchanged, post-beta
- **#4** — Enterprise outside-world integration — unchanged, post-beta

The original sub-project #2 design spec (2026-05-21-sub-project-2-design.md) remains the canonical reference for Sprint 179 — it is not deleted, it is referenced.

---

## 9. Process Invariants (locked from previous sprints + Sprint 176 lessons)

- **Self-modifying sequential** — `src/orchestra/`, `src/core/`, `src/cli/`, `src/api/`, `src/agents/` modifications trigger `self-modifying-detector.ts` → ZORUNLU sequential dispatch
- **Brain mode `structured`** — AI planning disabled for self-dogfood (task specs verbose enough to deterministic-parse)
- **`dependency_pipeline_enabled: false`** — Wave gates Brain manual (ADR-047)
- **Max workers 2** — Sequential, not parallel; same wave can have at most 2 concurrent
- **Build/publish gates Alperen's call** — `npm run build:all` + `deckent serve` + `npm publish` final approval Alperen, worker never runs them ([feedback_build_requires_user_approval](../../.claude/projects/.../memory/feedback_build_requires_user_approval.md))
- **`deckent kill` / `cleanup` on live sprint requires Alperen approval** ([feedback_sprint_kill_always_ask_user](../../.claude/projects/.../memory/feedback_sprint_kill_always_ask_user.md))
- **`.brain/memory.db` is sacred** — additive ALTER only, no DROP/rebuild ([feedback_db_silmek_yasak](../../.claude/projects/.../memory/feedback_db_silmek_yasak.md))
- **`.deckent/config.json` stays tracked** — never `git rm --cached` ([feedback_config_json_git_rm_yasak](../../.claude/projects/.../memory/feedback_config_json_git_rm_yasak.md))
- **NEW (this spec):** **Worker rollback engaged from Sprint 177 Task 1 onward** — every NO_GO reverts worker scope writes. Prevents the Sprint 176 corrupting pattern.

---

## 10. Cross-references

- **Predecessor evidence:** [Sprint 176 dogfood evidence](../audits/sprint-176/dogfood-evidence.md), [Sprint 176 load-test report](../audits/sprint-176/load-test-report.md)
- **Existing sub-project #2 spec (Sprint 179 reference):** [2026-05-21-sub-project-2-design.md](2026-05-21-sub-project-2-design.md)
- **Existing sub-project #2 plan (Sprint 179 reference):** [docs/superpowers/plans/2026-05-21-sub-project-2.md](../plans/2026-05-21-sub-project-2.md)
- **Stash safety net:** `git stash@{0}` "sprint-176-uncommitted-rollback-safety-2026-05-20" (working tree drained pre-spec; restorable via `git stash pop` if any of the 9 partial-task code drops are wanted)
