# Sprint 168 — Brain Repair Phase Sprint

**Tarih:** 2026-05-14
**Sprint:** 168
**Versiyon:** v1 (brainstorming output — Sprint 167 audit Phase 1+2 informed)
**Tip:** Architectural fix sprint (code mutation OK, no audit constraint)
**Vizyon:** Sprint 167 audit'in tespit ettiği 5 architectural cluster için root-cause fix → Brain otonom sprint orkestrasyonu mümkün hale gelir

---

## 1. Summary

Sprint 168 = **Pure Brain Repair**. Sprint 167 audit (Phase 1+2) Brain orchestration'ın 10 bug × 5 architectural cluster (Cluster A Hook Chain, B Locking Asymmetry, C Plan↔Spawn Disconnect, D Metrics Math, E Worker Lifecycle Mismatch) ile **kırık olduğunu** kanıtlı bir şekilde gösterdi. Phase 4.5 architectural review trigger justified — semptom fix yetmedi (3+ failed fix attempt per cluster), architectural refactor gerekli.

Sprint 168'in görevi: 5 cluster için 5 anchor task (C0a-C0e) ile root-cause fix. Sprint 167 audit findings'in Memory + OSS prep kısmı (C1-C2, H1-H5) **Sprint 168.5'e ertelendi** (audit remediation phase). Sprint 169 = OSS GA (conditional).

Brain hala kırık olduğu için Sprint 168 execution **manuel subagent dispatch** ile yapılır (5 paralel claude subagent, Sprint 164 doc-sync paterni proven). Brain bypass — chicken-and-egg paradox: Brain'in kendisi Brain repair'i otonom yapamaz.

Mekanik: Sprint 166/167 v1→v5 eval zinciri (brainstorming → systematic-debugging eval → devil's advocate → integration → Alperen final). 5 paralel subagent her cluster için TDD pattern (failing test önce + fix + pass + smoke test).

## 2. Context

### Sprint 167 Audit Sonrası Durum

- **Sprint 167 verdict:** GO_WITH_TECH_DEBT (T2 manuel retry, Brain SPAWN crash live evidence)
- **10 bug × 5 architectural cluster** (Phase 1+2 raporları)
- **Sprint 167 manuel survival pattern** 23+ incident (Sprint 164-167 toplam)
- **Brain finalize hook chain kısmî:** Step 1+3 ✓, Step 2 deprecated dispatch hala, Step 4 sentinel marker ✓ ama ADR list 44/50, Step 5 wire kırık
- **8 commit Sprint 167 zinciri:** e0bf018 → 863de9a (spec v1→v5 + plan + DIRECTIVES + audit + finalize + Phase 1 + Phase 2)

### 5 Architectural Cluster (Phase 4.5 Trigger Justified)

| Cluster | Bug'lar | Architectural Problem | Phase 4.5 Trigger Evidence |
|---|---|---|---|
| **A — Hook Chain Implementation Gap** | BUG-CC, BUG-DD, BUG-EE, BUG-GG | ADR-046 spec ile real implementation kısmî | Sprint 161/163/166/167 four wire fix attempts, hala kısmî |
| **B — Locking Infrastructure Asymmetry** | RC4 Bug E | Sprint 156 T-10 SpawnLock asymmetric, cleanup helpers eksik | 11 sprint orphan, Sprint 166 P0 işaretli |
| **C — Plan↔Spawn Integration Disconnect** | RC1, RC2, RC3 | Sprint 138 T4 designed, wire incomplete | 29 sprint orphan |
| **D — Sprint Metrics Math** | BUG-FF | Isolated null/undefined guard | Standalone |
| **E — Worker Lifecycle Mismatch** | BUG-HH | `_cleanupOrphanedPromptFiles()` non-selective, contract ihlal | Cascade ENDPOINT — single point of failure |

### Cascade Graph (Phase 2 Bulgu)

```
RC1 (parser) ─→ bare token
RC3 (cache) ─→ stale state ─┐
RC2 (collision) ─→ ignored ─┼─→ spawn attempt
                            │
                            ├─→ RC4 (SpawnLock cleanup gap) ─→ retry ─→ kill ─→
                            │       BUG-HH (claude.ts non-selective cleanup) ─→
                            │       ALL prompts deleted ─→ active workers fail
                            │
                            └─→ Sprint finalize ─→ Cluster A Hook Chain (Step 2/4/5/12 gap)
                                                  Sprint metrics (BUG-FF NaN/negative)
```

**Cluster E (BUG-HH) cascade ENDPOINT** — fix sıralaması cascade'in tersine: C0e → C0b → C0c → C0a → C0d.

## 3. Design Decisions

### 3.1 Scope: 5 Task Pure Brain Repair (Audit Remediation Sprint 168.5'e ertelendi)

Sprint 167 audit'in 12 task önerisi (T7 roadmap) **2 sprint'e bölündü**:
- **Sprint 168:** C0a-C0e (5 architectural fix, pure Brain Repair)
- **Sprint 168.5:** C1-C2 + H1-H5 + ADR-047 (8 task audit remediation)
- **Sprint 169:** OSS GA (conditional — Sprint 168.5 OSS pre-flip clear ise)

Rasyonale:
- Brain hala kırık → 12 task spawn Sprint 167 paterni replay riski
- C0a-C0e fix sonrası Brain otonom çalışabilir → Sprint 168.5 Brain dogfood test
- OSS GA için memory data integrity + secret scan + dashboard CI gate gerekli (Sprint 168.5)

### 3.2 Execution: Manuel Subagent Dispatch (5 Paralel)

Chicken-and-egg paradox: Brain orchestration kırık, Brain'in kendisi Brain repair'i otonom yapamaz. Sprint 167'de live evidence — `deckent start --auto-approve` SPAWN crash. Sprint 168'de aynı tuzağa düşmeyiz.

**Pattern:** Sprint 164 doc-sync paterni (5 paralel agent dispatch). Her cluster için 1 claude subagent:
- C0e subagent → Prompt Lifecycle + ADR-048
- C0b subagent → SpawnLock Symmetric Cleanup
- C0c subagent → Plan↔Spawn Integration Layer
- C0a subagent → Hook Chain Complete (bundle)
- C0d subagent → Metrics Math Guards

5 paralel subagent dispatch, çakışma riski Phase 2 dependency analysis ile minimal (her cluster ayrı modül grubu).

### 3.3 ADR Scope: Tek ADR-048 (Prompt Lifecycle Contract)

- ADR-048 (NEW): Prompt Lifecycle Contract — ADR-046 Step Ordering paterni
- Diğer cluster'lar mevcut ADR'leri (046 Step 2/4/5 fix, 037 RBAC, 035 Verification) extend eder — yeni ADR gerekmez
- ADR-047 (Manuel Survival Pattern) → Sprint 168.5'e ertelendi (T5 evidence input full collection sonrası)

### 3.4 GO/NO_GO Criteria (Strict)

| Kriter | Falsifiable Predicate |
|---|---|
| Anchor task DONE | 5/5 (0 NO_GO, GO_WTD ≤1) |
| TDD compliance | Her cluster: failing test → fix → pass + integration test |
| ADR-048 yazılı | `docs/adr/048-*.md` mevcut + memory.db `type='adr' id='adr-048'` row |
| `tsc --noEmit` | 0 hata |
| `vitest run` baseline tolerance | pass≥16395 + fail≤2 + skip≤41 (Sprint 167 baseline) |
| Brain otonom smoke test | Sprint 168 sonu 2-task minimal sprint spawn→execute→finalize otomatik (manuel survival pattern olmadan) |
| Sprint 168 NO_GO | Sprint 168.5 BLOCKED DEĞİL (Catch-22 fix Sprint 167 v4 paterni) |

**Brain otonom smoke test (Sprint 168 success criteria's most important):** Sprint 168 sonu mini sprint:
- 2 task DIRECTIVES (basit no-op)
- `deckent plan --mode ai` + `deckent start --auto-approve`
- Brain spawn → execute → finalize → memory.db Sprint 168 entries yazılır
- Manuel survival incident = 0

### 3.5 Eval Iteration Plan (Sprint 166/167 v1→v5 Paterni Proven)

1. **v1 spec** (bu doküman)
2. **v2 systematic-debugging eval (Agent A)** — Phase 1+2 referanslı, ≥95/100 hedef
3. **v3 devil's advocate eval (Agent B)** — saldırgan kritik, <30/100 hedef
4. **v4 integration** — A + B feedback
5. **v5 Alperen final approval**

## 4. Anchor Tasks (Detail)

### C0e — Prompt Lifecycle Contract + ADR-048

**Cluster:** E (Worker Lifecycle Mismatch)
**Cascade position:** ENDPOINT — fix önce, cascade kapatılır
**Severity:** CRITICAL

**Scope:**
- `src/providers/claude.ts:125-142` `_cleanupOrphanedPromptFiles()` **KALDIR** (Option B Phase 2'de önerildi)
- `src/orchestra/spawn-backend-docker.ts:982` `archivePromptFiles()` tek source of truth
- `src/orchestra/sprint-lifecycle.ts:309` invocation noktası sprint cleanup phase
- ADR-048 yazımı: `docs/adr/048-prompt-lifecycle-contract.md` (MADR v3, accepted)
- Cross-backend audit: Docker + Subprocess + Tmux 3 backend contract uniformity

**TDD steps:**
1. **Failing test:** `tests/providers/claude-cleanup-prompt-persistence.test.ts`
   ```typescript
   it('preserves active worker prompt file on kill of another worker', () => {
     // setup: 2 worker spawn (167-001, 167-002)
     // act: kill 167-001
     // assert: .prompt-167-002-*.txt MEVCUT (not deleted)
   });
   ```
2. Run test → FAIL (current implementation deletes all)
3. Fix: claude.ts _cleanupOrphanedPromptFiles fonksiyonunu kaldır (veya filter ekle)
4. Run test → PASS
5. ADR-048 yaz (MADR v3 format, Sprint 166 ADR-046 paterni)
6. Regression test full suite (vitest run)
7. Worker .result write

**Kanıt:**
- `grep "_cleanupOrphanedPromptFiles" src/providers/claude.ts` → 0 match (kaldırıldı) VEYA filter signature ile
- `ls docs/adr/048-*.md` → mevcut
- `npx vitest run tests/providers/claude-cleanup-prompt-persistence.test.ts` → PASS

---

### C0b — SpawnLock Symmetric Cleanup

**Cluster:** B (Locking Infrastructure Asymmetry)
**Cascade position:** Middle layer
**Severity:** CRITICAL

**Scope:**
- `src/core/file-lock.ts`: 4 yeni helper
  - `checkSpawnLock(projectRoot, filePath)`
  - `checkSpawnLocks(projectRoot)` (batch)
  - `clearStaleSpawnLocks(projectRoot, maxAgeMs=300000)` — 5min TTL
  - `clearOrphanSpawnLocks(projectRoot, activeTaskIds)` — taskId-aware
- `src/monitor/auditor.ts:L485` paterni: `stale_spawn_lock` alert + auto-cleanup (30s scan)
- `src/orchestra/spawn-backend-docker.ts:933` on-exit hook: sad-path cleanup garantisi

**TDD steps:**
1. **Failing test:** `tests/core/spawn-lock-cleanup.test.ts`
   ```typescript
   it('clears orphan spawn lock after worker crash', () => {
     // setup: acquireSpawnLock(taskId='167-001', file='./test.ts')
     // simulate crash: kill -9 process (process.exit(137))
     // act: Auditor scan loop (clearOrphanSpawnLocks with activeTaskIds=[])
     // assert: .spawnlock orphan deleted
   });
   ```
2. FAIL → Fix → PASS
3. Auditor integration test (scan loop binding)

**Kanıt:**
- `grep "clearOrphanSpawnLocks\|clearStaleSpawnLocks" src/core/file-lock.ts` → 2+ match
- `grep "stale_spawn_lock\|clearOrphanSpawnLocks" src/monitor/auditor.ts` → 2+ match

---

### C0c — Plan↔Spawn Integration Layer

**Cluster:** C (Plan↔Spawn Disconnect)
**Cascade position:** Root layer
**Severity:** CRITICAL

**Scope (3 alt-fix):**
1. **RC1 Parser fix:** `src/orchestra/planner.ts` veya `task-builder.ts`
   - "Files (write):" regex full path extract
   - Bare token blocklist (`.ts`, `.md`, `.test`, `test.ts`, etc.)
   - `validateScopeFilesWrite(filesWrite: string[]): { valid: boolean; errors: string[] }` validator
2. **RC2 Alert consume:** Brain decision-engine veya sprint-controller
   - `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` event subscriber
   - Decision: block spawn for colliding task IDs
3. **RC3 Cache invalidation:** Brain `TASK_ASSIGN` emit öncesi
   - task.json fresh disk read invariant (spawn-backend-docker.ts:733 paterni)

**TDD steps:**
1. **Failing test 1:** `tests/orchestra/parser-bare-token.test.ts` — "Files (write): foo.ts" → full path extract, NOT bare ".ts"
2. **Failing test 2:** `tests/orchestra/scope-collision-blocker.test.ts` — Auditor alert → Brain spawn blocked
3. **Failing test 3:** `tests/orchestra/brain-cache-invalidation.test.ts` — task.json manuel patch → Brain TASK_ASSIGN event fresh content
4. Each → FAIL → Fix → PASS
5. Integration test: Plan-time collision + parser bare → expect spawn blocked

**Kanıt:**
- `grep "validateScopeFilesWrite\|SCOPE_COLLISION_DETECTED.*subscribe\|task.json.*readFileSync" src/orchestra/` → multiple match
- 3 TDD test PASS

---

### C0a — Hook Chain Complete (Bundle: Step 2/4/5/12)

**Cluster:** A (Hook Chain Implementation Gap)
**Cascade position:** Finalize-only (cascade dışı ama Brain bütünlüğü)
**Severity:** CRITICAL

**Scope (4 alt-fix bundle):**
1. **Step 2 (BUG-GG):** `identity-generator.ts` `skipIdentityRegen` default=true (deprecated enforcement)
2. **Step 4 (T3 audit finding):** `rule-generator.ts` Active ADR Constraints memory.db query'sinden regenerate + idempotent sentinel marker replace
3. **Step 5 (BUG-DD + BUG-EE):** `sprint-retro-writer.ts` writeRetrospective DB upsert + RETRO.md file write dual invariant
4. **Step 12 (BUG-CC):** `sprint-docs-updater.ts:570` archiveDirectives — auto_archive_directives davranışı doc'a ekle veya default false flip (Alperen kararı)

**TDD steps:**
1. **Failing test:** `tests/orchestra/hook-chain-integration.test.ts` — end-to-end Step 1-5 + Step 12 chained sprint finalize
2. Test FAIL → 4 sub-fix → Test PASS
3. Per-step regression test
4. ADR-046 contract invariant test

**Kanıt:**
- `grep "skipIdentityRegen.*true\|default.*true" src/core/identity-generator.ts` → 1+ match
- `grep "store.getByType.*adr" src/core/rule-generator.ts` → 1+ match (DB query)
- `grep "RETRO.md.*write\|writeFileSync.*retro" src/orchestra/sprint-retro-writer.ts` → 1+ match
- Sprint 168 finalize sonrası: `.brain/sprints/sprint-168.md` + memory.db `sprint-log-168/retro-sprint-168/mem-sprint-168` 3 row + RETRO.md mtime current

---

### C0d — Sprint Metrics Math Guards

**Cluster:** D (Sprint Metrics Math)
**Cascade position:** Isolated
**Severity:** MEDIUM (cosmetic, P1)

**Scope:**
- Duration null guard: `start && end ? end - start : 0`
- Coverage division by zero: `total > 0 ? covered/total*100 : null` display "N/A"
- Unit test: edge case (start null, total 0)

**TDD steps:**
1. **Failing test:** `tests/orchestra/sprint-metrics-guards.test.ts` — edge cases
2. FAIL → Fix → PASS

**Kanıt:**
- `grep "Math.max(0\|N/A\|null.*coverage" src/orchestra/sprint-reporter.ts` → 1+ match

---

## 5. Architecture

### 5.1 Subagent Dispatch Strategy

5 paralel claude subagent (Sprint 164 paterni). Her subagent:
- **Prompt:** Phase 1+2 raporu cluster section + scope + TDD steps + ADR contract
- **Tools:** Edit/Write/Read/Bash (TDD pattern için)
- **Scope:** Per-cluster modül grubu (Phase 2'de listelendi)
- **Output:** Code fix + tests + commit

Dependency analysis (Phase 2 Section "Cross-Cluster Dependency Graph"):
- 5 cluster ayrı modül grubu — çakışma minimal
- Eğer çakışma olursa (örn. C0c brain.ts + C0a sprint-finalizer.ts) sequential refactor

### 5.2 ADR-048 Skeleton (C0e subagent yazacak)

```markdown
# ADR-048: Prompt Lifecycle Contract

**Status:** accepted
**Date:** 2026-05-14
**Sprint:** 168

## Context
[Sprint 167 BUG-HH evidence + cascade graph]

## Decision
- `.tasks/.prompt-*.txt` lifecycle: write at spawn → persist until sprint cleanup → archive (not delete)
- `_cleanupOrphanedPromptFiles()` non-selective KALDIRILDI
- `archivePromptFiles()` (sprint-lifecycle.ts:309) tek atomic operation
- Cross-backend contract uniformity (Docker + Subprocess + Tmux)

## Consequences
- Active worker prompt erişebilir (BUG-HH eradicated)
- Sprint cleanup phase'inde tek source of truth
- Test: regression Sprint 168 + canary Sprint 169

## Related ADRs
ADR-046 (Step Ordering Contract) — Step 12 archive paterni reference
```

### 5.3 Brain Smoke Test (Sprint 168 GO/NO_GO Critical)

Sprint 168 task'lar bitince **otonom smoke test:**

```bash
# Test sprint: 2 minimal task, Brain orchestration only
cat > .test/sprint-168-smoke-directives.md <<EOF
# DIRECTIVES — Sprint 168 Smoke Test
## Goal: Brain Otonom Spawn-Execute-Finalize Test (2 task)

## Task 1: T1 minimal echo
- Model: haiku
- Scope: .test/
- Description: `echo "T1 done" > .test/t1-result.txt`

## Task 2: T2 minimal echo (depends T1)
- Model: haiku
- Dependencies: ["sprint-168-smoke-T1"]
- Scope: .test/
- Description: cat .test/t1-result.txt + echo "T2 done"
EOF

cp .test/sprint-168-smoke-directives.md DIRECTIVES.md
npx deckent plan --no-confirm
npx deckent start --auto-approve
# Beklenen: Brain spawn → execute → finalize otomatik (manuel survival 0)
```

PASS criteria:
- 2/2 task DONE
- memory.db sprint-log-168-smoke + retro entry yazıldı
- `.brain/RETRO.md` mtime current
- 0 manuel intervention

## 6. Eval Iteration Plan (Sprint 166/167 v1→v5 Paterni)

| Versiyon | Yöntem | Hedef |
|---|---|---|
| v1 | brainstorming output | spec foundation |
| v2 | systematic-debugging eval (Agent A) | ≥95/100 |
| v3 | devil's advocate eval (Agent B) | <30/100 |
| v4 | A+B integration | madde-by-madde fix |
| v5 | Alperen final approval | GO |

## 7. Risks + Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Subagent dispatch çakışma (örn. C0c brain.ts + C0a sprint-finalizer.ts) | Medium | Phase 2 dependency analysis — eğer çakışma, sequential agent run |
| Brain smoke test fail (5 fix sonrası hala kırık) | High | Smoke test FAIL → root cause investigation Phase 1 (yeni döngü) |
| ADR-048 contract incomplete | Low | C0e subagent prompt'a ADR-048 skeleton inject |
| Sprint 168 task taşması (effort tahmin <30h, gerçek >40h) | Medium | Sprint 168.5'e shift fallback (Catch-22 v4 paterni) |
| Test coverage gap (TDD'ye rağmen) | Low | Integration test her cluster için + smoke test sprint sonu |
| ADR-046 Step Ordering Contract regression | Medium | C0a Hook Chain Complete + integration test ADR-046 invariant |

## 8. Sprint 168.5 + 169 Handoff

### Sprint 168.5 = Audit Remediation (8 task)

- **C1** Memory Relations Migration (Sprint 167 T4 CR-1)
- **C2** Bug Z3 Memory Rebuild Safety + Auto-Backup
- **ADR-047** Manuel Survival Pattern (Sprint 167 T5 evidence input)
- **H1** ADR DB→FS Export Pipeline (43 missing .md)
- **H2** Stub Memory Entries Backfill + Quarantine
- **H3** OSS Pre-Flip Secret Scan Baseline
- **H4** Dashboard Build CI Gate
- **H5** dep_pipeline_enabled Flip + 3-Layer Doc Fix

**Sprint 168.5 Brain otonom (eğer Sprint 168 başarılı):** `deckent plan + start` normal flow, manuel subagent fallback yok.

### Sprint 169 = Open Source GA (conditional)

- VerhexIO/deckent-dev → VerhexIO/deckent public flip
- npm publish v1.0.0-beta.2
- Show HN launch + community feedback
- ConditionalIf Sprint 168.5 OSS pre-flip clear (H1-H5 done)

## 9. Pre-Flight Checklist (Sprint 168 Başlatma Öncesi)

- [ ] `git status` clean (Sprint 167 closure commit'leri push edildi)
- [ ] `npm run build` PASS (Alperen onayı) — Sprint 167 commit'leri dist'te
- [ ] `npx deckent doctor` GREEN
- [ ] `.audit/sprint-167/T5-brain-debug-phase1.md` + `phase2.md` mevcut (Sprint 168 subagent prompt input)
- [ ] `.audit/sprint-167/T7-cross-cutting-synthesis.md` + `consolidated-inventory.md` mevcut
- [ ] Sprint 168 spec v5 final approved + commit
- [ ] Sprint 168 DIRECTIVES.md yazılı (Sprint 167 DIRECTIVES archive sonra)
- [ ] 5 subagent prompt template hazır (cluster başına 1)
- [ ] `tests/` dizini Sprint 168 yeni test'ler için hazır
- [ ] `docs/adr/048-*.md` placeholder (ADR-048 C0e subagent yazacak)

---

**Versiyon notu:** Bu v1 spec brainstorming output'udur. v2 (systematic-debugging eval Agent A), v3 (devil's advocate Agent B), v4 (integration), v5 (Alperen final approval) eval zincirinden geçecektir. Sprint 166/167 paterni proven — 5 iter ile god-level approval (Agent A 95+, Agent B <30).
