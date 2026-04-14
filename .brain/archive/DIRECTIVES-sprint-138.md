# DIRECTIVES — Sprint 138: Architectural Pivot — Verification Protocol Foundation

> Sprint 138 mimari pivot: Brain ↔ Auditor ↔ Worker iletişim standardizasyonu (ADR-035 + Auditor Authority + Event Stream + Plan-Time Collision Detection) + Sprint 137 recovery completion (test restoration + Layer 4 wire + auto-archive + worker honest v2) + vizyon foundation (Long-running resume MVP + ADR Governance).

## Referanslar
- Spec: `docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md` (commit `c9c69f1`, 1290 satır)
- Plan: `docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md` (commit `58ddadd`, 1150 satır)
- Sprint 137 scorecard: `.deckent/sprint-137-layer3-scorecard.md` (9/17 baseline)
- Sprint 137 archive: `.brain/archive/DIRECTIVES-sprint-137.md`
- Sprint 137 retrospektif: `.brain/RETRO.md`
- Brain memory: `.brain/MEMORY.md`

## Goal: Brain ↔ Auditor ↔ Worker iletişimini standardize etmek (ADR-035 protocol), auditor'a verification yetkileri vermek (3-pipeline), structured event stream + plan-time scope collision detection eklemek, Sprint 137 11 carry-over debt'ini temizlemek, long-running sprint zemini atmak. Hedef: Layer 3 9/17 → ≥14/17, readiness 4.00 → ≥4.15, vitest 53 → 0, clean GO.

## Pre-flight Bulguları (2026-04-14)
- **vitest baseline:** 8 fail file / 53 fail tests / 12652 pass (Plan'da yazılan 63'ten +10 daha iyi)
- **`.brain/DECISIONS.md`:** 702 satır, 35 ADR başlık, **7 Status alanı mevcut** (Plan'da yazılan 0'dan +7 — Sprint 130-131 ADR'lerinde Status zaten var, Task 0 idempotent kalmalı)
- **`src/core/file-lock.ts`:** 30 satır, observability facade (`claimTaskLock` + `acquireLock` re-export), real implementation **YOK** — Task 3 ~200 LoC genişletecek
- **`src/orchestra/result-evaluator.ts`:** 1033 satır, `tryCodeVerifiedDone` helper satır **729**'da export edilmiş, `sprint-finalizer.ts:493`'ten çağrılıyor — Task 2 helper'ı `auditor.ts`'e taşıyacak
- **`src/monitor/auditor.ts`:** 650 satır (Task 2 hedef ~950)
- **`src/orchestra/sprint-finalizer.ts`:** 957 satır (Task 5+6 modify hedef)
- **`src/agents/worker.ts`:** 1206 satır (Task 7 verify loop sertleştirme)
- **`src/orchestra/sprint-spawner.ts`:** 316 satır (Task 3 collision detection hedef)
- **`.locks/` dir:** boş (runtime'da hiç lock alınmıyor — Task 3 dolduracak)
- **`.tasks/`:** Sprint 137 28 orphan dosya `.brain/archive/sprint-137-tasks/`'a manuel taşındı, `sprint-state.json` reset (Sprint 138 başlamaya hazır)

---

## Task 1: ADR Governance Integration
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: yok
- Skills: typescript-expert, documentation-writer
- Files: .brain/DECISIONS.md, DECKENT.md, .claude/rules/brain.md, .claude/rules/worker-default.md, src/orchestra/task-builder.ts, scripts/adr-validator.mjs, tests/scripts/adr-validator.test.ts, tests/orchestra/task-builder.test.ts
- Scope: .brain/, DECKENT.md, .claude/rules/, scripts/, src/orchestra/task-builder.ts, tests/scripts/, tests/orchestra/task-builder.test.ts

### Description

Sprint 138'in **gerçek başlangıcı**. ADR governance kullanıcı-facing product feature olur (açık repoya geçtiğimizde kullanıcılar kendi `.brain/DECISIONS.md` yazıp Deckent'tan zorla uygulatmayı bekler). 5 alt-iş:

**Alt-iş A: ADR Format Audit & Migration (MADR v3 hibrit)**
35 ADR'ye `**Status:**` alanı ekle (Title sonrası, Decision öncesi). Default `accepted`. Mevcut 7 Status alanı zaten var (Sprint 130-131), idempotent (script Status zaten varsa dokunmaz). Explicit exception:
- ADR-005 "Synchronous I/O" → `Status: deprecated` + Sprint 132 CRITICAL #1 notu
- ADR-022 ilk entry (sat ~151) → `Status: superseded`, `Superseded by: ADR-022 v2 (Sprint 085)`
- ADR-022 ikinci entry (sat ~218) → `Status: accepted`, `Supersedes: ADR-022 v1 (Sprint 067)`

MADR v3 hibrit format: zorunlu (Title, Status, Decision, Context, Consequence) + opsiyonel serbest (Alternatives, Cost, Security, Superseded by, References).

**Alt-iş B: Mandatory Read Wiring (DECKENT.md only — ADR-013 pattern)**
`DECKENT.md`'ye `## Mandatory Architecture Rules\n@.brain/DECISIONS.md` ekle. CLAUDE.md'ye **EKLEME** (ADR-013 DECKENT.md Adapter Pattern: provider-specific dosyalar zaten DECKENT.md'yi import eder, multi-provider consistency).

`.claude/rules/brain.md` + `.claude/rules/worker-default.md` ADR mandatory read + violation rule ekle (NO_GO + yeni ADR proposal).

`src/orchestra/task-builder.ts` worker prompt template'e ADR content injection (`readFileSync('.brain/DECISIONS.md')` → prompt).

**Alt-iş C: Parser + Validator Script (`scripts/adr-validator.mjs` ~150-200 LoC)**
Markdown parse, structure validation, status enum check, duplicate ID detect, status transition. Exit codes: 0/1/2. `package.json` `lint:adr` script ekle.

**Alt-iş D: ADR Naming Split**
- `.brain/DECISIONS.md` = ADR (Architecture Decision Record, project governance, MADR v3, mandatory)
- `.deckent/decisions/*.json` = SDL (Sprint Decision Log, tactical, audit trail, opsiyonel)
DECKENT.md'ye kısa açıklama ekle.

**Alt-iş E: ADR-036 Self-Referential**
Task 0'ın kendisini dokümante eden yeni ADR (kullanıcılar kendi projelerinde ADR workflow'unu anlamak için). Meta-doğrulama: ADR-036 yazıldıktan sonra `npm run lint:adr` ADR-036'yı onaylamalı (kendi validator'ından geçer).

**Kanıt:**
- `grep -c "^\*\*Status:\*\*" .brain/DECISIONS.md` → ≥36 (35 migrate + 1 yeni ADR-036)
- `grep "^## ADR-005" -A5 .brain/DECISIONS.md` → `Status: deprecated`
- `grep "^## ADR-022" .brain/DECISIONS.md | wc -l` → 2
- `grep "^## ADR-036" .brain/DECISIONS.md` → hit
- `grep "@\.brain/DECISIONS" DECKENT.md` → 1 hit
- `npm run lint:adr` → exit 0
- `npx vitest run tests/scripts/adr-validator.test.ts tests/orchestra/task-builder.test.ts` → 0 fail

**Test:** 6+ test (validator parse, missing field, invalid status, duplicate ID, task-builder ADR injection, ADR-036 self-pass)

---

## Task 2: ADR-035 Verification Protocol Standard
- Model: sonnet
- Effort: low
- Priority: CRITICAL
- Dependencies: 138-001
- Skills: documentation-writer
- Files: .brain/DECISIONS.md
- Scope: .brain/

### Description

ADR-035 Brain ↔ Worker ↔ Auditor mesaj protokolü için tek kaynak. **Salt dokümantasyon task'ı** — kod değişikliği yok, Task 3+4 bu ADR'yi implement eder. Task 1'in MADR v3 hibrit format'ını **kullan**.

**ADR-035 içeriği:**
- Status: accepted
- Decision: Brain ↔ Worker ↔ Auditor iletişim versiyonlanmış mesaj protokolü. Dosya tabanlı state (`.hb`, `.result`) paralel devam eder ama event stream **kanonik truth** olur. Append-only, parseable, fail-safe fallback.
- Protocol Version 1.0 — 15 kanal kodu (Section 6 Task 138-001 spec):
  - `BRAIN→WORKER:TASK_ASSIGN`, `WORKER→BRAIN:HEARTBEAT`, `WORKER→BRAIN:RESULT`, `WORKER→BRAIN:QUESTION`, `BRAIN→WORKER:ANSWER`
  - `WORKER→AUDITOR:CODE_VERIFY_REQUEST`, `AUDITOR→BRAIN:VERIFICATION_RESULT`, `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED`, `AUDITOR→BRAIN:ADR_VIOLATION`, `AUDITOR→BRAIN:GATE_COMPUTED`, `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN`
  - `BRAIN→*:METRIC_EMITTED`, `BRAIN→WORKER:FIX_REQUEST`, `BRAIN→*:SPRINT_PHASE_CHANGE`
  - `DECKENT→USER:NOTIFY` (Sprint 139 dispatcher için protocol seed, Sprint 138'de sadece tanımlı)
- Message format JSON: `{timestamp, sequence, protocol_version: "1.0", source, target, channel, payload}`
- Backward compat: Sprint 138'de file-based paralel, Sprint 140+ soft-deprecate, Sprint 142'de removed
- Alternatives considered: gRPC/Protobuf (overkill), WebSocket (Docker complexity), Redis (vision contradiction), SQLite (basit değil)

**Kanıt:**
- `grep "^## ADR-035" .brain/DECISIONS.md` → hit
- `grep "DECKENT→USER:NOTIFY" .brain/DECISIONS.md` → hit (Sprint 139 prep)
- `node scripts/adr-validator.mjs` → exit 0 (Task 1 validator Task 2 output'unu onaylamalı — **ilk canlı dogfood**)

**Test:** Yok (salt doc, validator otomatik)

---

## Task 3: Auditor Authority Extension (3-Pipeline Verification + ADR Compliance)
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: 138-002
- Skills: typescript-expert, testing-expert
- Files: src/monitor/auditor.ts, src/orchestra/result-evaluator.ts, src/orchestra/sprint-finalizer.ts, tests/monitor/auditor.test.ts, tests/orchestra/result-evaluator.test.ts
- Scope: src/monitor/, src/orchestra/, tests/monitor/, tests/orchestra/

### Description

Auditor passive scanner → active verifier. 4 alt-iş.

**Alt-iş A: tryCodeVerifiedDone Helper Migration**
Mevcut: `src/orchestra/result-evaluator.ts:729 export function tryCodeVerifiedDone(...)`. Çağrı: `src/orchestra/sprint-finalizer.ts:493 const verifyResult = await tryCodeVerifiedDone(taskId, projectRoot)`. 

Sprint 138'de:
1. `tryCodeVerifiedDone()` + tüm helper functions `result-evaluator.ts` → `auditor.ts`'e taşı
2. `result-evaluator.ts` 1033 → ~750 LoC (-280 helper extraction)
3. `auditor.ts` 650 → ~950 LoC (+300)
4. `sprint-finalizer.ts:49` import path update: `from '../monitor/auditor.js'`
5. **Sprint 137 meta-dogfood regression test zorunlu** — helper hâlâ canlı çalışmalı (Task 137-001 retrospektif relabel pattern)

**Alt-iş B: 3-Pipeline Verification (KILLER FEATURE)**
```typescript
export async function verifyWorkerResult(taskId, projectRoot, result): Promise<VerificationResult> {
  switch (result.selfAssessment) {
    case 'NO_GO': return await tryCodeVerifiedDone(taskId, projectRoot);
    case 'GO_WITH_TECH_DEBT': return await validateTechDebt(taskId, projectRoot, result);
    case 'DONE': return await verifyFunctional(taskId, projectRoot, result);
  }
}

async function verifyFunctional(taskId, projectRoot, result): Promise<VerificationResult> {
  const affectedTests = inferAffectedTests(result.filesChanged);
  if (affectedTests.length === 0) return { verdict: 'PASS', reason: 'no tests' };
  const vitestResult = await runVitestOnFiles(affectedTests);
  if (vitestResult.fail === 0) return { verdict: 'PASS', reason: 'all tests pass' };
  return { verdict: 'DOWNGRADE', newStatus: 'GO_WITH_TECH_DEBT', reason: `${vitestResult.fail} tests still failing` };
}
```

**Sprint 137 canlı kanıt:** Task 137-001 worker `status: DONE` dedi, helper `CODE_VERIFIED_DONE` flag bastı, ama vitest 63 fail kaldı. Sprint 138'de `verifyFunctional` bu kısayolu kırar — file existence yerine **functional runtime check**.

**Alt-iş C: ADR Compliance Check (Pilot)**
```typescript
export async function checkADRCompliance(projectRoot, changedFiles): Promise<ADRViolation[]> {
  const adrs = parseADRs('.brain/DECISIONS.md');
  return adrs.filter(a => a.status === 'accepted' && a.enforcementRule)
    .map(adr => checkRule(adr.enforcementRule, changedFiles, projectRoot))
    .filter(Boolean);
}
```
Pilot ADR'ler (Sprint 138 sadece 3-5):
- ADR-006 `spawnSync + array args` → rule: grep `spawnSync.*shell.*true`
- ADR-008 Brain merkezi import → rule: grep `from.*brain` `src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts`
- ADR-010 Tek runtime dependency → rule: package.json dependencies count check

**Alt-iş D: Event Stream Hook Point (Task 4 koordineli)**
```typescript
import { writeEvent } from '../orchestra/event-stream.js'; // Task 4'te oluşacak
writeEvent(projectRoot, {
  source: 'auditor', target: 'brain',
  channel: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
  payload: { taskId, verdict, status, reason },
});
```

**Kanıt:**
- `grep -n "tryCodeVerifiedDone" src/monitor/auditor.ts` → hit
- `grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts` → **miss** (helper taşındı)
- `grep -n "verifyFunctional" src/monitor/auditor.ts` → hit
- `grep -n "checkADRCompliance" src/monitor/auditor.ts` → hit
- Sprint 138 execute sırasında: ≥1 task'ın `DONE → TECH_DEBT downgrade` canlı yakalanmalı (functional check kanıtı)

**Test:** 7+ test (helper migration regression, verifyFunctional happy path, partial fail downgrade, no affected tests edge, 3-pipeline dispatch, ADR-006 violation detect, no violation happy path)

---

## Task 4: Structured Event Stream + Plan-Time Scope Collision Detection
- Model: opus
- Effort: high
- Priority: HIGH
- Dependencies: 138-003
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/event-stream.ts, src/core/file-lock.ts, src/orchestra/conflict-resolver.ts, src/orchestra/sprint-spawner.ts, src/agents/worker.ts, src/monitor/auditor.ts, tests/orchestra/event-stream.test.ts, tests/core/file-lock.test.ts, tests/orchestra/sprint-spawner.test.ts
- Scope: src/orchestra/, src/core/, src/monitor/, src/agents/, tests/

### Description

Sprint 138'in **teknik omurgası** (high effort). 5 alt-iş.

**Pre-flight bulgu:** `src/core/file-lock.ts` şu an 30 satır, sadece `claimTaskLock` (observability wrapper) + `acquireLock` re-export. Real implementation `worker.ts:173`'te. Plan-time'da çağrılmıyor (`.locks/` boş).

**Alt-iş A: Event Stream (`src/orchestra/event-stream.ts` ~200 LoC, YENİ DOSYA)**
```typescript
export interface DeckentEvent {
  timestamp: string;
  sequence: number;
  protocol_version: '1.0';
  source: 'brain' | 'worker' | 'auditor' | string;
  target: string;
  channel: string;
  payload: unknown;
}
export function writeEvent(projectRoot, event): void  // append .deckent/sprint-NNN-events.jsonl
export function readEvents(projectRoot, filter?): DeckentEvent[]
export function reconstructState(projectRoot, sprintId): SprintState
```
Fail-safe: write fail → console.warn + file-based fallback. Backward compat: `.hb/.result` paralel devam.

**Alt-iş B: File Lock Real Implementation (`src/core/file-lock.ts` 30 → ~200 LoC)**
```typescript
export interface LockInfo { filePath, ownerWorkerId, acquiredAt, taskId, ttl? }
export function acquireLock(projectRoot, filePath, ownerWorkerId, taskId): LockInfo | null
export function releaseLock(projectRoot, lockInfo): void
export function checkLocks(projectRoot): LockInfo[]
export function clearStaleLocks(projectRoot, maxAgeMs): number
```
Mevcut `worker.ts:173 acquireLock` core'a delegate eder (worker logic sadece çağırır). Mevcut `claimTaskLock` (observability wrapper) korunur.

**Alt-iş C: Plan-Time Scope Collision Detection (`sprint-spawner.ts`)**
```typescript
export function detectScopeCollisions(tasks: Task[]): CollisionMap
export function buildCollisionAwareWaves(tasks: Task[], maxWorkers: number): Wave[]
```
Topological sort with collision edges + Dependencies field (Sprint 137 parser).

**Meta-dogfood beklentisi:** Sprint 138 DIRECTIVES'te Task 5 + Task 6 ikisi de `sprint-finalizer.ts`'e yazar. Brain `detectScopeCollisions()` bunu yakalar → Task 5 Wave 3, Task 6 Wave 4 otomatik. **Manuel wave barrier ihtiyacı ortadan kalkar.** Eğer canlı çalışıyorsa Sprint 138'in **ikinci meta-dogfood canlı kanıt**.

**Alt-iş D: Runtime Lock + Event Write Hook**
- `worker.ts`: file write öncesi `acquireLock()` + event write (`WORKER→BRAIN:FILE_LOCK_ACQUIRED`)
- `auditor.ts`: scan loop'ta lock state event (`AUDITOR→BRAIN:LOCK_STATE_SNAPSHOT`)

**Alt-iş E: Collision Event Integration**
Collision detection → event stream'e yaz (`AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED`).

**Kanıt:**
- `wc -l src/core/file-lock.ts` → ≥150 (30'dan büyüdü)
- `ls src/orchestra/event-stream.ts` → mevcut (yeni)
- `grep -n "detectScopeCollisions" src/orchestra/sprint-spawner.ts` → hit
- `grep -n "acquireLock" src/orchestra/sprint-spawner.ts` → hit (plan-time çağrı)
- `ls .locks/` Sprint 138 execute sırasında dolu
- `ls .deckent/sprint-138-events.jsonl` runtime mevcut
- `wc -l .deckent/sprint-138-events.jsonl` → ≥50
- `grep "SCOPE_COLLISION_DETECTED" .deckent/sprint-138-events.jsonl` → hit (**ikinci meta-dogfood canlı kanıt**)

**Test:** 10+ test (event roundtrip, state reconstruct, fail-safe, file lock acquire, collision, stale cleanup, detectScopeCollisions same file, non-collision, buildCollisionAwareWaves topological, Docker bind mount integration)

---

## Task 5: Test Restoration Tam Tamamlama
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: 138-001
- Skills: testing-expert, typescript-expert
- Files: tests/orchestra/runsprint-debt-integration.test.ts, tests/orchestra/brain-rollback.test.ts, tests/orchestra/sprint2-debt.test.ts, tests/orchestra/sprint-controller.test.ts, tests/orchestra/dependency-pipeline.test.ts, tests/orchestra/agent-activation.test.ts, tests/orchestra/brain-provider.test.ts, tests/orchestra/spawn-prevention.test.ts, tests/orchestra/plan-improvements.test.ts, tests/orchestra/brain.test.ts, tests/e2e/docker-backend.test.ts, tests/docs/jsdoc.test.ts
- Scope: tests/orchestra/, tests/e2e/, tests/docs/

### Description

**Pre-flight baseline:** vitest 8 fail file / 53 fail tests / 12652 pass (Plan'ın 63'ten +10 daha iyi). Sprint 137 Task 137-001 worker + FIX worker 60 test fix yaptı (123 → 53). Sprint 138'de kalan 53 temizlenir.

**Strateji:** Sprint 137 Task 137-001 worker'ın yazdığı fix pattern'ı (brain.test.ts mock update — barrel re-export path) diğer dosyalara uygula. Worker `npx vitest run <dosya>` ile fail sebebini okur, pattern match, fix.

**Hedef:** 53 → 0, 12652 → ≥12721, 8 fail file → 0.

**Kanıt:** `npx vitest run --reporter=basic 2>&1 | tail -5` → `Test Files X passed (513)`, `Tests 0 failed | 12721+ passed`

**Test:** Baseline = kanıt

---

## Task 6: Layer 4 Runtime Wire Forensic Fix
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: 138-004
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/core/observability.ts, tests/orchestra/sprint-finalizer.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

Sprint 136-137 üst üste **3-sprint runtime fail**. Worker "wire satır 10b/10c'de mevcut" diyor ama runtime artifact 0/3 (gate.json + load-report + metrics.jsonl).

**Forensic hipotezler:**
1. `finalizeSprint()` erken exit (koşul return hook'tan önce)
2. Hook path broken (Task 8 refactor import chain kırık — Sprint 136 sprint-controller slim yan etkisi)
3. Silently swallowed error (try-catch eat without rethrow)

**Fix yaklaşımı:**
1. Step 1: `finalizeSprint()` call path'ine breadcrumb logging ekle (her hook çağrısı öncesi/sonrası `console.log`)
2. Step 2: Sprint 138 dry-run veya test ile runtime'da hangi adım eksikse görülür
3. Step 3: Doğru hipotez bulunur, fix uygulanır
4. Step 4: Breadcrumb logging permanent kalır (debug için)

**Event stream integration (Task 4 sonrası):**
- gate.json write event stream'e: `AUDITOR→BRAIN:GATE_COMPUTED`
- load-report write event stream'e: `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN`
- metrics emit event stream'e: `BRAIN→*:METRIC_EMITTED`

**Kanıt (Sprint 138 finalize sonrası):**
- `.deckent/sprint-138-gate.json` runtime mevcut, `overallGate === "PASS" or "WARNING"`
- `docs/audits/sprint-138/load-test-report.md` runtime mevcut
- `.deckent/sprint-138-metrics.jsonl` ≥30 satır (canlı veri)
- Event stream'de 3 event: `GATE_COMPUTED`, `LOAD_REPORT_WRITTEN`, `METRIC_EMITTED`

**Test:** 4+ test (gate.json runtime write, load-report runtime write, metrics integration, fail-safe error swallow)

---

## Task 7: Auto-Archive Partial Regression Fix
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: 138-006
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-docs-helpers.ts, tests/orchestra/sprint-finalizer.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

Sprint 137'de auto-archive partial regression: `.brain/sprints/sprint-137.md` ✅ ama `.brain/archive/DIRECTIVES-sprint-137.md` ❌ ve `DIRECTIVES.md` Sprint 138 reset ❌ (manuel yapıldı). Sprint 135-136 redemption pattern Sprint 137'de geriledi.

**Root cause hipotezi:** Sprint 136 Task 8 sprint-controller refactor yan etkisi, archive hook erken exit veya import chain broken. Task 6 Layer 4 wire fix ile aynı dosya (sprint-finalizer.ts) — bu yüzden Task 7 `Dependencies: 138-006` (Task 6 sonrası sequential cross-wave).

**Fix: Otomatik 3-adım**
1. `.brain/sprints/sprint-138.md` write ✅ (zaten çalışıyor)
2. `.brain/archive/DIRECTIVES-sprint-138.md` write ❌ → fix
3. `DIRECTIVES.md` Sprint 139 template reset ❌ → fix

**Pre-flight not:** Sprint 137 orphan `.tasks/` dosyaları manuel `.brain/archive/sprint-137-tasks/`'a taşındı. Bu da auto-archive'ın kapsamı olmalı (Sprint 138 cleanup `.tasks/` orphan'ları otomatik archive etmeli).

**Kanıt (Sprint 138 finalize sonrası):**
- `.brain/sprints/sprint-138.md` ✅ (zaten çalışıyor)
- `.brain/archive/DIRECTIVES-sprint-138.md` ✅ (yeni fix)
- `DIRECTIVES.md` Sprint 139 template ✅ (yeni fix, `head -5 DIRECTIVES.md` Sprint 139 hazırlanıyor)
- (bonus) `.tasks/task-138-*.*` orphan'lar archive edilir veya temizlenir

**Test:** 3+ test (sprint log write, DIRECTIVES archive write, DIRECTIVES reset)

---

## Task 8: Worker Honest Assessment Calibration v2
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: 138-003
- Skills: typescript-expert, testing-expert
- Files: src/agents/worker.ts, src/orchestra/task-builder.ts, src/orchestra/result-evaluator.ts, tests/agents/worker.test.ts
- Scope: src/agents/, src/orchestra/, tests/

### Description

Sprint 137 canlı kanıt (`feedback_worker_honest_assessment.md`): Task 137-001 worker `status: DONE exitCode: 0` yazdı ama %39 functional (47/123 fix). Worker'lar "kod var → DONE" kısayolu. Sprint 138 kalibre.

**Alt-iş A: Worker Prompt Template Baseline Diff Instruction**
`src/orchestra/task-builder.ts`'e worker prompt'a eklenir:
```
## Honest Self-Assessment Required
Before writing .result with selfAssessment: DONE, you MUST verify:
1. Baseline state: what was the test/code state before your work?
2. End state: what is it now?
3. Delta: how much of the task did you ACTUALLY complete?

If <80%, write GO_WITH_TECH_DEBT with specific gap.
If <50%, write NO_GO with explanation.
"DONE" means functional outcome matches task spec fully.
"Code written" ≠ "DONE".
```

**Alt-iş B: Worker Verify Loop Sertleştirme (`worker.ts enforceVerifyLoop()`)**
- Test command auto-detect (vitest/jest)
- Baseline delta: start'ta filesChanged baseline count, end'de actual count
- Delta < 80% → auto TECH_DEBT downgrade
- `.tasks/{id}.verify-delta.json` kanıt dosyası

**Alt-iş C: result-evaluator.ts TECH_DEBT Downgrade Logic (Çift Katman)**
Task 3 `verifyFunctional` zaten partial → TECH_DEBT downgrade. Task 8 bu logic'i `result-evaluator.ts`'a **çift katman** olarak ekler (Auditor + Brain redundancy).

**Pre-flight not:** Task 8 Task 3 (Auditor Authority API) kullanır → Wave 4'te (Wave 2 tam bittikten sonra). `Dependencies: 138-003` (Task 3 değil — Task 4 = 138-004 = Event Stream, Task 3 = 138-003 = Auditor Authority).

**Kanıt:**
- `grep "Honest Self-Assessment" src/orchestra/task-builder.ts` → hit
- `grep "verify-delta" src/agents/worker.ts` → hit
- Sprint 138 execute sırasında: ≥1 task'ın `DONE → TECH_DEBT downgrade` canlı yakalanmalı (Task 3 verifyFunctional + Task 8 verify-delta birlikte)
- result dosyalarında rubricScores honest scoring (file existence değil functional %)

**Test:** 5+ test (prompt injection, verify loop baseline, downgrade, full completion, 0% NO_GO)

---

## Task 9: Long-Running Sprint Resume Capability MVP
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-spawner.ts, src/cli/commands/resume.ts, tests/orchestra/sprint-checkpoint.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/

### Description

Sprint 140 (50-task) + Sprint 145 (100-task) zemini. MVP: sprint yarıda kalsa state'ten devam.

**Alt-iş A: Checkpoint Write (`src/orchestra/sprint-checkpoint.ts` ~150 LoC, YENİ)**
```typescript
export interface SprintCheckpoint {
  sprintId: string; checkpointNumber: number; timestamp: string;
  completedTasks: string[]; pendingTasks: string[];
  activeWorkers: WorkerState[]; brainPhase: SprintPhase;
  eventStreamOffset: number;
}
export function writeCheckpoint(projectRoot, state): void
export function readCheckpoint(projectRoot, sprintId): SprintCheckpoint | null
```

**Alt-iş B: Resume Command (`src/cli/commands/resume.ts`)**
```typescript
program.command('resume <sprintId>').action(async (sprintId) => {
  const checkpoint = readCheckpoint(projectRoot, sprintId);
  if (!checkpoint) exit(1);
  await startSprint({ resumeFrom: checkpoint });
});
```

**Alt-iş C: Integration with Spawner**
`sprint-spawner.ts`: her N=5 task DONE/TD/NO_GO sonrası checkpoint write.

**Scope constraint (MVP, Sprint 138):**
- ✅ Checkpoint write
- ✅ Basic resume command
- ✅ Worker state restoration basic (running kill, pending respawn)
- ❌ Mid-worker resume (Sprint 140+)
- ❌ Heartbeat daemon integration (Sprint 140+)
- ❌ External state store (Sprint 145+)

**Kanıt:**
- `ls src/orchestra/sprint-checkpoint.ts src/cli/commands/resume.ts`
- `.deckent/sprint-138-checkpoint.json` runtime mevcut (en az 1 checkpoint)

**Test:** 3+ test (write+read roundtrip, resume from middle, fresh start fallback)

---

## Task 10: MCP/CLI Parity Audit (OPSİYONEL)
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Files: docs/audits/sprint-138/mcp-cli-parity-report.md
- Scope: docs/audits/sprint-138/

### Description

ADR-022 enforcement check. Her CLI komutunun MCP tool eşdeğeri var mı? Eksiklik listesi + Sprint 139 debt candidate'ları.

**Opsiyonel:** Kapasite kalırsa. Sprint 138 6-7 saat hard cap, Task 1-9 bitince Task 10 eklenir. Drop edilebilir.

**Kanıt:** `ls docs/audits/sprint-138/mcp-cli-parity-report.md` (eğer yapıldıysa)

**Test:** Yok (audit-only)
