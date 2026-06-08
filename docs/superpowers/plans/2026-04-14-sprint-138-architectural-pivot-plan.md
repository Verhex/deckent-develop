# Sprint 138 Architectural Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note:** This plan is coordinator-perspective (Alperen + Claude Code executing Deckent sprint via MCP). Worker implementation happens inside Docker containers spawned by Deckent Brain, not as subagents of this Claude Code session. Plan's "task execution" means DIRECTIVES writing + `deckent_start` MCP call + 3-layer monitoring, not subagent dispatch.

**Goal:** Sprint 138 Architectural Pivot — Brain↔Auditor↔Worker iletişim standardizasyonu (ADR-035 Verification Protocol + Auditor Authority + Event Stream + Plan-Time Collision Detection) + Sprint 137 recovery completion + vizyon foundation (Worker Honest v2 + Resume Capability MVP). 10 task, 4 wave, 6-7 saat natural execution.

**Architecture:** Phased Hybrid Wave model — Wave 1 Foundation Gate (Task 0+1 sequential) → Wave 2 Mimari Core (Task 2+3 sequential) → Wave 3 Recovery+Vizyon Batch 1 (Task 4+5+8 parallel) → Wave 4 Recovery+Vizyon Batch 2 (Task 6+7+9 parallel). MADR v3 hibrit ADR format + self-referential ADR-036 + helper functional upgrade + plan-time scope collision detection (canlı dogfood).

**Tech Stack:** TypeScript ESM, vitest, tsc, Docker (worker backend), MCP (deckent_*), JSON-lines event stream, file-lock pattern. Brain orchestrator: structured planner + sprint-finalizer.ts + result-evaluator.ts + auditor.ts.

**Spec reference:** `docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md` (commit `c9c69f1`)

---

## Phase 0: Pre-Flight & Setup

Pre-flight brainstorming session'ında ilk adım olmalı. Sprint 137 closing sonrası state'i doğrulamak için.

### Task 0.1: Baseline Doğrulama

**Files:** sadece okuma

- [ ] **Step 1: Git state kontrolü**

```bash
git log --oneline -7
git status --short
```

Expected:
- `c9c69f1 docs: Sprint 138 design spec` (en üst)
- `832ac4e test: Sprint 137 memory-decay` (oversight fix)
- `0d026b2 docs: Sprint 137 closing ceremony`
- `78e3ad5 feat: Sprint 137 recovery sprint`
- `96f5e49 docs: Sprint 137 design spec`
- Working tree: sadece runtime state (settings.local.json, managed-docs-cache.json, scheduled_tasks.lock, .deckent/decisions/, .deckent/pids/)

- [ ] **Step 2: TSC baseline**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0, 0 errors

- [ ] **Step 3: Vitest baseline (Sprint 137 sonrası)**

```bash
npx vitest run --reporter=basic 2>&1 | tail -10
```

Expected: `Test Files 10 failed | 503 passed (513)`, `Tests 63 failed | 12658+ passed | 16 skipped` — Sprint 138 Task 4 baseline

- [ ] **Step 4: Sprint state temiz mi**

```bash
ls .deckent/sprint-137.pid .deckent/sprint-state.json 2>&1
cat .deckent/config.json | head -15
```

Expected: state files yok (clean finalize), config: `last_sprint_id: "sprint-137"`, `spawn_backend: "docker"`, `max_workers: 3`, `brain_planning: "structured"`

- [ ] **Step 5: Pre-flight source inspection (Sprint 138 kritik dosyalar)**

```bash
wc -l src/monitor/auditor.ts src/orchestra/ipc-registry.ts src/orchestra/sprint-finalizer.ts src/orchestra/result-evaluator.ts src/agents/worker.ts src/orchestra/sprint-spawner.ts src/core/file-lock.ts src/orchestra/conflict-resolver.ts
```

Expected (brainstorming'de yakalanan):
- auditor.ts: 650
- ipc-registry.ts: 270
- sprint-finalizer.ts: 957
- result-evaluator.ts: 1033
- worker.ts: 1206
- sprint-spawner.ts: 316
- file-lock.ts: **30 (placeholder, 0 export!)**
- conflict-resolver.ts: 147

- [ ] **Step 6: ADR state kontrolü**

```bash
wc -l .brain/DECISIONS.md
grep -c "^## ADR-" .brain/DECISIONS.md
grep -c "^\*\*Status:\*\*" .brain/DECISIONS.md
```

Expected: 702 satır, 35 ADR başlık, **0 Status alanı** (Sprint 138 Task 0 bu alanı ekleyecek)

- [ ] **Step 7: Current tryCodeVerifiedDone helper location**

```bash
grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts src/orchestra/sprint-finalizer.ts src/monitor/auditor.ts 2>&1 | head -10
```

Expected:
- `result-evaluator.ts:729 export function tryCodeVerifiedDone` (kaynak, Sprint 138 Task 2 taşınacak)
- `sprint-finalizer.ts:49 import tryCodeVerifiedDone`
- `sprint-finalizer.ts:493 const verifyResult = await tryCodeVerifiedDone(taskId, projectRoot)`
- `auditor.ts`: **miss** (henüz burada değil)

- [ ] **Step 8: `.locks/` runtime dir boş mu**

```bash
ls .locks/ 2>&1
```

Expected: boş (Sprint 137 execute sırasında hiç lock alınmadı — Task 3 bu durumu değiştirecek)

---

## Phase 1: DIRECTIVES.md Yazımı

### Task 1.1: Sprint 138 DIRECTIVES Template (10 task + Dependencies)

**Files:**
- Modify: `DIRECTIVES.md` (Sprint 137 manual reset template'i üzerine yaz)

- [ ] **Step 1: Mevcut template'i doğrula**

```bash
head -10 DIRECTIVES.md
```

Expected: Sprint 137 sonrası reset template (`# DIRECTIVES — (Sprint 138 için hazırlanıyor)` + placeholder task)

- [ ] **Step 2: DIRECTIVES.md'yi tam içerikle yaz**

Write tool kullan. Plan dosyası çok uzun olduğu için DIRECTIVES.md içeriği Appendix A'da verilmiş — oradan kopyalayıp yazılacak. 10 task + her birinde `Dependencies:` line (T-005 dogfood için). Task priority karışımı: 2 CRITICAL (137-000, 137-002 → yanlışlık, Sprint 138: 138-000, 138-001, 138-002, 138-004, 138-005), 3 HIGH (138-003, 138-006, 138-007, 138-008), 1 NORMAL (138-009).

Revize: 5 CRITICAL + 4 HIGH + 1 NORMAL.

- [ ] **Step 3: DIRECTIVES.md content kontrolü**

```bash
grep -c "^## Task" DIRECTIVES.md
grep "Priority:" DIRECTIVES.md
grep "Dependencies:" DIRECTIVES.md
```

Expected:
- `^## Task` → 10 hit
- Priority: 5 CRITICAL + 4 HIGH + 1 NORMAL
- Dependencies: 9 hit (Task 0 dışındaki hepsi)

---

## Phase 2: Plan Dry-Run (T-005 Dependency Dogfood 3. Kanıt)

### Task 2.1: Structured Plan Dry-Run

- [ ] **Step 1: deckent plan structured dry-run**

```bash
npx deckent plan --structured --dry-run 2>&1 | tail -80
```

Expected:
- Sprint 138 (sprint-138) 10 görevle planlandı
- Priority sütununda **CRITICAL/HIGH/NORMAL karışımı** (Sprint 136+137 canlı dogfood, Sprint 138 3. kanıt)
- 10 task listed

- [ ] **Step 2: T-005 3. kanıt doğrulama**

Eğer Priority sütunu sadece NORMAL gösteriyorsa → Sprint 136 T-005 wire fix regression, acil stop (Sprint 138 Task 0 öncesi blocker). Değilse devam.

---

## Phase 3: Sprint Execution

### Task 3.1: Sprint 138'i Başlat

**Files:** brain orchestrator + Docker workers spawn

- [ ] **Step 1: deckent_plan MCP call (yazılı tasarıma uygun 10 task oluştur)**

MCP tool: `mcp__deckent__deckent_plan`
Parameters: `{ mode: "structured", dryRun: false }`

Expected:
- `sprintId: "sprint-138"`
- `tasks: 10`
- `modelDistribution: { opus: ~5, sonnet: ~5 }`
- `recommendation.maxWorkers: 3`
- `waveBreakdown: { wave1: ?, wave2: ? }` (Brain kendi wave breakdown yapar, bizim 4-wave hibrit değil)

- [ ] **Step 2: Task JSON files doğrula**

```bash
ls .tasks/task-138-*.json 2>&1
for i in 000 001 002 003 004 005 006 007 008 009; do
  echo "=== task-138-$i deps ==="
  grep -A3 '"dependencies"' .tasks/task-138-$i.json 2>&1 | head -5
done
```

Expected: 10 JSON file, dependencies field hepsinde doğru parse edilmiş (T-005 4. canlı dogfood)

- [ ] **Step 3: 3-Layer Monitoring Setup (paralel başlat)**

**Layer 1 — Shell Watchdog (background bash, Sprint 138 pattern):**

```bash
touch /tmp/sprint138-start
mkdir -p /tmp
while true; do
  echo "=== $(date '+%H:%M:%S') ==="
  ls -la .deckent/sprint-138.pid 2>&1 | head -1
  docker ps --filter "name=deckent" --format "{{.Names}} {{.Status}}" 2>&1 | head -5
  echo "Results: $(ls .tasks/task-138-*.result 2>/dev/null | wc -l)/10"
  ls .tasks/task-138-*.hb 2>&1 | head -5
  ls .locks/ 2>&1 | head -10
  wc -l .deckent/sprint-138-events.jsonl 2>&1 | tail -1
  wc -l .brain/MEMORY.md .brain/DECISIONS.md 2>&1 | tail -3
  echo "---"
  sleep 120
done > /tmp/sprint-138-shell-watchdog.log 2>&1
```

`run_in_background: true`

**Layer 2 — Watchdog Subagent:** Manuel dispatch, Wave geçişlerinde (4+ dispatch noktası — Wave 1→2, Wave 2 Task 2→Task 3, Wave 2→3, Wave 3→4, finalize öncesi).

**Layer 1 Verifier NOT deployed** — Sprint 137 lesson: background general-purpose subagent infinite loop'da erken exit. Sprint 138'de sadece shell loop + manuel watchdog.

- [ ] **Step 4: deckent_start MCP invocation**

MCP tool: `mcp__deckent__deckent_start`
Parameters:
```json
{
  "root": "/home/alperen/deckent-dev",
  "force": true,
  "autoApprove": true,
  "timeout": 25200000
}
```

Expected:
- Sprint 138 spawn message
- `jobId: "sprint-NNNNNNN"`
- `status: "RUNNING"`
- Sprint duration: natural 6-7 saat, hard cap 7 saat

- [ ] **Step 5: deckent_status periyodik kontrol**

Wave geçişlerinde MCP: `mcp__deckent__deckent_status { json: true }`

Phase akışı: `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`

---

### Task 3.2: Wave 1 — Foundation Gate (Task 0 + Task 1)

**Beklenen:** Task 0 (~45 dk) → Task 1 (~20 dk), sequential. Task 1 Task 0'ın bitmesini beklemeli (dependency).

- [ ] **Step 1: Task 0 spawn doğrula**

```bash
cat .tasks/task-138-000.hb 2>&1 | head
docker ps --filter "name=deckent-w-138-000" --format "{{.Names}} {{.Status}}"
```

Expected: w-138-000 container running, HB seq ≥1

- [ ] **Step 2: Task 0 result kontrol (ADR Governance)**

Beklenen süre: ~45 dk. Sonra:
```bash
cat .tasks/task-138-000.result 2>&1 | head -30
```

Expected: `selfAssessment: DONE` or `GO_WITH_TECH_DEBT`, filesChanged içinde `.brain/DECISIONS.md`, `DECKENT.md`, `scripts/adr-validator.mjs`, `src/orchestra/task-builder.ts`

- [ ] **Step 3: ADR format kontrolü (Task 0 çıktısı)**

```bash
grep -c "^\*\*Status:\*\*" .brain/DECISIONS.md
grep "^## ADR-005" -A5 .brain/DECISIONS.md | grep Status
grep "^## ADR-022" .brain/DECISIONS.md | wc -l
grep "^## ADR-036" .brain/DECISIONS.md
grep "@\.brain/DECISIONS" DECKENT.md
```

Expected:
- Status count ≥36 (35 migrate + 1 yeni ADR-036)
- ADR-005 `Status: deprecated`
- ADR-022 count 2
- ADR-036 hit
- DECKENT.md import hit

- [ ] **Step 4: adr-validator.mjs çalıştır**

```bash
npm run lint:adr 2>&1 || node scripts/adr-validator.mjs 2>&1
```

Expected: exit 0, 35+ ADR valid, 33 accepted + 1 deprecated (ADR-005) + 1 superseded (ADR-022 old) + 1 new (ADR-036)

- [ ] **Step 5: Task 1 spawn doğrula (Task 0 sonrası)**

Task 0 DONE olduktan sonra Brain Task 1'i spawn etmeli. Dependency respect kontrolü.

```bash
cat .tasks/task-138-001.hb 2>&1 | head
```

Expected: seq ≥1, spawnedAt Task 0 result yazımından sonra

- [ ] **Step 6: Task 1 result + ADR-035 kontrolü**

Beklenen süre: ~20 dk. Sonra:
```bash
cat .tasks/task-138-001.result 2>&1 | head -30
grep "^## ADR-035" .brain/DECISIONS.md
grep "DECKENT→USER:NOTIFY" .brain/DECISIONS.md  # Sprint 139 prep kanalı
npm run lint:adr 2>&1
```

Expected:
- Task 1 DONE
- ADR-035 başlık hit
- `DECKENT→USER:NOTIFY` kanal code'u tanımlı
- adr-validator.mjs exit 0 (ADR-035 yeni geçer)

- [ ] **Step 7: Wave 1 → Wave 2 watchdog dispatch**

Layer 2 Explore subagent dispatch:
```
Sprint 138 Wave 1 tamamlandı mı? Task 0 (ADR Governance) + Task 1 (ADR-035) 
sonuçları DONE mı? `.brain/DECISIONS.md` 36+ ADR var mı? adr-validator.mjs 
exit 0 mı? Wave 2 Task 2 spawn için hazır mıyız? <200 söz rapor.
```

---

### Task 3.3: Wave 2 — Mimari Core (Task 2 + Task 3)

**Beklenen:** Task 2 (~75 dk) → Task 3 (~120 dk), sequential intra-wave (file collision auditor.ts + sprint-finalizer.ts).

- [ ] **Step 1: Task 2 (Auditor Authority) result**

```bash
cat .tasks/task-138-002.result 2>&1 | head -30
grep -n "tryCodeVerifiedDone" src/monitor/auditor.ts
grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts
grep -n "verifyFunctional" src/monitor/auditor.ts
grep -n "checkADRCompliance" src/monitor/auditor.ts
grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts
```

Expected:
- Task 2 DONE
- auditor.ts: tryCodeVerifiedDone + verifyFunctional + checkADRCompliance hit
- result-evaluator.ts: **miss** (helper taşındı)
- sprint-finalizer.ts: import path update (from `../monitor/auditor.js`)

- [ ] **Step 2: Helper migration regression test**

```bash
npx vitest run tests/monitor/auditor.test.ts tests/orchestra/result-evaluator.test.ts tests/orchestra/sprint-finalizer.test.ts --reporter=basic 2>&1 | tail -10
```

Expected: 0 fail, Sprint 137 meta-dogfood pattern hâlâ çalışıyor

- [ ] **Step 3: Task 3 (Event Stream + Collision) spawn doğrula**

Task 2 DONE sonrası Brain Task 3 spawn etmeli (Dependencies: 138-002). Wave 2 intra-sequential doğrulaması.

```bash
cat .tasks/task-138-003.hb 2>&1 | head
```

Expected: seq ≥1

- [ ] **Step 4: Task 3 result + Event Stream + File Lock kontrolü**

Beklenen süre: ~120 dk (high effort). Sonra:
```bash
cat .tasks/task-138-003.result 2>&1 | head -30
ls src/orchestra/event-stream.ts
wc -l src/core/file-lock.ts
grep -n "detectScopeCollisions" src/orchestra/sprint-spawner.ts
grep -n "acquireLock" src/orchestra/sprint-spawner.ts src/core/file-lock.ts src/agents/worker.ts
```

Expected:
- Task 3 DONE
- event-stream.ts mevcut (yeni dosya)
- file-lock.ts ≥150 LoC (30'dan büyüdü)
- detectScopeCollisions sprint-spawner.ts'te hit
- acquireLock: core'da export, spawner+worker'dan import

- [ ] **Step 5: Event stream runtime kontrol (ilk canlı kanıt)**

```bash
ls .deckent/sprint-138-events.jsonl 2>&1
wc -l .deckent/sprint-138-events.jsonl 2>&1
head -5 .deckent/sprint-138-events.jsonl 2>&1
```

Expected:
- Dosya mevcut
- ≥10 line (Task 2+3 event'leri yazıldı)
- Format: `{timestamp, sequence, protocol_version, source, target, channel, payload}`

- [ ] **Step 6: Wave 2 → Wave 3 watchdog dispatch**

Layer 2 Explore subagent:
```
Sprint 138 Wave 2 tamamlandı mı? Task 2 (Auditor Authority) helper migration 
regression-free mi? Task 3 (Event Stream + Collision) event-stream.ts + 
file-lock.ts real implementation hazır mı? .deckent/sprint-138-events.jsonl 
runtime oluştu mu? Sprint 137 tryCodeVerifiedDone pattern hâlâ çalışıyor mu? 
Wave 3 3-parallel için hazır mıyız? <200 söz rapor.
```

---

### Task 3.4: Wave 3 — Recovery + Vizyon Batch 1 (Task 4 + 5 + 8)

**Beklenen:** 3 worker paralel (Task 4 + 5 + 8), ~60 dk wall time, max_workers=3 dolu.

**Kritik meta-dogfood beklentisi:** Task 5 (`sprint-finalizer.ts` modify) ile Task 6 (`sprint-finalizer.ts` modify) scope collision var. Brain'in `detectScopeCollisions()` (Task 3 output) bu collision'ı yakalayıp Task 6'yı **Wave 3'te spawn etmemeli**, Wave 4'e bırakmalı. Eğer canlı çalışıyorsa Sprint 138 ikinci meta-dogfood kanıt.

- [ ] **Step 1: Wave 3 spawn doğrula (3 worker paralel)**

```bash
docker ps --filter "name=deckent-w-138" --format "{{.Names}} {{.Status}}"
ls .tasks/task-138-{004,005,008}.hb 2>&1
```

Expected:
- 3 worker running (w-138-004, w-138-005, w-138-008)
- **Task 6 henüz spawn olmamış** (collision detection canlı ise!)
- 3 HB dosyası mevcut

- [ ] **Step 2: Collision detection canlı kanıt kontrol**

```bash
grep "SCOPE_COLLISION_DETECTED" .deckent/sprint-138-events.jsonl 2>&1
```

Expected:
- **Task 5 ↔ Task 6 collision event mevcut olmalı** (Sprint 138 ikinci meta-dogfood ilk canlı kanıtı)
- Eğer miss → collision detection canlı değil, Task 3 "kod var" ama runtime fail, Sprint 139 debt

- [ ] **Step 3: Task 4 (Test Restoration) result**

```bash
cat .tasks/task-138-004.result 2>&1 | head -30
npx vitest run --reporter=basic 2>&1 | tail -5
```

Expected:
- Task 4 DONE
- vitest: 0 fail, ≥12721 pass (Sprint 137 63 fail → Sprint 138 0)

- [ ] **Step 4: Task 5 (Runtime Wire) result + runtime artifact kontrol**

```bash
cat .tasks/task-138-005.result 2>&1 | head -30
ls .deckent/sprint-138-gate.json docs/audits/sprint-138/load-test-report.md 2>&1
wc -l .deckent/sprint-138-metrics.jsonl 2>&1
```

Expected (runtime wire fix başarılı ise):
- Task 5 DONE
- gate.json runtime mevcut
- load-test-report.md runtime mevcut
- metrics.jsonl ≥30 satır
- **3 Sprint üst üste runtime wire fail pattern'ı Sprint 138'de kırıldı**

- [ ] **Step 5: Task 8 (Resume Capability MVP) result**

```bash
cat .tasks/task-138-008.result 2>&1 | head -30
ls src/orchestra/sprint-checkpoint.ts src/cli/commands/resume.ts 2>&1
ls .deckent/sprint-138-checkpoint.json 2>&1
```

Expected:
- Task 8 DONE
- sprint-checkpoint.ts + resume.ts yeni dosyalar
- sprint-138-checkpoint.json runtime oluştu (en az 1 checkpoint)

- [ ] **Step 6: Wave 3 → Wave 4 watchdog dispatch**

```
Sprint 138 Wave 3 tamamlandı mı? Task 4 vitest 0 fail? Task 5 gate.json + 
load-report + metrics runtime? Task 8 checkpoint runtime? 
Meta-dogfood canlı kanıt: SCOPE_COLLISION_DETECTED event'i var mı? 
Wave 4 için hazır mıyız? <200 söz rapor.
```

---

### Task 3.5: Wave 4 — Recovery + Vizyon Batch 2 (Task 6 + 7 + 9)

**Beklenen:** 3 worker paralel, ~60 dk. Task 6 Task 5'in sprint-finalizer.ts üzerine (sequential cross-wave), Task 7 Task 2 Auditor Authority API kullanır, Task 9 opsiyonel.

- [ ] **Step 1: Wave 4 spawn (Task 5 bittikten sonra Task 6 spawn olmalı)**

```bash
docker ps --filter "name=deckent-w-138" --format "{{.Names}} {{.Status}}"
ls .tasks/task-138-{006,007,009}.hb 2>&1
```

Expected:
- w-138-006 + w-138-007 + w-138-009 (eğer opsiyonel active)
- Task 6 HB mevcut (collision detection sonrası Wave 4'e kaldı)

- [ ] **Step 2: Task 6 (Auto-Archive Fix) result**

```bash
cat .tasks/task-138-006.result 2>&1 | head -30
```

Expected: Task 6 DONE, sprint-finalizer.ts archive hook fix

- [ ] **Step 3: Task 7 (Worker Honest v2) result**

```bash
cat .tasks/task-138-007.result 2>&1 | head -30
grep "Honest Self-Assessment" src/orchestra/task-builder.ts
grep "verify-delta" src/agents/worker.ts
```

Expected:
- Task 7 DONE
- task-builder.ts: Honest Self-Assessment instruction hit
- worker.ts: verify-delta marker hit

- [ ] **Step 4: Task 9 (MCP/CLI Parity) opsiyonel kontrol**

```bash
ls .tasks/task-138-009.result 2>&1
ls docs/audits/sprint-138/mcp-cli-parity-report.md 2>&1
```

Expected (kapasite kaldıysa): DONE + rapor var. Değilse: Sprint 139 debt.

- [ ] **Step 5: Brain finalize + auto-archive kontrolü**

Brain otomatik EVALUATE → RETRO → DECAY → CLEANUP. Manuel müdahale gerekmez.

```bash
ls .brain/archive/DIRECTIVES-sprint-138.md .brain/sprints/sprint-138.md 2>&1
head -5 DIRECTIVES.md
```

Expected (Task 6 auto-archive fix başarılı ise):
- 2 archive dosyası otomatik oluştu
- DIRECTIVES.md Sprint 139 template'e otomatik reset (manuel değil — Sprint 137'deki regression fix'lendi)

- [ ] **Step 6: Watchdog cleanup**

Background shell watchdog bash process kill et (KillShell tool).

---

## Phase 4: Layer 3 Verification Pipeline

### Task 4.1: 17-Criterion Scoring + Architectural Pivot Evidence

**Files:**
- Create: `.deckent/sprint-138-layer3-scorecard.md`

- [ ] **Step 1: tsc + vitest + dashboard (Layer 2)**

```bash
npx tsc --noEmit 2>&1 | tail -3
```

Expected: 0 errors

```bash
npx vitest run --reporter=basic 2>&1 | tail -5
```

Expected: 0 fail, ≥12721 pass (Task 4 kanıtı)

```bash
npx vitest run --config src/dashboard/vitest.config.ts --reporter=basic 2>&1 | tail -5
```

Expected: 0 fail, 413 pass

- [ ] **Step 2: Per-task physical code grep (10 task)**

```bash
# Task 0: ADR Governance
grep -c "^\*\*Status:\*\*" .brain/DECISIONS.md  # ≥36
grep "@\.brain/DECISIONS" DECKENT.md  # 1 hit
ls scripts/adr-validator.mjs
npm run lint:adr  # exit 0
grep "^## ADR-036" .brain/DECISIONS.md  # hit

# Task 1: ADR-035
grep "^## ADR-035" .brain/DECISIONS.md  # hit
grep "DECKENT→USER:NOTIFY" .brain/DECISIONS.md  # hit

# Task 2: Auditor Authority
grep -n "tryCodeVerifiedDone" src/monitor/auditor.ts  # hit (migration)
grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts  # miss
grep -n "verifyFunctional" src/monitor/auditor.ts  # hit
grep -n "checkADRCompliance" src/monitor/auditor.ts  # hit

# Task 3: Event Stream + Collision
ls src/orchestra/event-stream.ts
wc -l src/core/file-lock.ts  # ≥150
grep -n "detectScopeCollisions" src/orchestra/sprint-spawner.ts  # hit
ls .deckent/sprint-138-events.jsonl  # runtime
wc -l .deckent/sprint-138-events.jsonl  # ≥50
grep "SCOPE_COLLISION_DETECTED" .deckent/sprint-138-events.jsonl  # hit (meta-dogfood #2)
ls .locks/  # Sprint 138 sırasında dolu olmuş olmalı (runtime)

# Task 4: Test Restoration
npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests" | tail -3
# Expected: 512 passed, 0 failed

# Task 5: Runtime Wire
ls .deckent/sprint-138-gate.json docs/audits/sprint-138/load-test-report.md
wc -l .deckent/sprint-138-metrics.jsonl  # ≥30

# Task 6: Auto-Archive
ls .brain/archive/DIRECTIVES-sprint-138.md
head -5 DIRECTIVES.md  # Sprint 139 template

# Task 7: Worker Honest v2
grep "Honest Self-Assessment" src/orchestra/task-builder.ts  # hit
grep "verify-delta" src/agents/worker.ts  # hit
# Meta-dogfood #1 kanıt:
grep -l "CODE_VERIFIED_PARTIAL\|DONE_FUNCTIONAL_DOWNGRADE" .tasks/task-138-*.result  # en az 1 hit

# Task 8: Resume Capability
ls src/orchestra/sprint-checkpoint.ts src/cli/commands/resume.ts
ls .deckent/sprint-138-checkpoint.json  # runtime

# Task 9 (opsiyonel)
ls docs/audits/sprint-138/mcp-cli-parity-report.md 2>&1
```

- [ ] **Step 3: Triple dogfood artifacts (Layer 4)**

```bash
ls .deckent/sprint-138-gate.json
cat .deckent/sprint-138-gate.json | head -20  # overallGate check
ls docs/audits/sprint-138/load-test-report.md
wc -l .deckent/sprint-138-metrics.jsonl
```

Expected:
- gate.json: `overallGate === "PASS"` or `"WARNING"`
- load-report.md mevcut + content var
- metrics.jsonl ≥50 satır

- [ ] **Step 4: Vision regression audit (Layer 5)**

```bash
grep -E "saas|cloud-hosted|paywall|enterprise edition" $(git diff --name-only HEAD~5..HEAD) 2>&1
```

Expected: 0 hit (clean)

```bash
git diff HEAD~5..HEAD -- .brain/DECISIONS.md docs/vision/roadmap.md | head -50
```

Expected: ADR-033 + ADR-034 değişmedi, roadmap.md immutable. Sadece yeni ADR-035 + ADR-036 eklendi + Status field migration.

- [ ] **Step 5: Scope compliance**

```bash
git diff --stat HEAD~5..HEAD | tail -3
```

Expected: declared scope dışında dosya yok (sadece src/orchestra/, src/monitor/, src/core/, src/agents/, src/cli/commands/, tests/, .brain/DECISIONS.md, DECKENT.md, .claude/rules/, scripts/, package.json, docs/audits/sprint-138/, .deckent/agents/ + skills/ auto-stats)

- [ ] **Step 6: Auto-archive canlı**

```bash
ls .brain/archive/DIRECTIVES-sprint-138.md .brain/sprints/sprint-138.md
head -5 DIRECTIVES.md
```

Expected (Task 6 başarılı ise):
- 2 archive dosyası **otomatik**
- DIRECTIVES.md Sprint 139 template (manuel değil)

### Task 4.2: Scorecard Yaz

**Files:**
- Create: `.deckent/sprint-138-layer3-scorecard.md`

- [ ] **Step 1: Sprint 137 parity template ile scorecard yaz**

Write tool. İçerik iskeleti:

```markdown
# Sprint 138 Layer 3 Scorecard — Architectural Pivot + Verification Protocol Foundation

**Date:** 2026-04-14 (or later if execution spans days)
**Verifier:** Claude Opus 4.6 (1M context)
**Reference:** docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md Section 4

## Execution Summary

| Metric | Sprint 138 | Sprint 137 | Delta |
|--------|-----------|-----------|-------|
| Duration | [DOLDUR] | 35m 52s | [DOLDUR] |
| Coordinator crash | 0 | 0 | unchanged |
| Manual recovery | 0 | 0 (minor) | cleaner |
| Auto-archive | [DOLDUR] | PARTIAL | bounce target |
| Task code rate | 10/10 | 6/6 | parity |
| Brain label | [DOLDUR] | 5+1+0 | [DOLDUR] |
| tsc | 0 | 0 | unchanged |
| vitest | [DOLDUR] | 10F/63T | 0 target |
| Events.jsonl | [DOLDUR] | N/A | new axis |

## Per-Task Physical Code Verification (10 tasks)

[10-row tablo, her task için Brain label + Physical evidence + Status]

## 17-Criterion Scoring

### Layer 1 (Self-Eval): [N]/3
### Layer 2 (Technical): [N]/3
### Layer 3 (Manual): [N]/3
### Layer 4 (Triple Dogfooding): [N]/3
### Layer 5 (Vision): 4/4 (target parity)
### Layer 6 (Readiness): [N]/1

**TOTAL: [N]/17**

**Honest label:** [DOLDUR — clean GO veya GO_WITH_TECH_DEBT]
**Readiness:** [weighted hesap]

## Architectural Pivot Evidence (Ayrı Section, 17-criterion'a girmez)

### Deliverables (6)
1. ADR Governance Integration — Task 0
2. ADR-035 Verification Protocol Standard — Task 1
3. ADR-036 ADR Governance Standard (self-referential) — Task 0 Alt-iş E
4. Auditor Authority Extension — Task 2
5. Event Stream + Plan-Time Collision Detection — Task 3
6. Worker Honest Assessment Calibration v2 — Task 7
7. Long-Running Sprint Resume Capability MVP — Task 8

### Meta-Dogfood Evidence (canlı kanıtlar)

**#1: Helper functional upgrade canlı**
- Target: En az 1 DONE → TECH_DEBT downgrade (functional check ile)
- Actual: [DOLDUR — kaç task downgrade oldu]
- Kanıt: `.tasks/task-138-*.result` içinde `CODE_VERIFIED_PARTIAL` veya downgrade flag

**#2: Plan-time scope collision detection canlı**
- Target: Task 5 ↔ Task 6 collision Brain tarafından otomatik yakalama
- Actual: [DOLDUR — event'te mevcut mu, Brain Task 6'yı Wave 4'e koydu mu]
- Kanıt: `grep SCOPE_COLLISION_DETECTED .deckent/sprint-138-events.jsonl`

**#3: ADR compliance check canlı (bonus)**
- Target: Pilot ADR (ADR-006) runtime kontrol
- Actual: [DOLDUR]

**Meta-dogfood count:** [N]/3 canlı → [architectural breakthrough or not]

## Sprint 138 Carry-Over Debt for Sprint 139

[Var ise listele]

## Conclusion

[Sprint 138 honest label + readiness + mimari pivot durum + Sprint 139 handoff]
```

- [ ] **Step 2: Scorecard [DOLDUR] alanlarını runtime data ile doldur**

Step 2 adımlarındaki tüm grep + vitest + metrics çıktılarını yerleştir. Readiness weighted hesaplamasını manuel yap (axis tablosu spec Section 11.3).

---

## Phase 5: Living Record + Closing Ceremony

### Task 5.1: FINAL Report Section 20+21 + Inline Updates

**Files:**
- Modify: `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md`

- [ ] **Step 1: Section 1 inline update**

Edit tool — Section 1'e Sprint 138 paragrafı ekle (Sprint 137 paragrafı sonrası):

```markdown
**Sprint 138 Update (2026-04-14):** 10 task planlandı (Architectural Pivot theme), 
[DURATION] execute, [CRASH COUNT] coordinator crash. Theme: "Architectural Pivot — 
Verification Protocol Foundation". Execution parameters: max_workers=3, structured 
planner, docker backend, Phased Hybrid Wave (Wave 1 Foundation Gate → Wave 2 Mimari 
Core → Wave 3-4 Recovery+Vizyon Parallel). Brain final label: [DONE+TD+NOGO] — 
[Architectural Pivot Outcome]. **🏆 Architectural breakthrough:** [describe meta-dogfood 
count + Task 2 helper functional upgrade canlı + Task 3 plan-time collision detection 
canlı Sprint 138 Task 5↔6 otomatik sequentialize]. Major deliverables: Task 0 (ADR 
Governance Integration, 35 ADR MADR v3 migration + ADR-036 self-referential + 
adr-validator.mjs + task-builder.ts ADR injection + DECKENT.md mandatory read), 
Task 1 (ADR-035 Verification Protocol Standard + DECKENT→USER:NOTIFY channel for 
Sprint 139), Task 2 (Auditor Authority Extension — helper migration result-evaluator→auditor, 
3-pipeline verification DONE/TD/NO_GO, verifyFunctional canlı check, checkADRCompliance 
ADR-006 pilot), Task 3 (Event Stream src/orchestra/event-stream.ts + file-lock.ts 30→200 
real implementation + sprint-spawner.ts detectScopeCollisions + conflict-resolver 
pre-emptive), Task 4 (Test restoration 63 → 0), Task 5 (Layer 4 runtime wire forensic 
fix gate.json + load-report + metrics.jsonl runtime restored after 3-sprint fail), 
Task 6 (auto-archive partial regression fix), Task 7 (Worker Honest Assessment v2), 
Task 8 (Long-Running Sprint Resume Capability MVP checkpoint + resume command). 
Layer 3 17-criterion [N]/17 PASS. Readiness ~[R]/5. [N] carry-over debt → Sprint 139.
```

- [ ] **Step 2: Enterprise Score satırı güncelle**

Edit — satırı yeni Sprint 138 skor ile:
```markdown
**Enterprise-Readiness Overall Score: 3.2/5 → 3.6/5 (Sprint 133) → 3.86/5 (Sprint 134) 
→ ~3.93/5 (Sprint 135) → ~3.925/5 (Sprint 136) → ~4.00/5 (Sprint 137) → ~[N]/5 (Sprint 138, [DELTA])**
```

- [ ] **Step 3: Section 6 catch-up note ekle**

Section 6 sonundaki "Sprint 136 + Sprint 137 axis update note" bloğuna Sprint 138 eklenecek:
```markdown
- **Sprint 138:** Bugsuz [DELTA] (vitest 63→0), Gözlemlenebilirlik [DELTA] (event stream 
  + runtime artifact), Ölçeklenebilir [DELTA] (Auditor Authority + Event Stream + Collision 
  Detection + Resume), Product Identity [DELTA] (ADR enforcement kullanıcı-facing), 
  Overall 4.00 → [N] ([DELTA])
```

- [ ] **Step 4: Section 20 NEW append — Sprint 138 Status & Metrics**

Spec'in Section 11 içeriğini genişlet + runtime data. Scorecard'daki tablo + meta-dogfood evidence + comparison Sprint 134-138 trend.

- [ ] **Step 5: Section 21 NEW append — Sprint 138 Retrospective**

What went well, what fell short, Sprint 139 theme recommendation, quotable insights, Sprint 139-147 chain update.

- [ ] **Step 6: Tek commit (living record discipline)**

Section 1 + 6 inline + Section 20 + 21 append AYNI commit (Commit 2). Sprint 134-137 pattern.

### Task 5.2: CLAUDE.md + IDENTITY.md + BETA-TRACKER + BLUEPRINT Optional Sync

**Files:**
- Modify: `CLAUDE.md`, `.deckent/workspace/IDENTITY.md`
- Optional: `BETA-TRACKER.md`, `DECKENT-MASTER-BLUEPRINT.md`

- [ ] **Step 1: CLAUDE.md Sprint Metrics tablosu**

Genelde Brain auto-update eder. Manuel check:
```bash
grep -A10 "## Sprint Metrics" CLAUDE.md
```

Expected: sprint-137 → sprint-138 değişti. Değilse Edit tool ile güncelle.

- [ ] **Step 2: IDENTITY.md sprint counter**

```bash
grep "^Sprint:" .deckent/workspace/IDENTITY.md
```

Expected: `Sprint: sprint-138`. Değilse güncelle.

- [ ] **Step 3: BETA-TRACKER + BLUEPRINT (opsiyonel)**

Sprint 137'de sync yapıldı. Sprint 138'de sprint counter güncellemesi yeterli, tam sync Sprint 139+'a bırakılabilir.

### Task 5.3: 2 Commit Ceremony

- [ ] **Step 1: Commit 1 — feat (source + tests)**

```bash
git add src/orchestra/ src/core/ src/monitor/ src/agents/ src/cli/commands/ \
        tests/ scripts/ package.json \
        .brain/DECISIONS.md DECKENT.md .claude/rules/ \
        .deckent/agents/ .deckent/skills/
git status --short | head -20
```

Expected: src + tests + scripts + ADR + DECKENT.md + rules staged. Doc dosyaları staged değil.

```bash
git commit -m "$(cat <<'EOF'
feat: Sprint 138 — architectural pivot (verification protocol foundation + recovery completion + vizyon foundation)

Sprint 138 Architectural Pivot — Brain↔Auditor↔Worker iletişim standardizasyonu + Sprint 137 recovery completion + vizyon foundation.
10 task, 4 wave (Phased Hybrid), [DURATION] execute, [BRAIN LABEL].

Major deliverables:
- Task 138-000: ADR Governance Integration — 35 ADR MADR v3 migration (Status field), ADR-036 self-referential, DECKENT.md @.brain/DECISIONS.md mandatory read, adr-validator.mjs + lint:adr script, task-builder.ts ADR injection
- Task 138-001: ADR-035 Verification Protocol Standard — 15 kanal code'u v1.0, DECKENT→USER:NOTIFY (Sprint 139 dispatcher prep)
- Task 138-002: Auditor Authority Extension — tryCodeVerifiedDone helper migration (result-evaluator→auditor), 3-pipeline verification (DONE/TD/NO_GO), verifyFunctional vitest run check (Sprint 137 file-existence kısayolu kırıldı), checkADRCompliance pilot 3 ADR
- Task 138-003: Event Stream + Plan-Time Scope Collision Detection — event-stream.ts (append-only JSONL, protocol_version 1.0), file-lock.ts 30→~200 LoC real impl, sprint-spawner.ts detectScopeCollisions + buildCollisionAwareWaves, conflict-resolver pre-emptive
- Task 138-004: Test restoration tam (Sprint 137 carry-over 63 → 0)
- Task 138-005: Layer 4 runtime wire forensic fix — gate.json + load-report.md + metrics.jsonl runtime restored (3-sprint üst üste fail pattern kırıldı)
- Task 138-006: Auto-archive partial regression fix (DIRECTIVES.md otomatik reset)
- Task 138-007: Worker Honest Assessment Calibration v2 — task-builder.ts baseline diff instruction + worker.ts verify-delta + result-evaluator TECH_DEBT downgrade logic
- Task 138-008: Long-Running Sprint Resume Capability MVP — sprint-checkpoint.ts + resume command, 100-task Sprint 145 foundation

🏆 META-DOGFOOD 2x CANLI KANIT (Sprint 138 breakthrough):
1. Helper functional upgrade — Task 2 verifyFunctional Sprint 138 execution'da [N] task'ın DONE → TECH_DEBT downgrade retrospektif relabel yaptı (Sprint 137 file-existence kısayolu kırıldı)
2. Plan-time scope collision detection — Sprint 138 Task 5 ↔ Task 6 sprint-finalizer.ts çakışması Brain tarafından otomatik yakalandı, Task 6 Wave 4'e sequentialize edildi (manuel wave barrier ihtiyacı kalktı)

vitest: 10 files / 63 fail → 0 fail / ≥12721 pass
tsc: 0 error
Layer 3: [N]/17 ([DELTA] vs Sprint 137 9/17)
Readiness: ~[R]/5 ([DELTA] vs Sprint 137 4.00)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Commit 2 — docs (closing ceremony)**

```bash
git add docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md \
        docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md \
        .deckent/sprint-138-layer3-scorecard.md \
        .brain/archive/DIRECTIVES-sprint-138.md \
        .brain/MEMORY.md .brain/RETRO.md .brain/PROJECT-IDENTITY.md .brain/ERRORS.md \
        CLAUDE.md .deckent/workspace/IDENTITY.md DIRECTIVES.md
git status --short | head -15
```

```bash
git commit -m "$(cat <<'EOF'
docs: Sprint 138 closing ceremony — FINAL report Section 1+6 inline + Section 20+21 append + scorecard + plan + auto-archive

Sprint 138 closing ceremony (living record discipline):

FINAL-EXECUTIVE-REPORT.md updates:
- Section 1 inline: Sprint 138 paragrafı (architectural pivot + meta-dogfood 2x canlı kanıt)
- Section 1 verdict satırı: Sprint 138 MODERATE-PRODUCT (architectural pivot breakthrough)
- Section 1 Enterprise Score: 4.00 → [N]
- Section 6 catch-up note: Sprint 138 axis hareketleri
- Section 20 NEW (Sprint 138 Status & Metrics): execution summary, 17-criterion, per-task results, Architectural Pivot Evidence, Sprint 134-138 trend
- Section 21 NEW (Sprint 138 Retrospective): wins/losses, Sprint 139 theme recommendation (Multi-Provider + Notification Dispatcher), quotable insights, Sprint 139-147 chain update

New artifacts:
- .deckent/sprint-138-layer3-scorecard.md (Sprint 137 parity, 17-criterion + Architectural Pivot Evidence section)
- docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md (this plan)
- .brain/archive/DIRECTIVES-sprint-138.md (auto-archive Task 6 fix sonucu)
- DIRECTIVES.md Sprint 139 template (otomatik reset)

Brain auto-update (Sprint 138 RETRO phase):
- .brain/MEMORY.md (Sprint 138 Learnings)
- .brain/RETRO.md, .brain/PROJECT-IDENTITY.md, .brain/ERRORS.md
- CLAUDE.md Sprint Metrics (sprint-138)
- .deckent/workspace/IDENTITY.md (sprint counter 137 → 138)

Living record discipline (feedback_living_record_sync.md): Section 1 inline + Section 20+21 append AYNI commit.

Sprint 138 commits:
1. [HASH] — feat: Sprint 138 architectural pivot
2. (this) — docs: Sprint 138 closing ceremony

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Git log doğrulama**

```bash
git log --oneline -8
```

Expected:
- `[hash] docs: Sprint 138 closing ceremony...`
- `[hash] feat: Sprint 138 architectural pivot...`
- `c9c69f1 docs: Sprint 138 design spec...`
- `832ac4e test: Sprint 137 memory-decay...`
- `0d026b2 docs: Sprint 137 closing ceremony...`
- `78e3ad5 feat: Sprint 137 recovery sprint...`
- `96f5e49 docs: Sprint 137 design spec...`

---

## Phase 6: Memory Sync + Sprint 139 Preflight

### Task 6.1: Auto Memory Updates

**Files:**
- Create: `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint138_completed.md`
- Modify: `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint139_preflight.md` (supersede old — Sprint 139 revised theme)
- Modify: `~/.claude/projects/-home-alperen-deckent-dev/memory/MEMORY.md` (index)

- [ ] **Step 1: project_sprint138_completed.md yaz**

Write tool — Sprint 138 closing snapshot:
- Final label (clean GO veya GO_WITH_TECH_DEBT)
- Layer 3 score (N/17) — target 14+
- Readiness (weighted) — target 4.15+
- Architectural Pivot deliverables (6)
- Meta-dogfood 2x canlı kanıt (Helper functional + Plan-time collision)
- Büyük kazanımlar + sert regresyonlar (varsa)
- Sprint 139 P0 roadmap (Notification Dispatcher + Multi-Provider foundation)

- [ ] **Step 2: project_sprint139_preflight.md yaz (revised, supersede old)**

Write tool — Sprint 139 theme revised:
- **Multi-Provider + Multi-Platform Foundation + Notification Dispatcher** (Sprint 138 carry-over integration)
- Task candidate list: Notification Dispatcher (CLI + MCP), Codex + Gemini sim test, macOS dogfood, Windows spike, Sprint 138 carry-over debt
- Sprint 138 Task 1 ADR-035 DECKENT→USER:NOTIFY kanal protokol referansı
- Sprint 138 Task 3 event stream foundation (Sprint 139 dispatcher hook point)
- Sprint 138 Task 8 resume capability (Sprint 140 50-task test foundation)

- [ ] **Step 3: MEMORY.md index update**

Edit — 2 yeni entry ekle, eski `project_sprint138_preflight.md` SUPERSEDED işaretlendiği için silme/güncelle:
```
- [project_sprint138_completed.md](project_sprint138_completed.md) — Sprint 138 closing snapshot
- [project_sprint139_preflight.md](project_sprint139_preflight.md) — REVISED: Multi-Provider + Notification Dispatcher + Sprint 138 carry-over
```

- [ ] **Step 4: Eski memory'leri review**

- `project_sprint138_architectural_pivot.md` — Sprint 138 sonrası HISTORICAL işaretlendi mi?
- `project_sprint138_debt_prompt_traceability.md` — Sprint 139 veya 140'a taşındı mı?
- `feedback_worker_honest_assessment.md` — Sprint 138 Task 7 ile kısmen çözüldü mü? Memory update.

### Task 6.2: deckent_cleanup

- [ ] **Step 1: Sprint 138 cleanup**

MCP: `mcp__deckent__deckent_cleanup`
Parameters: `{ root: "/home/alperen/deckent-dev" }`

Expected: task dosyaları arşivlenir, locks release, sprint complete. **`.tasks/*.log` + `.tasks/*.timeout` de temizlenmeli** (Sprint 137 orphan kalıntı sorunu).

---

## Self-Review Checklist

Plan'ı yazdıktan sonra spec'e karşı kontrol et:

**1. Spec coverage:**
- [x] Spec Section 5 (Architecture Wave) → Phase 3 Task 3.1-3.5
- [x] Spec Section 6 (10 task) → Phase 1 Task 1.1 (DIRECTIVES) + Phase 3
- [x] Spec Section 4 (17-criterion) → Phase 4 Task 4.1
- [x] Spec Section 8 (Testing & 3-layer monitoring) → Phase 3 Task 3.1 Step 3
- [x] Spec Section 11 (Success criteria) → Phase 4 Task 4.1
- [x] Spec Section 11.2 (Architectural Pivot Evidence) → Phase 4 Task 4.2 Scorecard
- [x] Spec Section 12 (Sprint 139 preview) → Phase 6 Task 6.1 Step 2

**2. Placeholder scan:** `[DOLDUR]` sadece runtime data (scorecard + commit messages), structural placeholder değil — kabul.

**3. Type/method consistency:**
- `tryCodeVerifiedDone` (Task 0, 2, 4.1)
- `verifyFunctional` (Task 2, 4.1)
- `checkADRCompliance` (Task 2, 4.1)
- `detectScopeCollisions` (Task 3, 4.1)
- `buildCollisionAwareWaves` (Task 3)
- `writeEvent` (Task 3)
- `acquireLock` (Task 3, 4.1)
- `ADR-035`, `ADR-036`, `DECKENT→USER:NOTIFY` (Task 0, 1, 4.1)
- `CODE_VERIFIED_DONE` vs `CODE_VERIFIED_PARTIAL` (Sprint 137 vs Sprint 138 yeni)

**4. Plan ↔ Spec parity:** 6 phase, spec 12 section. Plan executable, spec design rationale. Map edilmiş.

---

## Appendix A — DIRECTIVES.md Sprint 138 Template (Phase 1 Task 1.1 Step 2 için)

**Not:** Bu appendix çok uzun olduğu için plan yazımında Phase 1 Step 2'de koordinatör manuel yazım yapar. Template yapısı:

```markdown
# DIRECTIVES — Sprint 138: Architectural Pivot (Verification Protocol Foundation)

> **Theme:** Architectural Pivot — Brain↔Auditor↔Worker iletişim standardizasyonu.
> **Hedef:** Layer 3 9/17 → ≥14/17, readiness ≥4.15, vitest 63 → 0, mimari pivot breakthrough.

## Referanslar
- Design spec: docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md
- Plan: docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md
- Sprint 137 arşivi: .brain/archive/DIRECTIVES-sprint-137.md
- Sprint 137 scorecard: .deckent/sprint-137-layer3-scorecard.md

## Goal: Brain↔Auditor↔Worker iletişimini standardize, doğrula, zorla. Mimari pivot + Sprint 137 recovery completion + vizyon foundation.

---

## Task 0: ADR Governance Integration
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Skills: typescript-expert, documentation-writer
- Files: .brain/DECISIONS.md, DECKENT.md, .claude/rules/brain.md, .claude/rules/worker-default.md, src/orchestra/task-builder.ts, scripts/adr-validator.mjs, tests/scripts/adr-validator.test.ts, tests/orchestra/task-builder.test.ts
- Scope: .brain/, DECKENT.md, .claude/rules/, scripts/, src/orchestra/, tests/scripts/, tests/orchestra/

### Description
[Spec Section 6 Task 0 tam içeriği — 4 alt-iş A/B/C/D/E, MADR v3 hibrit, ADR-005 deprecated, ADR-022 duplicate temizle, ADR-036 self-referential, DECKENT.md only import, adr-validator.mjs, SDL/ADR split]

### Task 1-9 aynı pattern (spec Section 6'dan birebir)
```

**Kritik notlar DIRECTIVES yazımı için:**
- Her task için `Dependencies:` satırı (Task 0 hariç hepsinde)
- Priority karışımı: 5 CRITICAL + 4 HIGH + 1 NORMAL
- Task description'larda **canlı pre-flight bulguları** (file-lock.ts 30 LoC placeholder, tryCodeVerifiedDone konumu, helper call path sat 493)
- Worker pre-flight komutları (Task 6 debt-manager.ts grep pattern'ı gibi)
- Kanıt + Test bölümleri spec'teki kadar detaylı

---

## Appendix B — Monitoring & Recovery Playbook

**Wave 1-2 sırasında manuel wave barrier:** Task 3 henüz canlı değil, Brain 10 task'ı kendi scheduling'iyle spawn eder. `.tasks/task-138-*.json` dependencies field'ı mevcut, Brain respect etmeli. Eğer etmezse (Sprint 137 canlı kanıt: parser var enforcement yok), manuel intervention gerekmez — Brain max_workers=3 slot-based scheduling zaten collision'ı indirect yönetir.

**Wave 3-4 sırasında otomatik collision detection:** Task 3 bittiğinde yeni spawn'lanan worker'lar `detectScopeCollisions()` ile korunur. Sprint 138 Task 5 ↔ Task 6 collision'ı canlı dogfood hedefi.

**Spurious NO_GO recovery:** `tryCodeVerifiedDone` helper Task 2'de auditor'a taşındı, hâlâ çalışıyor (integration test). Docker HB shutdown bug pattern tekrar ederse helper retrospektif DONE relabel.

**Coordinator crash recovery:** Task 8 Resume Capability MVP canlı → `npx deckent resume sprint-138`. Sprint 135+136+137 zero crash pattern devam ederse hiç gerekmez.

**Dashboard parse error recovery (Sprint 137 kanıt):** `.deckent/.dashboard` file yoksa Brain auditor loop kırılır. Sprint 138 Task 1'in 137-001 fix'ini uygulayan kod bu sorunu çözdü mü kontrol. Eğer Sprint 138'de hâlâ olursa, `sprint-spawner.ts:178` ensureDashboard() helper Sprint 138 scope'una ekleyebilir misin?

---

## Appendix C — Success Criteria Hızlı Kontrol

Sprint 138 sonunda Phase 4 sırasında 10 checkbox hızlı tarama:

1. [ ] vitest 0 fail, ≥12721 pass
2. [ ] tsc 0 error
3. [ ] ADR Governance canlı (grep + lint:adr exit 0)
4. [ ] Auditor Authority migration + Sprint 137 regression yok
5. [ ] Event Stream foundation (events.jsonl ≥50 line)
6. [ ] Layer 4 runtime wire (gate.json + load-report + metrics.jsonl runtime)
7. [ ] Auto-archive otomatik (DIRECTIVES.md Sprint 139 reset)
8. [ ] Worker Honest v2 canlı (prompt + en az 1 downgrade)
9. [ ] Resume Capability MVP (checkpoint runtime)
10. [ ] Layer 3 scorecard ≥14/17

**Clean GO eşiği:** 8/10 (Sprint 137: 5/10 gerçek)

**Architectural Pivot Evidence (bonus):**
- Meta-dogfood #1: Helper functional upgrade canlı (≥1 downgrade)
- Meta-dogfood #2: Plan-time collision canlı (Task 5↔6 otomatik)
- Meta-dogfood #3 bonus: ADR compliance runtime

En az 2/3 → "architectural breakthrough" scorecard notu.
