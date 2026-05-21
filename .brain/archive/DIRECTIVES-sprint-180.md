# DIRECTIVES — Sprint 180: Hybrid Beta MUST + Nervous Faz 1 + Panic Guard UI (Crisis Stabilization §6)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §6 (Sprint 180: 13 task hybrid)
- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-24-sprint-180-hybrid-beta-nervous.md` — Layer 1 (Beta MUST) + Layer 2 (Nervous Faz 1, NERVOUS-TODO §11.2-3) + Layer 3 (Panic Guard UI) + W0-W5 wave breakdown
- **NERVOUS-TODO baseline:** `NERVOUS-TODO.md` (2026-05-20 audit, 540 satır, §11.2 6-step activation + §11.3 3-Faz roadmap + §11.10 4 locked decisions)
- **ADR-040:** Nervous System Architecture (accepted Sprint 147) — Faz 1 ile "realized" not eklenir (W5-3 doc)
- **Predecessor:** Sprint 179 (GO_WITH_TECH_DEBT, 8 DONE + 9 TECH_DEBT + 0 NO_GO). Bug A foundation + sub-project #2 12 task + Beta MUST W4-W5 ✅. Açık beta MUST: worker coverage + gate fix + npm publish + OSS docs.

## Goal

13 task ile Crisis Stabilization §6: **Beta MUST cleanup** (worker `.result` coverage zorunluluk → Sprint 179 9 TECH_DEBT root cause + self-audit gate vitest fix + npm publish v1.0.0-beta.1 readiness + OSS GA docs) + **Nervous Faz 1 Smoke** (NERVOUS-TODO §11.2 Step A-F + §11.3 Faz 1, 3 detector strict mode) + **Panic Guard UI** (Sprint 179 dogfood keşfi, Layer 2 IPC queue altyapısı sinerjisi). **June 1 2026 OSS beta gate'in son sprint'i** — Sprint 181 doc kapanış + post-beta scope için buffer.

## Brain Planning Instructions

Mode: **structured**. Self-modifying: ZORUNLU sequential (src/orchestra + src/nervous + src/api + src/agents + src/cli + src/mcp hepsi self-modifying). Wave: 6 (W0 → W1 → W2 → W3 → W4 → W5). Max workers: 2. `dependency_pipeline_enabled: false` → Brain manuel wave gates (ADR-047). Provider: claude. **Worker rollback + TOPP B+C + Bug A aggregate verdict canlı** (Sprint 177-179 deliverables).

### Dependency strategy (Sprint 179 drift-immune pattern korunur)

Sprint 176/178'de Dependencies field plan-slot ID kayması yaşandı, Sprint 179'da Dependencies kaldırıldı → drift bug %100 immun. Sprint 180'de aynı yaklaşım: **Dependencies field KULLANMA.** Her task `## Task N:` heading'inde wave prefix taşır (W0/W1/W2/W3/W4/W5). Brain manuel wave gate ile orchestre edilir:

- W0 single task (config foundation) → W1 başlat
- W1 (state tracker + bootstrap) → W2 başlat
- W2 (action handlers + IPC) → W3 başlat
- W3 sequential (controller wire → smoke config → integration test)
- W4 (coverage + panic UI + gate fix) → W5 başlat
- W5 (npm publish + docs + auto_restore)

## Worker Contract

- **Kod YAZAR** (Layer 1: 4 task source + test; Layer 2: 6 task source + test + 2 yeni dosya bootstrap + ipc-queue + action-handlers; Layer 3: 2 task source + test + 1 yeni doc). Scope DIŞINA yazma YASAK (advisory + worker rollback).
- **TDD ZORUNLU:** her task RED→GREEN (plan adımları aynen).
- **ESM:** `.js` uzantısı zorunlu (Node16 resolution).
- **memory.db:** SADECE additive ALTER (yok bu sprint'te). DROP/rebuild YASAK.
- **Worker rollback aktif:** NO_GO scope writes auto-revert.
- **TaskRecord schema:** `.result` `originalTaskId: null` (main) veya `originalTaskId: "180-..."` (fix retry) — Bug A aggregate verdict.
- **Coverage zorunluluk W4-1 land ettikten sonra:** worker `.result.coverage` gerçek vitest --coverage parse number olmak ZORUNDA (null/0 reject + retry).
- **Nervous activation default-off respect (L2 W3-1):** sprint-controller wire `if (!enabled) return null` early gate — atıl davranış aynen kalır.
- **Faz 1 smoke config (W3-2):** 3 detector enabled (stale-worker + dead-event-stream + directives-protection), authority mode `strict`, severity_min `critical+`.
- `.tasks/task-<id>.result`: gerçek vitest + selfAssessment + filesChanged + coverage + notes.

## GO/NO_GO Criteria

- **GATE-0 (W0):** Config schema sync PASS — 6 detector default + dead_event_stream reserve clear + Zod validation green.
- **GATE-1 (W1):** State tracker snapshot + nervous bootstrap fabrika land — 7 test PASS.
- **GATE-2 (W2):** 4 action handler + IPC queue PASS — handler chain + IPC race condition test green.
- **GATE-3 (W3) ★ NERVOUS LIVE:** Sprint-controller wire + Faz 1 smoke config + integration test PASS — `.deckent/nervous-history.jsonl` boş değil, en az 1 detector trigger event emit.
- **GATE-4 (W4) ★ BETA MUST:** Worker coverage zorunluluk + panic UI + gate fix PASS — Sprint 179 9 TECH_DEBT pattern reproduce edilmez, gate green.
- **GATE-5 (W5) ★ BETA LAUNCH:** npm publish v1.0.0-beta.1 readiness + OSS docs lint:link + auto_restore + nervous doc PASS — `npm run validate:publish` exit 0, beta launch ready.

**Sprint verdict:**
- **GO** = 13/13 DONE (beta launch ready, nervous Faz 1 live, panic UI functional)
- **GO_WITH_TECH_DEBT** = 11-12/13 DONE + ≤2 GWT; **şart:** W0+W1+W2+W3 (nervous activation) DONE + W4-1 coverage + W5-1 npm publish DONE. W5-2 docs veya W5-3 auto_restore GWT olabilir.
- **NO_GO** = Nervous bootstrap fail veya W3-3 integration test fail (rollback `enabled: false` config-driven, code rollback YOK) veya W5-1 npm publish smoke fail

---

## Task 1: W0 — Nervous config schema sync (Step F)
- Model: opus
- Effort: low
- Skills: typescript-expert
- Agent: refactorer
- Files: src/core/config.ts, src/core/config-types.ts, tests/core/nervous-config-schema.test.ts
- Scope: src/core/, tests/core/

### Description
Plan §Wave 0. NERVOUS-TODO §11.2 Step F. 6 eksik detector (task_mode_idle, build_failure_recurrence, token_spike, agent_routing_anomaly, scope_collision_rate, notification_delivery_health) DEFAULT_CONFIG.nervous_system.detectors'a default `enabled: false` ile eklenir. dead_event_stream `reserve_for` field temizlenir (Sprint 165'te kod hazır, config flag false kalmıştı). DetectorConfig interface + Zod validation senkronize. Backward-compat: loadConfig deep merge eksik key'leri default'tan fold ediyor. **Kanıt:** vitest 3 test PASS + tsc clean. **Test:** TDD RED→GREEN — 6 detector field + reserve_for clear + Zod parse round-trip.

---

## Task 2: W1-1 — sprint-state-tracker getSprintStateSnapshot (Step B)
- Model: opus
- Effort: low
- Skills: typescript-expert
- Agent: api-builder
- Files: src/orchestra/sprint-state-tracker.ts, tests/orchestra/sprint-state-snapshot.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Plan §Wave 1-1. NERVOUS-TODO §11.2 Step B. `getSprintStateSnapshot(): SprintStateSnapshot` export — aktif sprint'in `{sprintId, currentPhase, activeWorkers, totalTasks, completedTasks}` snapshot'ı. Sprint 161+ phase observability altyapısı kullanır. Observer'ın ihtiyacı bu (W1-2 bootstrap sprintStateProvider parametresi). **Kanıt:** vitest 3 test PASS (active sprint + idle + phase change).
**Test:** TDD — 3 test.

---

## Task 3: W1-2 — Nervous bootstrap fabrika (Step A)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/nervous/bootstrap.ts (NEW ~80 LoC), tests/nervous/bootstrap.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Plan §Wave 1-2. NERVOUS-TODO §11.2 Step A. `createNervousSystemIfEnabled(config, projectRoot, sprintStateProvider): {observer, dispose} | null` fabrika. `if (!config.nervous_system?.enabled) return null` (default-off respect). Observer + DecisionEngine + Proposer + Dispatcher + Executor + History instantiate + `'detection'` event chain wire. `dispose()` — observer.stop + executor pending timers clear. ADR-008 Brain merkezi import uyumlu. **Kanıt:** vitest 4 test PASS (disabled→null + enabled→object + dispose cleanup + observer.start invoked).
**Test:** TDD — 4 test.

---

## Task 4: W2-1 — Nervous action handlers (Step C)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect, testing-expert
- Agent: architect
- Files: src/nervous/action-handlers.ts (NEW ~150 LoC), tests/nervous/action-handlers.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Plan §Wave 2-1. NERVOUS-TODO §11.2 Step C. İlk 4 MVP action handler: `WORKER_RESPAWN(taskId)` → spawn-backend.respawnWorker, `ORPHAN_TASK_ARCHIVE(sprintId)` → archive-orphans helper, `STALE_LOCK_RELEASE(filePath)` → file-lock.release, `DEAD_EVENT_STREAM_CLEANUP(sprintId)` → event-bus prune. Diğer 26 action stub `{outcome: 'unimplemented', actionId}` döndürür. Aşamalı yaklaşım: Faz 2'de diğer handler'lar eklenir. **Kanıt:** vitest 4 unit + 1 integration test PASS.
**Test:** TDD — 4 handler + dispatcher chain + stub default.

---

## Task 5: W2-2 — Nervous IPC queue MCP→Executor (Step E)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: api-builder
- Files: src/nervous/ipc-queue.ts (NEW), src/mcp/tools/nervous.ts, tests/nervous/ipc-queue.test.ts
- Scope: src/nervous/, src/mcp/, tests/nervous/

### Description
Plan §Wave 2-2. NERVOUS-TODO §11.2 Step E + §11.10 karar #1 locked: file-based IPC queue. `.deckent/nervous-ipc/{pending,resolved}/*.json` queue. MCP `nervous_accept(id)` → IPC write; Executor 1s polling read → resolveApproval; resolved/*.json'a taşı. Backward-compat: nervous inactive ise mevcut stub history-only davranış (regression yok). Dispatcher zaten file channel yazıyor → uyumlu. **Kanıt:** vitest 5 test PASS (write + read + resolved move + concurrent IPC race + backward-compat inactive).
**Test:** TDD — 5 test.

---

## Task 6: W3-1 — Sprint-controller nervous wire (Step D)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-controller.ts, tests/orchestra/sprint-controller-nervous-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Plan §Wave 3-1. NERVOUS-TODO §11.2 Step D. `runSprint()` başında `const nervous = createNervousSystemIfEnabled(config, projectRoot, getSprintStateSnapshot)` call + `try { ... } finally { nervous?.dispose() }`. Default-off respect: `enabled: false` → null → no wire. Sprint scope'unda yaşar, sprint biterken otomatik temizlenir. **Kanıt:** vitest 3 test PASS (enabled→bootstrap call + disabled→no call + complete→dispose call).
**Test:** TDD — 3 test.

---

## Task 7: W3-2 — Faz 1 smoke config
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Agent: devops-engineer
- Files: .deckent/config.json, tests/config/nervous-faz1-smoke.test.ts
- Scope: .deckent/, tests/config/

### Description
Plan §Wave 3-2. NERVOUS-TODO §11.3 Faz 1 + §11.10 karar #3-4 locked: `nervous_system.enabled: true`, mode `strict`, severity_min `critical`, 3 detector enabled: `stale_worker` (threshold 180s, Sprint 179 5x pattern kanıtlı), `dead_event_stream` (threshold 600s, Sprint 165'te kod hazır), `directives_protection` (Sprint 177-005 baseline hook canlı). Diğer 9 detector `enabled: false`. Config validation PASS smoke. **Kanıt:** test validate exit 0 + detector list 3.
**Test:** Config validation only.

---

## Task 8: W3-3 — Nervous integration runtime test
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: tests/nervous/integration-runtime.test.ts (NEW)
- Scope: tests/nervous/

### Description
Plan §Wave 3-3. Gerçek `createNervousSystemIfEnabled(config={enabled:true,faz1-smoke})` + fake sprint state provider + en az 1 detector trigger (örn. stale-worker fake heartbeat) + assert `.deckent/nervous-history.jsonl` boş değil + dispatcher file channel `.deckent/nervous-events/*.json` yazıyor. NERVOUS-TODO §11.5 test stratejisi. **Kanıt:** integration test PASS — pipeline yaşıyor + 1 event emit + history append.
**Test:** TDD — runtime pipeline E2E.

---

## Task 9: W4-1 — Worker .result coverage zorunluluk ★ BETA MUST
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/agents/worker-verify.ts, src/orchestra/quality-assessor.ts, tests/agents/worker-verify-coverage.test.ts
- Scope: src/agents/, src/orchestra/, tests/agents/

### Description
Plan §Wave 4-1. Sprint 179 9 TECH_DEBT root cause: worker `.result.coverage=0/null` → Quality Scorer overall 100→75 → TECH_DEBT verdict. Çözüm: vitest `--coverage --reporter=json-summary` → coverage-summary.json parse → `.result.coverage` = total.lines.pct (number). Null/0 → reject + retry. Quality Scorer Coverage=null (escape: doc, audit task type) → "unmeasured" partial credit (overall 90 ceiling, 75 değil). **Kanıt:** vitest 4 test PASS — gerçek coverage parse + null reject + escape hatch + Quality Scorer integration; Sprint 179 9 TECH_DEBT pattern reproduce edilmez.
**Test:** TDD — 4 test.

---

## Task 10: W4-2 — Panic guard onay UI (Layer 3 synergy)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: api-builder
- Files: src/cli/commands/nervous.ts, src/mcp/tools/nervous.ts, tests/cli/nervous-accept-panic.test.ts
- Scope: src/cli/, src/mcp/, tests/cli/

### Description
Plan §Wave 4-2. Sprint 179 dogfood keşfi ([[project-panic-guard-no-approval-ui]]): "kill blocked — user approval required" diyor ama hiçbir kanaldan onay UI yok. Çözüm: Layer 2 W2-2 IPC queue altyapısını kullan. CLI: `deckent nervous accept-panic <task-id>` → IPC write. MCP: `deckent_nervous_subscribe` event akışında `PANIC_GUARD_KILL_PENDING` emit + `deckent_nervous_accept` ile onay path live. **Kanıt:** vitest 3 test PASS — CLI accept→IPC write + MCP subscribe→event emit + accept→resolveApproval.
**Test:** TDD — 3 test.

---

## Task 11: W4-3 — Self-audit gate vitest fix ★ BETA MUST
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: TBD (Sprint 179 self-audit raporu tarama sonrası pinpoint)
- Scope: tests/

### Description
Plan §Wave 4-3. Sprint 179 self-audit gate: "vitest: 1 failing tests" → `GO_WITH_GATE_FAILURE`. Worker pre-work audit: Sprint 179 retro çıktısı + git log Sprint 179 commits + `npx vitest run 2>&1 | grep FAIL` ile failing test pinpoint. Fix uygula + green. **Kanıt:** self-audit gate exit 0; ilgili test yeşil; tsc clean.
**Test:** Gate green smoke.

---

## Task 12: W5-1 — npm publish v1.0.0-beta.1 readiness ★ BETA LAUNCH
- Model: opus
- Effort: high
- Skills: devops-engineer, typescript-expert
- Agent: devops-engineer
- Files: package.json, scripts/validate-publish.mjs, tests/scripts/validate-publish-readiness.test.ts
- Scope: ./, scripts/, tests/scripts/

### Description
Plan §Wave 5-1. `npm run validate:publish` smoke pass için 6 readiness gate: (1) `npm pack --dry-run` files ≤ 2MB + 899 files target, (2) engines.node >=24, (3) main/types entry points exist, (4) no internal state leak (.deckent/ veya .brain/ tarball'da yok), (5) ADR validation clean (`npm run lint:adr` exit 0), (6) lint:link clean. Version `1.0.0-beta.1`. **Final smoke ama publish KOŞMAZ** — Alperen manuel ([[feedback-build-requires-user-approval]]). **Kanıt:** validate:publish exit 0; 6 readiness gate PASS.
**Test:** TDD — 6 readiness assertion.

---

## Task 13: W5-2 — OSS GA docs review ★ BETA LAUNCH
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: README.md, docs/guide/installation.md, docs/guide/quickstart.md, docs/guide/getting-started.md
- Scope: ./, docs/guide/

### Description
Plan §Wave 5-2. Sprint 178 doc updates üzerine OSS GA hijyen: (1) Install matrix kontrol (Node 24/26 references tutarlı), (2) landing-page-content tutarlılığı, (3) better-sqlite3 12.10 references update, (4) quickstart adımları smoke (manual `Open in Browser` smoke), (5) `npm run lint:link` exit 0. Sprint 179 Sub-project #2 deliverable'larını user-facing dokümana yansıt (terminal security guards, audit verify CLI). **Kanıt:** lint:link exit 0 + manual smoke + grep "Node 18" 0 hit.
**Test:** Doc-only + lint:link.

---

## Task 14: W5-3 — auto_restore=true + nervous user guide kısa giriş
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Agent: doc-writer
- Files: .deckent/config.json, tests/nervous/directives-protection-auto-restore.test.ts, docs/guide/nervous-system.md (NEW kısa giriş)
- Scope: .deckent/, tests/nervous/, docs/guide/

### Description
Plan §Wave 5-3. **auto_restore=true geçişi:** Bug A landed (Sprint 179) + Sprint 177-005 baseline hook canlı → `directives_protection.auto_restore: false → true` artık güvenli. Sprint 176 dogfood pattern (DIRECTIVES rollback) imkansız. **Sprint 149 doc borcu — kısa giriş:** `docs/guide/nervous-system.md` — Nervous nedir, nasıl açılır (`enabled: true`), Faz 1 3 detector ne yapar, authority mode'lar nasıl seçilir. Full user guide Sprint 181 post-beta'ya. ADR-040 status accepted → realized note. **Kanıt:** test PASS (auto_restore=true ile mid-sprint DIRECTIVES değişimi rollback yapmıyor) + doc ≥200 satır + lint:link clean.
**Test:** TDD — 1 test (no rollback) + doc smoke.
