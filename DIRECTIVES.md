# DIRECTIVES — Sprint 168: Brain Repair Phase

## Spec + Plan Referansları

- **Spec:** `docs/superpowers/specs/2026-05-14-sprint-168-design.md` (v5 f63a8f6 — çift hedef başarılı: Agent A 96/100 + Agent B 26/100)
- **Plan:** `docs/superpowers/plans/2026-05-14-sprint-168-plan.md` (54d9db2, 1598 satır TDD + runbook)
- **Phase 1 input:** `.audit/sprint-167/T5-brain-debug-phase1.md`
- **Phase 2 input:** `.audit/sprint-167/T5-brain-debug-phase2.md`
- **Sprint 167 archive:** `.brain/archive/DIRECTIVES-sprint-167.md`

## Goal

Sprint 167 audit'in tespit ettiği **5 architectural cluster (10 bug)** için root-cause fix.
Hardened manuel subagent dispatch (8 paralel + 1 sequential, git worktree isolation,
file authority matrix, lock pattern, TDD gate). Sprint 168 sonrası Brain otonom
sprint orkestrasyonu mümkün hale gelir.

**Çift hedef başarılı (v1→v5 eval zinciri):**
- Agent A (systematic-debugging): 79/100 → **96/100 APPROVED** ✓ (hedef ≥95)
- Agent B (devil's advocate): 22/100 → **26/100 SHIP_AS_IS** ✓ (hedef <30)

## Brain Planning Instructions

- **Mode:** Manuel subagent dispatch (Brain bypass — chicken-and-egg paradox kabul)
- **Subagent count:** 8 paralel + 1 sequential (ADR-047 meta) + Wave 1.5 manuel CHECKPOINT
- **Worktree isolation:** `../deckent-sprint-168-<CLUSTER_ID>` (git worktree per cluster)
- **File authority matrix:** Plan Section "Subagent Dispatch Runbook"
- **Lock pattern:** `.deckent/sprint-168-dispatch-locks.json`
- **TDD gate:** Failing test → fix → pass, yeni test'lerde skip kullanma (baseline 41 korunur)
- **Alperen review:** Subagent commit sonrası `npx vitest run` + skip count delta + `git diff --stat` kontrol

## Wave Structure (Cascade'in Tersine)

- **Wave 1 (paralel, 2 subagent):** C0e (cascade endpoint) + ADR-047 (meta governance)
- **Wave 1.5 (manuel Alperen CHECKPOINT):** ADR-048 review + memory.db insert verify
- **Wave 2 (paralel, 4 subagent):** C0b + C0c + C0a-1 + C0d
- **Wave 3 (sequential within sprint-finalizer.ts):** C0a-2 → C0a-3 → C0a-4

## 8 Anchor Tasks

### Task 1: C0e — Prompt Lifecycle Contract + ADR-048

- Model: opus
- Effort: high (4h)
- Cluster: E (Worker Lifecycle Mismatch — cascade ENDPOINT)
- Agent: bug-fixer (selective filter design + active worker protection)
- Worktree: `../deckent-sprint-168-C0e`
- Files (write): `src/providers/claude.ts`, `src/orchestra/sprint-lifecycle.ts`, `src/orchestra/spawn-backend.ts`, `src/orchestra/tmux.ts`, `src/core/active-workers.ts` (NEW), `docs/adr/048-prompt-lifecycle-contract.md`, `tests/providers/`, `tests/orchestra/`, `tests/core/active-workers.test.ts`
- Files (read): Phase 1+2 raporları, src/providers/claude.ts:125-142, src/orchestra/spawn-backend-docker.ts:941-942 + 982
- Scope: read-write per file authority matrix

#### Description

Sprint 167 BUG-HH live evidence — `_cleanupOrphanedPromptFiles()` non-selective.
Option C selective filter + `getActiveWorkerIds()` shared helper extract
(auditor.ts:2162-2168 pattern → `src/core/active-workers.ts`). Cross-sprint orphan
handling (startup `archivePromptFiles(prevSprintId)`). Cross-backend uniformity
(Docker + Subprocess + Tmux contract comments). ADR-048 yazımı MADR v3.

**Kanıt:**
- `grep "activeTaskIds" src/providers/claude.ts` → 1+ match
- `ls src/core/active-workers.ts` → mevcut
- `ls docs/adr/048-*.md` → 100+ satır MADR v3
- 4 TDD test PASS (active protected, prev sprint orphan, cross-backend, getActiveWorkerIds)

**Test:** 4 TDD test (TDD pattern failing → fix → pass)

### Task 2: C0b — SpawnLock Symmetric Cleanup

- Model: opus
- Effort: high (5h)
- Cluster: B (Locking Asymmetry — Sprint 156 T-10 partial)
- Agent: bug-fixer
- Worktree: `../deckent-sprint-168-C0b`
- Files (write): `src/core/file-lock.ts` (5 yeni helper), `src/monitor/auditor.ts` (L485 binding), `src/orchestra/spawn-backend-docker.ts:933` (on-exit hook), `tests/core/spawn-lock-*.test.ts`, `tests/monitor/auditor-spawn-lock-*.test.ts`

#### Description

Sprint 167 RC4 Bug E fix. SpawnLock cleanup helpers eksik (Phase 2 §141 listed 5).
5 yeni helper (`checkSpawnLock`, `checkSpawnLocks`, `clearStaleSpawnLocks`,
`clearOrphanSpawnLocks`, `releaseStaleSpawnLocksForTask`). Auditor L485 paterni
`stale_spawn_lock` alert + 30s scan binding. On-exit hook sad-path coverage.

**Kanıt:**
- `grep -c "clearOrphanSpawnLocks\|clearStaleSpawnLocks" src/core/file-lock.ts` → 2+ match
- `grep "stale_spawn_lock" src/monitor/auditor.ts` → 1+ match
- 3 TDD test PASS

**Test:** 3 TDD test (orphan cleanup, TTL 5min, Auditor binding)

### Task 3: C0c — Plan↔Spawn Integration Layer

- Model: opus
- Effort: high (8h)
- Cluster: C (Plan↔Spawn Disconnect — Sprint 138 T4 incomplete)
- Agent: bug-fixer
- Worktree: `../deckent-sprint-168-C0c`
- Files (write): `src/orchestra/planner.ts` veya `task-builder.ts` (RC1 parser), `src/orchestra/decision-engine.ts` (RC2 subscriber), `src/orchestra/sprint-controller.ts` (RC3 fresh read), `tests/orchestra/`

#### Description

3 alt-fix: RC1 parser `validateScopeFilesWrite` + bare token blocklist;
RC2 `decision-engine.ts handleScopeCollision` subscriber + `BRAIN→SPAWN:BLOCKED`
event; RC3 `readTaskJsonFresh` invariant — task.json fresh disk read.

**Kanıt:**
- `grep "validateScopeFilesWrite\|handleScopeCollision\|readTaskJsonFresh" src/orchestra/` → 3+ match
- 3 TDD test PASS

**Test:** 3 TDD test (parser, collision blocker, fresh read)

### Task 4: C0a-1 — Step 2 identityRegen Default Flip

- Model: sonnet
- Effort: low (1h)
- Cluster: A.1 (BUG-GG)
- Agent: bug-fixer
- Worktree: `../deckent-sprint-168-C0a-1`
- Files (write): `src/core/identity-generator.ts`, `tests/core/identity-regen-default-skip.test.ts`

#### Description

Sprint 166 T5 deprecated annotation runtime'da etkili değildi. `skipIdentityRegen`
default `false` → `true`. Deprecated enforcement.

**Kanıt:**
- `grep "skipIdentityRegen.*true" src/core/identity-generator.ts` → 1+ match
- 1 TDD test PASS

**Test:** 1 TDD test (default skip invariant)

### Task 5: C0a-2 — Step 4 ruleRegen DB Query + Sentinel Idempotent

- Model: opus
- Effort: normal (3h)
- Cluster: A.2 (T3 audit finding HIGH)
- Agent: bug-fixer
- Worktree: `../deckent-sprint-168-C0a-2` (sequential after C0a-1)
- Files (write): `src/core/rule-generator.ts`, `src/orchestra/sprint-finalizer.ts` (Step 4 only), `tests/core/`

#### Description

`.claude/rules/brain.md` Active ADR Constraints 11 ADR eksik (44/50). DB query
`store.getByType('adr')` ile regenerate. Sentinel marker `<!-- AUTO-START -->`
`<!-- AUTO-END -->` idempotent replace (append YASAK). ADR-046 invariant test.

**Kanıt:**
- `grep "store.getByType.*adr" src/core/rule-generator.ts` → 1+ match
- 4 rules dir parity (.claude / .codex / .gemini / .cursor)
- 3 TDD test PASS (DB query + idempotent + ADR-046 invariant)

**Test:** 3 TDD test

### Task 6: C0a-3 — Step 5 retro Dual Write

- Model: opus
- Effort: normal (3h)
- Cluster: A.3 (BUG-DD + BUG-EE)
- Agent: bug-fixer
- Worktree: `../deckent-sprint-168-C0a-3` (sequential after C0a-2)
- Files (write): `src/orchestra/sprint-retro-writer.ts`, `src/orchestra/sprint-finalizer.ts` (Step 5 only), `tests/orchestra/retro-dual-write.test.ts`

#### Description

Sprint 166 wire shipped (T6 Bug U+V) AMA Sprint 167 finalize'da `sprint-log-167`,
`retro-sprint-167`, `mem-sprint-167` = 0 (regression). DB upsert 3 row +
`writeFileSync('.brain/RETRO.md', content)` dual write atomic.

**Kanıt:**
- Finalize sonrası `node -e "...COUNT type=sprint OR retro OR memory WHERE sprint_id='sprint-168'"` → 3 row
- `.brain/RETRO.md` mtime current
- 1 TDD test PASS

**Test:** 1 TDD test (dual write invariant)

### Task 7: C0a-4 — Step 12 archiveDirectives Decision + ADR-046 Amendment

- Model: sonnet
- Effort: low (2h)
- Cluster: A.4 (BUG-CC)
- Agent: doc-writer
- Worktree: `../deckent-sprint-168-C0a-4` (sequential after C0a-3)
- Files (write): `src/orchestra/sprint-docs-updater.ts:570`, `docs/adr/046-*.md` (amendment), `src/orchestra/sprint-finalizer.ts` (Step 12 only), `tests/orchestra/archive-directives-default-preserve.test.ts`

#### Description

**Alperen decision (Pre-Flight Step 16):** Option B — `auto_archive_directives`
default=false. DIRECTIVES.md sprint finalize'da KORUNUR, sadece archive copy.
ADR-046 Step 12 amendment. Documentation update.

**Kanıt:**
- Sprint finalize sonrası `wc -l DIRECTIVES.md` → ≥200 satır KORUNUR
- `grep "auto_archive_directives.*false" src/orchestra/sprint-docs-updater.ts` → 1+ match
- ADR-046 amendment satır mevcut
- 1 TDD test PASS

**Test:** 1 TDD test (default preserve invariant)

### Task 8: C0d — Sprint Metrics Math Guards

- Model: sonnet
- Effort: low (1h)
- Cluster: D (BUG-FF cosmetic)
- Agent: bug-fixer
- Worktree: `../deckent-sprint-168-C0d`
- Files (write): `src/orchestra/sprint-reporter.ts` veya `managed-doc-runner.ts`, `tests/orchestra/sprint-metrics-guards.test.ts`

#### Description

Sprint 167 finalize "Duration: -1dk -1sn" + "Coverage: NaN%" cosmetic bug.
Null/undefined guard: `Math.max(0, end - start)` + `total > 0 ? covered/total : null`
display "N/A".

**Kanıt:**
- `grep "Math.max.*0\|N/A" src/orchestra/sprint-reporter.ts` → 1+ match
- 1 TDD test PASS

**Test:** 1 TDD test (edge case guards)

### Meta Task: ADR-047 — Manuel Subagent Dispatch Protocol

- Model: sonnet
- Effort: normal (2h)
- Agent: architect (governance doc)
- Worktree: `../deckent-sprint-168-ADR-047`
- Files (write): `docs/adr/047-manual-subagent-dispatch-protocol.md`

#### Description

Sprint 164-168 manuel survival pattern proven (23+ incident). Sprint 168 hardened
dispatch protocol formal kontrat. MADR v3 hibrit format. Sprint 169+ Brain otonom
hedefi anchor.

**Kanıt:**
- `ls docs/adr/047-*.md` → MADR v3 format
- `grep "Wave 1.5 serial gate\|file authority matrix\|TDD enforcement gate" docs/adr/047-*.md` → 3+ match

**Test:** N/A (governance doc, no test)

## Anchor Constraints (Worker zorunlu okur)

1. **Git worktree isolation:** Subagent kendi worktree'sinde çalışır (../deckent-sprint-168-<CLUSTER_ID>)
2. **File authority matrix:** scope.filesWrite STRICT (Plan "Subagent Dispatch Runbook")
3. **TDD ZORUNLU:** failing test → fix → pass + integration test
4. **Yeni test'lerde skip kullanma** (baseline 41 korunur, Sprint 168 ≤41)
5. **Test PASS olmadan commit YASAK** + atomic commits per step
6. **Phase 1+2 raporları mutlaka oku** (`.audit/sprint-167/T5-brain-debug-phase1.md` + `phase2.md` cluster section)
7. **ADR-046 invariant korunur** (C0a-2 test ile)
8. **Wave 1.5 Alperen CHECKPOINT** ZORUNLU (C0e DONE sonrası ADR-048 review)
9. **Subagent .result yaz:** `.deckent/sprint-168-<CLUSTER_ID>-result.json` (status + commits + tests + files)
10. **Alperen review gate:** Subagent DONE sonrası `npx vitest run` + skip delta + `git diff --stat`

## GO/NO_GO Criteria (Strict — Çift Hedef)

- ✅ 8/8 anchor task DONE (0 NO_GO, GO_WTD ≤1 — en muhtemel C0d cosmetic)
- ✅ ADR-047 + ADR-048 yazılı + memory.db `type='adr'` row count=2 artış
- ✅ TDD compliance: yeni test'lerde skip kullanılmadı (baseline 41 korunur)
- ✅ `tsc --noEmit` 0 hata
- ✅ `vitest run` baseline tolerance (pass≥16395 + fail≤2 + skip≤41)
- ✅ Brain otonom smoke test PASS (Plan Section "Brain Otonom Smoke Test Runbook" — 3-task complex)
- ✅ Cross-sprint orphan handling test (C0e)
- ✅ ADR-046 Step Ordering invariant test (C0a-2)
- ✅ Sprint 168 NO_GO ≠ Sprint 168.5 BLOCKED (Catch-22 v4 paterni)

## Sprint 168.5 + 169 Handoff

**Sprint 168.5 = Audit Remediation** (8 task — Sprint 167 T7 roadmap):
- C1 Memory Relations Migration
- C2 Bug Z3 Memory Rebuild Safety
- H1 ADR DB→FS Export Pipeline (43 missing .md)
- H2 Stub Memory Entries Backfill
- H3 OSS Pre-Flip Secret Scan Baseline
- H4 Dashboard Build CI Gate
- H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix
- ADR-047 (yazıldı Sprint 168'de)

**Sprint 168.5 execution mode (Section 3.2.4 spec):**
- Sprint 168 GO → Brain otonom (`deckent plan + start` normal)
- Sprint 168 GO_WTD → Brain yarı otonom (Alperen monitoring)
- Sprint 168 NO_GO → Manuel subagent dispatch replay (Sprint 168 paterni)

**Sprint 169 = OSS GA conditional** (Sprint 168.5 OSS pre-flip clear ise):
- VerhexIO/deckent-dev → VerhexIO/deckent public flip
- `npm publish v1.0.0-beta.2`
- Show HN launch
