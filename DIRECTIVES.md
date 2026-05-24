# DIRECTIVES — Sprint 192: God-Level Push Day 4 — Synthetic NO_GO Eradication + RAM Reform + Sprint 191 Carry-Over (5 dalga, 19 task)

## Goal: Sprint 191 dogfood'dan çıkan 3 büyük öğrenim'in kapanışı: (1) **W-INTEGRITY** stream — synthetic NO_GO sıfırlama + dishonest worker result detection ([[feedback_no_synthetic_results]]); (2) **W-M** stream — RAM optimizasyon canlı deney (12 worker × 2g vs mevcut 3 × 4g) + adaptive scheduler ([[project_sprint192_ram_optimization]]); (3) Sprint 191 6 genuine NO_GO carry-over fix; (4) Karpathy L-6/L-7 Faz 2 (10 daha PROMPT.md/SKILL.md). **1 Haziran 2026 OSS GA beta için kritik gün 4** — false NO_GO bug'ı kalıcı çözüm, agent stats gerçekçi hâle gelir. Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` (W-M + W-INTEGRITY + Sprint 191 carry-over).

Tüm task'lar için ortak kurallar:
- Worker yalnızca `scope.filesWrite` içine yazar; scope dışına dokunmak yasak (ADR-037 advisory).
- Her task **test ile geçer** — vitest minimum 3 test (mutlu/edge/hata). Audit task'ları test gerektirmez.
- `dosya:satır` kanıtı zorunlu.
- ADR ihlali → NO_GO + amendment proposal.
- `.brain/memory.db` write yalnızca core/memory-*.ts yolundan; **DB silmek YASAK** ([[feedback_db_silmek_yasak]]).
- Sprint sonu tsc temiz + test regresyon yok.
- Worker `.result` notes alanına kanıt komutu çıktısı yapıştır.
- **Dishonest result YASAK** — notes'ta iddia edilen LoC delta disk'le çakışmalı ([[feedback_no_synthetic_results]]); Sprint 192 192-012 dishonest detector aktif olacak.
- **OSS GA blocker:** Sprint 192 false-NO_GO ve agent stats güvenilirliği için kritik.

---

## DALGA 0 — Synthetic NO_GO Eradication Core (1 task — ZORUNLU İLK)

> **Neden tek başına:** Sprint 191 hotfix (`07f07c9a`) sadece `sprint-phases.ts:1120`'yi kapsadı. Sprint-controller'da 2 synthetic NO_GO daha var; Sprint 192'nin kendisi bu bloklara takılırsa hotfix testimiz bozulur.

---

## Task 1: 192-001 — sprint-controller.ts synthetic NO_GO bloklarına liveness check (W-INTEGRITY I-2)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/worker-liveness.ts, tests/orchestra/sprint-controller-liveness.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 191 hotfix `sprint-phases.ts:1120` synthetic NO_GO bloğunu liveness check ile kapsadı. Ama `sprint-controller.ts:821` (cleanup path) ve `:845` (recover path) iki sentetik kaynağı kapsamadı.

**Yöntem:**
1. `src/orchestra/sprint-controller.ts:821` ve `:845` blokları oku.
2. `checkWorkerLiveness(task, projectRoot)` import et + ÖNCE çağır:
   - `never-spawned` → SKIP synthetic, BRAIN→WORKER:NEVER_DISPATCHED event emit
   - `alive` → mümkünse poll, değilse honest label ile fall through
   - `dead` → mevcut synthetic (notes'a `liveness=dead` ekle)
3. Tests: 3+ test her iki blok için (cleanup path + recover path) — never-spawned skip + alive grace + dead synthetic.

**Kanıt:** `grep -A3 "syntheticResult" src/orchestra/sprint-controller.ts | grep -c "checkWorkerLiveness"` → 2+ match.
**Test:** 6+ test (2 path × 3 senaryo).

---

## DALGA 1 — Sprint 191 Genuine NO_GO Carry-Over (6 task)

> Sprint 191 dogfood'da 6 task gerçekten yarım kaldı (dishonest result + uncompleted source). Bu dalga'da hepsi paralel düzeltilir.

---

## Task 2: 192-002 — runtime_extension_enabled default true (Sprint 191 191-002 carry-over)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts, tests/core/config-defaults.test.ts
- Scope: src/core/, tests/core/

### Description
Sprint 191 worker test yazdı ama `src/core/config.ts` default'unu değiştirmedi — `runtime_extension_enabled: false` HÂLÂ default. Production user'lar bu fix'ten faydalanamaz.

**Yöntem:**
1. `src/core/config.ts` `timeout.runtime_extension_enabled` default `false → true` (Sprint 191 deckent-dev `.deckent/config.json` zaten true).
2. `tests/core/config-defaults.test.ts` default assertion güncellemesi.
3. CHANGELOG.md not.

**Kanıt:** `grep "runtime_extension_enabled" src/core/config.ts | grep "true"` → 1+ match (default block).
**Test:** 3+ test — (a) default true, (b) explicit false override, (c) config merge precedence.

---

## Task 3: 192-003 — outcome-tracker reclassifyTaskOutcome GERÇEK implementation (Sprint 191 191-003 carry-over — dishonest worker case)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/outcome-tracker.ts, src/cli/commands/agent.ts, src/core/errors.ts, tests/orchestra/outcome-tracker-reclassify.test.ts
- Scope: src/orchestra/, src/cli/, src/core/, tests/orchestra/

### Description
Sprint 191 worker `.result` notes'unda "outcome-tracker.ts +220 LoC, agent.ts +65 LoC reclassify subcommand, errors.ts +45 LoC" iddia etti ama disk'te SADECE test dosyası vardı. Honest-gate yakaladı → NO_GO. Bu task gerçek implementation.

**Yöntem:**
1. `src/orchestra/outcome-tracker.ts`:
   - `reclassifyTaskOutcome(sprintId, taskId, newDecision, opts?)` public method — idempotent, delta-apply.
   - agentPerformance/skillPerformance success delta (totalTasks bumping YOK — task zaten sayıldı).
   - skillSprintHistory + synergyMatrix update.
   - `.deckent/routing/outcomes/<sprintId>.json` in-place mutate.
   - Optional MemoryStore injection (ReclassifyAuditStore interface) — audit-trail `retro` entry write.
2. `src/cli/commands/agent.ts`:
   - `deckent agent reclassify --sprint <id> --task <id> --decision <DONE|GO_WITH_TECH_DEBT|NO_GO> [--reason <text>] [--no-audit]` subcommand register.
   - Lazy-load MemoryStore (better-sqlite3 absent fallback).
3. `src/core/errors.ts`:
   - DECKENT_E068..E071 codes (outcomes file missing, JSON parse fail, task not found, write fail).
4. Sprint 191 test dosyası mevcut (`tests/orchestra/outcome-tracker-reclassify.test.ts`) — tests ile bind et, hepsini geçir.
5. **Bonus:** Sprint 191 12 false NO_GO için bulk reclassify (192-019 task'ı bunu yapar — bu task sadece API/CLI).

**Kanıt:** `grep "reclassifyTaskOutcome" src/orchestra/outcome-tracker.ts` → 1+ match; `node dist/cli/index.js agent reclassify --help` → renkli output.
**Test:** Existing 10-test suite pass + 3+ ek (CLI subcommand integration, error codes).

---

## Task 4: 192-004 — CLI top-level error handler — uncaughtException + unhandledRejection (Sprint 191 191-007 carry-over)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/index.ts, src/cli/helpers/error-handler.ts, tests/cli/error-handler.test.ts
- Scope: src/cli/, tests/cli/

### Description
Sprint 191 worker error-handler.ts yarattı ama `src/cli/index.ts`'e `process.on('uncaughtException')` ve `process.on('unhandledRejection')` wire EKLEMEDİ. CLI silent exit hâlâ var.

**Yöntem:**
1. `src/cli/index.ts` startup'ta:
   ```typescript
   process.on('uncaughtException', formatFatalAndExit);
   process.on('unhandledRejection', formatFatalAndExit);
   ```
2. `src/cli/helpers/error-handler.ts` `formatFatalAndExit(error)`:
   - Stderr'a "✗ FATAL: <name>: <message>"
   - Stack trace `DECKENT_DEBUG=1` env ile aç
   - Crash log `.deckent/crashes/<timestamp>.log`
3. Commander.js error handler customize — eksik argüman/komut'ta suggestion.

**Kanıt:** `node dist/cli/index.js bogus-command 2>&1` → readable error + suggestion; exit code != 0.
**Test:** 3+ test — uncaught/unhandled/commander.

---

## Task 5: 192-005 — sprint-finalizer retro hook DB write (Sprint 191 191-008 carry-over)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-retro-writer.ts, src/core/memory-store.ts, tests/orchestra/sprint-finalizer-retro-hook.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint 191 worker test yazdı ama gerçek implementation YOK. Memory DB'de retro entry chronic gap ([[project_sprint167_db_gap]] devam).

**Yöntem:**
1. `sprint-retro-writer.ts` veya `sprint-finalizer.ts` retro generation noktasında `store.upsert({ type: 'retro', sprint_id, content, ... })` çağrısı ekle.
2. Idempotent — aynı sprint için tekrar çağrılırsa upsert.
3. Silent fail kaldır — hata propagate edilsin (sprint sonu hata, retro yazılmama'dan daha iyi).
4. Sprint 191 ve 192 retro entry backfill — manuel SQL insert (DB silmek YASAK, sadece insert).
5. Sprint 191 test dosyası mevcut — tests pass.

**Kanıt:** `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries WHERE type='retro' AND sprint_id IN ('sprint-189','sprint-190','sprint-191','sprint-192');"` → 4.
**Test:** Existing test + 3+ ek (retro hook wired, upsert idempotent, error propagation).

---

## Task 6: 192-006 — task-builder Karpathy block injection (Sprint 191 191-015 carry-over)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, src/agents/worker.ts, tests/orchestra/task-builder-karpathy.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description
Sprint 191 worker task-builder.ts'e hiç dokunmadı. Karpathy block worker prompt'larına inject edilmiyor.

**Yöntem:**
1. `src/orchestra/task-builder.ts` `buildWorkerPrompt()` — agent/skill prompt'larından sonra:
   ```
   ## Karpathy Discipline (mandatory)
   <content from .claude/rules/karpathy-discipline.md>
   ```
2. Content cache (sprint başında bir kez oku).
3. Token budget: ~500 token, kabul edilebilir ([[feedback_prompt_completeness_over_brevity]]).

**Kanıt:** `grep "Karpathy" src/orchestra/task-builder.ts` → 2+ match; sprint 192 worker prompt'unda görünmeli.
**Test:** 3+ test — block present, content loaded, cache hit.

---

## Task 7: 192-007 — Provider isAvailable 3-state + Ollama TECH_DEBT (Sprint 191 191-017 carry-over)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/providers/claude.ts, src/providers/codex.ts, src/providers/gemini.ts, src/providers/ollama.ts, src/cli/commands/doctor.ts, tests/providers/
- Scope: src/providers/, src/cli/commands/, tests/providers/

### Description
Sprint 190+191 carry-over zaten. Provider auth detection yarım.

**Yöntem:**
1. `isAvailable()` 3-state: `true` / `'partial'` / `false`.
2. `detect()` opt-in method: `{ binary, version, auth, ready }`.
3. `deckent doctor --providers` her 3 state açık mesaj.
4. Ollama: model list parse + tier mapping complete.

**Kanıt:** `deckent doctor --providers` 3 provider net state; `npm test -- providers/` pass.
**Test:** 3+ test per provider.

---

## DALGA 2 — W-INTEGRITY Telemetry + Honest Result Detection (5 task)

---

## Task 8: 192-008 — Hotfix telemetri — never-dispatched + alive-grace event sayım retro'ya (W-INTEGRITY I-1)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, src/orchestra/event-stream.ts, tests/orchestra/sprint-reporter-liveness.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 191 hotfix (`07f07c9a`) event emit ediyor — Sprint 192 retro'da bu metric'leri görelim. Hotfix etkisi VERİ-bazlı doğrulanır.

**Yöntem:**
1. `sprint-reporter.ts` retro generation'ında event stream'i parse et:
   - `BRAIN→WORKER:NEVER_DISPATCHED` count → "Never dispatched: N task"
   - `BRAIN→WORKER:TIMEOUT_EXTEND` count → "Extensions granted: N task"
   - alive-grace-hit vs alive-grace-miss oranı
2. Retro markdown bölümü "Liveness Stats" başlığı.

**Kanıt:** Sprint 192 retro'da "Liveness Stats" başlık görünmeli; counts > 0 (Sprint 192 dogfood'unda muhtemelen tetiklenecek).
**Test:** 3+ test — event count, retro markdown format, empty event handling.

---

## Task 9: 192-009 — EVALUATE phase trigger sıkılaştırma (W-INTEGRITY I-3)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, src/orchestra/sprint-controller.ts, tests/orchestra/evaluate-trigger-gate.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 191 RC: `runEvaluatePhase` Wave-3 task'lar dispatch olmadan tetiklendi. Trigger şartı belirsiz.

**Yöntem:**
1. `runEvaluatePhase` entry guard: "tüm sprint task'ları için ya `.result` var ya `assignedWorker` set ya da explicit DEFERRED". Aksi takdirde return + log "premature EVALUATE — waiting for dispatch".
2. Dispatch loop'unda her task spawn-attempt sonrası `task.assignedWorker` set (mevcut davranış olabilir — doğrula).
3. Timeout: dispatcher'a max bekleme süresi (effort'a göre 2-3x), aşılırsa DEFERRED işaretle ve EVALUATE'e izin ver.

**Kanıt:** Sprint 192'de 12 worker × 2g deneyinde EVALUATE log'unda "premature" mesaj olmamalı.
**Test:** 3+ test — full-dispatch trigger OK, partial-dispatch wait, DEFERRED override.

---

## Task 10: 192-010 — TaskEvaluation.DEFERRED enum + retro reporting (W-INTEGRITY I-4)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/task-types.ts, src/orchestra/sprint-reporter.ts, tests/core/task-types.test.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
Şeffaf retro için: `TaskEvaluation` enum'una `DEFERRED` ekle (PENDING/CLAIMED/EXECUTING/DONE/NO_GO/PAUSED yanına).

**Yöntem:**
1. `task-types.ts` enum extend.
2. `sprint-reporter.ts` retro markdown "Deferred: N task" başlığı.
3. handleEvaluation DEFERRED için cascade YOK (PAUSED'tan farklı semantik — DEFERRED = dispatcher saturation, PAUSED = depends-on-no_go).

**Kanıt:** `grep "DEFERRED" src/core/task-types.ts` → 1+ enum line.
**Test:** 3+ test — enum, retro inclusion, cascade exclusion.

---

## Task 11: 192-011 — Sprint-level adaptive timeout (W-INTEGRITY I-5)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/core/config.ts, tests/orchestra/sprint-timeout-adaptive.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Kullanıcı kuralı: "zaman sınırlarını daha geniş tutalım". Effort × 2-3 multiplier veya activity-based.

**Yöntem:**
1. `sprint_timeout_minutes: 0` (disable) default kalır.
2. **Effort-bazlı task timeout multiplier:** `timeout.effort_base.high: 7200s → 10800s` (3 saat) override.
3. **Activity-based extension:** Worker hâlâ heartbeat verirse, extension cap'i artır (mevcut 3 → 5).
4. Config schema: `timeout.adaptive_multiplier: number` (default 1.5).

**Kanıt:** Sprint 192 deneyinde hiç task base timeout'a takılmamalı.
**Test:** 3+ test — multiplier apply, extension cap, activity-based.

---

## Task 12: 192-012 — Dishonest worker result detector (W-INTEGRITY I-8)
- Model: opus
- Effort: high
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/result-evaluator.ts, src/orchestra/honest-gate.ts, tests/orchestra/dishonest-detector.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 191 191-003 worker `.result` notes'unda "+220 LoC outcome-tracker" iddia etti ama disk SADECE test dosyası. Honest-gate (Sprint 165 Bug X) mevcut ama bu pattern'i yakalamamış olabilir.

**Yöntem:**
1. `enforceHonestResultGate` veya `result-evaluator.ts` analiz:
   - `result.filesChanged` listesindeki dosyalarda gerçek değişiklik var mı? (`git diff --stat <files>`)
   - `result.linesAdded` ile `git diff --numstat` arasında ±%50 sapma → DISHONEST flag.
   - Notes'taki "Files changed" / "+N LoC" iddiaları parse + cross-check (heuristic regex).
2. DISHONEST detected → NO_GO + audit event `BRAIN→AUDITOR:DISHONEST_RESULT_DETECTED`.
3. Sprint 192 retro'da "Dishonest results: N" başlık (192-008'in extension'ı).

**Kanıt:** Sprint 191 191-003 .result test fixture'ı ile dishonest detect → NO_GO.
**Test:** 5+ test — honest pass, LoC delta dishonest, files-not-touched dishonest, notes-claim-mismatch, audit event emit.

---

## DALGA 3 — RAM Optimization Live Experiment (4 task)

---

## Task 13: 192-013 — worker_memory_limit 4g→2g + max_workers 3→12 deney (W-M M-1)
- Model: opus
- Effort: high
- Skills: devops-engineer, docker-expert
- Files: .deckent/config.json, src/orchestra/spawn-backend-docker.ts, docs/guide/docker-memory.md
- Scope: .deckent/, src/orchestra/, docs/guide/

### Description
Kullanıcı kararı (Sprint 191 dogfood — canlı `docker stats` worker peak 770MB/8GB cap %9.4): "Boşa RAM ayırıyorsak optimize edelim, 12 worker × 2g deneyelim."

**Yöntem:**
1. `.deckent/config.json`:
   - `modes.performance.max_workers: 3 → 12`
   - `worker_memory_limit: "4g" → "2g"`
   - `worker_memory_swap: "6g" → "3g"`
2. `spawn-backend-docker.ts` defaults aynı çekilir (DEFAULT_WORKER_MEMORY_LIMIT '4g' kalır user code uyumu — config override öncelik).
3. `docs/guide/docker-memory.md` update — yeni öneriler tablosu.

**Kanıt:** Sprint 192'de paralel 12 worker spawn; `docker stats` peak < 2g her worker'da; OOM count == 0.
**Test:** 3+ test — config defaults, override semantics, max_workers bound.

---

## Task 14: 192-014 — NODE_OPTIONS --max-old-space-size-percentage container env (W-M M-2)
- Model: opus
- Effort: normal
- Skills: docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/spawn-backend-docker.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Node 24 `--max-old-space-size-percentage=75` flag — V8 heap dinamik container cap'e bağlı.

**Yöntem:**
1. `spawn-backend-docker.ts` docker run args:
   ```
   '-e', 'NODE_OPTIONS=--max-old-space-size-percentage=75',
   ```
2. Worker process'leri Node 24+ kullanır (deckent worker bin: node).
3. Tests assert.

**Kanıt:** `docker exec deckent-w-XXX env | grep NODE_OPTIONS` → match.
**Test:** 3+ test — env var present, percentage value, override.

---

## Task 15: 192-015 — Adaptive scheduler — host RAM tespit + max_workers auto-calc (W-M M-3)
- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Files: src/core/host-detector.ts, src/orchestra/spawn-coordinator.ts, src/core/config.ts, tests/core/host-detector.test.ts
- Scope: src/core/, src/orchestra/, tests/core/

### Description
Kullanıcı: "16-32 GB RAM ayırarak bu sistemi kolayca kullanabilsin." Adaptive: host RAM tespit + `max_workers` auto-calc.

**Yöntem:**
1. `src/core/host-detector.ts`:
   - `detectHostMemory()` — `/proc/meminfo` parse (WSL2 doğru sonuç), fallback `os.totalmem()`.
   - `suggestMaxWorkers(totalGB, workerMemGB = 2)`: floor(totalGB / workerMemGB) - 1 (1GB host overhead). Cap 1-16.
2. `spawn-coordinator.ts` startup'ta `detectHostMemory()` çağır, config `max_workers` yoksa veya `auto` ise `suggestMaxWorkers()` kullan.
3. CLI: `deckent doctor --memory` host RAM rapor + suggested max_workers.

**Kanıt:** `deckent doctor --memory` → "Host: 40 GB, suggested max_workers: 15".
**Test:** 3+ test — /proc/meminfo parse, fallback, suggestion math.

---

## Task 16: 192-016 — RAM telemetri — `docker stats` snapshot retro'ya + VDS/VPS analiz (W-M M-7)
- Model: opus
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: src/orchestra/ram-telemetry.ts, src/orchestra/sprint-finalizer.ts, src/cli/commands/retro.ts, tests/orchestra/ram-telemetry.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/

### Description
Master plan W-M M-7: VDS/VPS kullanıcı kendi RAM kullanımını analiz edebilsin.

**Yöntem:**
1. `src/orchestra/ram-telemetry.ts`:
   - `collectDockerStats(sprintId)` — `docker stats --no-stream` parse → `{ workerId, memUsage, memLimit, memPct, cpuPct }[]`.
   - Sprint sırasında her N saniyede bir snapshot, sprint sonu peak/average hesapla.
2. `sprint-finalizer.ts` retro generation: telemetri'yi memory.db `retro` entry'sine ek alan + retro markdown'a tablo.
3. `deckent retro --memory` flag — yalnızca RAM tablo göster.

**Kanıt:** Sprint 192 retro'sunda "RAM Telemetry" başlık + tablo.
**Test:** 3+ test — docker stats parse, snapshot persist, retro inclusion.

---

## DALGA 4 — Karpathy Discipline Faz 2 + Retroactive Reclassify (3 task)

---

## Task 17: 192-017 — 5 ek agent PROMPT.md Karpathy refactor (L-6: security-auditor, performance-analyzer, accessibility-auditor, data-engineer, devops-engineer)
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: .deckent/agents/security-auditor/PROMPT.md, .deckent/agents/performance-analyzer/PROMPT.md, .deckent/agents/accessibility-auditor/PROMPT.md, .deckent/agents/data-engineer/PROMPT.md, .deckent/agents/devops-engineer/PROMPT.md
- Scope: .deckent/agents/

### Description
Sprint 191 5 agent PROMPT.md refactor edildi. Sprint 192'de 5 daha — toplam 10/15.

**Yöntem:** Sprint 191 Task 191-013 ile aynı template (Hero / Karpathy Discipline / Expertise / Anti-patterns / Verification).

**Kanıt:** 5 dosya ≥ 60 satır, "Karpathy Discipline" + "Anti-patterns" başlık.
**Test:** Audit task — structure check.

---

## Task 18: 192-018 — 5 ek skill SKILL.md Karpathy refactor (L-7: python-expert, anthropic-sdk, frontend-design, docker-expert, git-expert)
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: .deckent/skills/python-expert/SKILL.md, .deckent/skills/anthropic-sdk/SKILL.md, .deckent/skills/frontend-design/SKILL.md, .deckent/skills/docker-expert/SKILL.md, .deckent/skills/git-expert/SKILL.md
- Scope: .deckent/skills/

### Description
Sprint 191 5 skill SKILL.md refactor edildi. Sprint 192'de 5 daha — toplam 10/21.

**Yöntem:** Sprint 191 Task 191-014 ile aynı template.

**Kanıt:** 5 dosya ≥ 50 satır + Karpathy section.
**Test:** Audit task — structure check.

---

## Task 19: 192-019 — Sprint 191 retroactive bulk reclassify (192-003 API kullanarak)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: scripts/sprint-191-reclassify.mjs, tests/scripts/sprint-191-reclassify.test.ts
- Scope: scripts/, tests/scripts/

### Description
Sprint 191'de 12 false NO_GO disk-doğrulandı (DONE gerçekte). Agent stats çarpıtıldı (architect %27, temp-react-ts-specialist %0). Bulk reclassify ile düzelt.

**Yöntem:**
1. `scripts/sprint-191-reclassify.mjs`:
   - Sprint 191 false NO_GO listesi (disk-verified DONE): 191-002 (test only, skipped), 191-006, 191-009, 191-010, 191-011, 191-012, 191-013, 191-014, 191-016
   - Genuine NO_GO bırak: 191-003, 191-007, 191-008, 191-015, 191-017 (Sprint 192 dalga 1 ile zaten fix edilir)
   - 192-003'ün CLI'sini kullan: `deckent agent reclassify --sprint sprint-191 --task <id> --decision DONE --reason "Disk-verified: <evidence>"`
2. Çalıştır + log out.
3. Agent stats karşılaştırma raporu.

**Kanıt:** `deckent agent stats architect` Sprint 191 öncesi vs sonrası karşılaştırma; success rate net artış (örn. %27 → %60+).
**Test:** Script integration test — 9 DONE reclassify, 5 NO_GO bırak (genuine), agent stats delta.

---

## Sprint Sonu Notu

Bu sprint **8-day push'un 4. günü** — synthetic NO_GO + dishonest worker eradication + RAM optimization deneyi. Beklenen sonuçlar:
- 19/19 task DONE (Sprint 191 hotfix + W-INTEGRITY + W-M combo ile sıfır false NO_GO)
- Test fail count Sprint 191'den ≤ aynı (regresyon yok)
- 12 paralel worker × 2g cap deneyi başarılı (peak RAM < 6 GB toplam)
- Agent stats güvenilir hâle gelir (Sprint 191 retroactive reclassify)
- Karpathy refactor 10/15 agent + 10/21 skill
- RAM telemetri retro'da görünür (VDS/VPS kullanıcı için)
- Sprint 167 chronic DB-gap [[project_sprint167_db_gap]] kapanır (192-005)

Sprint 192 retro otomatik (sprint-reporter.ts). Bu DIRECTIVES'te retro task YOK ([[feedback_no_retro_task_in_directives]]).

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — W-INTEGRITY + W-M + Sprint 191 carry-over.

Next (Sprint 193 önizleme): W-E evolutionary architecture + Karpathy L-8..L-12 + dashboard reborn + Trinity Chat Path A (embedded).
