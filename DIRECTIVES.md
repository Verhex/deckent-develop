# DIRECTIVES — Sprint 178: Modernization Yayılma + TOPP (Crisis Stabilization §4)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §4 (Sprint 178 outline)
- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-22-sprint-178-modernization-topp.md` — TOPP en detaylı (567 satır)
- **TOPP referans:** memory `project_topp_continuous_dispatch.md` (Alperen onayı 2026-05-19)
- **Predecessor:** Sprint 177 (GO_WITH_TECH_DEBT, 4 DONE + 1 GWT). Worker rollback live; NO_GO worker'ları otomatik src/ revert.

## Goal

5 task ile Crisis Stabilization §4: Node 24/26 modernization yayılma (test+doc) + tmux backend code removal + CI flake fix + **TOPP B+C continuous-dispatch** (MUST — Sprint 179 12-task fan-out için zorunlu). Beta gate (June 1) yolu: bu sprint TOPP land etmezse Sprint 179 wave-throttled koşar.

## Brain Planning Instructions

Mode: **structured**. Self-modifying: ZORUNLU sequential. Wave: 5 (W1→W5 — Task 5 son, TOPP architectural lift). Max workers: 2. `dependency_pipeline_enabled: false` → Brain manuel gate (ADR-047). Provider: claude. **Worker rollback canlı** — Task NO_GO src/ otomatik revert.

## Worker Contract

- **Kod YAZAR** (5 task source + tests + 1 silme + 1 yeni ADR). Scope DIŞINA yazma YASAK (advisory + worker rollback).
- **TDD ZORUNLU:** Task 1-4 RED→GREEN; Task 5 G1-G10 matrix.
- **ESM:** `.js` uzantısı zorunlu.
- **memory.db:** sadece query (ADR number lookup Task 5 Step 2). Schema değişmiyor.
- **Worker rollback active:** her NO_GO scope writes auto-revert. Sprint 176 corrupted src/ pattern imkansız.
- `.tasks/task-<id>.result`: gerçek vitest + selfAssessment + filesChanged + coverage + notes.

## GO/NO_GO Criteria

- **GATE-1 (Task 178-001):** Node 24/26 test sweep PASS (4 files updated, vitest green)
- **GATE-2 (Task 178-002):** Doc updates PASS (lint:link exit 0, no stale Node 18 refs)
- **GATE-3 (Task 178-003):** Tmux removal PASS (tsc clean, no tmux refs, deprecation→removal note)
- **GATE-4 (Task 178-004):** CI flake PASS (lokal + CI=true parity)
- **GATE-5 (Task 178-005) ★ MUST:** TOPP G1-G10 PASS + cross-backend smoke + ADR lint:adr exit 0

**Sprint verdict:**
- **GO** = 5/5 DONE
- **GO_WITH_TECH_DEBT** = 4/5 DONE + 1 GWT **provided GWT is NOT Task 178-005 TOPP** (Sprint 179 unblock non-negotiable)
- **NO_GO** = Task 5 fails outright; veya test regression (worker rollback verdict)

---

## Task 1: 178-001 — Node 24/26 test assertion sweep
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Agent: ci-guardian
- Files: tests/scripts/publish-workflow.test.ts, tests/workflows/publish.test.ts, tests/e2e/install-matrix/fresh-install.test.ts, tests/docs/release-prep.test.ts
- Scope: tests/

### Description
Plan §Task 1. 4 test dosyasında stale Node 18/20/22 + '22.x' assertion'larını 24/26 + '24.x'a güncelle; engines.node >= 24 assertion. **Kanıt:** vitest 4 dosya PASS. **Test:** Assertion update — TDD bypass (existing test, sadece beklentiler güncellenir).

---

## Task 2: 178-002 — Doc updates (Node 24/26 yayılma)
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Agent: doc-writer
- Files: README.md, DECKENT.md, docs/guide/installation.md, docs/guide/quickstart.md, docs/guide/troubleshooting.md
- Scope: ./, docs/guide/

### Description
Plan §Task 2. README + DECKENT.md prerequisites + docs/guide/* Node 24/26 references. lint:link exit 0. **Kanıt:** lint:link temiz, grep stale "Node 18" 0 hit. **Test:** doc-only.

---

## Task 3: 178-003 — Tmux backend code removal
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Agent: refactorer
- Files: src/orchestra/tmux.ts (DELETE), src/orchestra/spawn-backend.ts, src/core/config.ts, tests/orchestra/tmux-deprecation.test.ts (DELETE), docs/guide/troubleshooting.md
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/guide/
- Dependencies: ["178-002"]

### Description
Plan §Task 3. tmux.ts + tmux-deprecation.test.ts sil. spawn-backend.ts tmux branch removal (3 backend → 2). config.ts spawn_backend type narrow ('docker' | 'subprocess' | 'auto'). tsc clean. **Kanıt:** grep tmux src/ 0 hit; vitest tests/orchestra/ regression yok. **Test:** Removal + type-check.

---

## Task 4: 178-004 — CI flake fix (PID portability + mock hygiene)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert, ci-testing
- Agent: bug-fixer
- Files: src/core/pid-liveness.ts (NEW), tests/cli/archive-debt.test.ts, tests/core/orphan-cleaner-ipc.test.ts, src/orchestra/ (process.kill call sites)
- Scope: src/core/, src/orchestra/, tests/

### Description
Plan §Task 4. isPidAlive() extract (linux /proc parse, darwin/win32 fallback). 2 test mock hygiene fix. process.kill(pid, 0) call sites → isPidAlive(). **Kanıt:** lokal + CI=true parity (2 test PASS her iki ortamda). **Test:** TDD — portability + mock surface.

---

## Task 5: 178-005 — TOPP B+C continuous-dispatch ★ MUST
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect, testing-expert
- Agent: architect
- Files: src/orchestra/result-collector.ts, src/orchestra/sprint-spawner.ts, src/orchestra/prompt-god-template.ts, tests/orchestra/topp-continuous-dispatch.test.ts (NEW), docs/adr/0XX-topp-continuous-dispatch.md (NEW)
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: ["178-003"]

### Description
Plan §Task 5. Wave-barrier kalkar: result-collector.ts:380 `dispatchTick(state)` flag-agnostik (replaces maybeRespawn + processQueue). sprint-spawner.ts:472,509 continuous body + 296-313 initial fill ladder. prompt-god-template.ts:291-307 TOPP C `buildDependenciesBlock` predecessor `.result` digest embed (selfAssessment + filesChanged + notes head). Yeni ADR 0XX (number memory.db'den) ADR-045 §3 wave-barrier supersede. DECKENT_LEGACY_FIFO=1 rollback escape hatch. **Kanıt:** vitest 10/10 G-matrix PASS + cross-backend (docker/subprocess) smoke clean + lint:adr exit 0. **Test:** TDD — G1-G10 matrix (empty queue, eligible spawn, dep-block, dep-resolve, max_workers boundary, collision-edge, predecessor digest, flag-agnostic, escape hatch, multi-wave smoke).
