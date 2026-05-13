# Sprint 166 Design Spec — Brain Self-Update + Data Integrity Closure

**Date:** 2026-05-13
**Status:** v4 (2. eval döngüsü sonrası — Agent A 95.2/100 ✓, Agent B 34/100 → 8 madde + 2 minor entegre)
**Quality bar:** T4 god-level (Agent A skor 95+, Agent B risk skor <30)
**Author:** Koordinatör (4 forensic + 4 adversarial eval agent + brainstorming/systematic-debugging skill çift kullanımı + Phase 4.5 architectural review)

---

## 1. Goal

Sprint 164-165 boyunca canlı reproduce olan 4 mimari kök sebebi (Bug M, N, S, Y2) kalıcı çözmek + 12 data correction'ı kapatmak + ADR-046 ile yeni mimariyi dokümante etmek. Brain post-sprint hooks **artık dosyaları gerçekten güncelliyor**, ADR'ler memory.db'ye akıyor, provider rules ADR-046+ ile evolve ediyor, doc sync agent'ları ground-truth verification yapıyor. Sprint 167+ "gerçek kontrol" hattına açılan kapı (open source GA prep).

## 2. Context

Sprint 154'ten beri (12 sprint) Brain'in self-update mekanizması yarım çalışıyor. 4 paralel forensic agent + 2 round (4 agent toplam) adversarial eval ile derinlemesine audit yapıldı, kanıt-bazlı 4 architectural root cause + 16 bug tespit edildi.

**Ground truth (kod kanıtlı):**
- Sprint: 165 | Agents: **15** (`src/core/builtins/agents/`) | Skills: 21 | MCP tools: 27 | CLI: 56
- ADR: 43 memory.db (043/044/045 YOK) | spawn_backend: docker | Version: 1.0.0-beta.1
- Sprint 165 gerçek token: 377K in+out + 514K cache = 891K grand total (5 task ortalama 75K input)

## 2.1 Working Pattern Comparison (Phase 2 — 3 kategori)

| Hook | Kategori | Neden |
|---|---|---|
| **memoryExport** | Working + Effective | Koşulsuz invocation, standart signature `(store, projectRoot)`, side-effect minimal |
| **updateProjectDocs** (managed-doc-runner) | **Working but Ineffective** | Invoke ediliyor ✓ ama `cached_no_change` ile SKIP (Bug S — cache key sprint.id içermiyor) |
| **identityRegen** | Working + Misdirected | `.brain/PROJECT-IDENTITY.md` yazıyor — managed-docs zincirinde `.deckent/workspace/IDENTITY.md` ayrıca kayıtlı, çakışma |
| **ruleRegen (otomatik)** | Working IF called | Brain otomatik path (`sprint-phases.ts:1238`) onRuleRegen geçiriyor ✓ |
| **ruleRegen (manuel)** | **NOT INVOKED** | Manuel `deckent finalize` (`cli/commands/finalize.ts:166`) onRuleRegen PARAMETRESİ YOK ✗ |
| **adrInsert** | **Hiç tanımlanmamış** | Codepath sıfırdan eksik |
| **agentsmdSync** | **Hiç tanımlanmamış** | docs.json'da kayıt yok |

**Mimari prensipler (Phase 2 çıkarımı):**
1. **Koşulsuz invocation pattern** — yeni hook'lar opsiyonel callback değil
2. **Cache key kompletlik** — sprint-aware invalidation zorunlu
3. **Single registration target** — direct invocation veya docs.json, ikisi birden değil

## 3. Root Cause Hierarchy (Phase 1)

### 3.1 Bug M — adrInsert hook YOK
**Yer:** `src/orchestra/sprint-finalizer.ts:1197` runPostFinalizeHooks zinciri
**Tanım:** Worker `docs/adr/045.md` yazıyor → memory.db'ye INSERT eden HİÇBİR runtime hook YOK. `parseDecisionsMd` (`src/core/memory-import.ts:54`) yalnız manuel `deckent memory rebuild` tetikleniyor.
**Etki:** ADR-043/044/045 23 gün önce kayboldu. ADR-036 governance bypass.

### 3.2 Bug N — onRuleRegen callback manuel finalize path'ten geçirilmiyor
**Forensic kanıtlanmış (v3 factual fix):**

```
sprint-phases.ts:1238    ✓ onRuleRegen: async (root) => await regenerateRules(root)  [GEÇIRIYOR]
sprint-finalizer.ts:1197 ✓ onRuleRegen: opts?.onRuleRegen                             [PASSING THROUGH]
identity-generator.ts:344 ✓ if (opts.onRuleRegen) { await opts.onRuleRegen(...) }     [WORKING IF DEFINED]
cli/commands/finalize.ts:166 ✗ finalizeSprint(..., { skipDecay, skipHooks, config }) [onRuleRegen YOK!]

cli/commands/recover.ts → finalizeSprint çağrısı YOK ✓ (v4 forensic — F4 risk çürütüldü)
```

**Asıl Bug:** Manuel `deckent finalize` CLI onRuleRegen wire yapmıyor. Brain **otomatik** path çalışıyor, **manuel** path kırık. Recover path zaten finalize çağırmadığı için Bug N tetiklemiyor.

**Bug S timeline ile mükemmel uyum:**
- Sprint 130-151: Brain otomatik finalize → CLAUDE.md auto-sync ✓
- Sprint 152+: Manuel finalize/recover (force) → otomatik hook'lar ATLANDI ✗

### 3.3 Bug S — managed-doc-runner cache invalidation + Sprint 152 break point
**Yer:** `src/orchestra/managed-docs/doc-cache.ts` cache key = fileHash + entryHash (sprint.id YOK)
**Tanım:** Cache `cached_no_change` SKIP. Her sprint sonu invocation ✓ ama dosya update edilmiyor.

**Git bisect forensic (Sprint 166 T6 deliverable: hangi commit kırdı):**
```
Sprint 130-151 working chain (12 sprint zincir):
  fd09060 (130) → 20b2a82 (132) → 06b7c8a (133) → b371065 (134) →
  119b65e (135) → a4440d5 (136) → 0d026b2 (137) → 079d1c8 (138) →
  375a1cf (139) → 2c21720 (142) → 8434387 (Sprint 151 son auto-sync)
Sprint 152 break point: commit 224618c (restore baseline 2026-05-05) + manuel-only Sprint 153+
T6 deliverable: `git diff 8434387..224618c -- src/orchestra/managed-docs/` analiz → "Sprint 152 break: hangi LoC değişti" 1-line forensic raporu spec v5 changelog
```

### 3.4 Bug Y2 — Doc sync agent ground-truth verification eksik
**Yer:** `src/orchestra/task-builder.ts` (build worker prompt) + `src/orchestra/planner.ts` (AI-mode prompt builder)

**Test pattern kararı (3-katmanlı defense-in-depth):**
- **Unit test:** `tests/orchestra/doc-sync-ground-truth.test.ts` — prompt input "X agents" iddiası vs `fs.readdirSync('src/core/builtins/agents/')` count. 3 case.
- **Integration test:** Wave 2 retro Auditor "agent count assertion" doğru sayı vermiş mi?
- **Auditor runtime check:** `src/monitor/auditor.ts::runScanCycle (line 705)` içine `verifyDocSyncGroundTruth(task)` çağrısı ekle, mismatch → `runtime.alert.boundary_violation`.
- **Falsifiable predicate:** Mismatch threshold = **1** (zero-tolerance).
- **Whitelist mekanizması:** `.deckent/ground-truth-overrides.json` — JSON şema:

```json
{
  "version": "1.0",
  "overrides": [
    {
      "metric": "agents_count",
      "expected": 15,
      "approvedBy": "alperen",
      "until_sprint": 170,
      "reason": "Sprint 148 ADR-041 reform stable"
    },
    {
      "metric": "mcp_tools_count",
      "expected": 27,
      "approvedBy": "alperen",
      "until_sprint": 200,
      "reason": "Sprint 161-165 nervous tools eklendi"
    }
  ]
}
```

## 4. 16 Bug Final Inventory

| ID | Tanım | Sev | Aksiyon |
|---|---|---|---|
| **M** | ADR-043/044/045 memory.db'de YOK | **P0** | adr-file-sync.ts + Step renumbering |
| **N** | onRuleRegen manuel finalize path'ten geçmiyor | **P0** | `cli/commands/finalize.ts:166` wire |
| **S** | doc-cache.ts cache key sprint.id içermiyor | **P0** | cache key extension |
| **Y2** | Doc sync ground-truth eksik | **P0** | 3-katmanlı + `runScanCycle:705` + whitelist şema |
| R | AGENTS.md docs.json'da yok | P1 | docs.json kayıt |
| T | identityRegen yanlış hedef | P1 | managed-docs devret |
| O | brain.md AUTO+CUSTOM duplicate | P1 | sync code refactor |
| P | TOOLS/BOOT/WORKER-GUIDE ölü | P1 | auto-content generators |
| U | sprint type='sprint' 140+ kırılmış | P1 | retro-writer forensic |
| Q | Provider parity drift | P2 | multi-provider pipeline |
| K | verify-ran atomic write | P2 | .tmp + rename |
| L | Doc test sprint count | P2 | 3 stale test güncel |
| V | 100 debt sprint_id=NULL | P2 | parseDebtMd populate |
| W | Pattern emitter yok | P2 | auditor runtime wire |
| X | summary.md "Active Debt" filter | P2 | export filter |
| C | .brain/DECISIONS.md broken ref | P2 | DECKENT.md L49 fix |

## 5. Architecture — 4-Wave Plan (11 task, T11 Wave 1.5'e ayrıldı)

### Wave 1: Architectural Hook Fixes (3 paralel — T11 ayrıldı v4)

1. **166-T1 (Bug M):** adr-file-sync.ts yeni + identity-generator Step renumbering wire + memory.ts rebuild secondary source. 5 test (1 idempotency).
2. **166-T2 (Bug N+O):** `cli/commands/finalize.ts:166` onRuleRegen wire + AUTO/CUSTOM block design fix. **Scope review:** `cli/commands/recover.ts` finalize çağrısı YOK (v4 forensic confirmed) — recover path Bug N tetiklemiyor. 4 test (1 idempotency).
3. **166-T3 (Bug S):** doc-cache.ts cache key extension (sprint.id hash) + fallback `if (!sprintId) use old hash` geriye uyumlu. 4 test (1 idempotency).

### Wave 1.5: Bootstrap Gate (T11 STRICTLY SERIAL — yeni v4 wave)

4. **166-T11 (ADR-046):** Brain Self-Update Hook Architecture ADR + Step renumbering doküman.
   - **Gate:** T1, T2, T3 hepsi DONE bekler
   - **Bridge step:** Alperen manuel `npx deckent memory rebuild` CHECKPOINT (`.deckent/decisions/sprint-166-T1-done.json` write → CHECKPOINT approve)
   - **Sonrası:** T11 worker spawn, ADR-046 yazımı (`docs/adr/046-*.md`) + memory.db insert (T1 wire ile otomatik)
   - **Step renumbering deliverable:** `identity-generator.ts:343` Step 3 (ruleRegen) → Step 4. Yeni Step 3 (adrInsert) insert noktası eklendi. Regression test `tests/core/identity-generator-step-order.test.ts` (1 test).
   - **Test:** 1 regression test (Step ordering), 0 unit test (doc task)

### Wave 2: Data Integrity + Manuel Corrections (4 paralel)

5. **166-T4 (Bug Y2):** Doc sync ground-truth verification 3-katmanlı + whitelist şema. `runScanCycle:705` içine `verifyDocSyncGroundTruth()` ekle. 3 test.
6. **166-T5 (Bug R+T):** AGENTS.md docs.json kayıt + identityRegen managed-docs devret + 15 agent correction (5 dosya). 2 test.
7. **166-T6 (Bug U+V):** Sprint type='sprint' Sprint 140+ forensic (T6 deliverable: hangi commit kırdı raporu) + 8 sprint memory backfill + 100 debt sprint_id populate. **Atomic transaction** (lock ~50ms). 4 test.
8. **166-T7 (Bug C+X):** DECKENT.md broken ref fix + summary.md "Active Debt" filter + Sprint 165 wire activation flip prep. 3 test.

### Wave 3: Living Docs + Cleanup (3 paralel)

9. **166-T8 (Bug P):** TOOLS/BOOT/WORKER-GUIDE.md docs.json kayıtları + auto-content generators. 4 test.
10. **166-T9 (Bug Q+W + M4 emit codepath):** Provider parity (.codex/.gemini frontmatter sync + `.cursor/rules/` scaffold IN — boş template + sync codepath; `extensions/vscode/` OUT, Sprint 169) + Auditor pattern emitter + **stale_md detector emit codepath** (`emitAlert('stale_md', {...})` `.dashboard.json` write hook'una pipe — M4 monitoring source). 3 test.
11. **166-T10 (Bug K+L):** verify-ran atomic write + 3 doc test sprint count. 2 test.

**Toplam:** 11 task, ~510 LoC, 34 test + 1 regression (T11) = 35 test.

### 5.1 Step Ordering Contract (Wave 1 mimari kontrat)

`identity-generator.ts:308-356` post-finalize hook chain yeni sıralama:

```
Step 1: memoryExport  (DB → .brain/exports/*.md)            [UNCHANGED]
Step 2: identityRegen (DEPRECATED — T5 devret managed-docs) [UNCHANGED → DEPRECATED]
Step 3: adrInsert     (YENİ T1 — docs/adr/*.md → memory.db) [v4 INSERTED HERE]
Step 4: ruleRegen     (önce Step 3 idi → Step 4'e KAYDIRILDI) [v4 RENUMBERED]
Step 5: updateProjectDocs (managed-doc-runner sprint-aware)  [UNCHANGED]
```

**Kontrat:** adrInsert (Step 3) **ÖNCE** çalışır → ruleRegen (Step 4) memory.db'den ADR-043+ okur → `.claude/rules/brain.md` inject. T11 ADR-046 bu kontratı dokümante eder + regression test (`identity-generator-step-order.test.ts`).

**T11 task JSON dependencies enforcement (v5 patch — Agent B F5):** T11 task JSON'unda `dependencies: ["166-T1","166-T2","166-T3"]` ZORUNLU. Wave 1.5 gate scheduler tarafından enforce edilir (Sprint 134 T-005 priority + dependencies altyapısı), manuel CHECKPOINT sonrası spawn. AI planner T11'i Wave 1'e paralel düşüremez.

### 5.2 Per-Task TDD + LoC Matrix

| Task | LoC | Test count | Idempotency test | Failing-first kanıtı | Post-condition |
|---|---|---|---|---|---|
| T1 | ~60 | 5 | 1 | `verify-ran` marker | grep `respawnEligibleTasks` 4+ match |
| T2 | ~40 | 4 | 1 | `verify-ran` marker | grep `onRuleRegen` cli/finalize.ts:166 match |
| T3 | ~30 | 4 | 1 | `verify-ran` marker | doc-cache test sprint hash kullanır |
| T11 | ~80 (doc) | 1 (regression) | 0 | TDD applicable değil (doc) | `sqlite3 memory.db SELECT id FROM entries WHERE id='adr-046'` 1 row |
| T4 | ~50 | 3 | 0 | `verify-ran` marker | `runScanCycle` verifyDocSyncGroundTruth invoked |
| T5 | ~40 | 2 | 0 | manuel (anchor edits) | 5 root .md "15 agents" + test-writer YOK |
| T6 | ~80 | 4 | 0 | atomic transaction test | sqlite3 ... `entries WHERE sprint_id IS NULL` → 0 |
| T7 | ~40 | 3 | 0 | `verify-ran` marker | grep `.brain/DECISIONS.md` DECKENT.md 0 match |
| T8 | ~60 | 4 | 0 | `verify-ran` marker | TOOLS.md auto-generated 27 MCP listed |
| T9 | ~70 (40+30 helper) | 3 | 0 | `verify-ran` marker | emitAlert('stale_md') codepath kanıt + `src/monitor/alert-emitter.ts` yeni helper |
| T10 | ~30 | 2 | 0 | `verify-ran` marker | verify-ran .tmp + rename test |
| **TOPLAM** | **~510** | **35** | **3** | — | — |

### 5.3 Wave 1 Plan-Time Collision Check

```
T1:  src/core/adr-file-sync.ts (YENİ) + src/core/identity-generator.ts (EDIT) + src/cli/commands/memory.ts (EDIT)
T2:  src/cli/commands/finalize.ts (EDIT) + src/core/rules-generator.ts (EDIT)
T3:  src/orchestra/managed-docs/doc-cache.ts (EDIT)
T11: docs/adr/046-*.md (YENİ) + tests/core/identity-generator-step-order.test.ts (YENİ)

COLLISION CHECK (Sprint 138 detectScopeCollisions):
- T1 vs T2: paylaşılan dosya YOK ✓
- T1 vs T3: paylaşılan dosya YOK ✓
- T2 vs T3: paylaşılan dosya YOK ✓
- T11 (Wave 1.5): T1 sonrası serial, çakışma yok ✓
```

## 6. Anchor Rules

1. **Ground-truth verification (Y2):** Tüm doc sync agent'ları gerçek dosya count'unu task öncesi doğrular (Bash `ls | wc -l`). Whitelist `.deckent/ground-truth-overrides.json` JSON şema (Section 3.4).
2. **`npm run build` YASAK** worker'larda
3. **Brain finalize observability izleme:** `.deckent/sprint-166-events.jsonl` + `ERRORS.md` canlı
4. **Sprint 165 wire korunur:** respawnEligibleTasks 13 grep match, honest-result gate, processQueue idempotency
5. **Multi-provider sync (Q dersi):** Hook eklerken `.claude/`, `.codex/`, `.gemini/`, `.cursor/` TÜM provider'lara yansır
6. **Test skip discipline:** verify-ran marker olmayan task NO_GO
7. **Idempotency:** Wave 1'de 3 idempotency test (T1+T2+T3)
8. **Koşulsuz invocation pattern:** Opsiyonel callback anti-pattern
9. **TDD failing-first kanıtı:** Her code task `verify-ran` marker'da red→green commit hash zinciri
10. **Step ordering kontratı:** Section 5.1 değiştirilemez (ADR-046'da dokümante)
11. **T11 Wave 1.5 gate:** T1+T2+T3 DONE → `.deckent/decisions/sprint-166-T1-done.json` CHECKPOINT → `npx deckent memory rebuild` → T11 spawn

### 6.1 Pre-Flight Checklist (Sprint 166 başlatma öncesi ZORUNLU — 10 madde v4)

```
[ ] npm run build PASS (Sprint 165 commits dist/'a yansıdı)
[ ] dist/orchestra/sprint-finalizer.js mtime > git log -1 --format=%ct src/orchestra/sprint-finalizer.ts (build fresh kanıt)
[ ] /mcp restart confirmed (MCP cache invalidation)
[ ] docker ps --filter "name=deckent" → 0 container
[ ] docker images deckent-worker:latest → mevcut (worker image hazır)
[ ] ls .locks/ → boş
[ ] ls .tasks/ → sadece archive/ veya boş
[ ] npx deckent doctor → GREEN (no critical alerts)
[ ] git status → clean (Sprint 165 commits tam)
[ ] cat .deckent/config.json | grep max_workers → 6
```

### 6.2 Token Budget Gate (v4 — Sprint 165 gerçek forensic)

**Sprint 165 gerçek toplam (5 task, run-mp3x* dahil):**
- Input: 331K, Output: 45K, **In+Out: 377K**
- Cache Read: 514K, **Grand Total: 891K**
- Per-task avg in+out: ~75K | Per-task avg grand: ~178K

**Sprint 166 tahmin (11 task):**
- Beklenen in+out: 11 × 75K = **825K**
- fix_phase replay 1.3× → **~1.07M in+out**
- Grand (cache dahil): 11 × 178K = **~2M**

**Checkpoint threshold:**
- Wave başı cumulative `in+out > 900K` → Alperen manuel triage
- Sprint sonu metric file ≥10 satır (Sprint 165 4-satır anomalisinden uzak)
- Monitoring source: `.deckent/sprint-166-metrics.jsonl` (Wave bazlı emit)

**Token gate enforcement (v5 patch — Agent B F7):** Sprint 166'da **advisory only** (manuel triage, Sprint controller'a otomatik blocker eklenmemiş). Sprint 167 P0: automatic blocker codepath (`sprint-controller.ts` Wave başı `if (cumulativeTokens > 900K) waitForApproval()`).

## 7. GO/NO_GO Criteria

- ✅ **11/11 task DONE** veya 9/11 + 2 GO_WITH_TECH_DEBT
- ✅ `tsc --noEmit` PASS
- ✅ `npx vitest run` **delta 0 fail**
- ✅ 35 yeni test PASS (34 + 1 T11 regression), 0 regression
- ✅ Bug M kanıtı: memory.db'de adr-043/044/045/046 var
- ✅ Bug N kanıtı: `cli/commands/finalize.ts:166` onRuleRegen wire'lı + `.claude/rules/brain.md` ADR-043+ içerir
- ✅ Bug S kanıtı: `grep "sprint-166" CLAUDE.md` 1+ match
- ✅ Bug Y2 kanıtı: 5 root .md "15 agents" + test-writer YOK + `runScanCycle` verifyDocSyncGroundTruth invoked
- ✅ ADR-046 accepted + memory.db'de
- ✅ **Per-hook idempotency:** 3 dedup test PASS (T1+T2+T3)
- ✅ **Step ordering:** Sprint 166 finalize log'unda Step 3 (adrInsert) Step 4 (ruleRegen) ÖNCE çalıştı kanıtı
- ✅ **T11 post-condition:** `sqlite3 memory.db SELECT id FROM entries WHERE id='adr-046'` → 1 row

## 8. Sprint 167+ Hazırlık

- **Sprint 167:** `dependency_pipeline_enabled` flip + minimal multi-wave smoke + monitoring metric M1-M4 baseline tracking
- **Sprint 168:** Open Source GA — public repo flip + npm publish v1.0.0-beta.2 + Show HN
- **Sprint 169:** VS Code extension adapter (T9 OUT scope), community feedback

## 9. Risk Matrix

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| Wave 1 hook fix Brain runtime bozar | Orta | Yüksek | Pre-flight 10-madde + non-destructive additive + fix_phase + Sprint 166.1 plan |
| Token budget aşımı (>900K in+out) | Orta | Orta | Wave başı checkpoint, Sprint 165 forensic-bazlı tahmin (1.07M with replay) |
| Sprint 166 OOM (Bug G replay) | Düşük | Orta | maxWorkers=6, Sprint 165 dersleri |
| 16 bug çok geniş scope | Orta | Düşük | Wave prioritization, GO_WITH_TECH_DEBT kabul |
| **Brain self-bozma paradox** | Orta | **Yüksek** | T1 yeni dosya, T2 parameter ekleme, T3 cache key fallback — **mevcut hook'a dokunulmuyor** |
| **T1 vs T11 bootstrap paradox** | Düşük | Orta | **v4 fix:** T11 Wave 1.5'e ayrıldı, T1+T2+T3 DONE → manuel CHECKPOINT → T11 spawn (strict serial) |
| Wave 2 T6 schema migration race | Düşük | Düşük | Atomic transaction (lock ~50ms), Wave 1 finalize'dan SONRA |
| TDD discipline regression | Düşük | Düşük | Section 5.2 matrix + verify-ran marker red→green zinciri |
| Cursor scope creep | Düşük | Düşük | T9 explicit `.cursor/rules/` IN, vscode OUT (Sprint 169) |
| **recover path Bug N tetikler mi (Agent B F4)** | YOK ✓ | — | **v4 forensic confirmed:** `cli/commands/recover.ts` finalizeSprint çağrısı YOK — recover audit + cleanup + archive yapar, finalize bypass eder |

## 10. Concrete Monitoring Metric Spec (Phase 4.5 detail)

Sprint 167-168 boyunca otomatik tracked metric'ler:

| Metric ID | Tanım | Hedef | Kaynak | Emit codepath |
|---|---|---|---|---|
| **M1** | `hook_fail_count` | = 0 her sprint sonu | `.deckent/sprint-NNN-events.jsonl` hook çağrı log | postFinalizeHooks içine emit eklenir (Sprint 167 P0) |
| **M2** | `claude_md_mtime_freshness` | **≤ sprint median 35dk × 2 = 70dk** | `git log --follow CLAUDE.md` son commit ≥ sprint başı | Sprint 167 cron check |
| **M3** | `adr_parity_delta` | = 0 | `sqlite3 memory.db SELECT count(*) FROM entries WHERE type='adr'` vs `ls docs/adr/*.md \| wc -l` | Sprint 167 daily check |
| **M4** | `auditor_stale_md_alert_count` | = 0 | `.dashboard.json` alerts "stale_md" tipi | **Sprint 166 T9 emit codepath ekler** (`emitAlert('stale_md', ...)` `auditor.ts:runScanCycle` içine) |

**Refactor trigger condition (Sprint 170 açılışı):**
- Sprint 167-169 boyunca **4 metric'ten ≥1'i 2+ kez ihlal** (cumulative count `.deckent/sprint-NNN-metrics.jsonl` Wave bazlı track) → Sprint 170 "Brain Self-Update Mekanizması Mimari Refactor v2" sprint plan'a girer
- Veya: cache_skip / hook_undefined / missing_md kategorilerinden ≥2 yeni bug raporu

## 11. Phase 4.5 — Architectural Review (Yamalama vs Refactor)

systematic-debugging: **"3+ fix failed → question architecture"**. 12 sprint failure → karşı kanıt mı?

### 11.1 Yamalama Kararı Gerekçeleri (v4)

1. **Mevcut mimari paradigma sağlam (KISMI VARSAYIM — Sprint 167-168 M1-M4 monitoring ile DOĞRULANACAK):** Hook chain + docs.json + cache layer doğru paradigma. Bug'lar runtime invocation chain'inde (manuel path miss, cache key eksik, missing hook).
2. **Refactor riski yüksek + Sprint 134-136 god-split counter-evidence:** 3 sprint sürdü, kısmen başarılı (stable). Sprint 166 11 task + 510 LoC kapsamı zaten ağır — refactor 3 sprint'lik scope, ayrı sprint olarak Sprint 170'e taşınması mantıklı.
3. **Yamalama additive sınırı:** Spec proposed fix'leri non-destructive additive. T11 Wave 1.5 gate + Pre-flight checklist + Step ordering kontratı ile mimari sözleşme açık.
4. **ADR-046 mimariyi dokümante eder:** Brain Self-Update Hook Architecture + working/broken pattern anchor doküman. M1-M4 monitoring ile falsifiable — replay olursa Sprint 170.

### 11.2 Counter-Argument (Agent B observation kabul)

> "Refactor riski yüksek iddiası Sprint 134-136 örneğiyle çelişiyor — refactor yapıldı, çalıştı."

**Kabul:** Refactor mümkün ama Sprint 166'da scope çok büyük. Sprint 170 refactor sprint Sprint 167-168 monitoring sonrası açılırsa daha fokus. Sprint 166 = yamalama + Sprint 170 = refactor (eğer trigger sağlanırsa, otomatik check `.deckent/sprint-NNN-metrics.jsonl`'dan).

## 12. Self-Review v4

✅ **Placeholder scan:** Hiç TBD/TODO yok.
✅ **Internal consistency:** 4 root cause ↔ 11 task ↔ 16 bug ↔ Step Ordering ↔ TDD Matrix ↔ Wave 1.5 gate tutarlı.
✅ **Scope check:** Tek sprint ağır ama Wave + Pre-flight 10-madde + Token budget gate + Wave 1.5 strict serial ile yönetilebilir.
✅ **Ambiguity check:** Her bug unique aksiyon + file:line + test pattern + post-condition.
✅ **Working pattern coverage:** 3-eksenli kategori (7 hook tablodakil).
✅ **Architectural review:** Phase 4.5 + counter-argument kabulü + monitoring trigger.
✅ **Monitoring metric:** M1-M4 + emit codepath (M4 Sprint 166 T9'da implement).
✅ **Adversarial coverage:** 2 eval döngüsü (4 agent toplam), 18 madde entegre, recover path forensic confirmed.
✅ **Forensic kanıt:** Sprint 165 token toplam 891K, runScanCycle:705, recover.ts finalize yok — hepsi verified.

## 13. Cross-References

- Sprint 165 final state: `docs/release/sprint-165-final-state.md`
- Sprint 165 commit zinciri: `0f4c936..27f1759`
- Spec v3 → v4 transition: commit `ad2d972` (v3) → bu commit (v4)
- 2-round adversarial eval: 4 agent rapor (`agent A v2/v3` + `agent B v2/v3`)
- Bug N forensic: `cli/commands/finalize.ts:166`, `cli/commands/recover.ts` (finalize yok)
- Bug S Sprint 152 break: commit `224618c` ile `8434387` arası `git diff src/orchestra/managed-docs/`
- ADR-036 ADR Governance, ADR-013 DECKENT.md Adapter Pattern
- Sprint 161/164/165 forensic: `.brain/archive/sprint-{161,164,165}-tasks/`
- Sprint 165 DIRECTIVES archive: `.brain/archive/DIRECTIVES-sprint-165.md`
