# Sprint 160 — Brain Stability + Restart Recovery (Design Spec)

| Field | Value |
|-------|-------|
| Sprint | sprint-160 |
| Tarih | 2026-05-12 |
| Önceki sprint | sprint-159 (force-finalize, Brain restart loop crash) |
| Status | Draft — design approval gate |
| Disiplin | T4-modified (T3 + Security Review + 2 ADR) |
| Hedef süre | ~2 saat (3 wave × ~40-45dk) |
| Provider | claude (opus brain + opus workers, kritik altyapı) |
| Baseline commit | `8b250d5` (chore: sprint-159-sync) |

## 1. Problem Statement

Sprint 157 → 158 → 159 **üçü de** Brain runner crash/stall ile sonuçlandı. Sprint 159 force-finalize'dan sonra disk üzerindeki IPC artifacts (`sprint-159-events.jsonl`, `checkpoint.json`, `gate.json`, `sprint-state.json`) üzerinde yapılan forensic incelemede **üç yapısal eksik** kanıtlandı:

| Bulgu | Kanıt | Anlamı |
|-------|-------|--------|
| **Sequence reset** | events.jsonl seq 16 → seq 1 (event 17'de) | Brain runner crash + restart, sequence counter sıfırdan başladı |
| **2 saatlik event boşluğu** | seq 12 (15:45) → seq 13 (17:38) | Brain çalıştı ama event yayınlamadı (silent execute fazı) |
| **Negative duration** | metric `sprint.summary` `durationMs:-106` | startedAt restart sonrası geçerli persist edilmedi |
| **Sprint-state.json donuk** | `phase:SPAWN, status:PLANNING, updatedAt:15:45:45` | Phase EXECUTE→EVALUATE→RETRO→CLEANUP geçti, state.json hiç güncellenmedi |
| **Checkpoint donuk** | `checkpointNumber:1, completedTasks:[], eventStreamOffset:0` | Sprint başında alındı, hiç güncellenmedi (Sprint 138 T-9 broken) |
| **Exception handler eksik** | `src/orchestra/sprint-runner-entry.ts`'te `uncaughtException`/`unhandledRejection` handler YOK | Silent crash mümkün, log/redact yok |
| **Double-MCP** | PID 1311115 + 1473819 aynı anda çalışıyordu (stale + active) | Race riski, runtime'da guard yok |

**Kök sebepler (3 yapısal eksik):**
1. **Global exception/rejection handler eksik** → silent crash
2. **Checkpoint loop runtime'da çalışmıyor** → resume imkânsız
3. **Phase transition update sprint-state.json'a yazılmıyor** → external observer kör

NEXT-SESSION-PROMPT.md'deki OOM hipotezi bu run'da elendi (memory free 39GB/41GB, SQLite WAL/SHM yok). Fix-fix recursion bug Sprint 161'e kayıyor.

## 2. Goal

Brain runner restart loop'un kanıtlanmış üç yapısal eksiğini kapatmak. Sprint sonunda hedef:
- ✅ Sprint runner global exception/rejection/SIGTERM handler ile fail-safe
- ✅ Checkpoint loop runtime'da aktif (her N task DONE'da disk'e write)
- ✅ Sprint state JSON phase transition'larında güncel (observer canlı görüyor)
- ✅ State recovery on restart: stale EXECUTING task'lar için `handleEvaluation` tetikleniyor
- ✅ EvaluationAuditTrail (Sprint 157 T-001 survivor) runtime'da çağrılıyor
- ✅ Double-MCP guard ile 2nd instance refused
- ✅ Security review 3 çekirdek maddede greenflag
- ✅ Çift katmanlı smoke validation (synthetic crash + Sprint 161 dogfood)

## 3. Scope

### In-Scope
- `src/orchestra/sprint-runner-entry.ts` — global exception/rejection/SIGTERM handler + redaction
- `src/orchestra/sprint-checkpoint.ts` + `sprint-controller.ts` — checkpoint loop runtime wire (CHECKPOINT_INTERVAL=5)
- `src/orchestra/sprint-phases.ts` — state.json phase update + EvaluationAuditTrail wire
- `src/orchestra/brain.ts` + `sprint-controller.ts` — state recovery on restart
- `src/mcp/server.ts` — double-instance PID lock
- 4 test dosyası (yeni) + 2 e2e smoke test + 1 integration crash injection
- 2 ADR (043 Brain Crash Recovery Protocol + 044 Sprint State Observability Contract)
- Security review (3 madde)

### Out-of-Scope (Sprint 161+'a kayar)
- `fix-fix.json` recursion (NEXT-SESSION-PROMPT Bug 2) → Sprint 161 P0
- OOM protection pre-flight → kanıt yok bu run'da, Sprint 162+ candidate
- `scoreTestCoverage` null + `AUDIT_RUBRIC` tuning + retro naming → Sprint 161 P1 (3 task)

## 4. Architecture & Approach

### Yapısal değişiklikler

```
┌─────────────────────────────────────────────────────────────┐
│  sprint-runner-entry.ts (Brain runner process boot)         │
│  ─────────────────────────────────────────────────────      │
│  ① process.on('uncaughtException', handler)  ← T-001        │
│  ② process.on('unhandledRejection', handler) ← T-001        │
│  ③ process.on('SIGTERM', graceful shutdown)  ← T-001        │
│  ④ redactSensitive() — API key, token, sec   ← T-001        │
└─────────────────────────────────────────────────────────────┘
         │ spawns
         ▼
┌─────────────────────────────────────────────────────────────┐
│  sprint-controller.ts (Brain orchestrator)                  │
│  ─────────────────────────────────────────────────────      │
│  ⑤ checkpointLoop(interval=5) ← T-002 runtime wire          │
│  ⑥ writeCheckpoint() her N task DONE'da disk write          │
│  ⑦ restoreFromCheckpoint() on boot ← T-004 recovery         │
│  ⑧ resumeStaleExecuting()  → handleEvaluation() ← T-004     │
└─────────────────────────────────────────────────────────────┘
         │ calls
         ▼
┌─────────────────────────────────────────────────────────────┐
│  sprint-phases.ts (per-phase logic)                         │
│  ─────────────────────────────────────────────────────      │
│  ⑨ updateSprintState({phase}) — her transition ← T-003  │
│  ⑩ EvaluationAuditTrail.record() runtime wire ← T-003   │
└─────────────────────────────────────────────────────────────┘
         │ singleton check
         ▼
┌─────────────────────────────────────────────────────────────┐
│  mcp/server.ts (MCP stdio server)                           │
│  ─────────────────────────────────────────────────────      │
│  ⑪ acquirePidLock(.deckent/mcp-server.pid) ← T-006          │
│  ⑫ stale lock cleanup + 2nd instance refused                │
└─────────────────────────────────────────────────────────────┘
```

### İletişim kontratları (yeni — ADR-044'ün özü)

```typescript
// Phase transition contract — sprint-phases.ts'in her phase'inde MANDATORY
async function transitionPhase(from: SprintPhase, to: SprintPhase) {
  await updateSprintState({ phase: to, updatedAt: new Date().toISOString() });
  await writeEvent({ source: 'brain', channel: 'BRAIN→*:SPRINT_PHASE_CHANGE',
                     payload: { fromPhase: from, toPhase: to } });
  await checkpointIfDue(); // T-002 ile entegre
}

// Checkpoint invariants (her write'ta tutmak zorunlu)
// 1. eventStreamOffset = events.jsonl son sequence
// 2. completedTasks = task.status === DONE filter
// 3. brainPhase = current sprint phase (gerçek)
```

### State recovery flow (T-004)

```
Brain boot:
  1. checkpoint.json var mı?
     yes → restoreFromCheckpoint()
     no  → fresh PLAN
  2. Stale EXECUTING task'lar (task.json status=EXECUTING ama HB > 2dk eski) için:
     a. .result var mı?
        yes → handleEvaluation(task, result)
        no  → mark NO_GO + log "stale executing detected on resume"
     b. evaluatePhase yeniden çalıştır (idempotent guard Sprint 157 T-002 survivor sayesinde safe)
  3. sprint-state.json'a sync: phase, status, updatedAt
  4. Continue from restored brainPhase
```

## 5. Task Taksonomisi (6 task)

| # | Task ID | Başlık | TaskType | Model | Effort | Scope (filesWrite) |
|---|---------|--------|----------|-------|--------|---------------------|
| **T-001** | 160-001 | Global exception/rejection/SIGTERM handler + redaction | BUG_FIX (infrastructure) | opus | normal | `src/orchestra/sprint-runner-entry.ts`, `tests/orchestra/exception-handler.test.ts` |
| **T-002** | 160-002 | Checkpoint loop runtime wire (CHECKPOINT_INTERVAL=5 active) | BUG_FIX | opus | normal | `src/orchestra/sprint-checkpoint.ts`, `src/orchestra/sprint-controller.ts`, `tests/orchestra/checkpoint-loop.test.ts` |
| **T-003** | 160-003 | Sprint phase observability fix (state.json transition update + EvaluationAuditTrail runtime wire) — composite | FEATURE + BUG_FIX (composite — see note) | opus | high | `src/orchestra/sprint-phases.ts`, `tests/orchestra/phase-transition-observability.test.ts` |
| **T-004** | 160-004 | State recovery on Brain restart | FEATURE | opus | high | `src/orchestra/brain.ts`, `src/orchestra/sprint-controller.ts`, `tests/orchestra/state-recovery.test.ts` |
| **T-006** | 160-006 | Double-MCP guard + PID lock + stale cleanup | BUG_FIX | opus | normal | `src/mcp/server.ts`, `tests/mcp/server-singleton.test.ts` |
| **T-007** | 160-007 | Crash injection integration test + dogfood smoke | TEST + INTEGRATION | opus | normal | `tests/orchestra/brain-crash-injection.test.ts`, `tests/e2e/sprint-160-smoke.test.ts` |

> Task ID `160-005` rezerve edildi (atomik bölme Sprint 161'e taşınırsa kullanılacak — bkz. composite not).

**Not (T-003 composite):** Memory feedback `feedback_no_minimum_no_mvp_deckent` ve TaskType taxonomy atomik task ister, ama bu iki değişiklik aynı dosya (`sprint-phases.ts`) ve aynı kontrat (phase transition). Birleştirme **collision'ı önlemek** için seçildi. Kullanıcı onayı verildi ("1.deneyelim görelim"). Sprint 161 retro'sunda atomik bölme (T-005 ID rezerveli) değerlendirilecek.

## 6. Wave Plan + Dependency

```
Wave 1 (paralel, 0 collision — ayrı dosyalar, eş zamanlı başlar):
  ├─ T-001 (sprint-runner-entry.ts + test)
  ├─ T-002 (sprint-checkpoint.ts + sprint-controller.ts + test)
  ├─ T-003 (sprint-phases.ts + test)  ← sprint-controller.ts T-002 ile paylaşılır mı?
  └─ T-006 (mcp/server.ts + test)
  Beklenen süre: ~45dk
  Not: T-002 ve T-004 sprint-controller.ts'e yazıyor; T-004 Wave 3'te → collision yok.

Wave 2 (T-002 + T-001 done sonrası):
  └─ T-004 (brain.ts + sprint-controller.ts + test)
  Beklenen süre: ~30dk
  Dependency: T-002 (checkpoint loop) ve T-001 (exception handler) done bekler.

Wave 3 (T-001 + T-002 + T-003 + T-004 done sonrası, integration):
  └─ T-007 (crash injection integration + e2e dogfood smoke)
  Beklenen süre: ~30-45dk
  Dependency: tüm fix task'lar done.
```

**Kritik path:** Wave 1 (max ~45dk, T-003 muhtemelen en uzun) → Wave 2 (~30dk) → Wave 3 (~30-45dk) ≈ **~2 saat toplam**.

**Collision matrix:**
| Task | sprint-runner-entry | sprint-checkpoint | sprint-controller | sprint-phases | brain | mcp/server |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| T-001 | ✏️ |  |  |  |  |  |
| T-002 |  | ✏️ | ✏️ |  |  |  |
| T-003 |  |  |  | ✏️ |  |  |
| T-004 |  |  | ✏️ |  | ✏️ |  |
| T-006 |  |  |  |  |  | ✏️ |
| T-007 | (test only) | (test only) | (test only) | (test only) | (test only) | (test only) |

sprint-controller.ts: T-002 (Wave 1) + T-004 (Wave 2) — **sıralı**, collision yok.

## 7. ADR Drafts (2 — mandatory T4-modified)

### ADR-043 — Brain Crash Recovery Protocol

**Status:** proposed (Sprint 160 sonu accepted hedefi)

**Context:** Sprint 157/158/159 üçü de Brain runner crash. Global exception handler eksikliği + checkpoint loop broken + state recovery yok → silent crash + state freeze.

**Decision:**
1. `sprint-runner-entry.ts` boot'ta mandatory handler: `uncaughtException`, `unhandledRejection`, `SIGTERM` (graceful), `SIGINT` (passthrough — Sprint 076 ADR-025).
2. Exception payload'larında **redactSensitive()** mandatory: API key, OAuth token, file content >100 char, env değerleri.
3. Crash sonrası **fail-fast policy**: process exit code 1, parent supervisor restart kararı verir (Brain kendi restart'ını yapmaz — daimi loop riski).
4. Recovery boot'ta `checkpoint.json` varsa `restoreFromCheckpoint()`, yoksa fresh PLAN.

**Consequences:**
- ✅ Silent crash imkânsız (her exception log + redact)
- ✅ Resume capability runtime'da gerçek
- ⚠️ Parent supervisor sorumluluğu (Sprint 161+ devam — MCP/CLI parent watchdog)

### ADR-044 — Sprint State Observability Contract

**Status:** proposed (Sprint 160 sonu accepted hedefi)

**Context:** Sprint 159'da `sprint-state.json` phase'ler EXECUTE→EVALUATE→RETRO→CLEANUP geçti ama dosya `phase:SPAWN, status:PLANNING`'de donuk kaldı. Checkpoint.json benzer sorun. External observer (auditor, dashboard, MCP `deckent_status`) Brain'in gerçek state'ini göremedi.

**Decision:**
1. **Phase transition mandatory write:** `sprint-phases.ts`'de her `transitionPhase()` çağrısında `sprint-state.json` atomic update (`{phase, status, updatedAt}`).
2. **Checkpoint invariants:** her `writeCheckpoint()`'te:
   - `eventStreamOffset` = `events.jsonl` son sequence number
   - `completedTasks` = task.json'da `status === DONE` filter
   - `brainPhase` = gerçek current phase (faz başında write, sonunda re-write)
3. **Event sequence monotonicity:** restart sonrası `sequence` counter `events.jsonl` max'tan +1 başlamalı (reset YASAK).
4. **Negative duration guard:** `sprint.summary` event'inde `durationMs < 0` ise `null` yazılır + warning log.

**Consequences:**
- ✅ External observer Brain'in gerçek state'ini her zaman görür
- ✅ Recovery deterministic (state.json + checkpoint.json + events.jsonl 3-way consistency)
- ⚠️ Phase transition latency +few ms (atomik write fsync)

## 8. Security Review Scope (3 madde)

### 8.1 Exception Handler Data Leak

**Risk:** `uncaughtException` payload'ı (Error.stack, Error.message) içinde API key/token/file content olabilir. Log dosyasına yazılırsa veya event-stream'e push edilirse → leak.

**Audit:**
- `redactSensitive(err)` fonksiyonu: stack trace'te `process.env.*`, `Authorization:`, `Bearer `, `api_key`, `token=`, `secret`, `password` regex match → `[REDACTED]`.
- 100+ char file content paths → sadece file path tutuldu, content silindi.
- Unit test: 6 senaryo (API key, OAuth token, env var, file content, password, mixed).

### 8.2 Double-MCP Guard Race

**Risk:** PID lock atomic değilse, iki MCP server aynı anda lock acquire edebilir.

**Audit:**
- `O_CREAT | O_EXCL` flag ile lock dosyası oluşturma (atomic).
- PID dosya içeriğinde geçerli process kontrolü (`kill(pid, 0)` → ESRCH ise stale, cleanup).
- Stale lock cleanup'ta race penceresi: 2 process aynı anda stale detect ederse → ikincil EEXIST'le retry.
- Test: 3 senaryo (clean acquire, stale cleanup, simultaneous spawn race).

### 8.3 State Recovery Integrity

**Risk:** Brain restart'ta yarım kalan worker'ların DONE/FAIL durumu yanlış evaluate edilebilir. Sprint 159 `durationMs:-106` regression bu sınıfta.

**Audit:**
- `handleEvaluation` recovery sırasında çağrılırsa, idempotency guard (Sprint 157 T-002 PID-bound lock) zaten safe — yeniden test edilecek.
- `startedAt` recovery sonrası original timestamp'i koruyacak (checkpoint'ten restore).
- Timestamp drift guard: `currentTime < startedAt` ise warning + skip duration calc.

## 9. Test Stratejisi (Çift Katman)

### Katman 1 — In-Sprint (T-007 task'ı içinde)

**`tests/orchestra/brain-crash-injection.test.ts`** — 6 senaryo:
1. SIGTERM during EXECUTE → graceful shutdown + checkpoint flush + restart resume
2. unhandledRejection in `evaluatePhase` → exception handler graceful exit + redact verification
3. Double-MCP spawn → 2nd instance refused (EEXIST + clean error)
4. sprint-state.json desync → recovery aligns (state.json mismatch detection)
5. checkpoint.json missing → degrade to PLAN re-run (fresh start)
6. EvaluationAuditTrail write fail → fallback (try/catch wrap), Brain devam eder

**`tests/e2e/sprint-160-smoke.test.ts`** — mini-sprint:
- 1 dummy task spawn → Brain success path → cleanup
- 1 dummy task spawn + SIGTERM inject → recovery path → success

### Katman 2 — Post-Sprint (Alperen kararı, Sprint 161 dogfood)

- Alperen `npm run build` + MCP restart sonrası `deckent_start` ile Sprint 161 (3 minimal task) başlatır.
- Sprint 161 başarı kriteri: 0 Brain crash, sprint-state.json canlı update, checkpoint.json güncel, events.jsonl sequence monotonic.
- Beklenmedik durum: Brain crash olursa exception handler log + checkpoint'ten resume devreye girmeli (Sprint 160 ürünü test edilmiş olur).

## 10. GO/NO_GO Criteria

| Kriter | GO | NO_GO |
|--------|----|----|
| Task DONE | 6/6 DONE veya GO_WITH_TECH_DEBT | T-001 veya T-004 NO_GO |
| tsc | PASS | FAIL |
| vitest | delta 0 fail | herhangi delta fail |
| Crash injection | 6/6 yeşil | 1+ kırmızı |
| ADR | 043 + 044 accepted DB'ye yazıldı | birinden eksik |
| Security review | 3/3 greenflag | 1+ kırmızı |
| Gate (auditor) | overallGate = PASS | FAIL |

## 11. Risks + Pre-Flight

### Sprint başlamadan önce (pre-flight)
- ✅ Disk state temiz (2 commit yapıldı: `e3ae2be` + `8b250d5`)
- ✅ Locks boş, Docker container yok
- ✅ Double-MCP çözüldü (PID 1311115 öldü, 1473819 aktif)
- ✅ Memory bol (39GB free)
- ⚠️ **Build hazır mı?** Sprint 160 başlamadan ÖNCE Alperen `npm run build` çalıştırmalı (worker'lar yasak — memory `feedback_build_requires_user_approval`).

### Sprint sırasında riskler
| Risk | Etki | Mitigasyon |
|------|------|------------|
| T-003 composite task atomic discipline'a uymaz | Memory feedback ihlali iddiası | Sprint 161 retro'sunda değerlendirilecek; collision riskini azaltıyor, kanıt T-001/T-002/T-006 wave'inde |
| T-004 recovery testleri için Brain'in fix öncesi davranışı mock'lanmalı | Test komplekliği | Mock'lar `tests/orchestra/__mocks__/` altında |
| Sprint 160 ortasında Brain crash olursa | Recursive crash, fix kendi fix'ini test edemez | Pre-flight: Alperen build sonrası `deckent_doctor` + checkpoint cleanup |
| ADR-043 fail-fast policy başka Sprint 161+ kodu kırabilir | Backward incompat | ADR-043 explicit migration note: parent supervisor TBD Sprint 161 |
| Sprint 161 dogfood smoke fail olursa | Sprint 160 ürünü gerçekte bozuk | Telemetry: Sprint 161 ilk 5dk events.jsonl + state.json'ı ben inceleyeceğim |

## 12. Open Questions

1. **Parent supervisor:** ADR-043 fail-fast policy "parent supervisor restart kararı verir" diyor — bu parent şu an MCP server mı, CLI mı, yoksa yeni bir watchdog mu? **Karar:** Sprint 161'e bırakıldı (ADR-043 migration note); Sprint 160'ta sadece Brain side exit code 1, parent passive.
2. **Event sequence persistence:** restart sonrası `seq` counter `events.jsonl`'i parse edip max+1 mi yoksa ayrı `sprint-NNN-seq` dosyası mı? **Karar:** Mevcut `sprint-NNN-seq` dosyası source-of-truth (Sprint 159'da broken — bu run'da sıfırlandı). T-002 + T-003 birlikte fix.
3. **Checkpoint atomicity:** `writeCheckpoint()` `fs.writeFileSync({flag:'w'})` mu `rename(temp, real)` atomic mi? **Karar:** Atomic rename (Sprint 139 Task 13 docker HB core fix pattern) — `tests/orchestra/checkpoint-loop.test.ts`'de doğrulanacak.

## 13. References

### Memory
- `project_sprint156_dogfood.md` — Sprint 156-159 dogfood history, 3 major bug
- `project_task_type_taxonomy_vision.md` — TaskType + Reversibility 3-katman mimari
- `feedback_t3_minimum_discipline_baseline.md` — T3+T4 disiplin matrisi
- `feedback_no_minimum_no_mvp_deckent.md` — minimum/MVP YASAK
- `feedback_build_requires_user_approval.md` — npm build Alperen kararı

### Commits
- `6c337b0` (Sprint 156-followup) — Sprint 157 T-001 EvaluationAuditTrail survivor (6.2 KB, 8/8 test pass) + T-002 PID-bound idempotency guard survivor
- `e3ae2be` (Sprint 159-survivor) — `evaluate-phase-idempotency.test.ts` 6-case regression (Sprint 157 T-002 kanıtı)
- `8b250d5` (Sprint 159-sync) — finalize artifacts + lastUsed manifests + forensic archives

### IPC Artifacts (forensic)
- `.deckent/sprint-159-events.jsonl` (18 event, sequence reset proof)
- `.deckent/sprint-159-checkpoint.json` (donuk, eventStreamOffset:0)
- `.deckent/sprint-state.json` (donuk, phase:SPAWN)
- `.deckent/archive/sprint-158-failed-2026-05-12/` (Sprint 158 crash forensic)

### Existing code
- `src/orchestra/sprint-checkpoint.ts` (Sprint 138 T-9 — broken loop)
- `src/orchestra/evaluation-audit-trail.ts` (Sprint 157 T-001 survivor — runtime wire yok)
- `src/orchestra/sprint-phases.ts:469,506` (Sprint 157 T-002 PID-bound idempotency — wired in lock acquire)

---

**Status:** Brainstorming complete. Awaiting user review of this spec before transitioning to writing-plans skill for implementation plan generation.
