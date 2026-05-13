# Sprint 166 Design Spec — Brain Self-Update + Data Integrity Closure

**Date:** 2026-05-13
**Status:** v3 (system-debugging deep eval + devil's advocate red team sonrası 16 madde + Bug N factual fix)
**Quality bar:** T4 god-level (Agent A skor 95+ + Agent B risk skor <30)
**Author:** Koordinatör (4 forensic + 2 adversarial agent + brainstorming/systematic-debugging skill çift kullanımı + Phase 4.5 architectural review)

---

## 1. Goal

Sprint 164-165 boyunca canlı reproduce olan 4 mimari kök sebebi (Bug M, N, S, Y2) kalıcı çözmek + 12 data correction'ı kapatmak + ADR-046 ile yeni mimariyi dokümante etmek. Brain post-sprint hooks **artık dosyaları gerçekten güncelliyor**, ADR'ler memory.db'ye akıyor, provider rules ADR-046+ ile evolve ediyor, doc sync agent'ları ground-truth verification yapıyor. Sprint 167+ "gerçek kontrol" hattına açılan kapı (open source GA prep).

## 2. Context

Sprint 154'ten beri (12 sprint) Brain'in self-update mekanizması yarım çalışıyor. 4 paralel forensic agent + 2 adversarial agent ile derinlemesine audit yapıldı, kanıt-bazlı 4 architectural root cause + 16 bug tespit edildi.

**Ground truth (kod kanıtlı):**
- Sprint: 165 | Agents: **15** (`src/core/builtins/agents/`) | Skills: 21 | MCP tools: 27 | CLI: 56
- ADR: 43 memory.db (043/044/045 YOK) | spawn_backend: docker | Version: 1.0.0-beta.1

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
**Etki:** ADR-043 (Sprint 163), ADR-044 (Sprint 163), ADR-045 (Sprint 164) 23 gün önce kayboldu. ADR-036 governance bypass.

### 3.2 Bug N — onRuleRegen callback manuel finalize path'ten geçirilmiyor (FACTUAL FIX v3)
**ÖNCEKİ v2 İDDİASI YANLIŞ:** "sprint-finalizer.ts:1185 onRuleRegen geçirmiyor"
**GERÇEK FORENSIC:**

```
sprint-phases.ts:1238    ✓ onRuleRegen: async (root) => await regenerateRules(root)  [GEÇIRIYOR]
sprint-finalizer.ts:1197 ✓ onRuleRegen: opts?.onRuleRegen                             [PASSING THROUGH]
identity-generator.ts:344 ✓ if (opts.onRuleRegen) { await opts.onRuleRegen(...) }     [WORKING IF DEFINED]

cli/commands/finalize.ts:166 ✗ finalizeSprint(root, sprint, evaluations, results, {
                                  skipDecay, skipHooks, config
                                  // ← onRuleRegen YOK!
                                })
```

**Asıl Bug:** Manuel `deckent finalize` CLI (Sprint 152+ force-finalize/recover sonrası kullanılan) onRuleRegen wire yapmıyor. Brain **otomatik** path çalışıyor, **manuel** path kırık.

**Bug S timeline ile mükemmel uyum:**
- Sprint 130-151: Brain otomatik finalize → CLAUDE.md auto-sync commit zinciri ✓
- Sprint 152+: Manuel finalize/recover (force) → otomatik hook'lar ATLANDI ✗

### 3.3 Bug S — managed-doc-runner cache invalidation + Sprint 152 break point
**Yer:** `src/orchestra/managed-docs/doc-cache.ts` cache key = fileHash + entryHash (sprint.id YOK)
**Tanım:** Cache `cached_no_change` ile SKIP. Her sprint sonu invocation ✓ ama dosya update edilmiyor.
**Bug N ile birlikte:** Cache problem + manuel finalize hook miss ikisi birleşince Sprint 152+ stale.

**Git bisect forensic (Sprint 166 T6'da derinleştirilecek):**
```
Sprint 130-151 working chain:
  fd09060 (Sprint 130) → 20b2a82 (132) → 06b7c8a (133) → b371065 (134) →
  119b65e (135) → a4440d5 (136) → 0d026b2 (137) → 079d1c8 (138) →
  375a1cf (139) → 2c21720 (142) → 8434387 (Sprint 151 son auto-sync)

Sprint 152 break point: commit 224618c (restore baseline, 2026-05-05)
Sprint 153+ manuel only: 359bd10 (12 May, restore + Wave A)
```

### 3.4 Bug Y2 — Doc sync agent ground-truth verification eksik
**Yer:** `src/orchestra/task-builder.ts` (build worker prompt) + `src/orchestra/planner.ts` (AI-mode prompt builder)
**Tanım:** Sprint 164'te koordinatör agent'lara "16 agent" inject etti, gerçek 15. AGENTS.md doğru, diğer 5 dosya yanlış.
**Etki:** Sprint 164 commit `a4f3be4` yanlış bilgi yaydı.

**Test pattern kararı (3-katmanlı defense-in-depth):**
- **Unit test:** `tests/orchestra/doc-sync-ground-truth.test.ts` — prompt input "X agents" iddiası vs `fs.readdirSync('src/core/builtins/agents/')` count. 3 case.
- **Integration test:** Wave 2 retro Auditor "agent count assertion" doğru sayı vermiş mi?
- **Auditor runtime check:** `src/monitor/auditor.ts` scan loop'unda doc-sync task var ise prompt regex parse + `fs.readdirSync` karşılaştırma → mismatch → boundary violation alarm.
- **Falsifiable predicate:** Mismatch threshold = **1** (zero-tolerance — ground-truth her zaman exact).
- **Whitelist mekanizması:** `.deckent/ground-truth-overrides.json` — Alperen onaylı bilinçli istisnalar (örn. yakın gelecek sprint sayısı).

## 4. 16 Bug Final Inventory

| ID | Tanım | Sev | Aksiyon |
|---|---|---|---|
| **M** | ADR-043/044/045 memory.db'de YOK | **P0** | adr-file-sync.ts + Step 4 wire |
| **N** | onRuleRegen manuel finalize path'ten geçmiyor | **P0** | `cli/commands/finalize.ts:166` wire |
| **S** | doc-cache.ts cache key sprint.id içermiyor | **P0** | cache key extension |
| **Y2** | Doc sync ground-truth eksik | **P0** | Agent verification 3-katmanlı + whitelist |
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

## 5. Architecture — 3-Wave Plan (11 task)

### Wave 1: Architectural Hook Fixes (4 task, gating: T11 STRICTLY blocked until T1 DONE)

1. **166-T1 (Bug M):** adr-file-sync.ts yeni + identity-generator Step 4 wire + memory.ts rebuild secondary source. 5 test.
2. **166-T2 (Bug N+O):** `cli/commands/finalize.ts:166` onRuleRegen wire + AUTO/CUSTOM block design fix. 4 test.
3. **166-T3 (Bug S):** doc-cache.ts cache key extension (sprint.id hash) + fallback `if (!sprintId) use old hash` geriye uyumlu. 4 test.
4. **166-T11 (ADR-046):** Brain Self-Update Hook Architecture ADR yazımı. **STRICTLY serial dependency:** T1 DONE bekler, sonra manuel `deckent memory rebuild` CHECKPOINT (Alperen approval) sonrası ADR-046 memory.db'ye girer. 0 test.

### Wave 2: Data Integrity + Manuel Corrections (4 paralel)

5. **166-T4 (Bug Y2):** Doc sync ground-truth verification 3-katmanlı + whitelist. 3 test.
6. **166-T5 (Bug R+T):** AGENTS.md docs.json kayıt + identityRegen managed-docs devret + 15 agent correction (5 dosya). 2 test.
7. **166-T6 (Bug U+V):** Sprint type='sprint' Sprint 140+ forensic + 8 sprint memory backfill + 100 debt sprint_id populate. **Concurrency budget:** Wave 1 finalize'dan SONRA atomic transaction (lock ~50ms, çakışma yok). 4 test.
8. **166-T7 (Bug C+X):** DECKENT.md broken ref fix + summary.md "Active Debt" filter + Sprint 165 wire activation flip prep. 3 test.

### Wave 3: Living Docs + Cleanup (3 paralel)

9. **166-T8 (Bug P):** TOOLS/BOOT/WORKER-GUIDE.md docs.json kayıtları + auto-content generators. 4 test.
10. **166-T9 (Bug Q+W):** Provider parity (.codex/.gemini frontmatter sync + `.cursor/rules/` scaffold IN — boş template + sync codepath; `extensions/vscode/` adapter scope OUT, Sprint 169) + Auditor pattern emitter runtime wire. 3 test.
11. **166-T10 (Bug K+L):** verify-ran atomic write + 3 doc test sprint count. 2 test.

**Toplam:** 11 task, ~510 LoC, 34 test.

### 5.1 Step Ordering Contract (Wave 1 mimari kontrat)

`identity-generator.ts:308-356` post-finalize hook chain yeni sıralama:

```
Step 1: memoryExport  (DB → .brain/exports/*.md)
Step 2: identityRegen (DEPRECATED — T5 devret managed-docs)
Step 3: adrInsert     (YENİ T1 — docs/adr/*.md → memory.db) ← ÖNCE
Step 4: ruleRegen     (mevcut — memory.db'den ADR'leri okur, .claude/rules inject) ← SONRA
Step 5: updateProjectDocs (managed-doc-runner, cache sprint-aware T3 sonrası)
```

**Kontrat:** adrInsert Step 3 (önce DB'ye yaz), ruleRegen Step 4 (sonra DB'den oku + inject). T1 fix bu sıralama gerçekleşmesi için kritik.

### 5.2 Per-Task TDD + LoC Matrix

| Task | LoC | Test count | Idempotency test | Failing-first kanıtı |
|---|---|---|---|---|
| T1 | ~60 | 5 | 1 | `verify-ran` marker (red→green commit hash) |
| T2 | ~40 | 4 | 1 | `verify-ran` marker |
| T3 | ~30 | 4 | 1 | `verify-ran` marker |
| T11 | ~80 (doc) | 0 | 0 | TDD applicable değil (doc task) |
| T4 | ~50 | 3 | 0 | `verify-ran` marker |
| T5 | ~40 | 2 | 0 | manuel — anchor edits |
| T6 | ~80 | 4 | 0 | atomic transaction test |
| T7 | ~40 | 3 | 0 | `verify-ran` marker |
| T8 | ~60 | 4 | 0 | `verify-ran` marker |
| T9 | ~40 | 3 | 0 | `verify-ran` marker |
| T10 | ~30 | 2 | 0 | `verify-ran` marker |
| **TOPLAM** | **~510** | **34** | **3** | — |

### 5.3 Wave 1 Plan-Time Collision Check

```
T1:  src/core/adr-file-sync.ts (YENİ) + src/core/identity-generator.ts (EDIT) + src/cli/commands/memory.ts (EDIT)
T2:  src/cli/commands/finalize.ts (EDIT) + src/core/rules-generator.ts (EDIT)
T3:  src/orchestra/managed-docs/doc-cache.ts (EDIT)
T11: docs/adr/046-*.md (YENİ)

COLLISION CHECK (Sprint 138 detectScopeCollisions):
- T1 vs T2: paylaşılan dosya YOK ✓
- T1 vs T3: paylaşılan dosya YOK ✓
- T1 vs T11: paylaşılan dosya YOK ✓ (T11 sadece docs/adr/ + manuel DB insert)
- T2 vs T3: paylaşılan dosya YOK ✓
- T2 vs T11: paylaşılan dosya YOK ✓
- T3 vs T11: paylaşılan dosya YOK ✓
```

Sprint 138 Task 4 `detectScopeCollisions` plan-time pre-spawn check otomatik çalışır.

## 6. Anchor Rules

1. **Ground-truth verification (Y2):** Tüm doc sync agent'ları gerçek dosya count'unu task öncesi doğrular (Bash `ls | wc -l`). Whitelist `.deckent/ground-truth-overrides.json`.
2. **`npm run build` YASAK** worker'larda
3. **Brain finalize observability izleme:** `.deckent/sprint-166-events.jsonl` + `ERRORS.md` canlı
4. **Sprint 165 wire korunur:** respawnEligibleTasks 13 grep match, honest-result gate, processQueue idempotency
5. **Multi-provider sync (Q dersi):** Hook eklerken `.claude/`, `.codex/`, `.gemini/`, `.cursor/` TÜM provider'lara yansır
6. **Test skip discipline:** verify-ran marker olmayan task NO_GO
7. **Idempotency:** Her hook için `idempotency.test.ts` (Wave 1'de toplam 3 test)
8. **Koşulsuz invocation pattern:** Opsiyonel callback anti-pattern
9. **TDD failing-first kanıtı:** Her code task `verify-ran` marker'da red→green commit hash zinciri
10. **Step ordering kontratı:** Bölüm 5.1'deki sıralama değiştirilemez (mimari karar, ADR-046'da dokümante)

### 6.1 Pre-Flight Checklist (Sprint 166 başlatma öncesi ZORUNLU)

```
[ ] npm run build PASS (Sprint 165 commits dist/'a yansıdı)
[ ] /mcp restart confirmed (MCP cache invalidation)
[ ] docker ps --filter "name=deckent" → 0 container
[ ] ls .locks/ → boş
[ ] ls .tasks/ → sadece archive/ veya boş
[ ] npx deckent doctor → GREEN (no critical alerts)
[ ] git status → clean (Sprint 165 commits tam)
[ ] cat .deckent/config.json | grep max_workers → 6
```

### 6.2 Token Budget Gate

Sprint 165 metrics 4 satır kanıtladı — observability sıfır seviyede. Sprint 166 11 task token tahmini:
- Worker session ortalama: 30-50K input + 10-20K output
- 11 task × ~50K = ~550K
- fix_phase replay 1.5× = ~825K tahmin
- **Wave başı checkpoint:** cumulative token >600K ise Alperen manuel triage (token usage tracker `.deckent/sprint-166-metrics.jsonl` izlenir)
- **Sprint sonrası kanıt:** Sprint 166 metrics ≥10 satır (Sprint 165 4 satır anomalisinden uzak)

## 7. GO/NO_GO Criteria

- ✅ **11/11 task DONE** veya 9/11 + 2 GO_WITH_TECH_DEBT
- ✅ `tsc --noEmit` PASS
- ✅ `npx vitest run` **delta 0 fail** (Sprint 165 closure)
- ✅ 34 yeni test PASS, 0 regression
- ✅ Bug M kanıtı: memory.db'de adr-043/044/045/046 var
- ✅ Bug N kanıtı: `cli/commands/finalize.ts:166` onRuleRegen wire'lı + `.claude/rules/brain.md` ADR-043+ içerir
- ✅ Bug S kanıtı: `grep "sprint-166" CLAUDE.md` 1+ match (manuel finalize sonrası bile)
- ✅ Bug Y2 kanıtı: 5 root .md "15 agents" + test-writer YOK
- ✅ ADR-046 accepted
- ✅ **Per-hook idempotency:** adr-file-sync çift çağrı tek INSERT (dedup test), ruleRegen çift çağrı tek `.claude/rules/brain.md` write, doc-cache çift çağrı tek dosya update
- ✅ **Step ordering:** Sprint 166 finalize log'unda Step 3 (adrInsert) Step 4 (ruleRegen) ÖNCE çalıştı kanıtı

## 8. Sprint 167+ Hazırlık

- **Sprint 167:** `dependency_pipeline_enabled` flip + minimal multi-wave smoke + monitoring metric M1-M4 baseline tracking
- **Sprint 168:** Open Source GA — public repo flip + npm publish v1.0.0-beta.2 + Show HN
- **Sprint 169:** VS Code extension adapter (T9 OUT scope), community feedback

## 9. Risk Matrix

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| Wave 1 hook fix Brain runtime bozar | Orta | Yüksek | Pre-flight checklist (6.1) + non-destructive additive + fix_phase güvenlik ağı + Sprint 166.1 hot-fix plan |
| Token budget aşımı (>600K) | Orta | Orta | Wave başı checkpoint, Alperen manuel triage |
| Sprint 166 OOM (Bug G replay) | Düşük | Orta | maxWorkers=6 ders, container memory limit Wave 2 izlenir |
| 16 bug çok geniş scope | Orta | Düşük | Wave prioritization, GO_WITH_TECH_DEBT kabul |
| **Brain self-bozma paradox** | Orta | **Yüksek** | (1) T1 yeni dosya additive, (2) T2 `finalize.ts:166` parameter ekleme additive, (3) T3 cache key fallback geriye uyumlu — **mevcut çalışan hook'a dokunulmuyor** |
| **T1 vs T11 bootstrap paradox** | Yüksek | Orta | T11 STRICTLY serial gate (T1 DONE → manuel `deckent memory rebuild` CHECKPOINT → T11) |
| Wave 2 T6 schema migration race | Düşük | Düşük | Atomic transaction (lock ~50ms), Wave 1 finalize'dan SONRA execute |
| TDD discipline regression (test sayısı tutmaz) | Düşük | Düşük | Per-task TDD matrix (5.2), failing-first marker `verify-ran` zinciri kanıt |
| Cursor scaffold scope creep | Düşük | Düşük | T9 explicit `.cursor/rules/` IN, vscode OUT (Sprint 169) |

## 10. Concrete Monitoring Metric Spec (Phase 4.5 detail)

Sprint 167-168 boyunca otomatik tracked metric'ler:

| Metric ID | Tanım | Hedef | Kaynak |
|---|---|---|---|
| **M1** | `hook_fail_count` | = 0 her sprint sonu | `.deckent/sprint-NNN-events.jsonl` hook çağrı log'u |
| **M2** | `claude_md_mtime_freshness` | ≤ 1 sprint cycle | `git log --follow CLAUDE.md` son commit ≥ sprint başı |
| **M3** | `adr_parity_delta` | = 0 | `sqlite3 memory.db SELECT count(adr)` vs `ls docs/adr/*.md \| wc -l` |
| **M4** | `auditor_stale_md_alert_count` | = 0 | `.dashboard.json` alerts içinde "stale_md" tipi |

**Refactor trigger condition (Sprint 170 açılışı):**
- Sprint 167-169 boyunca **4 metric'ten ≥1'i 2+ kez ihlal** → otomatik Sprint 170 "Brain Self-Update Mekanizması Mimari Refactor v2" sprint plan'a girer
- Veya: cache_skip / hook_undefined / missing_md kategorilerinden ≥2 yeni bug raporu

## 11. Phase 4.5 — Architectural Review (Yamalama vs Refactor Kararı)

systematic-debugging diyor: **"3+ fix failed → question architecture"**. 12 sprint failure rate karşı kanıt mı?

### 11.1 Yamalama Kararı Gerekçeleri

1. **Mevcut mimari paradigma sağlam (kısmi varsayım — Sprint 167-168 monitoring metric M1-M4 ile DOĞRULANACAK):** Hook chain + docs.json registry + cache layer doğru paradigma. Bug'lar **runtime invocation chain'inde** (manuel path miss, cache key eksik, missing hook).
2. **Refactor riski yüksek + Sprint 134-136 god-split refactor counter-evidence:** 3 sprint sürdü, kısmen başarılı (sprint-controller.ts:1185 + identity-generator.ts:308-356 stable). Yeniden tasarım hayat eden 12 sprint kodu riske atar — AMA aynı zamanda refactor'un yapılabilirlik kanıtı.
3. **Yamalama additive sınırı:** Spec'in proposed fix'leri **non-destructive additive** (yeni hook ekleme, cache key extension, ground-truth verification). Mevcut çalışan hook silmiyor — kontrolör Risk Matrix 9.5'te.
4. **ADR-046 mimariyi dokümante eder:** Brain Self-Update Hook Architecture anchor doküman + working/broken pattern. Sprint 167-168 monitoring metric'leri ile **falsifiable** — eğer bug pattern replay olursa Sprint 170 refactor sprint açılır.

### 11.2 Counter-Argument (Agent B observation)

> "Refactor riski yüksek" iddiası Sprint 134-136 örneğiyle ÇELİŞİYOR (refactor yapıldı, çalıştı). Bu yamalama kararının zayıf gerekçesi.

**Kabul:** Refactor mümkün ama Sprint 166'da scope çok büyük. Sprint 170 refactor sprint Sprint 167-168 monitoring sonrası açılırsa daha fokus olur. Sprint 166 = yamalama + Sprint 170 = refactor (eğer trigger sağlanırsa).

## 12. Self-Review v3

✅ **Placeholder scan:** Hiç TBD/TODO yok. Bug N factual fix `cli/commands/finalize.ts:166` kanıtlı.
✅ **Internal consistency:** 4 root cause ↔ 11 task ↔ 16 bug ↔ 5.1 Step Ordering ↔ 5.2 TDD Matrix tutarlı.
✅ **Scope check:** Tek sprint için ağır (11 task, ~510 LoC), Wave + Pre-flight + Token budget gate ile yönetilebilir.
✅ **Ambiguity check:** Her bug unique aksiyon + file:line + test pattern. T11 strictly serial gate.
✅ **Working pattern coverage:** 3 kategori (Working+Effective, Working but Ineffective, Not Invoked, Missing).
✅ **Architectural review:** Phase 4.5 Section 11 + 11.2 counter-argument açık tartışma.
✅ **Monitoring metric:** M1-M4 net + refactor trigger condition spesifik.
✅ **Adversarial coverage:** Agent B 10 sorusu, Agent A 10 maddesi, factual error fix dahil 16 madde entegre.

## 13. Cross-References

- Sprint 165 final state: `docs/release/sprint-165-final-state.md`
- Sprint 165 commit zinciri: `0f4c936..27f1759`
- Spec v3 forensic agent raporları: Agent A (systematic-debugging deep eval) + Agent B (devil's advocate red team)
- Bug N forensic: `git log -S "onRuleRegen"` → Sprint 143 `2e3ba2a` wire commit
- Bug S timeline: `git log --follow CLAUDE.md` Sprint 130-151 working chain + Sprint 152 break
- ADR-036 ADR Governance, ADR-013 DECKENT.md Adapter Pattern
- Sprint 161/164/165 forensic: `.brain/archive/sprint-{161,164,165}-tasks/`
- Sprint 165 DIRECTIVES archive: `.brain/archive/DIRECTIVES-sprint-165.md`
