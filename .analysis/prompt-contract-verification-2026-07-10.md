# Prompt-Contract Doğrulama — Codex 5.6 + Fable Analizlerinin Kod-Erişimli Verifikasyonu (2026-07-10)

> Girdi: sprint-397'nin 3 worker prompt'u (397-007 ELOOP · 397-011 DOCS-SAYILAR · 397-012 BASELINES)
> üzerine kod GÖRMEDEN yapılmış iki dış analiz. Bu doküman her iddiayı disk + kod üzerinden doğrular,
> iki analizin de ıskaladığı gerçek kök nedeni kanıtlar ve çözüm rotasını mevcut G-serisi/work-item
> düzlemine bağlar. İlgili memory: `project_prompt_gate_plan_time` · `project_agent_skill_prompt_catalog_audit_2026_07`.

---

## 0. Tek-cümle hüküm

İki analizin ortak merkez iddiası — *"planner, task gereksinimlerini filesWrite'a koyamıyor"* — **katman olarak YANLIŞ**:
task JSON'ları diskte "eksik" denen dosyaları İÇERİYOR (`README.md`, `README-TR.md` 011'de; `.secrets-baseline` 012'de).
Dosyaları düşüren, render-zamanı **`sanitizeScope` Rule 5** (`src/orchestra/scope-sanitizer.ts:114-124`):
`/` içermeyen her yolu "unqualified filename" sayıp **sessizce siliyor** — repo-kökü meşru dosyalar dahil.
Üretilen uyarılar `scopeWarnings`'e gidiyor; `scopeWarnings`'in **src/ genelinde sıfır tüketicisi var**.
Analizlerin önerdiği "satisfiability compiler" ise zaten tasarlanmış açık iş = **G1b** (+ ölü kod
`validateGoCriteriaScope`, `src/orchestra/planner.ts:973`, SCOPE-W2 — yazılmış, hiç wire edilmemiş).

---

## 1. Disk ground-truth (task JSON ↔ render edilen prompt)

| Task | JSON `scope.filesWrite` (disk) | Render edilen WRITE authority | Fark nedeni |
|---|---|---|---|
| 397-011 | 10 giriş: **README.md, README-TR.md**, docs/reference/agents.md, cli.md, update-readme-stats.mjs, 3 test + 2 typo-dupe (`docs/refdocs-adr-regen.test.ts`, `docs/validate-publish.test.ts`) | 6 Existing + 2 Unverified; **README'ler tamamen YOK** | sanitizeScope Rule 5 drop (kök-dosya) |
| 397-012 | 2 giriş: scripts/spawnsync-baseline.json, **`.secrets-baseline`** | 1 Existing; `.secrets-baseline` YOK | sanitizeScope Rule 5 drop (kök-dotfile; `KNOWN_DOTFILES` allowlist'inde yok — ama asıl kusur allowlist değil, existence-check'sizlik) |
| 397-007 | 2 giriş: chat-tool-exec.ts, **`tests/cli/error-handling-unification.test.ts`** (typo — gerçeği `tests/core/`) | 1 Existing + 1 Unverified (did-you-mean DOĞRU öneriyi vermiş) | planner-authoring typo; gate suspect'i yakalamış, sprint `--force-scope`-sınıfı override ile geçilmiş |

**Sonuçlar (gerçek hasar):**
- 007 worker'ı GO_WITH_TECH_DEBT: test pinleyemedi + `core/errors.ts` scope-dışı olduğu için **`DECKENT_E005` ('scope violation') kodunu symlink-loop için yeniden kullandı** — scope açığının ikincil semantik hasarı. Fix çevrildi: `task-397-007-fix.json` **aynı typo path'i miras almış** (fix-cascade scope'u yeniden gate'lemiyor); fix worker'ı partial-result/OOM ile öldü.
- 011 worker'ı TIMEOUT_WITH_WORK; `filesChanged` = 37 dosyalık TÜM kirli worktree (attribution kirliliği).
- 012 worker'ı doğru davranıp secrets-yarısını atladı → GO_WITH_TECH_DEBT.

---

## 2. İddia-iddia karne

### 2a. Doğrulanan iddialar
| # | İddia (kaynak) | Kanıt |
|---|---|---|
| 1 | 007 persona=api-builder mismatch (her ikisi) | task JSON `assignedAgent: api-builder`. Mekanizma: `SURFACE_DOMAIN_TO_AGENT_ID['cli']→api-builder` + `USER_SURFACE_BONUS=8` (`src/core/routing-engine.ts:231-234`, exclude-bypass gücünde). born-470 `src/cli→terminal-ux-engineer` düzeltmesi dist'te VAR ve default-on (`dist/core/routing-engine.js:517 domainFromScope ?? true`) — yine de api-builder kazanmış; skor-marjı/agent-pool durumu, routing-karar logu olmadığından kapatılamıyor (→ ölçüm-döngüsü açığı, §4-P1). |
| 2 | 007 DoD "test pinler" karşılanamaz (her ikisi) | Test yolu VERİLMİŞ ama yanlış dizinde; prompt Unverified için "STOP+NO_GO" diyor; gerçek dosya `tests/core/` yazılamaz → DoD fiilen unsatisfiable. Codex'in "yalnızca chat-tool-exec yazılabilir" ifadesi ise eksik/yanlış. |
| 3 | 007 Kanıt komutu var-olmayan path'i çağırıyor (fable) | `tests/cli/error-handling-unification.test.ts` yok; gerçeği `tests/core/`. |
| 4 | 011 "5 dosya" ↔ liste uyumsuz (her ikisi) | Başlık 5 diyor; JSON 10 giriş (8 unique + 2 typo-dupe); render 6+2. Kozmetik ama title-metadata tek kaynaktan gelmiyor. |
| 5 | 011 typo-dupe'lar doğru path'lerle birlikte emit ediliyor (fable) | JSON'da hem `tests/docs/refdocs-adr-regen.test.ts` hem `docs/refdocs-adr-regen.test.ts` var. Suspect'in suggestion'ı zaten listedeyse otomatik düşürme yok. |
| 6 | adr-d-004 üç task'te de alakasız (fable) | Injection skorlu (`adr-selector.ts:387` topN=3, eşik 0.3, preset+IDF-keyword); d-004 core-dev/orchestra preset'lerinde → docs task'ına girişi ya keyword-match ya `code-development` sınıflaması. **R-5** (d-004 full-kontratı import-touching'e daralt) zaten planlı açık iş. |
| 7 | d-002 compact-vs-full tutarsız mı? (fable sorusu) | **Bilinçli** two-tier: `classifyInjectionTier` (`adr-selector.ts:510`) — task metninde explicit `ADR-x` referansı → governing full-body (012'de durum bu; baseline dosyası W1'in ürünü); skorla seçilen → condensed `[background constraint]`. G5/R-3 teslimatı, nondeterminizm değil. |
| 8 | `npx tsc` + `npm run lint` tekrar (Codex) | Doğru + DAHA KÖTÜ: `npm run lint` = `tsc --noEmit ×2 + lint:gates`. DoD checklist'i ise **çıplak `npx tsc`** diyor — tsconfig'de `noEmit` YOK, `outDir=./dist` → worker'a sprint ORTASINDA dist-emit yaptırma talimatı (yasak op; ESM-cache tehlikesi). Sızıntı kaynağı: `src/core/stack-detector.ts:30` `build: 'npx tsc'` → goCriteria'ya typecheck-kanıtı olarak giriyor. |
| 9 | Data-only task'a kod-task verify şablonu (Codex) | Tek jenerik CRITICAL VERIFY STEPS; task-tipi-farkında verify matrisi yok (→ G6 kapsamı). |
| 10 | ci-baseline-detect.test "AYNEN kalır" ama WRITE'ta (Codex) | Doğru; least-privilege ihlali. `MUST_REMAIN_UNCHANGED ∩ WRITE` warn'ı G1b spec'ine eklendi (§4-P0-2). |
| 11 | "Prompt concat ediliyor, kontrat olarak derlenmiyor" (her ikisi, sistemik) | Yön doğru, resim eksik: G1a/G1c/G1d/G2/G5 CANLI, scope-gate pre-spawn BLOK yapıyor. Eksik boyut tam olarak **G1b (satisfiability)** + sanitizer-bug + sıfır-tüketicili uyarılar. Codex'in "P0 compiler" önerisi = G1b'nin kendisi. |

### 2b. Çürütülen / düzeltilen iddialar
| # | İddia | Gerçek |
|---|---|---|
| A | "Planner README/secrets'ı filesWrite'a koymadı" (her ikisi) | KOYDU. Düşüren render-katmanı `sanitizeScope` Rule 5. Katman-atfı iki analizde de yanlış (Codex: "prompt üreticisi uzlaştıramıyor"; fable: "planner→scope-compiler arayüzü"). |
| B | "Dispatch öncesi sözleşme doğrulaması yok" (Codex) | Var ve BLOK yapıyor (`sprint-controller.ts:1153` → `evaluateScopeGate`, `SCOPE_GATE_SUSPECT` → throw). Sprint-397 override ile başlatılmış. Asıl kusur: override'ın all-or-nothing olması + satisfiability boyutunun (G1b) gate'te olmaması. |
| C | "007 write authority yalnızca src dosyası" (Codex) | Test yolu verilmişti (yanlış dizin). Nüans önemli: sorun yetki-vermeme değil, typo+override+STOP-talimatı zinciri. |

### 2c. Yeni bulgular (yalnız kod erişimiyle görülebilen)
| # | Bulgu | Konum |
|---|---|---|
| N1 | **Rule 5 kök-dosya drop** — `/`'sız her yol siliniyor; README.md, README-TR.md, .secrets-baseline, DIRECTIVES.md, LICENSE... hepsi kapsam-dışı kalıyor | `scope-sanitizer.ts:114-124` |
| N2 | **`scopeWarnings` sıfır tüketici** — "Unqualified filename removed: README.md" üretiliyor, debugLog'a bile değil, artifact metadata'sında çürüyor | `prompt-god-template.ts:294,322,381` → hiçbir okuyucu yok |
| N3 | **`validateGoCriteriaScope` ölü kod** — G1b'nin çekirdeği (goCriteria'daki test-path'ler filesWrite'ta mı + autoExpandedFiles) YAZILMIŞ, tek çağıran kendi testi | `planner.ts:973` (SCOPE-W2) |
| N4 | **Fix-cascade scope mirası** — FIX task'ı orijinalin scope'unu aynen kopyalıyor; suspect+suggestion çözülmüyor | `task-397-007-fix.json` kanıt |
| N5 | **DoD `npx tsc` = dist-emit talimatı** — bkz. §2a-8 | `stack-detector.ts:30` |
| N6 | **Override all-or-nothing** — `--force-scope` TÜM suspect'leri dalgalandırıyor; unambiguous suggestion'lı typo bile insan-onaysız geçiyor | `scope-gate.ts:210`, `start.ts:168` |
| N7 | **E005 semantik borcu** — 007 fix'i 'scope violation' kodunu ELOOP'a taktı (worker dürüstçe raporladı); path-resolution error-code'u yok | `src/cli/commands/chat-tool-exec.ts:206` (working tree) |
| N8 | **Routing-karar görünmezliği** — dist güncel + sinyaller doğruyken api-builder'ın neden kazandığı loglardan çıkarılamıyor (ADR-injection için `logInjectionAudit` var, routing için muadili yok) | `routing-engine.ts:1219` skor toplamı log'suz |

---

## 3. Codex'in sistemik önerilerinin mevcut-mimariye eşlemesi

| Codex önerisi | Deckent karşılığı | Durum |
|---|---|---|
| P0 Task/scope satisfiability gate | **G1b** (prompt-gate.ts'e lint) + SCOPE-W2 wire | Tasarlı, İNŞA EDİLMEDİ → bu doğrulamayla P0'a terfi |
| P0 DoD achievability check | G1b'nin alt-kümesi (Kanıt-komut path-varlık + test-write-yetki çaprazı) | G1b spec'ine dahil edildi |
| P0 Contradiction detector | `MUST_REMAIN_UNCHANGED ∩ WRITE` = G1b-warn; `MUST_EDIT − WRITE` = G1b-block | G1b spec'ine dahil |
| P1 Persona relevance scoring | G1a-domain WARN CANLI (`validatePersonaTaskMatch`) + kök-fix **G3** (operation-class) açık | Kısmen canlı |
| P1 ADR projection | **G5 TESLİM** (two-tier); kalan R-5 d-004 daraltma | Büyük ölçüde var |
| P1 Task-tipine göre verification | **G6** açık iş; kapsamına stack-detector typecheck-alanı eklendi | Açık |
| P1 Tek-kaynak criterion modeli | goCriteria zaten tek alan; DoD/checklist ondan render ediliyor (`buildDodBlock/buildDodChecklist`) — Codex'in "5 yerde tekrar" algısı render-görünümü, drift-riski düşük | Kısmen yanlış-alarm |
| Prompt sıra önerisi (contract-first) | `renderSegments` tier-sistemi + leadingT0Reorder (default-off, L1 döngüsü) | Ayrı iş (L1) |

---

## 4. ÇÖZÜM ROTASI (kesinleşen)

> Sıralama kuralı: sprint-397 evaluate-lock canlı + worktree 011-artığıyla kirli →
> **şimdi src'ye dokunma yok** (build yasak + diff-attribution bozulur). Rota 397 kapanışı + Alperen build sonrası.

### P0 — "Kontrat bütünlüğü" paketi (tek dedike sprint önerisi; hepsi prompt-gate/scope düzleminde, birbirine dokunur)
1. **SAN-1 (yeni, en yüksek kaldıraç):** `sanitizeScope` Rule 5'i trackedFiles-aware yap — `/`'sız yol git-tracked kök-dosyaysa KORU (existence-based; KNOWN_DOTFILES allowlist büyütme değil). GLOBAL_PROTECTED davranışı aynen kalır. + `scopeWarnings`'i prompt-gate finding'e terfi: **write-path drop = BLOCK-level** (sessiz drop imkânsızlaşır). Dosyalar: `scope-sanitizer.ts`, `prompt-god-template.ts`, `prompt-gate.ts`.
2. **G1b (mevcut açık iş, kanıtla P0):** goCriteria+description'daki imperatif dosya-adları ↔ filesWrite eşleme lint'i. Çekirdek olarak ölü `validateGoCriteriaScope`'u (planner.ts:973) genişlet + `evaluatePromptGate`'e taşı/wire et. Kapsam: (a) mentioned-but-unlisted → BLOCK; (b) Kanıt-komut içindeki dosya-yolu repo'da yok → BLOCK (007'yi yakalar); (c) "değişmeyecek" denen dosya WRITE'ta → WARN (Codex-contradiction). Verifier'ın simetriği: o "listede-var-repoda-yok", bu "task'te-var-listede-yok".
3. **SAN-2 suggestion-adoption (yeni):** scope-gate suspect çözümü: (a) suggestion zaten filesWrite'ta → typo-girdiyi otomatik düşür (011-dupe sınıfı); (b) unambiguous suggestion → auto-replace + advisory not (007 sınıfı); `--force-scope` yalnız kalan gerçek-belirsizler için. + **fix-cascade generator'ı scope'u yeniden gate'lesin** (N4). Dosyalar: `scope-gate.ts`, fix-task üreticisi (`sprint-controller`/`result-evaluator` fix-path'i).
4. **G6 verify-mikro (mevcut açık iş, kapsam netleşti):** task-tipi-farkında verify matrisi (code/test-only/data-only/docs-only) + `stack-detector`'a ayrı `typecheck: 'npx tsc --noEmit'` alanı (DoD'daki çıplak-tsc dist-emit talimatını keser, N5) + goCriteria'ya basılan typecheck/`lint` tekrarını tekilleştir.

### P1 — routing + ADR hassasiyeti (mevcut açık işler, önceliği teyitlendi)
5. **G3 operation-class routing** — cli→api-builder USER_SURFACE_BONUS kök-fixi; öncesinde N8 için **routing-karar audit-log'u** (`selectBestAgent` skor-dökümünü task JSON'a/journal'a yaz — logInjectionAudit'in routing ikizi). 007 vakası regresyon-fixture'ı olsun.
6. **R-5** — adr-d-004 full-kontrat koşulunu import-touching task'lere daralt.
7. **E005-FOLLOWUP** — `DECKENT_E0xx` path-resolution/symlink-loop kodu + chat-tool-exec düzeltmesi (tek satır + registry girişi).
8. **Ölçüm döngüsü** (mevcut) — retro'ya prompt-attribution; bu sprint'in 3 vakası ilk veri-noktaları.

### P2
9. Title-metadata ("5 dosya") tek-kaynak render'ı — kozmetik.
10. L1 cache-tier wire (prompt %90 boilerplate maliyeti) — ayrı hat, `project_agent_skill_prompt_catalog_audit_2026_07` §5 ile birleşik.

### Bilinçli RED (dokunma)
- Codex'in "tek-kaynak criterion modeli" için yeni şema: goCriteria zaten tek kaynak; render-görünümleri drift üretmiyor. Yeni taksonomi = YAGNI.
- Codex'in prompt-sıra reorganizasyonu: leadingT0Reorder mevcut, L1 kapsamında; ayrı iş açma.
- "STOP+NO_GO çok katı" eleştirisi: davranış doğru (orphan-önleme); kusur upstream'de (typo'nun oraya ulaşması). SAN-2 bunu kökten çözer, worker-tarafı self-healing'e gerek kalmaz.
