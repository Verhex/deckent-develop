# Sprint 166 Design Spec — Brain Self-Update + Data Integrity Closure

**Date:** 2026-05-13
**Status:** APPROVED v2 (system-debugging eval sonrası 6 madde güncelleme)
**Author:** Koordinatör (4 paralel forensic agent + brainstorming/systematic-debugging skill çift kullanımı + Phase 4.5 architectural review)

---

## 1. Goal

Sprint 164-165 boyunca canlı reproduce olan 4 mimari kök sebebi (Bug M, N, S, Y2) kalıcı çözmek + 12 data correction'ı kapatmak + ADR-046 ile yeni mimariyi dokümante etmek. Brain post-sprint hooks **artık dosyaları gerçekten güncelliyor**, ADR'ler memory.db'ye akıyor, provider rules ADR-046+ ile evolve ediyor, doc sync agent'ları ground-truth verification yapıyor. Sprint 167+ "gerçek kontrol" hattına açılan kapı (open source GA prep).

## 2. Context

Sprint 154'ten beri (12 sprint) Brain'in self-update mekanizması yarım çalışıyor. 4 paralel forensic agent (Memory V2 + Root .md + Provider Adapter + PostFinalizeHooks codepath) ile derinlemesine audit yapıldı, kanıt-bazlı 4 architectural root cause + 16 bug tespit edildi.

**Ground truth (kod kanıtlı):**
- Sprint: 165 (config.json `last_sprint_id`)
- Agents: **15** (`src/core/builtins/agents/` 15 dizin, test-writer YOK)
- Skills: 21
- MCP tools: 27 (`src/mcp/tools/` 28 dosya - 1 index = 27 register)
- CLI: 56 (`src/cli/commands/` dosya)
- ADR: 43 memory.db (043/044/045 YOK)
- spawn_backend: docker
- Version: 1.0.0-beta.1

## 2.1 Working Pattern Comparison (Phase 2 — systematic-debugging)

Spec ilk versiyonunda eksikti — broken pattern'ler tek başına analiz edildi. Bu bölüm working hook'lara karşı kıyaslama yapar.

### Çalışan Hook Pattern'leri (neden çalışıyor):

| Hook | Mimari Özellik | Neden Çalışıyor |
|---|---|---|
| **memoryExport** | Parametre yok, runFinalizeHooks tarafından koşulsuz çağrılır | "DB→.md basit export", side-effect minimal, signature `(store, projectRoot)` standart |
| **updateProjectDocs** (managed-doc-runner) | docs.json registered docs üzerinden çağrılır | Step 9 sprint-finalizer.ts:866-871 direct invocation, opsiyonel callback değil |

### Çalışmayan Hook Pattern'leri (neden bozuk):

| Hook | Mimari Özellik | Neden Bozuk |
|---|---|---|
| **ruleRegen** | `opts.onRuleRegen` opsiyonel callback parametre alır | `sprint-finalizer.ts:1185` çağrısı `onRuleRegen` parametresi GEÇİRMİYOR → callback `undefined`, hook gövdesi `if (opts.onRuleRegen) ...` ile no-op |
| **identityRegen** | Direct invocation ama yanlış hedef | `.brain/PROJECT-IDENTITY.md` yazıyor — managed-docs zincirinde `.deckent/workspace/IDENTITY.md` ayrıca kayıtlı, çakışma |
| **(yok) adrInsert** | Hiç tanımlanmamış | `docs/adr/*.md` → memory.db insert codepath sıfırdan eksik |

**Mimari Çıkarım:** Çalışan hook'lar = "koşulsuz invocation + standart signature". Bozuk hook'lar = "opsiyonel callback + yanlış hedef + missing". **Sprint 166 fix prensibi:** Tüm yeni hook'lar **koşulsuz invocation pattern** kullanmalı, opsiyonel callback ile değil.

## 3. Root Cause Hierarchy (Phase 1 — systematic-debugging)

### 3.1 Bug M — adrInsert hook YOK
**Yer:** `src/orchestra/sprint-finalizer.ts:1185` runPostFinalizeHooks zinciri
**Tanım:** Worker `docs/adr/045.md` yazıyor → memory.db'ye INSERT eden HİÇBİR runtime hook YOK. Tek var olan `parseDecisionsMd` (`src/core/memory-import.ts:54`) yalnız manuel `deckent memory rebuild` ile tetikleniyor.
**Etki:** ADR-043 (Sprint 163), ADR-044 (Sprint 163), ADR-045 (Sprint 164) 23 gün önce kayboldu. ADR-036 governance bypass edildi (kendi kuralı ihlal).
**Evidence:** memory.db query `WHERE type='adr' AND id LIKE 'adr-04%'` → adr-040, adr-041, adr-042 var, 043/044/045 YOK.

### 3.2 Bug N — ruleRegen callback finalize'den geçirilmiyor
**Yer:** `sprint-finalizer.ts:1185` runPostFinalizeHooks() çağrısında `onRuleRegen` parametresi YOK
**Tanım:** `identity-generator.ts:343-353` ruleRegen hook tanımlı ama "OPSİYONEL callback" boş kalıyor (Phase 2 working pattern karşılaştırmasına göre opsiyonel callback anti-pattern).
**Etki:** `.claude/`, `.codex/`, `.gemini/` rules/*.md dosyaları 13 sprint stale. ADR-042 (proposed) + 043/044/045 hiç inject edilmemiş.

### 3.3 Bug S — managed-doc-runner cache invalidation (TIMELINE VERIFIED)
**Yer:** `src/orchestra/managed-docs/doc-cache.ts` cache key = fileHash + entryHash
**Tanım:** Cache key sprint.id veya sprint metrics hash içermiyor → her sprint sonu `cached_no_change` ile SKIP.
**Etki:** CLAUDE.md Sprint 152'den sonra commit YOK. Sprint 154'ten beri "sprint-153" değerinde DONMUŞ.

**Git log timeline kanıtı (Phase 1 Step 4 — multi-component boundary):**
```
Sprint 130 → commit fd09060 docs: Sprint 130 dokümantasyon senkronizasyonu
Sprint 132 → commit 20b2a82 (auto + manual sync)
Sprint 133 → commit 06b7c8a
Sprint 134 → commit b371065 docs: Sync CLAUDE.md + IDENTITY.md
Sprint 135-140 → düzenli commit zinciri
Sprint 142 → commit 2c21720 (son normal auto-sync)
Sprint 151 → commit 8434387 docs(claude-md): sync — sprint-151 state
Sprint 152'den itibaren CLAUDE.md commit YOK
Sprint 153 (12 May) → commit 359bd10 (RESTORE baseline, manuel commit, otomatik değil)
```

**Yeni hipotez:** Pre-Sprint 152 CLAUDE.md auto-sync çalışıyordu (Sprint 130-151 commit zinciri kanıt). Sprint 152'de bir şey kırıldı — ya managed-doc-runner cache logic ya restore operasyonu sonrası hook yapısı. Sprint 166 fix sırasında **cache key'i değiştirirken eski commit hashlerini invalidate etmemeliyiz** (idempotency).

### 3.4 Bug Y2 — Doc sync agent ground-truth verification eksik
**Yer:** Agent dispatch prompt'ları (Sprint 164 doc-update agent'ları, koordinatör side)
**Tanım:** Sprint 164'te koordinatör agent'lara "16 agent" inject etti, agent'lar prompt'a güvendi, gerçek `src/core/builtins/agents/` 15 dizin. AGENTS.md doğru, diğer 5 dosya yanlış.
**Etki:** Sprint 164 commit `a4f3be4` yanlış bilgi yaydı. 5 anchor .md'de "16 agent + test-writer" hatası.

**Test pattern kararı (system-debugging eval):**
- **Unit test (vitest):** Doc sync agent prompt builder'a "ground-truth assertion" eklenir. `tests/orchestra/doc-sync-ground-truth.test.ts` — agent prompt input doğrulama (örn. agent count iddiası vs `fs.readdirSync` gerçek count). 3 case.
- **Integration test:** Sprint 166 Wave 2 retrospective check — Wave 2 sonu Auditor "agent count assertion" doğru sayı vermiş mi?
- **Auditor runtime check:** Auditor scan döngüsünde doc-sync task var ise prompt'taki sayısal iddiaları regex ile çek + `fs.readdirSync` ile karşılaştır → mismatch → boundary violation alarm.
- **Karar:** Üçü birden, defense-in-depth pattern (systematic-debugging supporting technique).

## 4. 16 Bug Final Inventory

| ID | Tanım | Sev | Aksiyon (özet) |
|---|---|---|---|
| **M** | ADR-043/044/045 memory.db'de YOK | **P0** | adr-file-sync.ts yeni + Step 4 wire |
| **N** | ruleRegen callback çağrılmıyor | **P0** | sprint-finalizer.ts:1185 wire + koşulsuz invocation refactor |
| **S** | doc-cache.ts cache key sprint.id içermiyor | **P0** | cache key extension |
| **Y2** | Doc sync ground-truth eksik | **P0** | Agent verification protokolü (3 katmanlı defense-in-depth) |
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

### Wave 1: Architectural Hook Fixes (4 paralel, ~185 LoC)

1. **166-T1 (Bug M):** adr-file-sync.ts yeni dosya + identity-generator Step 4 wire + memory.ts rebuild secondary source. MADR v3 başlık regex adr-validator.mjs'den taşı. 5 test.
2. **166-T2 (Bug N+O):** ruleRegen callback finalize wire (koşulsuz invocation pattern) + AUTO/CUSTOM block design fix. CUSTOM AUTO kopyası olmayacak, sprint-özel ekleme için boş template. 4 test.
3. **166-T3 (Bug S):** doc-cache.ts cache key extension (sprint.id hash). 4 test.
4. **166-T11 (ADR-046):** Brain Self-Update Hook Architecture ADR yazımı + memory.db insert. Working hook pattern (koşulsuz invocation) + bozuk hook pattern (opsiyonel callback) mimari fark dokümante. Yeni hook ekleme guideline. 0 test (governance dokümanı).

### Wave 2: Data Integrity + Manuel Corrections (4 paralel, ~150 LoC)

5. **166-T4 (Bug Y2):** Doc sync ground-truth verification — 3 katmanlı defense-in-depth (unit + integration + Auditor runtime). 3 test.
6. **166-T5 (Bug R+T):** AGENTS.md `docs.json`'a kayıt + identityRegen managed-docs zincirine devret + 15 agent correction (5 dosya: CLAUDE.md, DECKENT.md, README.md, README-TR.md, IDENTITY.md). 2 test.
7. **166-T6 (Bug U+V):** Sprint type='sprint' insert Sprint 140+ kırık forensic + fix. 8 sprint memory backfill (134, 140, 152, 157-161, 165). 100 debt sprint_id=NULL populate. 4 test.
8. **166-T7 (Bug C+X):** DECKENT.md `.brain/DECISIONS.md` broken ref fix + summary.md "Active Debt" filter (status!=resolved) + Sprint 165 wire activation flip prep (Sprint 167 hazırlık). 3 test.

### Wave 3: Living Docs + Cleanup (3 paralel, ~175 LoC)

9. **166-T8 (Bug P):** TOOLS/BOOT/WORKER-GUIDE.md `docs.json` kayıtları + auto-content generators (27 MCP, 56 CLI, Bug X/Y/RBAC/honest-gate anti-pattern listesi). 4 test.
10. **166-T9 (Bug Q+W):** Provider parity (.codex/.gemini frontmatter sync + Cursor adapter scaffold) + Auditor pattern emitter runtime wire. 3 test.
11. **166-T10 (Bug K+L):** verify-ran atomic write + 3 doc test sprint count update. 2 test.

**Toplam:** 11 task (10 + ADR-046), ~510 LoC, 34 test.

## 6. Anchor Rules (Sprint 164/165 derslerinin ışığında)

1. **Ground-truth verification (Y2 dersi):** Tüm doc sync agent'ları gerçek dosya count'unu task öncesi doğrular (Bash `ls | wc -l`).
2. **`npm run build` YASAK** worker'larda — sadece Alperen onayı (dist/ rebuild post-sprint)
3. **Brain finalize observability izleme:** Sprint 166 sırasında Alperen `.deckent/sprint-166-events.jsonl` + `ERRORS.md` canlı izler, hook fail olursa müdahale eder
4. **Sprint 165 wire korunur:** respawnEligibleTasks 13 grep match + honest-result gate + processQueue idempotency — Sprint 166 silmez
5. **Multi-provider sync (Q dersi):** Hook eklerken `.claude/`, `.codex/`, `.gemini/`, `.cursor/` TÜM provider'lara yansır
6. **Test skip discipline:** verify-ran marker olmayan task NO_GO
7. **Idempotency:** Tüm yeni hook'lar idempotent (çift çağrı → tek sonuç). Her hook için ayrı `idempotency.test.ts` zorunlu.
8. **Koşulsuz invocation pattern (Y2.1 working pattern dersi):** Yeni hook'lar opsiyonel callback değil, direct invocation. `if (opts.onX) ...` anti-pattern.

## 7. GO/NO_GO Criteria

- ✅ **11/11 task DONE** veya 9/11 + 2 GO_WITH_TECH_DEBT
- ✅ `tsc --noEmit` PASS
- ✅ `npx vitest run` **delta 0 fail** (Sprint 165 GO_WITH_TECH_DEBT closure)
- ✅ 34 yeni test PASS, 0 regression
- ✅ Bug M kanıtı: memory.db'de ADR-043/044/045/046 var (4 yeni ADR Sprint 166'da insert)
- ✅ Bug N kanıtı: `.claude/rules/brain.md` Active ADR Constraints ADR-043+ içerir
- ✅ Bug S kanıtı: `grep "sprint-166" CLAUDE.md` 1+ match
- ✅ Bug Y2 kanıtı: 5 root .md "15 agents" + test-writer YOK
- ✅ ADR-046 accepted (Brain Self-Update Hook Architecture)

## 8. Sprint 167+ Hazırlık

- **Sprint 167:** `dependency_pipeline_enabled` canlı flip (Sprint 164 wire activation) + minimal multi-wave smoke
- **Sprint 168:** Open Source GA — public repo flip (`VerhexIO/deckent-dev` → `VerhexIO/deckent` public) + npm publish v1.0.0-beta.2 + Show HN launch
- **Sprint 169+:** Community feedback, messaging trio canlı, DeckentHub 50 skill

## 9. Risk Matrix (Brain Self-Bozma Mitigation EXPANDED)

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| Wave 1 hook fix Brain runtime'ı bozar | Orta | Yüksek | tsc/vitest pre-check, fix_phase güvenlik ağı, **Plan B: Sprint 166 fail olursa Sprint 166.1 hot-fix sprint** |
| Bug Y2 verification protokol agent prompt regression | Düşük | Orta | Ground-truth check + Brain self-audit gate |
| Sprint 166 OOM (Sprint 165 Bug G replay) | Düşük | Orta | maxWorkers=6 (Sprint 165'ten alınan ders) |
| 16 bug çok geniş scope, focus kaybı | Orta | Düşük | Wave-based prioritization + GO_WITH_TECH_DEBT kabul edilebilir |
| **Brain self-bozma paradox (KRİTİK):** Wave 1 ortasında Brain hook'ları broken bırakılırsa sprint finalize başarısız | Orta | **Yüksek** | **3-katmanlı mitigation:** (1) Wave 1 ilk task adr-file-sync.ts YENİ DOSYA — mevcut hook'a dokunmaz, eklenir; (2) Wave 1 ikinci task ruleRegen callback wire — additive (parameter eklenir, mevcut davranış korunur); (3) Wave 1 üçüncü task doc-cache.ts cache key — fallback `if (!sprintId) use old hash` ile geriye uyumlu. Tüm Wave 1 fix'leri **non-destructive additive**. Brain mevcut hook zinciri Sprint 166 boyunca çalışmaya devam eder, sadece yeni hook'lar eklenir. |
| Wave 1 fail → Wave 2-3 başlamaz | Orta | Orta | fix_phase retry + manuel `deckent_run` fallback (Sprint 165 pattern proven) |
| ADR-046 yazılırken mevcut adrInsert henüz fix değil → ADR-046 kendisi memory.db'ye giremez | Yüksek | Düşük | ADR-046 task **Wave 1'de paralel** ama T1 (adr-file-sync) DONE olduktan sonra Brain manuel insert (`deckent memory rebuild`) ile backfill. Bootstrapping kabul edilir. |

## 10. Self-Review v2 (6 madde güncelleme sonrası)

✅ **Placeholder scan:** Hiç TBD/TODO yok, somut file:line + git commit hash + kanıt komutları.
✅ **Internal consistency:** 4 root cause ↔ 11 task ↔ 16 bug haritası tutarlı (ADR-046 task = T11 mimari dokümantasyon).
✅ **Scope check:** Tek sprint için ağır ama dokumantasyon-heavy + Brain observability + non-destructive additive pattern ile güvenli.
✅ **Ambiguity check:** Her bug'a unique aksiyon + file referansı + test pattern karar (Y2 için 3-katmanlı defense-in-depth).
✅ **Working pattern coverage:** Phase 2 working hook karşılaştırması eklendi (2.1).
✅ **Architectural review:** Phase 4.5 section eklendi (11).

## 11. Phase 4.5 — Architectural Review

systematic-debugging diyor: **"3+ fix failed → question architecture"**. Brain self-update mekanizması Sprint 154'ten beri 12 sprint çalışmıyor — bu pattern hâlihazırda 3+ failed cycle. Mevcut `managed-docs` + `postFinalizeHooks` mimarisi fundamentally sound mu?

**Soru:** Yeniden tasarım mı (refactor), yamalama mı (patch)?

**Cevap:** **Yamalama (patch), refactor değil.** Gerekçe:

1. **Mevcut mimari kavramsal sağlam:** Hook chain pattern + docs.json registry + cache layer — bunlar genel olarak doğru paradigma. Bug, **runtime invocation chain'inde** (opsiyonel callback parameter passing, cache key composition, missing hook).

2. **Refactor riski yüksek:** Sprint 134-136'da sprint-controller.ts god-split refactor 3 sprint sürdü, çoğu çalışan sistem korundu. Yeniden tasarım hayat eden 12 sprint'lik kod tabanını riske atar (sprint-controller.ts:1185 + identity-generator.ts:308-356 + managed-doc-runner.ts:38-119 stable).

3. **Yamalama yeterli sınırı:** Spec'in proposed fix'leri **additive** (yeni hook ekleme, cache key extension, ground-truth verification). Hiçbiri mevcut working hook'u silmiyor.

4. **ADR-046 mimariyi dokümante eder:** Bu sprint'in çıktısı sadece kod fix değil, **bir sonraki Brain self-update bug'ının erken tespiti için anchor doküman**. Working pattern (koşulsuz invocation + standart signature) + anti-pattern (opsiyonel callback + missing hook + yanlış cache key) net.

**Karar:** Patch + ADR-046 dokümantasyon. Sprint 167+ retro sonrası mimari refactor gerekirse, yeni bir sprint planlanır (örn. Sprint 170 "Brain Self-Update Mekanizması Mimari Refactor v2").

**Architectural commitment:** Sprint 166 sonrasında **2 sprint** Brain self-update mekanizmasını izlemeli. Sprint 167+168 boyunca eğer:
- CLAUDE.md/IDENTITY.md/AGENTS.md tutarlı kalır ✓ Architecture sound, yamalama doğru karar.
- Yeni Bug Z ortaya çıkar ve **aynı pattern'i replay eder** → Sprint 170 refactor sprint açılır.

## 12. Cross-References

- Sprint 165 final state: `docs/release/sprint-165-final-state.md`
- Sprint 165 commit zinciri: `0f4c936..27f1759` (6 commit)
- Sprint 166 design forensic agent raporları (4 agent): bu spec'in evidence base'i
- ADR-036 ADR Governance (memory.db'de): `npx deckent recall "adr-036"`
- ADR-013 DECKENT.md Adapter Pattern (T-007 protected docs)
- Sprint 161/164 forensic: `.brain/archive/sprint-{161,164,165}-tasks/`
- Sprint 165 DIRECTIVES (archive): `.brain/archive/DIRECTIVES-sprint-165.md`
- Brain self-update commit timeline: Sprint 130→152 working chain (commit fd09060→8434387), Sprint 152→165 broken (no CLAUDE.md auto-sync commit)
