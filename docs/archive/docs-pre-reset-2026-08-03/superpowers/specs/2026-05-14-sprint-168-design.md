# Sprint 168 — Brain Repair Phase Sprint

**Tarih:** 2026-05-14
**Sprint:** 168
**Versiyon:** v5 (Agent A+B 2nd round patch — 6 madde minor, çift hedef başarılı)
**Tip:** Architectural fix sprint with hardened subagent dispatch protocol
**Vizyon:** Sprint 167 audit'in tespit ettiği 5 architectural cluster için root-cause fix + Brain otonom orchestration

> **v1→v5 zinciri:**
> - v1 (commit fc91fcd): brainstorming output
> - v2 1st round Agent A systematic-debugging: 79/100, Phase 4.5 trigger, 5 critical/high
> - v3 1st round Agent B devil's advocate: 22/100, hedef <30 KARŞILANDI ✅
> - v4 (commit 72b4880): 17 madde integration
> - v5 2nd round Agent A: **96/100 APPROVED ✅** (hedef ≥95)
> - v5 2nd round Agent B: **26/100 SHIP_AS_IS ✅** (hedef <30 korundu)
> - v5 patch (bu): 6 madde minor (4 Agent A cosmetic + 2 Agent B clarification)
> - v6 Alperen final approval bekliyor

---

## 1. Summary

Sprint 168 = **Pure Brain Repair**. Sprint 167 audit Phase 1+2 ile Brain orchestration'ın 10 bug × 5 architectural cluster ile kırık olduğu kanıtlandı. Phase 4.5 trigger justified — semptom fix yetmedi (3+ failed fix per cluster).

**v4 önemli reframe (Agent B savunulamaz #1):** "Brain kırık" iddiası aşırı genel idi. Modül-fonksiyon-satır seviyesinde gerçek:

- **Brain.ts/sprint-controller.ts orchestration loop:** ÇALIŞIYOR (`deckent plan` AI mode + `deckent start` Sprint 167'de spawn etti)
- **Brain spawn pipeline:** KIRIK (RC1 parser bare token, RC4 SpawnLock cleanup gap, BUG-HH cleanup cascade) — 4 bug evidence
- **Brain finalize hook chain:** KISMI ÇALIŞIYOR (Step 1+3 ✓, Step 2 deprecated dispatch hala, Step 4 sentinel marker shipped + ADR list 44/50, Step 5 wire kırık) — 4 bug evidence
- **Brain decision-engine integration:** EKSIK (Auditor SCOPE_COLLISION_DETECTED subscribe yok) — Sprint 138 T4 wire incomplete, 1 bug evidence

Yani Brain'in TÜM mekanizması kırık değil — **spawn pipeline + finalize hook chain bağlamında 4 modül grubu kırık**. Sprint 168 bu 4 grup için root-cause fix yapar.

**10 bug attribution explicit (Agent A 2nd round #2 patch):**
- Cluster A (Hook Chain — 4 bug): BUG-CC + BUG-DD + BUG-EE + BUG-GG
- Cluster B (Locking — 1 bug): RC4 Bug E
- Cluster C (Plan↔Spawn — 3 bug): RC1 + RC2 + RC3
- Cluster D (Metrics — 1 bug): BUG-FF
- Cluster E (Worker Lifecycle — 1 bug): BUG-HH
- **Toplam:** 4+1+3+1+1 = **10 bug** ✓

Sprint 168 scope 8 task'a genişletildi (Agent A #2 — C0a bundle split):
- **C0a Hook Chain Complete** 4 ayrı sub-anchor'a bölündü (C0a-1/C0a-2/C0a-3/C0a-4)
- C0b + C0c + C0d + C0e (4 cluster fix)
- ADR-047 + ADR-048 Sprint 168'de yazılır (Agent A #4)

**Sprint 168.5'e ertelendi:** Audit Remediation (Memory Relations, Bug Z3, ADR FS export, secret scan, dashboard, dep_pipeline flip).

**Sprint 169:** OSS GA (conditional).

Execution: **Hardened manuel subagent dispatch** (git worktree isolation + file-authority matrix + lock pattern + Alperen review gate) — Sprint 164 paternini hardened version (Agent A #4 + Agent B Saldırı #3 fix).

## 2. Context

### Sprint 167 Audit Sonrası Durum

10 bug × 5 architectural cluster (Phase 1+2 raporları detail):
- Cluster A — Hook Chain Implementation Gap (BUG-CC, DD, EE, GG)
- Cluster B — Locking Asymmetry (RC4 Bug E)
- Cluster C — Plan↔Spawn Disconnect (RC1, RC2, RC3)
- Cluster D — Metrics Math (BUG-FF)
- Cluster E — Worker Lifecycle Mismatch (BUG-HH) — cascade ENDPOINT

### Cascade Graph + Cross-Cluster Dependency (v4 YENI Agent B #2)

```
[Plan-time]
  RC1 (parser)─→ bare token ─┐
  RC3 (cache stale)─→ stale ─┼─→ Brain TASK_ASSIGN payload
  RC2 (collision)─→ ignored ─┘
                                     │
[Spawn-time]                          ▼
  RC4 (SpawnLock cleanup gap)─→ spawn lock conflict
                                     │
[Worker lifecycle]                    ▼
  BUG-HH (claude.ts:129 non-selective cleanup)─→ ALL prompts deleted
                                     │
[Finalize phase]                      ▼
  Cluster A: Hook chain
    Step 2 (BUG-GG dispatch deprecated)
    Step 4 (BUG-?? ruleRegen ADR list partial)
    Step 5 (BUG-DD + BUG-EE wire kırık)
    Step 12 (BUG-CC DIRECTIVES overwrite)
  Sprint metrics
    BUG-FF (Duration negative + Coverage NaN)
```

**Cross-cluster dependency (v4 yeni — Agent A P4.5 trigger):**

```
sprint-controller.ts (Brain)
  ├─→ TASK_ASSIGN emit ← C0c (decision-engine collision subscribe)
  ├─→ Spawn dispatch ← C0b (SpawnLock cleanup) + C0e (prompt persistence)
  └─→ Finalize phase ← C0a-1/2/3/4 (Hook Chain Step 2/4/5/12)

decision-engine.ts ← C0c subscriber
file-lock.ts ← C0b + C0e (lock + prompt lifecycle)
identity-generator.ts ← C0a-1 (Step 2 skip default)
rule-generator.ts ← C0a-2 (Step 4 DB query + sentinel)
sprint-retro-writer.ts ← C0a-3 (Step 5 DB+file dual write)
sprint-docs-updater.ts ← C0a-4 (Step 12 archive decision)
sprint-finalizer.ts ← C0a chain orchestrator
claude.ts (provider) ← C0e
planner.ts/task-builder.ts ← C0c (RC1 parser)
sprint-reporter.ts ← C0d (Metrics math)
auditor.ts ← C0b binding
```

**Çakışma yöneti̇mi̇ (Agent A #10 fix):**
- `sprint-controller.ts` C0a + C0c implicit shared edit yer — sequential merge protocol (Section 5.1)
- `sprint-finalizer.ts` C0a-1/2/3/4 4 sub-anchor aynı dosyada — single subagent sequential commit (per-step staged)
- `auditor.ts` C0b binding + future C0c monitoring — C0b önce, C0c sonra

## 3. Design Decisions

### 3.1 Scope: 8 Task (Sprint 168.5 = Audit Remediation, Sprint 169 = OSS GA)

**Sprint 168 task list (v4):**

| # | Task | Cluster | Modül | Effort (v4 revised) |
|---|---|---|---|---|
| **C0e** | Prompt Lifecycle Contract + ADR-048 | E | claude.ts + spawn-backend-docker.ts + sprint-lifecycle.ts | normal (4h) |
| **C0b** | SpawnLock Symmetric Cleanup | B | file-lock.ts + auditor.ts + spawn-backend-docker.ts | high (5h) |
| **C0c** | Plan↔Spawn Integration Layer | C | planner.ts + decision-engine.ts + sprint-controller.ts | high (8h) |
| **C0a-1** | Step 2 identityRegen Default Flip | A.1 (BUG-GG) | identity-generator.ts | low (1h) |
| **C0a-2** | Step 4 ruleRegen DB Query + Sentinel Idempotent | A.2 (T3 finding) | rule-generator.ts + sprint-finalizer.ts | normal (3h) |
| **C0a-3** | Step 5 retro Dual Write (DB + RETRO.md) | A.3 (BUG-DD + BUG-EE) | sprint-retro-writer.ts | normal (3h) |
| **C0a-4** | Step 12 archiveDirectives Decision + ADR Amendment | A.4 (BUG-CC) | sprint-docs-updater.ts + ADR-046 amendment | low (2h) |
| **C0d** | Sprint Metrics Math Guards | D (BUG-FF) | sprint-reporter.ts | low (1h) |
| **ADR-047** | Manuel Subagent Dispatch Protocol | meta | docs/adr/047-*.md | normal (2h) |
| **ADR-048** | Prompt Lifecycle Contract | C0e içinde | docs/adr/048-*.md | included in C0e |

**Total effort tahmin (v4 — Agent B V6 fix):** 8 task ~30h work + 5h ADR-047 yazımı = ~35h. 5 paralel subagent + sequential merge = 2-3 gün gerçekçi (önceki 1-2 gün iddiası yanıltıcıydı).

**Sprint 168.5 = Audit Remediation** (8 task — Sprint 167 T7 roadmap'tan):
- C1 Memory Relations Migration
- C2 Bug Z3 Memory Rebuild Safety
- H1 ADR DB→FS Export Pipeline
- H2 Stub Memory Entries Backfill
- H3 OSS Pre-Flip Secret Scan Baseline
- H4 Dashboard Build CI Gate
- H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix
- (Eğer Sprint 168 GO ise Brain otonom çalışır)

**Sprint 169 = OSS GA conditional:**
- VerhexIO/deckent → VerhexIO/deckent public flip
- npm publish v1.0.0-beta.2
- Show HN launch
- ConditionalIf Sprint 168.5 OSS pre-flip clear (H1-H5 done)

### 3.2 Execution: Hardened Manuel Subagent Dispatch

**v1'in "manuel subagent dispatch" zayıflıktı (Agent A #4 + Agent B V7).** v4'te hardened protocol:

#### 3.2.1 Dispatch Mechanism (Agent A #4 fix)

**Tool:** Claude Code `Agent` tool (Task tool — general-purpose subagent) ile dispatch.

**Isolation:**
- **Git worktree isolation per cluster** (Agent B #5 fix): Her cluster için ayrı git worktree
  ```bash
  git worktree add ../deckent-sprint-168-C0a-1 main
  git worktree add ../deckent-sprint-168-C0b main
  # ... 8 worktree
  ```
- Subagent her biri kendi worktree'de çalışır, conflict yok
- Sprint sonu: rebase + merge to main (sequential)

**File authority matrix:**

| Subagent | scope.filesWrite (yazma yetkisi) | scope.filesRead |
|---|---|---|
| C0e | src/providers/claude.ts, src/orchestra/sprint-lifecycle.ts, docs/adr/048-*.md, tests/providers/, tests/orchestra/ | tüm src/ + tests/ |
| C0b | src/core/file-lock.ts, src/monitor/auditor.ts (lock binding), src/orchestra/spawn-backend-docker.ts (on-exit hook), tests/core/ | tüm src/ + tests/ |
| C0c | src/orchestra/planner.ts, src/orchestra/task-builder.ts, src/orchestra/decision-engine.ts, src/orchestra/sprint-controller.ts (TASK_ASSIGN re-read), tests/orchestra/ | tüm src/ + tests/ |
| C0a-1 | src/core/identity-generator.ts, tests/core/ | tüm src/ + tests/ |
| C0a-2 | src/core/rule-generator.ts, src/orchestra/sprint-finalizer.ts (sequential lock), tests/core/, tests/orchestra/ | tüm src/ + tests/ |
| C0a-3 | src/orchestra/sprint-retro-writer.ts, tests/orchestra/ | tüm src/ + tests/ |
| C0a-4 | src/orchestra/sprint-docs-updater.ts, ADR-046 amendment, tests/orchestra/ | tüm src/ + tests/ |
| C0d | src/orchestra/sprint-reporter.ts (veya managed-doc-runner.ts), tests/orchestra/ | tüm src/ + tests/ |
| ADR-047 | docs/adr/047-*.md | tüm spec'ler |

**Sequential merge order (cascade'in tersine):**
1. C0e (cascade endpoint — first)
2. C0b (locking)
3. C0c (plan↔spawn integration)
4. C0a-1/2/3/4 (hook chain, internal sequential within C0a)
5. C0d (isolated)
6. ADR-047 (yazılır, paralel)

#### 3.2.2 Lock Pattern (Agent A #10 fix)

`.deckent/sprint-168-dispatch-locks.json`:
```json
{
  "version": "1.0",
  "subagents": {
    "C0a-1": { "worktree": "../deckent-sprint-168-C0a-1", "status": "pending", "files_owned": [...] },
    "C0a-2": { "worktree": "../deckent-sprint-168-C0a-2", "status": "pending", "files_owned": [...] },
    ...
  }
}
```

Sequential merge: Önceki subagent DONE olmadan sonraki başlayamaz (sprint-controller.ts gibi shared files için).

#### 3.2.3 TDD Enforcement Gate (Agent B V7 fix)

**Subagent prompt'a ZORUNLU inject:**
- Skip ekleme YASAK (Sprint 167 baseline 41 skip, Sprint 168 sonrası ≤41)
- Test PASS olmadan commit YASAK
- Subagent .result dosyasında `tests_skipped_added: 0` field zorunlu
- Alperen review gate: subagent commit sonrası `npx vitest run` çıktısı + skip count delta kontrol
- Eğer skip arttıysa: subagent retry veya manuel fix

#### 3.2.4 Manual Survival Fallback (Agent B V5 fix)

**Sprint 168 NO_GO durumu için explicit fallback (Sprint 168.5 BLOCKED zinciri açıklaması):**

- Sprint 168 NO_GO senaryosu: 8 task'tan ≥2 fail VEYA smoke test fail
- Sprint 168.5 başlatma kuralı:
  - Sprint 168 GO → Sprint 168.5 Brain otonom (deckent plan + start normal flow)
  - Sprint 168 GO_WTD (1 fail) → Sprint 168.5 yarı otonom (Brain spawn AMA Alperen monitoring)
  - **Sprint 168 NO_GO → Sprint 168.5 yine manuel subagent dispatch (Sprint 168 paterni replay)**
  - Sprint 168 fail eden cluster Sprint 168.5'in ilk task'ı olur (gap closure)

Recursion paradox kabul: Brain repair sırasında manuel dispatch GEREKLİ. Sprint 168 sonu Brain otonom OLMAYABILIR — bu durumda Sprint 168.5 hala manuel survival ile çalışır AMA Sprint 168'in fix'leri persistent (regression yok). Sprint 169 OSS GA Brain otonom hedefi Sprint 170+'a kayabilir.

### 3.3 ADR Scope (v4 expanded — Agent A #4)

**Sprint 168'de 2 yeni ADR (v1'in tek ADR-048'i yetersizdi):**

- **ADR-047** Manuel Subagent Dispatch Protocol (yeni v4 — meta-anchor task)
  - Git worktree isolation
  - File authority matrix
  - Lock pattern
  - TDD enforcement gate
  - Manual survival fallback semantik
  - **MADR v3 hibrit format**
- **ADR-048** Prompt Lifecycle Contract (C0e içinde)
  - tmpfiles persist until sprint cleanup
  - archivePromptFiles tek source of truth
  - Cross-backend uniformity (Docker + Subprocess + Tmux)
  - Cross-sprint orphan handling (Agent A #1 — fix below)

**ADR-048 Wave 1.5 Serial Gate (Agent B #4 fix):**
Sprint 166 T11 paterni — C0e subagent ADR-048 yazımı sonrası Alperen manuel CHECKPOINT:
- ADR-048 MADR v3 format compliance check
- Cross-backend audit sonucu doğrula
- `npx deckent memory rebuild` veya backfill script ile DB'ye insert
- `.deckent/decisions/sprint-168-C0e-done.json` write
- Sonra C0a-1/2/3/4 + C0b + C0c + C0d paralel başlatılır

### 3.4 Strict GO/NO_GO Criteria (v4 hardened)

| Kriter | Falsifiable Predicate (v4) |
|---|---|
| Anchor task DONE | **8/8** (0 NO_GO, GO_WTD ≤1 — en muhtemel C0d cosmetic metrics fix degrade adayı, v5 patch netleştir) |
| TDD compliance | Her cluster: failing test → fix → pass + integration test |
| Skip count delta (v4 Agent B V7 fix) | **0 yeni skip** (baseline 41, Sprint 168 sonrası ≤41) |
| ADR-047 + ADR-048 | İkisi yazılı + memory.db `type='adr'` row count=2 artış |
| `tsc --noEmit` | 0 hata |
| `vitest run` baseline | pass≥16395 + fail≤2 + skip≤41 (Sprint 167 baseline) |
| Brain otonom smoke test (v4 expanded) | **3+ task complex sprint** (collision + crash + parallel) — Section 5.3 |
| Cross-sprint orphan handling (Agent A #1) | Cross-sprint prompt cleanup explicit test |
| ADR-046 invariant test (Agent B #7) | C0a integration test ADR-046 Step 1-5 invariant assert |
| Sprint 168 NO_GO ≠ Sprint 168.5 BLOCKED (Catch-22 v4) | Sprint 168.5 yine manuel dispatch ile başlar (Section 3.2.4) |

### 3.5 Eval Iteration Plan

| Versiyon | Yöntem | Hedef | Gerçek (Sprint 168) |
|---|---|---|---|
| v1 | brainstorming output | spec foundation | commit fc91fcd |
| v2 | systematic-debugging eval (Agent A) | ≥95/100 | 79/100 (P4.5 trigger) |
| v3 | devil's advocate eval (Agent B) | <30/100 | **22/100 ✅ KARŞILANDI** |
| v4 | A+B integration | 17 madde fix | bu doküman |
| v5 | Alperen final approval | GO | bekliyor |

## 4. Anchor Tasks (Detail v4)

### C0e — Prompt Lifecycle Contract + ADR-048 + Cross-Sprint Orphan Handling

**Cluster:** E | **Cascade:** ENDPOINT — first fix | **Severity:** CRITICAL | **Effort:** 4h

**Scope (v4 expanded — Agent A #1 + Agent B #6):**

1. **`src/providers/claude.ts:129` `_cleanupOrphanedPromptFiles()` fix:**
   - **Option C (v4 yeni — Agent A #1 fix):** Fonksiyon KALMASIN AMA selective filter ile (active worker'lar protected)
   - Signature: `_cleanupOrphanedPromptFiles(activeTaskIds: string[]): void`
   - Filter: `if (activeTaskIds.some(id => file.includes(id))) continue;`
   - Constructor-time çağrısı (claude.ts:122) için `getActiveWorkerIds()` invocation
   - **`getActiveWorkerIds()` helper extract (v5 patch — Agent A 2nd round MINOR-1):**
     - `auditor.ts:2162-2168` inline `Set<string>` pattern'i `src/core/active-workers.ts` shared helper'a extract
     - Export: `export function getActiveWorkerIds(projectRoot: string): string[]`
     - claude.ts constructor + cleanup function bu helper'ı invoke eder
2. **Cross-sprint orphan handling (Agent A #1 critical fix):**
   - Startup'ta `archivePromptFiles(prevSprintId)` çağrısı — prior sprint cleanup
   - Sprint 168 spawn öncesi: `archivePromptFiles(getPreviousSprintId())` invoke
3. **`spawn-backend-docker.ts:982 archivePromptFiles()` tek source of truth** sprint cleanup phase
4. **Cross-backend uniformity (Agent B #6 fix):**
   - Docker backend: spawn-backend-docker.ts:941-942 contract enforced
   - Subprocess backend: `src/orchestra/spawn-backend.ts` aynı contract eklendi
   - Tmux backend: `src/orchestra/tmux.ts` aynı contract eklendi
   - 3 backend prompt lifecycle paterni uniform
5. **ADR-048 yazımı + Wave 1.5 serial gate (Agent B #4 fix):**
   - MADR v3 hibrit
   - Cross-backend audit + cross-sprint orphan handling formal kontrat
   - Alperen CHECKPOINT öncesi Sprint 168 yarı-paralel devamı

**TDD steps:**
1. Failing test 1: `tests/providers/claude-cleanup-active-protected.test.ts` — active worker prompt protected
2. Failing test 2: `tests/orchestra/sprint-startup-prev-sprint-orphan.test.ts` — cross-sprint orphan cleanup
3. Failing test 3: `tests/orchestra/cross-backend-prompt-uniformity.test.ts` — 3 backend paterni aynı
4. FAIL → Fix → PASS
5. ADR-048 yaz + Wave 1.5 CHECKPOINT
6. Integration test sprint smoke

**Kanıt:**
- `grep -A 5 "_cleanupOrphanedPromptFiles" src/providers/claude.ts` → activeTaskIds parameter mevcut
- `ls docs/adr/048-*.md` → mevcut, MADR v3 format
- `node -e "const db=...; db.prepare(\"SELECT id FROM entries WHERE id='adr-048'\").get()"` → 1 row
- 3 TDD test PASS

---

### C0b — SpawnLock Symmetric Cleanup (v4 expanded — Agent A #8)

**Cluster:** B | **Cascade:** Middle layer | **Severity:** CRITICAL | **Effort:** 5h

**Scope (v4 — 5 helper Phase 2 listelendi, v1'de 4 idi, v4'te 5):**

1. **`src/core/file-lock.ts` 5 yeni helper:**
   - `checkSpawnLock(projectRoot, filePath): SpawnLockInfo | null` (Agent A #8 yeni)
   - `checkSpawnLocks(projectRoot): SpawnLockInfo[]` (batch)
   - `clearStaleSpawnLocks(projectRoot, maxAgeMs=300000): number` — 5min TTL
   - `clearOrphanSpawnLocks(projectRoot, activeTaskIds: string[]): number` — taskId-aware
   - `releaseStaleSpawnLocksForTask(projectRoot, taskId): void` — on-error cleanup
2. **`src/monitor/auditor.ts:L485` paterni:**
   - Yeni `stale_spawn_lock` alert (type literal)
   - `spawn_lock_orphan` event channel (AUDITOR→BRAIN)
   - 30s scan loop integration (existing pattern)
3. **`src/orchestra/spawn-backend-docker.ts:933` on-exit hook:**
   - Happy + sad path coverage (worker crash/kill scenarios)
   - SIGTERM + SIGKILL trap

**TDD steps:**
1. Failing test 1: `tests/core/spawn-lock-orphan-cleanup.test.ts` — kill -9 simulation
2. Failing test 2: `tests/core/spawn-lock-stale-ttl.test.ts` — 5min TTL aşımı
3. Failing test 3: `tests/monitor/auditor-spawn-lock-binding.test.ts` — Auditor integration
4. FAIL → Fix → PASS

---

### C0c — Plan↔Spawn Integration Layer (v4 hardened — Agent A #3)

**Cluster:** C | **Cascade:** Root layer | **Severity:** CRITICAL | **Effort:** 8h

**Scope (v4 — 3 alt-fix detaylı, subscriber owner net):**

1. **RC1 Parser fix (`src/orchestra/planner.ts` veya `task-builder.ts`):**
   - "Files (write):" regex full path extract
   - Bare token blocklist (`.ts`, `.md`, `.test`, `test.ts`, basename-only)
   - `validateScopeFilesWrite(filesWrite: string[]): ValidationResult` validator
   - Output: `{ valid: boolean; errors: string[]; sanitized: string[] }`
2. **RC2 Alert consume (Agent A #3 fix — subscriber owner DESIGNATE):**
   - **Owner: `src/orchestra/decision-engine.ts`** (verified exists)
   - Function signature: `handleScopeCollision(payload: ScopeCollisionPayload): SpawnDecision`
   - Decision: `{ action: 'block' | 'replan' | 'continue', reason: string, taskIds: string[] }`
   - Brain spawn pipeline integration: TASK_ASSIGN öncesi decision-engine consult
   - **Mandatory test:** `decision-engine.ts` `BRAIN→SPAWN:BLOCKED` event emit on collision
3. **RC3 Cache invalidation:**
   - Brain `sprint-controller.ts` TASK_ASSIGN emit öncesi task.json fresh disk read
   - `readTaskJsonFresh(projectRoot, taskId): Task` helper
   - In-memory plan-state cache fields invalidated post-patch detect

**TDD steps:**
1. Failing test 1: `tests/orchestra/parser-bare-token-validation.test.ts` — "Files (write): foo/bar.ts" → no bare ".ts" token
2. Failing test 2: `tests/orchestra/decision-engine-collision-blocker.test.ts` — collision payload → block decision + event
3. Failing test 3: `tests/orchestra/brain-task-assign-fresh-read.test.ts` — manuel patch → fresh content
4. FAIL → Fix → PASS
5. Integration test: full Plan-time collision flow

---

### C0a-1 — Step 2 identityRegen Default Flip (Agent A #2 split)

**Cluster:** A.1 (BUG-GG) | **Severity:** MEDIUM | **Effort:** 1h

**Scope:**
- `src/core/identity-generator.ts` `skipIdentityRegen` default → `true`
- runPostFinalizeHooks signature: deprecated flag enforcement
- @deprecated comment update — Sprint 168'de runtime skip

**TDD:**
1. Failing test: `tests/core/identity-regen-default-skip.test.ts` — default opts → identityRegen invoked = false
2. FAIL → Fix → PASS

---

### C0a-2 — Step 4 ruleRegen DB Query + Sentinel Idempotent (Agent A #2 split + B #7 invariant)

**Cluster:** A.2 (T3 audit finding) | **Severity:** HIGH | **Effort:** 3h

**Scope:**
- `src/core/rule-generator.ts` Active ADR Constraints bloğu **memory.db query'sinden** (`store.getByType('adr')`) regenerate
- Hardcoded list yerine dynamic
- Sentinel marker `<!-- AUTO-START -->`/`<!-- AUTO-END -->` idempotent replace (append YASAK)
- 4 rules dir parity (.claude / .codex / .gemini / .cursor)
- **ADR-046 invariant test (Agent B #7 fix):** `tests/core/adr-046-step-ordering-invariant.test.ts` — Step 3 → Step 4 ordering Step 3 sonrası Step 4 fresh ADR list

**TDD:**
1. Failing test 1: `tests/core/rule-regen-db-query.test.ts`
2. Failing test 2: `tests/core/rule-regen-sentinel-idempotent.test.ts`
3. Failing test 3: ADR-046 invariant
4. FAIL → Fix → PASS

---

### C0a-3 — Step 5 retro Dual Write (Agent A #2 split)

**Cluster:** A.3 (BUG-DD + BUG-EE) | **Severity:** HIGH | **Effort:** 3h

**Scope:**
- `src/orchestra/sprint-retro-writer.ts` writeRetrospective:
  - `store.upsert({type: 'retro', id: 'retro-sprint-NNN', ...})` — DB
  - `store.upsert({type: 'sprint', id: 'sprint-log-NNN', ...})` — DB (BUG-DD)
  - `store.upsert({type: 'memory', id: 'mem-sprint-NNN', ...})` — DB
  - `writeFileSync('.brain/RETRO.md', content)` — file (BUG-EE)
- Atomic invariant: 3 DB upsert + 1 file write, transaction-like

**TDD:**
1. Failing test: `tests/orchestra/retro-dual-write.test.ts` — finalize sonrası 3 DB row + RETRO.md mtime current
2. FAIL → Fix → PASS

---

### C0a-4 — Step 12 archiveDirectives Decision + ADR-046 Amendment (Agent A #2 + #9)

**Cluster:** A.4 (BUG-CC) | **Severity:** MEDIUM | **Effort:** 2h

**Scope (Agent A #9 fix — decision NOW):**

- **Alperen kararı (Sprint 168 spec yazımı sırasında):** `auto_archive_directives` default behavior
  - Option A: default=true, DIRECTIVES.md placeholder ile reset (mevcut intent) — Sprint 168 spec'in yazıldığı an Alperen onayı
  - Option B: default=false, DIRECTIVES.md korunur, archive copy only
- **v4 öneri (Alperen review):** Default Option B (safer) + `auto_archive_directives: true` flag opt-in
- `src/orchestra/sprint-docs-updater.ts:570` writeFileSync(placeholder) conditional
- **ADR-046 amendment:** Step 12 archiveDirectives behavior dokümantasyon ekle
- Documentation update: BOOT.md + DECKENT.md `auto_archive_directives` config flag açıklama

**TDD:**
1. Failing test: `tests/orchestra/archive-directives-default-preserve.test.ts` — Sprint finalize sonrası DIRECTIVES.md content KORUNUR
2. FAIL → Fix → PASS

---

### C0d — Sprint Metrics Math Guards (unchanged from v1)

**Cluster:** D (BUG-FF) | **Severity:** MEDIUM (cosmetic) | **Effort:** 1h

**Scope:** Duration + Coverage null/undefined guards (v1 spec aynı).

---

### ADR-047 — Manuel Subagent Dispatch Protocol (v4 YENI — Agent A #4)

**Type:** Meta-anchor (NOT cluster fix, but governance for Sprint 168 itself)
**Effort:** 2h
**Owner:** Brainstorming/architect role

**Content (MADR v3):**
- Context: Sprint 164-168 manuel survival pattern proven
- Decision: Sprint 168 hardened dispatch protocol (Section 3.2)
- Consequences: Brain repair sprint'lerinde formal protocol
- Related ADRs: ADR-046 (Hook Chain), ADR-037 (RBAC), ADR-035 (Verification)

**TDD:** N/A (governance doc)

**Kanıt:**
- `ls docs/adr/047-*.md` → mevcut
- `node -e "..adr-047 row count"` → 1

## 5. Architecture

### 5.1 Subagent Dispatch Protocol (v4 ADR-047)

(Section 3.2'de detail — file authority matrix, git worktree isolation, lock pattern, TDD enforcement gate, manual survival fallback)

**Worker prompt template (her subagent için):**
```
SUBAGENT-CLUSTER-FIX (Sprint 168 C0X)
- Git worktree: ../deckent-sprint-168-CXX (isolated)
- File authority: <scope.filesWrite from matrix>
- TDD ZORUNLU: failing test → fix → pass
- **Yeni test'lerde skip kullanma** (v5 patch — Agent A 2nd round MINOR-3 reword). Mevcut 41 skip baseline aynı kalır, Sprint 168 yeni test'leri skip eklemeyecek.
- Test PASS olmadan commit YASAK
- ADR-047 dispatch protocol uyumlu
- Output: .deckent/sprint-168-CXX-result.json (status + skip delta + commit hash)
```

### 5.2 ADR-048 Wave 1.5 Serial Gate (Agent B #4)

Sprint 166 T11 paterni:
1. C0e subagent ADR-048 yazımı + claude.ts fix (paralel diğer subagent'lardan)
2. Alperen manuel CHECKPOINT:
   - ADR-048 MADR v3 format check
   - Cross-backend audit doğrula
   - DB insert verify (`npx deckent memory rebuild` veya direkt backfill)
   - `.deckent/decisions/sprint-168-C0e-done.json` write
3. C0a-1/2/3/4 + C0b + C0c + C0d paralel başlatılır

### 5.3 Brain Otonom Smoke Test — Complex Scenario Suite (Agent A #5 + Agent B Saldırı #2)

**v1 smoke test 2-task echo yetersizdi.** v4'te 3+ task complex scenario:

**Test sprint DIRECTIVES (`.test/sprint-168-smoke-directives.md`):**

```markdown
# DIRECTIVES — Sprint 168 Smoke Test

## Goal: Brain Otonom Spawn-Execute-Finalize Complex Scenario

## Task 1: T1 Scope Collision Trigger
- Model: haiku
- Scope: .test/, scope.filesWrite: [".test/shared.txt"]
- Description: write "T1 done" to .test/shared.txt

## Task 2: T2 Scope Collision with T1 (PARALLEL)
- Model: haiku
- Scope: .test/, scope.filesWrite: [".test/shared.txt"]  ← COLLISION (C0c test)
- Description: write "T2 done" to .test/shared.txt

## Task 3: T3 Kill Recovery Simulation (DEPENDS T1)
- Model: haiku
- Dependencies: ["sprint-168-smoke-T1"]
- Scope: .test/
- Description: cat .test/shared.txt + sleep 30 (will be killed mid-execution by smoke test)
```

**Smoke test runtime:**
```bash
cp .test/sprint-168-smoke-directives.md DIRECTIVES.md
npx deckent plan --no-confirm
# C0c: Expected — decision-engine collision detect → spawn block for T1 OR T2
# C0b: After ~10s, kill T3 worker container manually → orphan spawn lock
npx deckent start --auto-approve &
START_PID=$!
sleep 10
docker kill deckent-w-168-smoke-T3 2>&1
wait $START_PID
# C0e: T1, T2 prompt files MEVCUT olmalı (kill of T3 should not delete T1/T2 prompts)
# Cluster A: Brain finalize hook chain otomatik (3 sprint type DB entry + RETRO.md update)
```

**PASS criteria:**
- 1/2 collision task block (T1 OR T2 NO_GO with reason="scope_collision")
- 1 task kill → orphan spawn lock cleaned by Auditor (within 60s)
- T1 ve T2'nin prompt'ları kill sonrası MEVCUT (BUG-HH fix)
- Brain finalize otomatik (memory.db sprint-log-168 + retro-sprint-168 + mem-sprint-168 entries)
- RETRO.md mtime current
- Manuel survival incident = 0

**Sprint 168.5 pre-flight smoke test (v5 patch — Agent B 2nd round Saldırı #2):**

Sprint 168 smoke test sadece C0a/b/c/e pattern'lerini doğrular. Sprint 168.5 task'ları (C1 memory migration, H1 ADR FS export, H3 secret scan) farklı pattern. Sprint 168.5 başlatma öncesi **ek pre-flight smoke** çalıştırılır:

```bash
# Sprint 168.5 başlatma öncesi (Sprint 168 GO'dan sonra):
# Ek smoke: multi-file scope + DB write + repo scan pattern coverage

cat > .test/sprint-168.5-preflight-directives.md <<EOF
# DIRECTIVES — Sprint 168.5 Pre-Flight Smoke Test

## Task 1: T1 Multi-File Module Edit (C1-like pattern)
- Model: haiku
- Scope: .test/multi/
- Description: 3 dosya yazımı + DB upsert minimal pattern

## Task 2: T2 File System Generate (H1-like pattern)
- Model: haiku
- Scope: .test/fs-gen/
- Description: 5 .md file generate from template

## Task 3: T3 Repo Scan (H3-like pattern)
- Model: haiku
- Scope: .test/scan/
- Description: grep -r pattern repo-wide + raporlama
EOF
```

Eğer pre-flight smoke FAIL → Sprint 168.5 başlatılmaz, Sprint 168 Phase 1 yeni döngü (cluster F discovery).

### 5.4 Cross-Cluster Dependency Resolution (Agent A P4.5 fix)

(Section 2 cross-cluster dependency graph + Section 3.2.1 sequential merge order)

Çakışma noktaları (sprint-controller.ts, sprint-finalizer.ts):
- `sprint-controller.ts`: C0c (TASK_ASSIGN fresh read) — C0c'den sonra Brain finalize chain trigger (C0a)
- `sprint-finalizer.ts`: C0a-2 (Step 4 sentinel) + C0a-3 (Step 5 retro) + C0a-4 (Step 12 archive) — single subagent within C0a sequential

Subagent dispatch sequence (Section 3.2.1):
1. C0e + ADR-047 (paralel, isolated worktrees)
2. ADR-048 Wave 1.5 CHECKPOINT (Alperen manuel)
3. C0b + C0c + C0a-1 + C0d (paralel, isolated worktrees — different modules)
4. C0a-2 + C0a-3 + C0a-4 (sequential within sprint-finalizer.ts subagent — single agent multi-commit)
5. Merge to main (cascade order tersine: C0e → C0b → C0c → C0a → C0d)

## 6. Eval Iteration Plan (Sprint 166/167 v1→v5 Paterni)

Already documented Section 3.5.

## 7. Risks + Mitigations (v4 expanded)

| Risk | Severity | Mitigation |
|---|---|---|
| Subagent dispatch çakışma (Agent A #10) | High | Git worktree isolation + file authority matrix + sequential merge (Section 3.2.1) |
| Brain smoke test fail (5 fix sonrası hala kırık) | High | Smoke test FAIL → root cause investigation Phase 1 (yeni döngü) |
| ADR-048 contract incomplete | Low | C0e subagent prompt'a ADR-048 skeleton inject + Wave 1.5 CHECKPOINT |
| Sprint 168 task taşması (effort tahmin yetersiz) | Medium | v4 revised tahmin 35h (önceki 22-30h yanıltıcıydı) + Sprint 168.5'e shift fallback |
| Test coverage gap (TDD'ye rağmen) | Medium | Skip artış 0 enforcement + Alperen review gate (Section 3.2.3) |
| ADR-046 Step Ordering Contract regression | Medium | C0a-2 + C0a-3 integration test ADR-046 invariant assert |
| Cross-sprint orphan handling (Agent A #1) | High | C0e Option C: filter-based selective cleanup + startup invocation |
| Sprint 168 NO_GO → Sprint 168.5 recursion paradox (Agent B Saldırı #1) | High | Section 3.2.4 explicit fallback — Sprint 168.5 yine manuel dispatch ile başlar |
| Multi-provider parity (Agent B #6) | Medium | C0e cross-backend uniformity (Docker + Subprocess + Tmux) |
| Subagent skip ekleme (Agent B V7) | High | TDD enforcement gate + Alperen review (Section 3.2.3) |

## 8. Sprint 168.5 + 169 Handoff (v4 expanded)

### Sprint 168.5 = Audit Remediation

(8 task — Sprint 167 T7 roadmap'tan, ADR-047 manuel dispatch protokol Sprint 168'de yazıldı)

- C1 Memory Relations Migration
- C2 Bug Z3 Memory Rebuild Safety
- H1 ADR DB→FS Export Pipeline (43 missing .md)
- H2 Stub Memory Entries Backfill
- H3 OSS Pre-Flip Secret Scan Baseline
- H4 Dashboard Build CI Gate
- H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix
- Sprint 168 NO_GO fail task'ları (gap closure, en başta)

**Sprint 168.5 execution mode (Agent B V5 fix):**
- Sprint 168 GO → Brain otonom (deckent plan + start normal)
- Sprint 168 GO_WTD → Brain yarı otonom (Alperen monitoring)
- **Sprint 168 NO_GO → Manuel subagent dispatch (Sprint 168 paterni replay, ADR-047 protokol)**

**Sprint 168.5 wave split opsiyonu (v5 patch — Agent B 2nd round Saldırı #3):**

Sprint 168 NO_GO durumda Sprint 168.5 task sayısı 9-10 olabilir (7 mevcut + 1-2 gap closure). Sprint 166 max 11 task'ta chaos paterni. Wave split:
- **Sprint 168.5a:** Sprint 168 fail cluster gap closure + C1 Memory Relations + C2 Bug Z3 (3-4 task)
- **Sprint 168.5b:** H1 ADR FS Export + H2 Stub Backfill + H3 Secret Scan + H4 Dashboard + H5 dep_pipeline (5 task)
- Sprint 169 OSS GA Sprint 168.5b sonrası (kayma ihtimali Sprint 170+'a, kullanıcı god-level vision review)

**Alperen kararı:** Wave split tetikleyici threshold — Sprint 168.5 task count ≥10 ise auto-split (`split_directive` config flag).

### Sprint 169 = Open Source GA conditional

- VerhexIO/deckent → VerhexIO/deckent public flip
- npm publish v1.0.0-beta.2
- Show HN launch
- ConditionalIf Sprint 168.5 OSS pre-flip clear

## 9. Pre-Flight Checklist (Sprint 168 Başlatma Öncesi)

- [ ] `git status` clean (Sprint 167 + Sprint 168 spec commit'leri push edildi)
- [ ] `npm run build` PASS (Alperen onayı)
- [ ] `npx deckent doctor` GREEN
- [ ] `.audit/sprint-167/T5-brain-debug-phase1.md` + `phase2.md` mevcut (subagent prompt input)
- [ ] `.audit/sprint-167/T7-cross-cutting-synthesis.md` + `consolidated-inventory.md` mevcut
- [ ] Sprint 168 spec v5 final approved + commit
- [ ] Sprint 168 DIRECTIVES.md yazılı (Sprint 167 DIRECTIVES archive sonra)
- [ ] 8 subagent prompt template hazır (cluster başına 1 + ADR-047)
- [ ] Git worktree 8 isolated worktree oluşturuldu (Section 3.2.1)
- [ ] `.deckent/sprint-168-dispatch-locks.json` init
- [ ] `docs/adr/047-*.md` + `docs/adr/048-*.md` placeholder
- [ ] Brain otonom smoke test DIRECTIVES `.test/` hazır (Section 5.3)
- [ ] Alperen `auto_archive_directives` default decision verildi (Section C0a-4 — Option A/B)
- [ ] Sprint 168 NO_GO fallback (Section 3.2.4) Alperen ile gözden geçirildi
- [ ] `src/core/active-workers.ts` shared helper extract planı (v5 patch C0e MINOR-1) C0e subagent prompt'a inject edildi
- [ ] Sprint 168.5 pre-flight smoke test DIRECTIVES (`.test/sprint-168.5-preflight-directives.md`) hazırlandı (v5 patch — Agent B Saldırı #2)
- [ ] Sprint 168.5 wave split threshold (`split_directive` config flag) Alperen ile kararlaştırıldı (v5 patch — Agent B Saldırı #3)

**Pre-Flight Checklist toplam: 16 madde** (v5 patch — Agent A 2nd round MINOR-4 netleştirme: önceki "14 madde" iddiası yanıltıcıydı, gerçek 13'tü, v5 patch sonrası 16).

---

**Versiyon notu:** Bu v5 spec, v4 17-madde integration üzerine 2nd round Agent A 96/100 + Agent B 26/100 eval'larının 6 madde minor patch'ini içerir (4 Agent A cosmetic + 2 Agent B clarification). Çift hedef başarılı (Agent A ≥95 + Agent B <30). v6 Alperen final approval bekliyor — onay sonrası writing-plans skill Sprint 168 TDD plan yazımına geçilir.
