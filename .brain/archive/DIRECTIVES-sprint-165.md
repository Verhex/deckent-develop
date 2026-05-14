# DIRECTIVES — Sprint 166: Brain Self-Update + Data Integrity Closure

## Spec + Plan Referansları

- **Spec:** `docs/superpowers/specs/2026-05-13-sprint-166-design.md` (v5, commit 0196337) — T4 god-level APPROVED (Agent A 95/100, Agent B 28/100)
- **Plan:** `docs/superpowers/plans/2026-05-13-sprint-166-plan.md` (commit f22294d) — 11 task × TDD steps
- **Sprint 165 archive:** `.brain/archive/DIRECTIVES-sprint-165.md`

## Goal

4 mimari kök sebep (Bug M, N, S, Y2) kalıcı fix + 12 data correction + ADR-046 documentation. Brain post-sprint hooks **artık dosyaları gerçekten güncelliyor**, ADR'ler memory.db'ye akıyor, provider rules ADR-046+ ile evolve ediyor, doc sync agent'ları ground-truth verification yapıyor. Sprint 167+ "gerçek kontrol" hattına açılan kapı (open source GA prep).

## 4-Wave Plan + Bootstrap Gate

- **Wave 1 (3 paralel architectural hook fixes):** Task 1 (Bug M adrInsert) + Task 2 (Bug N onRuleRegen) + Task 3 (Bug S cache key)
- **Wave 1.5 (Bootstrap Gate STRICTLY SERIAL):** Task 11 (ADR-046) — T1+T2+T3 DONE bekler + Alperen manuel `npx deckent memory rebuild` CHECKPOINT (`.deckent/decisions/sprint-166-T1-done.json`)
- **Wave 2 (4 paralel data integrity):** Task 4+5+6+7
- **Wave 3 (3 paralel living docs):** Task 8+9+10

**maxWorkers:** 6 | **dependency_pipeline_enabled:** false (Sprint 167 flip) | **deckent_start otomatik mode**

## Sprint 164-165 Forensic Özet (4 Root Cause)

| Bug | Tanım | Kanıt |
|---|---|---|
| **M** | ADR-043/044/045 memory.db'de YOK | `sprint-finalizer.ts:1197` adrInsert hook hiç yok, son insert 2026-04-20 |
| **N** | onRuleRegen manuel finalize path'ten geçmiyor | `cli/commands/finalize.ts:166` onRuleRegen param YOK (Brain otomatik path ✓ ama manuel path ✗) |
| **S** | doc-cache.ts cache key sprint.id içermiyor | Sprint 152'den beri CLAUDE.md `cached_no_change` skip (Sprint 130-151 working chain commit zinciri kanıt) |
| **Y2** | Doc sync agent ground-truth eksik | Sprint 164 commit `a4f3be4` "16 agent + test-writer" yanlış inject (gerçek 15) |

## Sprint 165 Token Forensic Baseline

- Sprint 165 gerçek toplam: 377K in+out + 514K cache = **891K grand total** (5 task × ~75K avg)
- Sprint 166 tahmin: 825K in+out (replay 1.3× = 1.07M), grand ~2M
- **Wave başı checkpoint:** cumulative >900K → Alperen manuel triage (Sprint 166 advisory only, Sprint 167 P0 automatic blocker)

---

## Task 1: Bug M Fix — adrInsert Hook + Step 3 Wire

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/core/adr-file-sync.ts, src/core/identity-generator.ts, src/cli/commands/memory.ts, tests/core/adr-file-sync.test.ts
- Scope: src/core/, src/cli/commands/, tests/core/

### Description

Sprint 156-011 CRITICAL debt CLOSED hedefi. `src/core/adr-file-sync.ts` yeni dosya yazılır — MADR v3 başlık regex ile `docs/adr/*.md` parse + memory.db upsert. `identity-generator.ts:308-356` postFinalizeHooks zincirine **Step 3 (adrInsert)** insert edilir (ruleRegen Step 4'e RENUMBERED — Step Ordering Contract Section 5.1 spec).

`memory.ts:39-44 (rebuild)` ikincil source `docs/adr/*.md` öncelikli olur (`.brain/exports/decisions.md` ikincil).

**Test:** 5 unit test (1 idempotency dahil) — happy path, idempotent, malformed ADR skip, status transition, sprint_id extraction.

**Kanıt:**
- `grep "syncAdrFilesToDb" src/core/` → 2+ match
- `npx vitest run tests/core/adr-file-sync.test.ts` → 5/5 PASS
- Post-Wave 1.5: `sqlite3 .brain/memory.db "SELECT id FROM entries WHERE type='adr' AND id LIKE 'adr-04%'"` → adr-043, adr-044, adr-045, adr-046

---

## Task 2: Bug N Fix — onRuleRegen Manuel Finalize Path Wire + AUTO/CUSTOM

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/cli/commands/finalize.ts, src/core/rules-generator.ts, tests/cli/finalize-rule-regen.test.ts
- Scope: src/cli/commands/, src/core/, tests/cli/

### Description

**Bug N factual fix (spec v3 forensic):** `sprint-phases.ts:1238` onRuleRegen geçiriyor ✓, `sprint-finalizer.ts:1197` passing through ✓, AMA `cli/commands/finalize.ts:166` `finalizeSprint(...)` çağrısında onRuleRegen parametresi YOK ✗. Sprint 152+ manuel finalize kullanılan dönemde `.claude/rules/*.md` 13 sprint stale.

**Fix:** `finalize.ts:166` `finalizeSprint(...)` çağrısına `onRuleRegen: async (root) => await regenerateRules(root)` ekle.

**Bonus (Bug O):** `rules-generator.ts` AUTO+CUSTOM block design fix. CUSTOM block AUTO kopyası DEĞİL — sprint-özel ekleme için empty template.

**recover.ts forensic:** `cli/commands/recover.ts` finalizeSprint çağrısı YOK — recover Bug N tetiklemez (v4 confirmed).

**Test:** 4 unit test (1 idempotency).

**Kanıt:**
- `grep -n "onRuleRegen" src/cli/commands/finalize.ts` → 1+ match
- `grep "CUSTOM_TEMPLATE" src/core/rules-generator.ts` → 1 match (empty template)
- `npx vitest run tests/cli/finalize-rule-regen.test.ts` → 4/4 PASS

---

## Task 3: Bug S Fix — doc-cache Sprint-Aware Cache Key

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: bug-fixer
- Files: src/orchestra/managed-docs/doc-cache.ts, tests/orchestra/managed-docs/sprint-aware-cache.test.ts
- Scope: src/orchestra/managed-docs/, tests/orchestra/managed-docs/

### Description

`doc-cache.ts` cache key `fileHash + entryHash` → `fileHash + entryHash + sprint.id` extension. Geriye uyumlu fallback: `if (!sprintId) use old hash`. Sprint 154+ managed-doc-runner her sprint CLAUDE.md güncellemesi yapacak.

**Test:** 4 unit test (1 idempotency) — sprint difference, idempotent, backwards compat fallback, updateProjectDocs cache miss on new sprint.

**Kanıt:**
- `grep -n "computeCacheKey" src/orchestra/managed-docs/doc-cache.ts` → 1 match
- `npx vitest run tests/orchestra/managed-docs/sprint-aware-cache.test.ts` → 4/4 PASS

---

## Task 4: Bug Y2 Fix — Ground-Truth Verification 3-Layer Defense

- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/task-builder.ts, src/orchestra/planner.ts, src/monitor/auditor.ts, .deckent/ground-truth-overrides.json, tests/orchestra/doc-sync-ground-truth.test.ts
- Scope: src/orchestra/, src/monitor/, .deckent/, tests/orchestra/

### Description

Sprint 164 commit `a4f3be4`'te koordinatör agent prompt'una "16 agent" yanlış inject etti, gerçek 15. 5 anchor .md yanlış güncellendi (AGENTS.md tek doğru).

**3-katmanlı defense-in-depth:**
1. **Unit test:** Prompt "X agents" iddiası vs `fs.readdirSync('src/core/builtins/agents/')` count
2. **Integration test:** Wave 2 retro Auditor agent count assertion doğru
3. **Auditor runtime:** `runScanCycle (src/monitor/auditor.ts:705)` içine `verifyDocSyncGroundTruth(task)` ekle, mismatch → boundary violation alarm

**Falsifiable predicate:** Mismatch threshold = 1 (zero-tolerance).

**Whitelist:** `.deckent/ground-truth-overrides.json` JSON şema:
```json
{
  "version": "1.0",
  "overrides": [
    { "metric": "agents_count", "expected": 15, "approvedBy": "alperen", "until_sprint": 170, "reason": "Sprint 148 ADR-041 reform stable" }
  ]
}
```

**Test:** 3 unit test.

**Kanıt:**
- `grep -n "verifyDocSyncGroundTruth" src/monitor/auditor.ts` → 1+ match (line 705 civarı)
- `ls .deckent/ground-truth-overrides.json` → mevcut
- `npx vitest run tests/orchestra/doc-sync-ground-truth.test.ts` → 3/3 PASS

---

## Task 5: Bug R+T Fix — AGENTS.md docs.json + 15 Agent Correction

- Model: sonnet
- Effort: normal
- Skills: documentation-writer, system-architect
- Agent: doc-writer
- Files: .deckent/docs.json, src/core/identity-generator.ts, AGENTS.md, CLAUDE.md, DECKENT.md, README.md, README-TR.md, .deckent/workspace/IDENTITY.md
- Scope: ., .deckent/, src/core/

### Description

**Bug R fix:** `.deckent/docs.json`'a AGENTS.md entry ekle (`autoSections: ["Built-in Agents", "Last Updated"]`, `protectedSections: ["Identity", "Architecture"]`).

**Bug T fix:** `identity-generator.ts` identityRegen hook DEPRECATED — `.brain/PROJECT-IDENTITY.md` yazımı kaldırılır veya `.deckent/workspace/IDENTITY.md`'ye yönlendirilir (managed-docs zincirine devredilir, çakışma kaldırılır).

**Bug Y2 correction (Sprint 164 hatasının düzeltmesi):** 5 root .md "16 agent + test-writer" → "15 agent" (test-writer reference kaldır):
- AGENTS.md ZATEN doğru (15) — değişiklik yok ama "Sprint 149 reform" → "Sprint 166 ADR-041 reconfirmed" update
- CLAUDE.md L33 "16 built-in agents" → "15"
- DECKENT.md L23, L367 (Built-in Agents list + count)
- README.md L136, L178 (badge + comparison table)
- README-TR.md L138, L180
- `.deckent/workspace/IDENTITY.md` L15 "16 built-in" → "15"

**Anchor (T4 Y2 verification çalıştıktan sonra):** Ground-truth `.deckent/ground-truth-overrides.json` "agents_count: 15" zaten whitelist'te.

**Test:** 2 unit test (docs.json schema validation, identityRegen deprecation).

**Kanıt:**
- `grep -c "16 built-in\|test-writer" CLAUDE.md DECKENT.md README.md README-TR.md .deckent/workspace/IDENTITY.md` → 0 match
- `grep "agents-md" .deckent/docs.json` → 1 match
- `npx vitest run` → 2/2 PASS

---

## Task 6: Bug U+V Fix — Sprint Type Insert + Debt sprint_id Backfill

- Model: opus
- Effort: high
- Skills: typescript-expert, database-migration, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-retro-writer.ts, src/core/memory-import.ts, tests/orchestra/sprint-retro-writer-forensic.test.ts, tests/core/parse-debt-md.test.ts
- Scope: src/orchestra/, src/core/, tests/

### Description

**Bug U fix:** `sprint-retro-writer.ts` Sprint 140'tan sonra `type='sprint'` insert kırılmış (memory.db query: type='sprint' sadece 4 kayıt = Sprint 136-139). Git bisect deliverable: `git diff 8434387..224618c -- src/orchestra/` ile hangi commit kırdı raporu (1-line forensic).

**Bug V fix:** `memory-import.ts:54 (parseDebtMd)` 100 debt entry sprint_id=NULL — id'den (örn. debt-156-011) sprint extract regex + UPDATE atomic transaction (lock ~50ms).

**8 sprint memory backfill:** 134, 140, 152, 157, 158, 159, 160, 161, 165 için type='memory' entry'leri backfill (parseMemoryMd ile).

**Test:** 4 unit test (atomic transaction <100ms, sprint_id regex, backfill idempotency, sprint type insert).

**Kanıt:**
- `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries WHERE type='memory' AND sprint_id IN ('sprint-134','sprint-140','sprint-152','sprint-157','sprint-158','sprint-159','sprint-160','sprint-161','sprint-165')"` → 9 row
- `sqlite3 ... "SELECT COUNT(*) FROM entries WHERE type='debt' AND sprint_id IS NULL"` → 0
- `sqlite3 ... "SELECT COUNT(DISTINCT sprint_id) FROM entries WHERE type='sprint'"` → 4 + Sprint 166 (5)
- `npx vitest run` → 4/4 PASS

---

## Task 7: Bug C+X Fix — DECKENT.md Broken Ref + Summary Debt Filter

- Model: sonnet
- Effort: normal
- Skills: documentation-writer, typescript-expert
- Agent: doc-writer
- Files: DECKENT.md, src/core/memory-export.ts, tests/core/summary-debt-filter.test.ts
- Scope: ., src/core/, tests/core/

### Description

**Bug C fix:** DECKENT.md L49 `.brain/DECISIONS.md` referansı **broken** (Memory V2 DB-first migrate sonrası dosya YOK). `.brain/exports/decisions.md` veya MemoryStore API olarak güncellenir.

**Bug X fix:** `memory-export.ts` summary.md "Active Technical Debt" export filter `status != 'resolved'` ekle. debt-156-011 status='resolved' ama summary "Active" listede — yanlış export. Filter sonrası sadece açık debt'ler.

**Sprint 167 flip prep:** DECKENT.md `Default: Claude (docker backend)` ifadesi netleştir (tmux yazımı kaldır), Sprint 167 `dependency_pipeline_enabled` flip için anchor not.

**Test:** 3 unit test (debt filter, summary export, DECKENT.md reference validity).

**Kanıt:**
- `grep "\.brain/DECISIONS\.md" DECKENT.md` → 0 match
- `grep "tmux backend" DECKENT.md` → 0 match (docker olarak güncel)
- `grep -A 3 "Active Technical Debt" .brain/exports/summary.md` → debt-156-011 LİSTEDE DEĞİL
- `npx vitest run tests/core/summary-debt-filter.test.ts` → 3/3 PASS

---

## Task 8: Bug P Fix — TOOLS/BOOT/WORKER-GUIDE Auto-Content Generators

- Model: sonnet
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Agent: doc-writer
- Files: .deckent/docs.json, src/orchestra/managed-docs/content-generators.ts, .deckent/workspace/TOOLS.md, .deckent/workspace/BOOT.md, .deckent/workspace/WORKER-GUIDE.md, tests/orchestra/managed-docs-content-generators.test.ts
- Scope: .deckent/, src/orchestra/managed-docs/, tests/orchestra/managed-docs/

### Description

3 workspace dokümanı **ölü** (Sprint 138-148'den beri stale, 27 MCP + 56 CLI eksik, anti-pattern listesi yok).

**Fix:**
1. `.deckent/docs.json`'a 3 entry ekle (TOOLS.md, BOOT.md, WORKER-GUIDE.md)
2. `content-generators.ts` auto-content fonksiyonları:
   - **TOOLS.md:** 27 MCP tool list (kod tabanından otomatik enumerate), 56 CLI command listesi
   - **BOOT.md:** 7-step boot sequence + Sprint 165 manuel recovery zinciri (kill→cleanup→recover→run→spawn)
   - **WORKER-GUIDE.md:** verify-ran marker mekanizması, honest-result gate (Bug X), processQueue stall awareness, RBAC ADR-037, anti-pattern listesi (it.skip gerekçesiz YASAK, stub YASAK)

**Test:** 4 unit test (content-generators output validation).

**Kanıt:**
- `grep -c "deckent_audit\|deckent_recover\|deckent_watch\|deckent_nervous" .deckent/workspace/TOOLS.md` → 5+ match
- `grep -c "verify-ran\|honest-result gate" .deckent/workspace/WORKER-GUIDE.md` → 2+ match
- `npx vitest run tests/orchestra/managed-docs-content-generators.test.ts` → 4/4 PASS

---

## Task 9: Bug Q+W Fix — Provider Parity + emitAlert Helper + stale_md Detector

- Model: sonnet
- Effort: normal
- Skills: typescript-expert, system-architect, git-expert
- Agent: code-reviewer
- Files: src/monitor/alert-emitter.ts, src/monitor/auditor.ts, .codex/rules/brain.md, .codex/rules/auditor.md, .codex/rules/worker-default.md, .gemini/rules/brain.md, .gemini/rules/auditor.md, .gemini/rules/worker-default.md, .cursor/rules/, tests/monitor/alert-emitter.test.ts, tests/nervous/stale-md-detector.test.ts
- Scope: src/monitor/, .codex/rules/, .gemini/rules/, .cursor/, tests/

### Description

**Bug Q fix — Provider parity:**
- `.codex/rules/*.md` + `.gemini/rules/*.md` frontmatter sync (`paths: [...]` eklenir, `.claude/rules/` ile parite)
- `.cursor/rules/` scaffold IN — boş template + sync codepath (AGENTS.md → cursor.md sync logic)
- `extensions/vscode/` SCOPE OUT — Sprint 169'a ertelenir

**Bug W fix — Auditor pattern emitter:**
- `src/monitor/auditor.ts` `runScanCycle` içine pattern detection → `store.insert({type:'pattern'})` runtime wire (Sprint 148-165 boyunca 0 pattern entry — wire eksik)

**emitAlert helper (yeni infrastructure):** `src/monitor/alert-emitter.ts` (+30 LoC) — Sprint 166 T9 sınırı bu helper dahil. `emitAlert(type, payload)` → `.dashboard.json` alert write + `.deckent/sprint-NNN-events.jsonl` event emit (M4 monitoring source codepath).

**stale_md detector (M4 monitoring):** Nervous detector pattern — CLAUDE.md mtime > 70min ise emitAlert('stale_md', {...}).

**Test:** 3 unit test (emitAlert atomic, stale_md threshold trigger, provider parity sync).

**Kanıt:**
- `ls .codex/rules/ .gemini/rules/ .cursor/rules/` → 3 directory listed
- `grep -c "^paths:" .codex/rules/*.md` → 3 match (3 dosyada frontmatter)
- `grep "emitAlert" src/monitor/auditor.ts` → 2+ match (pattern emitter + stale_md detector)
- `npx vitest run` → 3/3 PASS

---

## Task 10: Bug K+L Fix — verify-ran Atomic Write + Stale Doc Test Update

- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/agents/worker-verify.ts, tests/agents/verify-ran-atomic.test.ts, tests/docs/CHANGELOG.test.ts, tests/blueprint/sprint-history.test.ts
- Scope: src/agents/, tests/

### Description

**Bug K fix:** `worker-verify.ts:379` `writeFileSync(markerPath, ...)` → atomic write pattern (write to `.tmp` + `renameSync` to final). Sprint 165 forensic: verify-ran marker 0 byte anomaly (atomic değil, partial write).

**Bug L fix:** 3 stale doc test sprint count güncelleme:
- `tests/docs/CHANGELOG.test.ts` Sprint 156 → 166 assertion
- `tests/blueprint/sprint-history.test.ts × 2` (Sprint 145+ → 165+ veya 166+)

**Test:** 2 unit test (atomic write race, stale test refactor).

**Kanıt:**
- `grep "renameSync\|\.tmp" src/agents/worker-verify.ts` → 2+ match (atomic pattern)
- `npx vitest run tests/docs/CHANGELOG.test.ts tests/blueprint/sprint-history.test.ts` → PASS (0 fail)

---

## Task 11: ADR-046 — Brain Self-Update Hook Architecture (Wave 1.5 Bootstrap Gate)

- Model: sonnet
- Effort: normal
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Files: docs/adr/046-brain-self-update-hook-architecture.md, tests/core/identity-generator-step-order.test.ts
- Scope: docs/adr/, tests/core/
- **Dependencies (ZORUNLU JSON):** `["166-T1","166-T2","166-T3"]`

### Description

**Wave 1.5 strictly serial gate:**
1. T1, T2, T3 hepsi DONE bekler (Brain scheduler dependency enforce eder)
2. **Alperen manuel CHECKPOINT:**
   - `npx deckent memory rebuild` (T1 wire artık ADR'leri DB'ye insert eder)
   - `.deckent/decisions/sprint-166-T1-done.json` write (decision marker)
3. T11 worker spawn → ADR-046 yazımı + regression test

**ADR-046 içeriği (MADR v3 hibrit):**
- **Status:** accepted
- **Context:** Sprint 154-165 boyunca Brain self-update yarım çalıştı (4 root cause forensic)
- **Decision:** Post-finalize hook chain mimari kontratı (Step 1-5 sıralama)
- **Mimari prensipler:** Koşulsuz invocation, cache key kompletlik, single registration target
- **Consequences:** Yeni hook eklenmesi için anchor; Sprint 167-168 M1-M4 monitoring ile falsifiable; Sprint 170 refactor trigger

**Regression test (`identity-generator-step-order.test.ts`):** Post-finalize hook çağrı sırası `memoryExport → adrInsert (Step 3) → ruleRegen (Step 4) → updateProjectDocs` doğrulanır.

**Test:** 1 regression test, 0 unit test (governance doc).

**Kanıt:**
- `ls docs/adr/046-brain-self-update-hook-architecture.md` → mevcut
- `sqlite3 .brain/memory.db "SELECT id FROM entries WHERE id='adr-046'"` → 1 row
- `npx vitest run tests/core/identity-generator-step-order.test.ts` → 1/1 PASS
- `grep "Sprint 170 refactor trigger\|M1-M4 monitoring" docs/adr/046-*.md` → 2+ match

---

## Anchor Kurallar (Worker'lar zorunlu okur)

1. **Ground-truth verification (Y2):** Tüm doc sync agent'ları gerçek dosya count'unu task öncesi doğrular (Bash `ls | wc -l`). Whitelist `.deckent/ground-truth-overrides.json`.
2. **`npm run build` YASAK** worker'larda — Alperen kararı
3. **Brain finalize observability izleme:** `.deckent/sprint-166-events.jsonl` + `ERRORS.md` canlı
4. **Sprint 165 wire korunur:** respawnEligibleTasks 13 grep match, honest-result gate, processQueue idempotency
5. **Multi-provider sync (Q dersi):** Hook eklerken `.claude/`, `.codex/`, `.gemini/`, `.cursor/` TÜM provider'lara yansır
6. **Test skip discipline:** verify-ran marker olmayan task NO_GO
7. **Idempotency:** Wave 1'de 3 idempotency test (T1+T2+T3) zorunlu
8. **Koşulsuz invocation pattern (Phase 2 dersi):** Yeni hook'lar opsiyonel callback değil, direct invocation
9. **TDD failing-first kanıtı:** Her code task `verify-ran` marker'da red→green commit hash zinciri
10. **Step ordering kontratı:** Spec 5.1 (Step 3 adrInsert, Step 4 ruleRegen) değiştirilemez — ADR-046'da dokümante
11. **T11 Wave 1.5 gate:** T1+T2+T3 DONE → `.deckent/decisions/sprint-166-T1-done.json` CHECKPOINT → `npx deckent memory rebuild` → T11 spawn

## Pre-Flight Checklist (Sprint başlatma öncesi ZORUNLU — 10 madde)

Alperen elle doğrular:
```
[ ] npm run build PASS (Sprint 165 commits dist/'a yansıdı)
[ ] dist/orchestra/sprint-finalizer.js mtime > git log -1 --format=%ct src/orchestra/sprint-finalizer.ts
[ ] /mcp restart confirmed (MCP cache invalidation)
[ ] docker ps --filter "name=deckent" → 0 container
[ ] docker images deckent-worker:latest → mevcut
[ ] ls .locks/ → boş
[ ] ls .tasks/ → sadece archive/ veya boş
[ ] npx deckent doctor → GREEN
[ ] git status → clean
[ ] cat .deckent/config.json | grep max_workers → 6
```

## GO/NO_GO Criteria

- ✅ **11/11 task DONE** veya 9/11 + 2 GO_WITH_TECH_DEBT
- ✅ `tsc --noEmit` PASS
- ✅ `npx vitest run` **delta 0 fail** (Sprint 165 GO_WITH_TECH_DEBT closure)
- ✅ 35 yeni test PASS (34 + 1 T11 regression), 0 regression
- ✅ Bug M kanıtı: memory.db'de adr-043/044/045/046 var
- ✅ Bug N kanıtı: `cli/commands/finalize.ts:166` onRuleRegen wire'lı + `.claude/rules/brain.md` ADR-043+ içerir
- ✅ Bug S kanıtı: `grep "sprint-166" CLAUDE.md` 1+ match (manuel finalize sonrası bile)
- ✅ Bug Y2 kanıtı: 5 root .md "15 agents" + test-writer YOK
- ✅ ADR-046 accepted + memory.db'de
- ✅ Per-hook idempotency: 3 dedup test PASS (T1+T2+T3)
- ✅ Step ordering: Sprint 166 finalize log'unda Step 3 (adrInsert) Step 4 (ruleRegen) ÖNCE çalıştı
- ✅ T11 post-condition: `sqlite3 memory.db SELECT id FROM entries WHERE id='adr-046'` → 1 row

### NO_GO senaryoları ve aksiyon:

- **Task 1 NO_GO** (Bug M adrInsert fail): Wave 1.5 BAŞLATILMAZ, T11 + Wave 2 + Wave 3 GECİKİR. Sprint 166.1 hot-fix.
- **Task 2 NO_GO** (Bug N onRuleRegen wire fail): `.claude/rules/` stale kalır, Sprint 167 monitoring M2 ihlal alarmı tetiklenir.
- **Task 3 NO_GO** (Bug S cache key fail): CLAUDE.md auto-sync hâlâ broken, Sprint 167 M2+M3 ihlal.
- **Task 11 NO_GO** (ADR-046 yazımı veya regression test fail): Step ordering kontratı dokümante değil — Sprint 167'de Bug M+N replay riski.
- **Wave 2-3 NO_GO**: Sprint 165 paterni — manuel `deckent_run` veya `deckent spawn --auto-approve` fallback (Sprint 165 proven).

## Sprint 167+ Hazırlık (Sprint 166 retro sonrası netleşir)

- **Sprint 167:** `dependency_pipeline_enabled` flip + minimal 3-task multi-wave smoke + M1-M4 baseline tracking
- **Sprint 168:** Open Source GA — public repo flip (`VerhexIO/deckent-dev` → `VerhexIO/deckent` public) + npm publish v1.0.0-beta.2 + Show HN
- **Sprint 169:** VS Code extension adapter (T9 OUT scope), community feedback

## Post-Sprint Verify Protokolü (manual review — opsiyonel ama önerilen)

1. **Bug M kanıtı:** `sqlite3 .brain/memory.db "SELECT id, status FROM entries WHERE id LIKE 'adr-04%'"` → adr-043/044/045/046 listede
2. **Bug N kanıtı:** `grep -n "onRuleRegen" src/cli/commands/finalize.ts` → 1+ match
3. **Bug S kanıtı:** `git log --follow CLAUDE.md | head -3` → en yeni commit Sprint 166 hash
4. **Bug Y2 kanıtı:** `grep -c "16 built-in\|test-writer" CLAUDE.md DECKENT.md README.md README-TR.md .deckent/workspace/IDENTITY.md` → 0
5. **ADR-046 kanıtı:** `cat docs/adr/046-*.md | head -30` + `sqlite3 ... adr-046 row count = 1`
6. **Step ordering kanıtı:** Sprint 166 finalize log'unda hook execution order doğru
7. **Per-hook idempotency:** 3 dedup test PASS report
8. **Test count:** `npx vitest run` → fail 0, 35 yeni test
9. **maxWorkers korundu:** `cat .deckent/config.json | grep max_workers` → 6

Bu protokol opsiyonel — Brain self-audit gate ve Auditor scan bu kontrolleri içerikte kapsıyor; manuel review çift-katman güven katar.
