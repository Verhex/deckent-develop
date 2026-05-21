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
| **6e** | **TOPP B+C continuous-dispatch (wave-barrier removal + slot-fill efficiency)** | **178** | ⚠️ **MUST (without it Sprint 179's 12 tasks run wave-throttled; memory: project_topp_continuous_dispatch.md, Alperen onayı 2026-05-19)** |
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

## 4. Sprint 178 — Modernization Yayılma + CI/CD Yeşil + TOPP (5 task)

**Scope:** Items 6a-d (Node 24/26 spread across tests/docs, tmux code removal follow-up, CI flaky test fix) **+ TOPP B+C continuous-dispatch** (item 6e — wave-barrier removal + slot-fill efficiency).

(Detailed task breakdown deferred to Sprint 178 spec — written after Sprint 177 retro. Outline only:)

- Task 178-001: Node 24/26 test assertion sweep (4-5 test files reference 18-20-22 strings — find + replace + verify)
- Task 178-002: Doc updates — README.md, DECKENT.md, docs/guide/*.md engines.node references
- Task 178-003: Tmux code removal (Sprint 177 deprecation path → actual deletion of `src/orchestra/tmux.ts` + removal of tmux branch in `spawn-backend.ts`; tests pruned)
- Task 178-004: CI flaky test fix (original sub-project #2 Task 7 — orphan-cleaner-ipc PID portability + archive-debt mock hygiene)
- **Task 178-005: TOPP B+C continuous-dispatch — wave-barrier removal + slot-fill efficiency.** `result-collector.ts:380` `dispatchTick` flag-agnostik (replaces `respawnEligibleTasks` NO-OP-when-flag-false hole + supersedes `processQueue` legacy FIFO). `sprint-spawner.ts:472,509` continuous body + `:296-313` initial fill ladder. `prompt-god-template.ts:291-307` TOPP C collision-edge predecessor `.result` digest embed. Wave becomes a pure metric, not a barrier. **E1 flag-agnostic semantics:** continuous-dispatch fires regardless of `dependency_pipeline_enabled`; that flag now means "explicit dependency-ordering strictness", deckent-dev keeps `false` (ADR-047 intact). Escape hatch: `DECKENT_LEGACY_FIFO=1` env var. Reference design: memory `project_topp_continuous_dispatch.md` (Alperen onayı 2026-05-19). New ADR contract-first (number resolved from DB — ADR-045 §3 wave-barrier superseded). Cross-backend test (docker/subprocess) + multi-wave smoke. Bug-encoding tests (processqueue-stall, task-queue, dependency-pipeline-flag-disabled) **rewritten, not deleted** (continuous semantics preserve correctness).

**Why TOPP MUST land in Sprint 178 (before Sprint 179):** Sprint 179 = 12-task sub-project #2 original scope. Without TOPP, those 12 tasks would run wave-barrier-throttled (~2-3 effective parallel slots even with max_workers=6) → beta gate (June 1) at risk. With TOPP, the 12 tasks can fan out to all available slots respecting only true dependency edges.

**Sprint 178 detailed spec will be written by 2026-05-25 after Sprint 177 retro reveals what shifted.**

---

## 5. Sprint 179 — Sub-project #2 Original Scope + Bug A Foundation (14 task)

**Scope:** Items 7a-c (planner state-hygiene + frontend + self-security) **+ Bug A foundation** (Sprint 178 forensik bulgusu: dependency aggregate fix-aware).

### 5a. Sprint 178 forensik: Bug A discovery

`/.deckent/sprint-178-events.jsonl` analizinde 5 dispatch bug bulundu. Alperen filtresi (2026-05-22):

- **Bug A — DO:** Dependency aggregate fix-aware. Ana worker NO_GO ama fix DONE olduğunda → event stream'de ana task hâlâ NO_GO durur; downstream `depStatuses` "EXECUTING" görür → fix-after-NO_GO başarısı dependency hattına yansımaz. CLI final aggregate doğru hesaplıyor ama event stream + predecessor digest yanlış. **Sprint 179 W0 foundation — sub-project #2 12 task fan-out'tan ÖNCE land.**
- **Bug C/E — DON'T TOUCH:** Brain done işleri dürüstçe re-evaluate ediyor (FIX phase'de). Bu davranış kasıtlı + doğru — "done olmasına aldanmıyor". User direktifi: "bu yapıya dokunmayalım doğru çalışması yeterli".

**Why Bug A önce land etmeli:** Sprint 179'da 12 task var, çoğu cross-wave dependency'li (W2→W1, W3→W1, W5→W4 etc). Bug A olmadan her ana task NO_GO + fix DONE pattern'ı downstream wave'i 22dk taklit boş yere bekletecek. Sprint 178'de tek task'ta görüldü; 12-task fan-out'ta amplifie olur → beta gate (June 1) risk.

### 5b. Wave breakdown — Bug A foundation + sub-project #2 12 task

- **W0 — Foundation (1 task, sequential, Sprint 179 başı):**
  - Task 179-W0-1: Dependency aggregate fix-aware. Event stream'e `DEPENDENCY_RESOLVED_BY_FIX` channel ekle; `result-evaluator` ana task verdict'i `max(originalVerdict, latestFixVerdict)` aggregate; `result-collector.planDispatch` downstream task `depStatuses` query'sinde aggregate verdict döner; predecessor digest (TOPP C) fix sonucunu da embed eder.
- **W1 — Planner P0 (2 task, sequential, same file: sprint-planner.ts):**
  - Auto-debt scope inheritance
  - Re-plan orphan task file cleanup
- **W2 — Discipline gate (3 task, parallel):**
  - DEP0190 shell:true win32-only
  - Coverage hard-floor / aspirational split
  - CI-only test flakes (PID portability — Sprint 178 partial; final hygiene burada)
- **W3 — Memory V2 cascade (2 task, parallel):**
  - Dashboard TS + root lint wire
  - `doctor` DECISIONS.md obsolete + cascade
- **W4 — Self-security core ★ BETA MUST (3 task, parallel):**
  - Prompt guard (I1 + I2 invariant)
  - Command guard (I3 default-deny remote-shell)
  - Outbound rate-limit (I5 tenant isolation)
- **W5 — Self-security advanced ★ BETA MUST (2 task, parallel):**
  - mTLS hook (AuthProvider interface — no impl)
  - Audit HMAC chain + verify CLI (I4 append-only)

### 5c. Spec/plan reference chain

- Sub-project #2 design spec (2026-05-21-sub-project-2-design.md) **remains canonical** for W1-W5 (12 task; 5 invariants I1-I5; verdict matrix; threat model).
- Sub-project #2 plan (docs/superpowers/plans/2026-05-21-sub-project-2.md) **remains canonical TDD breakdown** for W1-W5 task steps (re-slot 176-* → 179-*).
- Sprint 179 detailed plan (yeni, `docs/superpowers/plans/2026-05-23-sprint-179-subproject-2-plus-bugA.md`) **eklenecek:** W0 task tasarımı + dependency wiring + DIRECTIVES task-title pattern.

### 5d. Bug A test surface

- `tests/orchestra/dependency-aggregate-fix-aware.test.ts` (NEW):
  - (a) `result-evaluator` ana task NO_GO + fix DONE → `getAggregateVerdict(taskId)` döner `DONE`
  - (b) `event-stream` fix DONE on dependency → `DEPENDENCY_RESOLVED_BY_FIX` event emit
  - (c) `planDispatch` downstream task `depStatuses` aggregate kullanır — "EXECUTING" değil "DONE" döner
  - (d) Predecessor digest (TOPP C buildDependenciesBlock) hem original hem latest-fix .result digest'ini içerir
  - (e) Honest-gate koruma: Brain re-evaluate her zaman ana verdict üstüne yazabilir (Bug C/E intact — aggregate hesaplama UPDATE'i bloke etmez)

### 5e. Sprint 179 verdict

- **GO** = 13/13 DONE
- **GO_WITH_TECH_DEBT** = 11-12/13 DONE + ≤2 GWT (W0 + W4 + W5 ≥6 DONE şart — beta blocker; W1-W3 ≤2 GWT KABUL)
- **NO_GO** = W0 fail (downstream rant'ı engelliyor) **veya** güvenlik invariant ihlali (I1-I5)

Sprint 179 launches AFTER Sprint 177 worker rollback + Sprint 178 TOPP land (her ikisi de live). Worker rollback NO_GO src/ revert garantisi + TOPP continuous-dispatch fan-out parallelism = 14 task ≤4 gün.

**Sprint 179 detailed plan: [docs/superpowers/plans/2026-05-23-sprint-179-subproject-2-plus-bugA.md](../plans/2026-05-23-sprint-179-subproject-2-plus-bugA.md) (eklenecek).**

---

## 6. Sprint 180 — Hybrid Beta MUST + Nervous Faz 1 + Panic Guard UI (14 task)

**Revised 2026-05-20 after Sprint 179 retro:** Originally planned as post-beta. Reframed as **last beta-blocker sprint** because Sprint 179 surfaced four open beta-MUST items (worker `.result` coverage zorunluluk → 9 TECH_DEBT root, self-audit gate vitest failure, npm publish readiness, OSS GA docs) **plus** NERVOUS-TODO.md analysis (2026-05-20) confirmed Nervous Half-Wired Dormant state — §11.4 timing window already on Sprint 180 (28+ sprint backlog).

### 6a. Three-layer hybrid scope

**Layer 1 — Beta MUST cleanup (4 task):** Sprint 179 verdict GO_WITH_TECH_DEBT (9 TECH_DEBT) root cause: worker `.result` coverage=0/null → Quality Scorer overall 100→75 → TECH_DEBT yargısı. Plus 1 vitest failing test (self-audit gate `GO_WITH_GATE_FAILURE`). Plus npm publish v1.0.0-beta.1 readiness gap (Sprint 165 prep). Plus OSS GA docs review (README, install, getting-started).

**Layer 2 — Nervous Faz 1 Smoke (8 task):** NERVOUS-TODO §11.2 6-step activation + §11.3 Faz 1 (3 detector strict mode). Locked decisions:
- IPC kanal MCP→Executor: **file-based queue** (`.deckent/nervous-ipc/`) — dispatcher zaten file channel yazıyor, singleton anti-pattern'den kaçınma
- Faz 1 detector seçimi: **stale-worker + dead-event-stream + directives-protection** (Sprint 179 stale_heartbeat 5x pattern + Sprint 165 reserve_for clear + Sprint 177-005 baseline hook canlı)
- Authority mode: **strict** (autonomous yok, hepsi approval)
- Severity threshold: **critical+** (false-positive gürültü filtresi)

**Layer 3 — Panic Guard UI synergy (2 task):** Sprint 179 dogfood'da keşfedilen UX bug ([[project-panic-guard-no-approval-ui]]): "kill blocked — user approval required" diyor ama hiçbir kanaldan onay yok. Layer 2 Step E (IPC queue) altyapısını kullanır. `directives_protection.auto_restore` → true geçişi (Bug A landed + Sprint 177-005 baseline hook canlı).

### 6b. Wave breakdown

| Wave | Layer | Task | Effort |
|------|-------|------|--------|
| W0 | L2 Step F | Config schema sync (6 detector default + dead_event_stream reserve clear) | low |
| W1-1 | L2 Step B | sprint-state-tracker `getSprintStateSnapshot()` export | low |
| W1-2 | L2 Step A | nervous bootstrap fabrika `createNervousSystemIfEnabled()` | normal |
| W2-1 | L2 Step C | İlk 4 action handler (WORKER_RESPAWN, ORPHAN_TASK_ARCHIVE, STALE_LOCK_RELEASE, DEAD_EVENT_STREAM_CLEANUP) | high |
| W2-2 | L2 Step E | IPC queue MCP→Executor + nervous-ipc.ts (NEW) | high |
| W3-1 | L2 Step D | sprint-controller wire (bootstrap + dispose finally) | normal |
| W3-2 | L2 Faz 1 smoke | 3 detector enable + strict mode + severity critical | low |
| W3-3 | L2 integration | runtime nervous pipeline end-to-end test | normal |
| W4-1 | L1 | Worker `.result` coverage zorunluluk + vitest --coverage parse | high |
| W4-2 | L3 | Panic guard UI (Layer 2 IPC queue ile bağla) | normal |
| W4-3 | L1 | Self-audit gate vitest failing test fix | normal |
| W5-1 | L1 | npm publish v1.0.0-beta.1 readiness (validate:publish smoke) | high |
| W5-2 | L1 | OSS GA docs review (README + install-matrix + getting-started) | normal |
| W5-3 | L3 | `directives_protection.auto_restore` → true (Bug A + baseline hook canlı) + Sprint 149 doc borcu (nervous user guide kısa giriş) | normal |

### 6c. Sprint 180 verdict

- **GO** = 13/13 DONE (beta launch ready, nervous Faz 1 live, panic UI functional)
- **GO_WITH_TECH_DEBT** = 11-12/13 DONE + ≤2 GWT; **şart:** L2 nervous activation (W1-W3 hepsi) DONE + L1 beta MUST (W4-1 coverage + W5-1 npm publish) DONE
- **NO_GO** = nervous bootstrap fail veya integration test fail (rollback `enabled: false` ile config-driven, code rollback gerekmez) veya npm publish smoke fail

### 6d. Beta launch readiness

Sprint 180 GO sonrası June 1 beta launch için tek kalan:
- npm publish v1.0.0-beta.1 (Alperen manuel komutu, build/publish gate [[feedback-build-requires-user-approval]])
- Sprint 181 (post-beta) buffer: nervous Faz 2 pilot başlangıç + doc sprint borcu kapanış + Sub-project #3/#4 spec'i

**Risk:** Sprint 180 NO_GO durumunda Faz 1 nervous rollback `.deckent/config.json` → `nervous_system.enabled: false`. Beta MUST (Layer 1) bağımsız land edebilir — nervous rollback Layer 1'i etkilemez. Beta launch Sprint 181 buffer ile hâlâ June 1 zamanlamasında.

---

## 7. Beta Gate Analysis (June 1 2026)

| Sprint | Days est. | MUST tasks (beta blocker) | SHOULD tasks | Status |
|--------|-----------|----------------------------|--------------|--------|
| 177 | 2-3 | All 5 tasks | — | **In progress (this spec)** |
| 178 | 2-3 | **TOPP (Task 178-005)** — unblocks Sprint 179 fan-out | 4 (Node 24/26 spread + tmux removal + CI flakes) | Pending 177 retro |
| 179 | 3-4 (with TOPP) / 5-6 (without) | W4-W5 (5 self-security tasks) | W1-W3 (7 planner+frontend tasks) | Pending 178 retro |
| 180 | post-beta | — | — | Pending 179 retro |

**Total beta-required:** Sprint 177 (5) + Sprint 178 TOPP (1) + Sprint 179 W4-W5 (5) = 11 task in ~7 days. With worker rollback live from Task 177-001 onward, sprint quality should be reliable; with TOPP live from Sprint 178 Task 5 onward, Sprint 179's 12-task fan-out runs at native parallelism.

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
