# DIRECTIVES — Sprint 177: Critical Runtime Stability (Crisis Stabilization §3)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` (commit `912b8715`) — Sprint 177-180 master plan, beta-gate prioritization.
- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-21-sprint-177-critical-runtime.md` (commit `ea53052b`) — her worker kendi Task bölümündeki **adım/kod/test'i** + aşağıdaki Worker Contract'ı **mutlaka** okur.
- **Predecessor:** Sprint 176 (rolled back — config drift + 8 dogfood bug; evidence: `docs/audits/sprint-176/dogfood-evidence.md`)
- **Sub-project status:** Sub-project #2 original (planner hijyen + self-security) subsumed → Sprint 179'a kaydı; bu sprint kritik runtime stability'ye odaklanıyor.

## Goal

5 task ile Sprint 176'nın açığa çıkardığı 5 runtime gap'i kapat: worker rollback, deckent kill cascade, tmux deprecate path, config regen guard, nervous baseline hook. Bu sprint **June 1 beta gate için MUST** — bu altyapı yoksa sonraki sprint'ler tekrar Sprint 176 gibi state'i bozar.

## Brain Planning Instructions

Mode: **structured**. **Self-modifying / dogfood: ZORUNLU sequential** (`src/agents/`, `src/orchestra/`, `src/core/`, `src/nervous/`, `src/cli/`, `src/mcp/` → `self-modifying-detector.ts` tetikler). Wave: 1 (5 task tek wave — Task 177-001 önce, sonra 002-005 paralel olabilir ama max 2 concurrent). Max workers: 2. `dependency_pipeline_enabled: false` → Brain manuel gate (ADR-047). Provider: claude. Alperen review: sprint başlangıç + her task PASS sonrası + finalize.

## Worker Contract

- **Kod YAZAR** (her task src/ + tests/ modifies). Scope DIŞINA yazma YASAK (ADR-037 advisory). **Task 177-001 lands ondan sonra worker rollback canlı** — sonraki task'ların NO_GO'sı otomatik revert.
- **TDD ZORUNLU:** plandaki RED→GREEN aynen.
- **ESM:** `.js` uzantısı zorunlu (Node 16/24).
- **memory.db:** Task 177-001 additive ALTER (TaskRecord.snapshot_stash_ref kolon). DROP/rebuild YASAK.
- **Honest gate:** `.tasks/task-<id>.result` gerçek vitest çıktısına göre selfAssessment + filesChanged + coverage + testsPassed + notes. **Fake "DONE" YOK.**
- **Worker rollback engaged Task 177-001'den itibaren** — bir worker NO_GO döndüğünde scope'undaki tüm src/ değişiklikleri otomatik revert edilir.

## GO/NO_GO Criteria

- **GATE-1 (Task 177-001):** Worker rollback testleri PASS (4 test); `git stash list` test sonrası clean; out-of-scope NO_GO da revert; **bu task BLOCKING — başarısız olursa sprint NO_GO.**
- **GATE-2 (Task 177-002):** Kill cascade integration testi PASS; dummy sprint + kill → 0 stale process/metadata/socket.
- **GATE-3 (Task 177-003):** Default `spawn_backend` resolves to docker; tmux deprecation warning emitted (once per sprint).
- **GATE-4 (Task 177-004):** Partial config regen preserves user fields + creates `.bak.regen-{iso}` backup.
- **GATE-5 (Task 177-005):** Sprint-boundary `deckent_set_directives` change not auto-restored by nervous directives_protection.

**Sprint verdict:**
- **GO** = 5/5 DONE
- **GO_WITH_TECH_DEBT** = 4/5 DONE + 1 GWT, **provided GWT task is NOT 177-001 or 177-002** (worker rollback ve kill cascade non-negotiable)
- **NO_GO** = 177-001 veya 177-002 fail; veya worker rollback regresyonu tespit edilirse

---

## Task 1: 177-001 — Worker rollback: git-stash snapshot-on-spawn
- Model: opus
- Effort: high
- Skills: typescript-expert, git-expert
- Agent: bug-fixer
- Files: src/agents/worker.ts, src/agents/worker-rollback.ts, src/orchestra/result-evaluator.ts, src/core/memory-types.ts, tests/agents/worker-rollback.test.ts
- Scope: src/agents/, src/orchestra/, src/core/, tests/agents/

### Description
Plan §Task 1 adımları. `snapshotWorkerScope()` git stash --include-untracked --keep-index ile pre-spawn state kayıt; `rollbackWorkerScope()` NO_GO'da git checkout HEAD -- . + git clean -fd; `dropWorkerSnapshot()` DONE/GWT'de stash drop. TaskRecord.snapshot_stash_ref memory.db'de tutulur. **Bu task BLOCKING** — sonraki 4 task bu altyapıya bağlı.
**Kanıt:** vitest 4 test PASS (snapshot/NO_GO-revert/DONE-keep/out-of-scope-revert); git stash list test sonrası boş.
**Test:** TDD — 4 test (RED→GREEN izlenebilir).

---

## Task 2: 177-002 — deckent kill cascade fix
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/cli/commands/kill.ts, src/orchestra/sprint-controller.ts, src/orchestra/tmux.ts, src/orchestra/spawn-backend.ts, tests/cli/kill-cascade.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/
- Dependencies: ["177-001"]

### Description
Plan §Task 2 adımları. `deckent kill --all` cascade: SIGTERM workers + SIGTERM controller PID (.deckent/pids/) + 5s grace + SIGKILL stragglers + remove sprint-state.json/checkpoint.json/gate.json + tmux socket cleanup + emit `BRAIN→*:SPRINT_KILLED` event. **Sprint 176 evidence: kill 43dk controller PID alive kalıyor + metadata kalıyor.**
**Kanıt:** vitest 3 test PASS (full cascade + controller-only + tmux-socket cleanup); integration test: dummy sprint + kill → 0 stale process/metadata/socket.
**Test:** TDD — 3 test.

---

## Task 3: 177-003 — Tmux backend deprecate path
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Agent: refactorer
- Files: src/orchestra/spawn-backend.ts, src/orchestra/tmux.ts, src/core/config.ts, docs/guide/troubleshooting.md, tests/orchestra/tmux-deprecation.test.ts
- Scope: src/orchestra/, src/core/, docs/guide/, tests/orchestra/
- Dependencies: ["177-001"]

### Description
Plan §Task 3 adımları. `resolveBackend()` default 'auto'→'docker' (önceden 'tmux'); explicit tmux için deprecation warning (once per sprint); DEFAULT_CONFIG.spawn_backend = 'docker'; docs/guide/troubleshooting.md tmux deprecation section. Sprint 178'de tmux kodu silinecek. **Sprint 176 evidence: auto→tmux fallback yanlış backend tetikledi.**
**Kanıt:** vitest 3 test PASS (default→docker + explicit-warns + warn-once).
**Test:** TDD — 3 test.

---

## Task 4: 177-004 — Config template-regen guard + restore docs
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Agent: devops-engineer
- Files: src/core/config.ts, docs/guide/config-recovery.md, tests/core/config-regen-guard.test.ts
- Scope: src/core/, docs/guide/, tests/core/
- Dependencies: ["177-001"]

### Description
Plan §Task 4 adımları. `regenerateConfigSafe()` mevcut config'i template ile MERGE eder (overwrite değil); destructive regen öncesi `.deckent/config.json.bak.regen-{iso}` backup; templateDefaults spawn_backend='docker' + dependency_pipeline_enabled=false + haiku_allowed=false + brain_planning='structured' içerir. **Sprint 176 evidence: PR #16 git rm --cached sonrası regen template alıp spawn_backend dahil tüm field'ları kaybetti.**
**Kanıt:** vitest 3 test PASS (merge preserves user fields + backup created + missing-field add); docs/guide/config-recovery.md mevcut.
**Test:** TDD — 3 test.

---

## Task 5: 177-005 — nervous_system directives_protection baseline-update hook
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Agent: api-builder
- Files: src/nervous/observer.ts (veya detector-registry.ts), src/mcp/tools/set-directives.ts, src/orchestra/sprint-controller.ts, src/cli/commands/nervous.ts, tests/nervous/directives-protection-baseline.test.ts
- Scope: src/nervous/, src/mcp/, src/orchestra/, src/cli/, tests/nervous/
- Dependencies: ["177-001"]

### Description
Plan §Task 5 adımları. DirectivesProtectionDetector.updateBaseline() metodu eklenir + `deckent_set_directives` success path tetikler + `sprint-controller.startSprint()` tetikler + `deckent nervous baseline-refresh` CLI subcommand. **Sprint 176 evidence: kill+cleanup sonrası auto_restore Sprint 175 content'ini Sprint 176'nın üstüne yazdı.**
**Kanıt:** vitest 3 test PASS (set_directives baseline refresh + adversary change restored + CLI baseline refresh).
**Test:** TDD — 3 test.
