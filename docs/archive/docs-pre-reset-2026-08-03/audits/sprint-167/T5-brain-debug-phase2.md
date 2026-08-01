# Sprint 167 — Brain Orchestration Debug Phase 2 (Pattern Analysis)

**Skill:** superpowers:systematic-debugging
**Phase:** 2 (Pattern Analysis — Working Examples + Reference Compare + Differences)
**Date:** 2026-05-14
**Input:** Phase 1 raporu (`.audit/sprint-167/T5-brain-debug-phase1.md`, 10 bug, 5 cluster)
**Iron Law respected:** Phase 2 sırasında NO FIXES — pattern identify + dependency analysis
**Read-only constraint:** sadece `.audit/sprint-167/T5-brain-debug-phase2.md` yazılır

> Bu rapor Phase 1'de tespit edilen 5 architectural cluster için **working code references** + **reference implementation compare** + **differences inventory** + **dependencies** yapar. Phase 3 (hypothesis testing) ve Phase 4 (implementation) Sprint 168 TDD'de.

---

## Cluster A — Brain Finalize Hook Chain Implementation Gap

**Bug'lar:** BUG-CC (Step 12 archive), BUG-DD (Step 5 DB), BUG-EE (Step 5 file), BUG-GG (Step 2 dispatch)

### Working Examples (Reference Implementation)

**1. ADR-046 Spec (Sprint 166 T11):** `docs/adr/046-brain-self-update-hook-architecture.md`
- Step Ordering Contract Section 5.1: Step 1 memoryExport → Step 2 identityRegen (deprecated) → Step 3 adrInsert → Step 4 ruleRegen → Step 5 updateProjectDocs
- 3 mimari prensip: unconditional invocation, cache key completeness, single registration target

**2. Step 3 adrInsert (ÇALIŞIYOR — Sprint 166 Bug M fix):** `src/core/adr-file-sync.ts`
- `syncAdrFilesToDb(store, adrDir, opts)` — idempotent, defensive parse, error reporting
- 13 unit test passing, live integration kanıt mevcut
- Tekrar çalıştırıldığında 0/0/N (skipped) — idempotency invariant

**3. Step 1 memoryExport (ÇALIŞIYOR):** `src/core/memory-export.ts`
- `exportToMd(store, exportDir)` — DB → .md snapshot
- Atomic write pattern (write + rename)

### Reference Compare (NOT Working)

**Step 2 identityRegen** (deprecated, BUG-GG):
- Annotation: `@deprecated Sprint 166 — Step 2 deprecated, will be removed Sprint 168`
- BUT runtime dispatch hala çalışıyor (skipIdentityRegen default=false)
- **Difference vs Step 3 (working):** Step 3 conditional `if (!opts.skipAdrInsert)` ✓; Step 2 conditional aynı pattern AMA default flip yok

**Step 4 ruleRegen** (kısmen çalışıyor):
- Sentinel marker `<!-- AUTO-START -->`/`<!-- AUTO-END -->` EKLENDI (Sprint 167 finalize'da live)
- BUT ADR listesi 44/50 (6 eksik)
- BUT `archiveDirectives` (Step 12) DIRECTIVES.md'yi placeholder ile overwrite ediyor — bu Step 4 değil ama hook chain aynı
- **Difference vs Step 3:** Step 4 hardcoded ADR list var (memory.db query'den değil)

**Step 5 retro+sprint+mem** (kırık, BUG-DD + BUG-EE):
- Sprint 166 T6 fix shipped (`sprint-retro-writer.ts:506-524`)
- BUT Sprint 167 finalize sonrası sprint-log-167 = 0
- **Difference vs Step 3:** Step 5 muhtemelen finalize'da farklı code path'ten çağrılıyor (manuel `--force` flag specific?) — veya try/catch silently swallowing

### Differences Inventory

| Step | Working (Step 3) | Broken | Difference |
|---|---|---|---|
| Conditional dispatch | `if (!opts.skipAdrInsert) syncAdrFilesToDb(...)` | Step 2 same pattern but default not flipped | Default value not updated to deprecated state |
| Idempotency | `syncAdrFilesToDb` returns {inserted, updated, skipped} | Step 4 ruleRegen no idempotency check | Append vs replace decision missing |
| Data source | `docs/adr/*.md` filesystem | Step 4 hardcoded list (`activeAdrs` array) | Should query memory.db `store.getByType('adr')` |
| Test coverage | 13 unit + live integration | Step 5 wire test eksik | Sprint 166 fix shipped but Sprint 167 regression — no canary test |

### Dependencies

- memory-store.ts (read/write for DB)
- adr-file-sync.ts (Step 3 reference)
- rule-generator.ts (Step 4)
- sprint-retro-writer.ts (Step 5)
- identity-generator.ts (Step 2)
- sprint-docs-updater.ts (Step 12 archive)

**Architectural fix scope (Sprint 168 C0a):**
1. Step 2: `skipIdentityRegen` default = true (deprecated enforcement)
2. Step 4: Active ADR list memory.db query'sinden regenerate
3. Step 4: Sentinel marker idempotent replace (append yerine)
4. Step 5: writeRetrospective DB upsert + file write dual invariant
5. Step 12: `auto_archive_directives` davranışı doc + safer default (false?)
6. End-to-end integration test (Step 1-5 + Step 12 chained)

---

## Cluster B — Locking Infrastructure Asymmetry

**Bug:** RC4 Bug E SpawnLock cleanup gap

### Working Example (Reference)

**Regular `.lock` cleanup (ÇALIŞIYOR):** `src/core/file-lock.ts`
- `acquireLock(projectRoot, taskId, workerId, filePath)` (L60)
- `releaseLock(projectRoot, taskId, workerId, filePath)` (L123)
- `checkLock(projectRoot, filePath)` (L151)
- `checkLocks(projectRoot)` (L168)
- `releaseAllLocks(projectRoot, workerId)` (L191)
- `clearStaleLocks(projectRoot, maxAgeMs)` (L221) — TTL-based
- `clearOrphanLocks(projectRoot, activeWorkerIds)` (L258) — worker-aware

**Auditor scan loop binding:** `src/monitor/auditor.ts:30`
- `import { clearOrphanLocks } from '../core/file-lock.js'`
- L485 `type: 'stale_lock'` alert
- L498 "Auto-removed stale lock"
- L2173 `clearOrphanLocks(projectRoot, activeWorkerIds)` — 30s scan cycle

### Reference Compare (NOT Working)

**SpawnLock `.spawnlock` cleanup (EKSIK):** `src/core/file-lock.ts:305-470`
- `acquireSpawnLock(projectRoot, taskId, filePath)` (L335) ✓
- `releaseSpawnLock(projectRoot, taskId, filePath)` (L402) ✓
- `acquireSpawnLocks(projectRoot, taskId, filePaths)` (L431) ✓ atomic batch
- `releaseSpawnLocks(projectRoot, taskId, filePaths)` (L455) ✓
- `releaseAllSpawnLocks(projectRoot, taskId)` (L470) ✓

**EKSIK helpers:**
- ❌ `checkSpawnLock(projectRoot, filePath)`
- ❌ `checkSpawnLocks(projectRoot)`
- ❌ `clearStaleSpawnLocks(projectRoot, maxAgeMs)` — TTL
- ❌ `clearOrphanSpawnLocks(projectRoot, activeTaskIds)` — taskId-aware
- ❌ Auditor scan loop binding

**Line 305-306 explicit comment:**
```
// Use the `.spawnlock` extension so existing `.lock` cleanup helpers
// (checkLocks / clearStaleLocks / clearOrphanLocks) ignore them.
```

### Differences Inventory

| Operation | Regular Lock | SpawnLock | Asymmetry |
|---|---|---|---|
| Acquire | acquireLock | acquireSpawnLock | ✓ symmetric |
| Release | releaseLock | releaseSpawnLock | ✓ symmetric |
| Check | checkLock / checkLocks | ❌ YOK | gap |
| Stale cleanup | clearStaleLocks (TTL) | ❌ YOK | gap |
| Orphan cleanup | clearOrphanLocks (worker-aware) | ❌ YOK | gap |
| Auditor scan | L485 stale_lock alert | ❌ scan loop bind yok | gap |

### Dependencies

- spawn-backend-docker.ts (acquire/release call sites)
- auditor.ts (scan loop binding)
- result-collector.ts (sprint completion cleanup)

**Architectural fix scope (Sprint 168 C0b):**
1. `checkSpawnLock(projectRoot, filePath)` + `checkSpawnLocks(projectRoot)` ekle
2. `clearStaleSpawnLocks(projectRoot, maxAgeMs=300000)` — 5min TTL
3. `clearOrphanSpawnLocks(projectRoot, activeTaskIds)` — taskId-aware
4. Auditor scan loop L485 paterniyle `stale_spawn_lock` alert + auto-cleanup
5. On-exit hook spawn-backend-docker.ts:933 paterni — happy + sad path coverage

---

## Cluster C — Plan↔Spawn Integration Disconnect

**Bug'lar:** RC1 Bug Z2 parser bare token, RC2 collision alert disconnect, RC3 cache stale

### Working Example (Reference)

**Plan-time scope.filesWrite Z3 normalize (Sprint 165 paterni):**
- Sprint 165 T1+T2 honest-result gate (RC1 ile ilgili değil ama Brain pipeline'da plan-time output validation pattern)
- ADR-035 Verification Protocol Standard (Sprint 138) — Brain ↔ Worker ↔ Auditor verification protocol

**Auditor SCOPE_COLLISION emit (ÇALIŞIYOR):** `src/monitor/auditor.ts`
- Channel: `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED`
- Plan-time detection live (Sprint 167 events.jsonl seq #1, #2, #8 evidence)

**Disk-based fresh read pattern (ÇALIŞIYOR):** `src/orchestra/spawn-backend-docker.ts:733`
- `acquireSpawnTimeLocks(projectDir, taskId)` — task.json'u disk'ten okuyor
- Fresh state per spawn

### Reference Compare (NOT Working)

**Brain TASK_ASSIGN event payload (RC3 cache stale):**
- Brain plan-state in-memory object'ten TASK_ASSIGN emit
- Disk'ten re-read YOK
- spawn-backend-docker.ts:733 ile asymmetric (spawn-time fresh, plan-time stale)

**Auditor collision alert consume (RC2 disconnect):**
- Alert emit ✓
- Subscribe/consume ❌ — Brain decision-engine veya sprint-controller'da handler yok
- Sprint 138 T4 designed AMA wire incomplete

**Parser output validation (RC1 Bug Z2):**
- `planner.ts` veya `task-builder.ts` "Files (write):" parse
- Output validation YOK — bare token'lar accepted
- scope.filesWrite array'inde bare uzantı string'ler kabul ediliyor

### Differences Inventory

| Operation | Reference | Broken | Gap |
|---|---|---|---|
| Disk fresh read | spawn-backend-docker.ts:733 ✓ | Brain TASK_ASSIGN emit ✗ | Plan-state cache invalidation eksik |
| Alert emit | Auditor SCOPE_COLLISION ✓ | Brain consume ✗ | Subscriber wire yok |
| Output validation | ADR-035 Verification Protocol ✓ | Parser output ✗ | Validator yok |
| Pattern | Disk-first invariant | In-memory-first | Asimetri |

### Dependencies

- planner.ts / task-builder.ts (RC1 parser)
- auditor.ts emit ↔ brain decision-engine consume (RC2)
- brain.ts / sprint-controller plan-state (RC3)
- spawn-backend-docker.ts:733 reference (working disk read)
- ADR-035 verification protocol

**Architectural fix scope (Sprint 168 C0c):**
1. **RC1 Parser:** "Files (write):" regex fix — full path extract + bare token blocklist + scope validation function
2. **RC2 Alert consume:** Brain decision-engine `SCOPE_COLLISION_DETECTED` subscriber + spawn blocker decision
3. **RC3 Cache invalidation:** Brain TASK_ASSIGN sırasında task.json fresh disk read invariant (spawn-time pattern uygula)
4. Integration test: Plan-time collision + parser bare → expect spawn blocked

---

## Cluster D — Sprint Metrics Math

**Bug:** BUG-FF Duration negative, Coverage NaN

### Working Example (Reference)

**Sprint 165/166 sprint metrics (ÇALIŞIYOR — pre-Sprint 167):**
- CLAUDE.md L93-103 önceki sprint'lerde pozitif duration + sayısal coverage
- Sprint 165 RETRO.md: "Completed 0/0 tasks in 3h 35m" — duration positive
- Sprint 166 retro: "Completed 11/11 tasks (10 DONE + 1 GO_WTD)" — coverage hesaplanmıştı

### Reference Compare (NOT Working)

**Sprint 167 sprint metrics:**
- Duration: "-1dk -1sn" — negative arithmetic
- Coverage: "NaN%" — division by zero veya undefined value
- **Possible cause:** Sprint 167 SPAWN crash → sprint state initialize edilmedi → start timestamp null
- **Possible cause 2:** Read-only audit sprint → 0 source change → 0/0 coverage NaN

### Differences Inventory

| Field | Working | Broken | Cause |
|---|---|---|---|
| Duration | `end - start` (both timestamp) | `end - undefined` | Start null guard yok |
| Coverage | `covered / total * 100` | `0 / 0 * 100 = NaN` | Division by zero guard yok |
| Display | "3h 35m" | "-1dk -1sn" | Negative arithmetic display |

### Dependencies

- Sprint state initialization (Brain SPAWN phase)
- sprint-reporter.ts veya managed-doc-runner.ts metrics calculation
- CLAUDE.md template render

**Architectural fix scope (Sprint 168 C0d):**
1. Sprint start timestamp guard — default to current time if SPAWN fails (mid-sprint init)
2. Duration arithmetic: `Math.max(0, end - start)` veya `start ? end-start : 0`
3. Coverage division: `total > 0 ? covered/total : null` display "N/A" if null
4. Unit tests: edge case (start null, total 0)

---

## Cluster E — Worker Lifecycle Mismatch ⭐ (Alperen explicit request)

**Bug:** BUG-HH Prompt File Premature Deletion (claude.ts:125-142 non-selective)

### Working Example (Reference)

**Spawn-backend-docker.ts kontrat (Sprint 156 T4 design intent):**
```
spawn-backend-docker.ts:941-942:
// Sprint 156 Task 4: .prompt-*.txt AND .worker-*.sh tmpfiles persist until sprint cleanup.
// Both are archived together by archivePromptFiles() during sprint cleanup phase.
```

**archivePromptFiles() (ÇALIŞIYOR):** `src/orchestra/spawn-backend-docker.ts:982-1010`
- Sprint cleanup phase'inde tmpfiles archive'a taşınır (move, not delete)
- `.tasks/archive/sprint-{sprintId}/` dizinine
- Filter: `f.startsWith('.prompt-') && f.endsWith('.txt')` — extension-based, taskId-agnostic ama sprint phase'de güvenli

### Reference Compare (NOT Working)

**claude.ts:125-142 `_cleanupOrphanedPromptFiles()`:**
```typescript
private _cleanupOrphanedPromptFiles(): void {
  const tasksDir = join(this.projectDir, TASKS_DIR);
  if (!existsSync(tasksDir)) return;
  try {
    const files = readdirSync(tasksDir);
    for (const file of files) {
      if (file.startsWith('.prompt-') && file.endsWith('.txt')) {
        cleanupPromptFile(join(tasksDir, file));  // ← unlinkSync!
      }
    }
  } catch { /* ignore */ }
}
```

**Çağrı yer:** "Called automatically after kill() to prevent file accumulation" (line 127 comment)

**Sorun:** kill() bir worker için çağrıldığında **tüm prompt'lar siliniyor** (active worker'ların DA dahil).

### Differences Inventory

| Operation | Reference (archivePromptFiles) | Broken (_cleanupOrphanedPromptFiles) | Issue |
|---|---|---|---|
| When called | Sprint cleanup phase (END of sprint) | After kill() (mid-sprint, sürekli) | Timing — premature |
| Action | Move to archive (preserve) | unlinkSync (destroy) | Destructive |
| Filter | `.prompt-*.txt` pattern (sprint boundary) | `.prompt-*.txt` pattern (no boundary) | No active filter |
| Selective | Atomic per-sprint | Non-selective per-call | No taskId filter |

### Dependencies

- claude.ts ProviderAdapter
- tmux.ts cleanupPromptFile (unlinkSync utility)
- spawn-backend-docker.ts:982 archivePromptFiles (working reference)
- sprint-lifecycle.ts:309 archivePromptFiles invocation

**Architectural fix scope (Sprint 168 C0e):**
1. **Option A (Quick fix):** `_cleanupOrphanedPromptFiles(activeTaskIds: string[])` parametre — filter: skip if `file.includes(activeTaskId)` for any active task
2. **Option B (Recommended):** `_cleanupOrphanedPromptFiles()` fonksiyonunu KALDIR — spawn-backend-docker.ts:982 archivePromptFiles() tek source of truth (sprint cleanup phase'inde tek atomic operation)
3. **ADR-048 (NEW):** Prompt Lifecycle Contract — "tmpfiles persist until sprint cleanup, archived together" intent'ini formal kontrat olarak yaz (ADR-046 Step Ordering paterni)
4. **Regression test:** Active worker spawn → kill another worker → prompt file mevcut mu? (must be yes)
5. **Cross-backend audit:** Docker + Subprocess + Tmux 3 backend için contract uniformity

---

## Cross-Cluster Dependency Graph

```
RC1 (Bug Z2 parser) ─┐
                     ├─→ scope.filesWrite bare token
RC3 (cache stale) ───┤
                     ├─→ TASK_ASSIGN event payload (events.jsonl)
                     │
RC2 (collision) ─────┤
                     ├─→ Brain spawn pipeline (decision-engine wire eksik)
                     │
                     ▼
                  Spawn attempt
                     │
                     ├─→ Lock acquire (bare token)
                     │       │
                     │       ▼
                     │   RC4 (SpawnLock cleanup gap)
                     │       │
                     │       ▼
                     │   Conflict → retry → kill
                     │           │
                     │           ▼
                     │       BUG-HH (claude.ts:125 prompt cleanup non-selective)
                     │           │
                     │           ▼
                     │       ALL .prompt-*.txt deleted
                     │           │
                     │           ▼
                     │       Active workers fail
                     │
                     ├─→ Sprint finalize triggered
                     │       │
                     │       ▼
                     │   Cluster A: Hook chain
                     │       │
                     │       ├─→ Step 1 ✓ memoryExport
                     │       ├─→ Step 2 ⚠ identityRegen (BUG-GG dispatch)
                     │       ├─→ Step 3 ✓ adrInsert
                     │       ├─→ Step 4 ⚠ ruleRegen (44/50, BUG-CC scope drift)
                     │       └─→ Step 5 ❌ retro+sprint+mem (BUG-DD + BUG-EE)
                     │       └─→ Step 12 ⚠ archiveDirectives (BUG-CC overwrite)
                     │
                     └─→ Sprint metrics calculation
                             │
                             ▼
                         BUG-FF (null/undefined arithmetic)
```

**Critical observation:** Cluster E (BUG-HH) is **cascade end-point** — Cluster B+C+A herhangi bir kill triggerlarsa BUG-HH tetiklenir. Single point of failure.

**Sprint 168 Wave 1 P0 sıralaması (Cascade'in tersine fix):**
1. **C0e Prompt Lifecycle** ÖNCE (cascade endpoint kapatılır, diğer bug'lar tek başına BUG-HH'yi triggerlamaz)
2. **C0b SpawnLock Cleanup** (cascade middle layer)
3. **C0c Plan↔Spawn Integration** (cascade root layer)
4. **C0a Hook Chain Complete** (finalize bütünlüğü — cascade dışı)
5. **C0d Metrics Math** (isolated)

---

## Phase 2 Predicate — Compliance Self-Check

| Predicate | Beklenen | Ölçülen | Status |
|---|---|---|---|
| Working code references | 5 cluster × ≥1 | 5 cluster × multiple | ✓ |
| Reference compare | 5 cluster | 5 cluster | ✓ |
| Differences inventory table | per cluster | 5 cluster × tablo | ✓ |
| Dependencies listed | per cluster | 5 cluster × dependency list | ✓ |
| Cross-cluster graph | Beklenen | Cascade graph + endpoint identified | ✓ |
| Architectural fix scope | per cluster | 5 cluster × C0a-C0e scope | ✓ |
| No fixes proposed (Iron Law) | Phase 2 | Sadece pattern + reference + comparison | ✓ |
| Read-only constraint | sadece phase2.md | git status verify | ✓ |

---

## Phase 3/4 Roadmap (Sprint 168 TDD'de)

### Phase 3 — Hypothesis Formation + Testing per Cluster

**C0e (Cluster E) — En kritik (Wave 1 P0):**
- Hypothesis: `_cleanupOrphanedPromptFiles()` kaldırılması + sprint-lifecycle.ts archivePromptFiles tek source of truth
- Failing test: "active worker prompt file deletion test"
- TDD: test write → fail → fix (Option B) → pass

**C0b (Cluster B):**
- Hypothesis: clearOrphanSpawnLocks + Auditor scan loop binding fix Bug E
- Failing test: "orphan spawn lock cleanup after worker crash"
- TDD pattern

**C0c (Cluster C):**
- Hypothesis: Plan↔Spawn integration layer fix RC1+RC2+RC3
- Failing test: "plan-time parser output validation" + "collision blocker" + "fresh disk read"
- 3 alt-test

**C0a (Cluster A):**
- Hypothesis: ADR-046 Step 1-5 + Step 12 end-to-end integration test fail-first
- Failing test: 5 step × invariant
- TDD per step

**C0d (Cluster D):**
- Hypothesis: null/undefined guards
- Failing test: edge case unit test
- TDD

### Phase 4 — Implementation (Sprint 168 TDD)

- Sprint 168 sprint disipline (brainstorming + plan + DIRECTIVES + execute)
- 12 task (5 critical C0a-C0e + 2 C1-C2 + 5 H1-H5)
- Strict GO/NO_GO (Sprint 168 hard blocker yok artık — Catch-22 fix Sprint 167 v4 spec)

---

**Yazan:** Claude Opus 4.7 — Sprint 167 systematic-debugging Phase 2, Alperen explicit request "hepsi" 2026-05-14
**Sprint 168 spec input:** ✓ 5 cluster × working references + differences + architectural fix scope + dependency graph
**Phase 3/4 trigger:** brainstorming skill Sprint 168 spec v1 yazımı sonra TDD per cluster
