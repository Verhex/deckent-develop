# Prompt / Scope / Agent-Skill Mekanizma Devrimi — Fable Çalışma Planı

> **Amaç:** Prompt üretim + scope doğrulama + agent/skill seçim-evrim mekanizmasını **canlı gelişen, evrimleşen** bir yapıya taşımak. deckent'in milyonlar tarafından doğru+kolay kabulü buna bağlı. **Ben (CC/Fable) doğrudan el-kodlayacağım** — hedeflerin neredeyse tamamı DISTINCT-FILE kapalı-liste (sprint-utils/routing-engine/prompt-god-template/adr-selector/quality-assessor/result-collector) → worker sprint'ine route EDİLMEZ.
> **Kaynaklar:** (1) `PROMPT-MECHANICS-ANALYSIS.md` (benim ajanım, 345 satır, `file:line`-temelli, 3 boyut) + (2) diğer-oturum Sprint-383 prompt-tutarsızlık analizi (7 tutarsızlık + 6 kazanım). **Çapraz-doğrulanan** bulgular ⭐ ile işaretli; tek-kaynak olanlar kodda birebir doğrulandı.
> **Tarih:** 2026-07-08 · Alperen review-bekliyor (uygulama ONAY sonrası).

---

## 0. Çerçeve — 3 kapanmayan geri-besleme döngüsü (+1 kesişen)

deckentin bu üç boyutta **kağıt üstünde doğru mimarisi zaten var**; sorun tasarım değil **wiring**. Aynı desen üç kez tekrarlıyor: iyi-inşa-edilmiş + unit-test'li + **gerçek sprint yolunda sıfır çağıran** bir modül. "Devrim" = bu modülleri gerçek `task-builder`/`sprint-controller` yoluna **bağlamak**, yeni bir şey inşa etmek değil.

| Döngü | Boyut | Bugün neden kapanmıyor | Kapanınca ne olur |
|---|---|---|---|
| **L1 · cache-tier → provider-adapter** | A (prompt-token) | `prompt-segmentation.ts` + `cache-adapter.ts` (5-archetype) inşa+test'li ama **sıfır çağıran**; `leadingT0Reorder` default-OFF | Sınıf-değişmez ~%65 statik prompt tekrar-gönderilmez; prompt-şekli task-odaklı |
| **L2 · scope → varlık-kontrolü** | B (scope) | Spawn öncesi `filesWrite` yolu gerçek-ağaçta VAR MI diye kontrol yok → sprint-380 orphan-file | Yanlış-yol (573/518 gibi) spawn'dan ÖNCE yakalanır — **maraton-koruyucu** |
| **L3 · outcome → routing-ağırlık** | C (agent/skill) | Öğrenme verisi hayalet-skill'lerle kirli; ADR-075 affinity **kalıcı-kapalı** | Routing gerçek+temiz outcome'dan öğrenir |
| **L4 · sözleşme-bütünlüğü (kesişen)** | — | goNogo drift + prompt-arşiv-imhası + skill-relevance yanlış-alan → değerlendirme & öğrenme sahte-veri yiyor | "governance-by-construction" gerçekten kapanır; training-trace beslenir |

---

## FAZ 0 — Sözleşme-bütünlüğü bug'ları (çapraz-doğrulanan · KARAR YOK · İLK el-kodla)

Bunlar saf bug-fix: mimari kararı yok, davranış-riski düşük, güven yüksek. **Maraton-öncesi ŞART** (F1+F2 landmadan sonraki sprint'ler de sahte kriterle değerlendirir).

### F0.1 ⭐ Hayalet-skill kirliliği (KÖK FIX) — `routing-engine.ts`
- **Bulgu (iki analiz):** `resolved.forceSkills` (`routing-engine.ts:574-583`) skill-havuzuna karşı **doğrulanmadan** `task.assignedSkills`'e akıyor. Sprint-383'te `forceSkills:['typescript-expert','security-auditor','testing']` → `security-auditor` bir **agent** id'si, `testing` gerçek id değil (`testing-expert` var). `resolveSkillPrompts()` (`result-collector.ts:688-693`) sessiz `catch→continue` ile ikisini de düşürüyor — **prompt'a hiç girmedi** — ama `outcome-tracker` "kullanıldı" kaydetti. Gerçek `learnings.json`: `security-auditor` 11 task/%100, `testing` 31 task/%100 = **hayalet, MIN_SAMPLES=5 üstü, auto-rule-apply'a uygun.**
- **Fix (kök):** routing-time'da `forceSkills`/`assignedSkills`'i gerçek skill-pool'a karşı doğrula → bilinmeyeni **düş + görünür uyarı** (assignedSkills'e ve learnings.json'a GİRMEDEN). Bu, aşağıdaki her C-fix'in ön-koşulu.
- **Fix (yardımcı):** (a) `resolveSkillPrompts()` sessiz `catch`'ini `buildScopeBlock`'un zaten kullandığı `outWarnings` kanalına bağla. (b) Plan-time alias-çöz: `testing→testing-expert`, `security-auditor`(agent)→uyarı+en-yakın-skill öner.
- **Fix (tüketici) — sağlama gerekli:** `assessSkillRelevance` (`quality-assessor.ts:183`) `task.assignedSkills` okuyor; gerçekten-enjekte `identity.skills` (`result-assembler.ts:218`). Swap YAP **ama** önce `identity.skills` provenance'ını doğrula (post-resolution injected set mi, yoksa assignedSkills passthrough'u mu). Passthrough ise kök-fix tek başına yeterli, swap kozmetik.
- **Dosyalar:** `src/core/routing-engine.ts`, `src/orchestra/result-collector.ts`, `src/orchestra/quality-assessor.ts`. **Test:** phantom-id → düşer+uyarı; learnings'e yazılmaz.

### F0.2 ⭐(now-confirmed) goNogo format-drift — `sprint-utils.ts`
- **Bulgu (kodda doğrulandı):** `extractGoNogoCriteria` (`:427`) regex'i (`:409`) YALNIZ `Kanıt:/Proof:/Doğrulama:/Verification:/Verify:/Test:` etiketlerini tanıyor. DIRECTIVES yazarının (BENİM) kullandığı `- goCriteria:` / `- nogo:` formatı **hiç parse edilmiyor** → jenerik fallback'e düşüyor (`:485-486` "Build fails or tests fail"). **S1/S2/S3'ün TÜM task-özel goNogo kriterleri makine-sözleşmesinde inert'ti.** `result-evaluator.ts:176-186` Step-3a da bu yüzden ölü. brain.md "GO/NO-GO task-specific not generic" + `feedback_directive_kanit_letter_vs_goal` dersinin mekanik ihlali.
- **Fix:** parser'a `goCriteria:` / `nogo:` etiketlerini EKLE (additive; `Kanıt:` regex + WP-13 testleri yeşil kalır). `nogo:` → makine-görünür `noGoCriteria`. Zincirleme: prompt DoD gerçek hedefi gösterir, evaluator Step-3a canlanır.
- **ARA-ÖNLEM (maraton):** bu landmadan resume edersem DIRECTIVES goNogo'yu parser'ın **zaten tanıdığı** `Kanıt:`/`Proof:` etiketiyle yaz — YA DA resume-öncesi bu fix'i land et (önerilen).
- **Dosya:** `src/orchestra/sprint-utils.ts`. **Test:** `- goCriteria:`/`- nogo:` satırları → doğru çıkarım; eski `Kanıt:` testleri yeşil.

### F0.3 Prompt-dosyası arşivden ÖNCE imha — `providers/claude.ts`
- **Bulgu (kodda doğrulandı):** `_cleanupOrphanedPromptFiles` (`:188`) `.prompt-*.txt`'yi `unlink` ediyor; kontrat (tmux.ts:63) "sprint cleanup'a dek kalır" diyor. Ampirik: 379→383 arşivlerinde sıfır worker-prompt; 383'ün 8 prompt'u verify fazında silindi (007 hâlâ koşarken bile). **TRN (training-trace WIRE) P0'ının (prompt→result) çiftinin prompt-yarısı sistematik yok ediliyor.**
- **Fix:** `unlink` yerine `archive/sprint-N/`'e **rename** (ya da silmeden önce `archivePromptFiles`). Aktif-worker koruma eşiğini (stale-hb) düzelt — koşan worker'ın prompt'u silinmesin.
- **Dosya:** `src/providers/claude.ts` (+ arşiv-yardımcı). **Not:** training-data-mine projesine bedava veri. **Test:** cleanup sonrası prompt arşivde var; aktif-hb'li prompt korunuyor.

### F0.4 ADR active-constraint kelime-ortası kırpma — `adr-selector.ts`
- **Bulgu:** active-constraint satırı (`ACTIVE_CONSTRAINT_CAP`, `:674`) kelime-ortasından kırpılıyor ("**✅ V1 PURG…"); paragraf-sınırında kırpan `truncateAtParagraph` kodda MEVCUT ama bu satır için kullanılmıyor.
- **Fix:** active-constraint render'ında `truncateAtParagraph` kullan.
- **Dosya:** `src/orchestra/adr-selector.ts`. **Test:** ≥cap uzunlukta ADR → kelime-sınırında biter.

---

## FAZ 1 — Token/kalite hızlı-kazanımlar (düşük risk)

### F1.1 Karpathy Layer-4 drift — **KARAR VERİLDİ: SİL** (port-back fallback)
- **Bulgu (ajan+diff doğruladı):** 20 agent'tan **5'i** (`refactorer,code-reviewer,architect,doc-writer,bug-fixer`) `.deckent/agents/*/PROMPT.md`'de ~467-tok drifted "Karpathy 4-Discipline Anchor" taşıyor; `src/core/builtins/agents/*/PROMPT.md`'de YOK (commit `ec91a409` workspace-copy'yi düzenledi, template'e port etmedi). Zaten Layer-1 (CLI auto-load ~2.1K) + Layer-2 (essence ~95) her worker'a iniyor → 4. kat saf tekrar.
- **Karar:** drifted Anchor'ı 5 workspace-copy'den **SİL** (diğer 15 agent'la eşleş; geri-alınabilir; saf token-kazanç ~%8 `refactorer` prompt'unda). Anchor'ın agent-özel ifadesi değerli görülürse fallback: `src/core/builtins/`'e port + o agent'lar için Layer-2 essence'ı bastır (`hasOwnKarpathyAnchor` flag).
- **Dosyalar:** `.deckent/agents/{refactorer,code-reviewer,architect,doc-writer,bug-fixer}/PROMPT.md`.

### F1.2 Idempotency-Key ölü-gating — `prompt-god-template.ts`
- **Bulgu:** `conditionalBoilerplate` (`:553`) Idempotency bölümünü yalnız `type==='refactor'`'da düşürüyor; 8 task'ın hepsi `code-development` → dış-API'siz saf iç-fix'e de Idempotency basılıyor (boşuna token).
- **Fix:** düşürme koşulunu genişlet — dış-API/dep-mutasyon içermeyen task'ta Idempotency bölümünü at.
- **Dosya:** `src/orchestra/prompt-god-template.ts`.

### F1.3 ADR over-match ince-ayar — `adr-selector.ts`
- **Bulgu:** `adr-g-006` (Routing) kod-task'ların 6/8'ine alakasız girdi; `adr-d-004` tam C1–C7 gövdesi 7/8 (~1.4KB/prompt). PCOMP-W4 katmanlama d-004 tam-render koşulunu tam daraltamamış.
- **Fix:** kod-task worker'ında routing-ADR'ye relevance cezası; `adr-d-004` "governing" full-render koşulunu daralt (yalnız gerçekten referans-verildiğinde).
- **Dosya:** `src/orchestra/adr-selector.ts`. (Not: benim §4 → ADR *seçimi* çoğunlukla iyi; bu artık-zayıflık.)

---

## FAZ 2 — Scope-gate (L2 / Boyut B) · **MARATON-KORUYUCU → token'lardan yukarı**

git-guard yalnız stash-scatter modunu kapattı; **orphan-yanlış-yol modu hâlâ korumasız** — 573/518'de ben yaşadım. Maraton hemen sonra resume olacağı için bu, döngünün pahalı-hatayı tekrarlamasını durduran tek fix.

### F2.1 `evaluateScopeGate()` — yeni `src/core/scope-gate.ts`
- **Bulgu (benim §7):** Spawn öncesi hiçbir yerde `scope.filesWrite` yolu gerçek-ağaçta VAR MI kontrolü yok. `sanitizeScope` yol-*şekli* filtreliyor (fs-import'u yok), varlık değil. Load-bearing `--allowedTools Write(...)` allowlist'i de varlık-kör: olmayan yola yazma izni = "yeni dosya yarat" ile ayırt-edilemez. `sprint-planner.ts:219` zaten `git ls-files` (4670 dosya) çekiyor ama 100-satıra kırpılıp priority-8'de aç-bırakılıyor. Precedent VAR: `auditPlanGroundTruth()` (`planner.ts:763`) sayısal iddiaları gerçek-count'a karşı doğruluyor — aynı desen yollara genişletilmemiş.
- **Fix:** saf-karar fonksiyonu (`existsSync` inject'li, testlenebilir), zaten-çekilen `fileTree`'ye karşı her yolu sınıfla: **CONFIRMED-EXISTING** / **NEW-FILE-plausible** (create-dili + kardeş-dosyalı dizin) / **SUSPECT** (yok + başka dizinde aynı-basename fuzzy-eşleşme → "did you mean src/agents/worker.ts?"). Cost-gate (`core/cost-gate.ts:111`) UX'ini birebir aynala.
- **Prompt-fix (gate'ten bağımsız):** `buildScopeBlock()` (`prompt-god-template.ts:563`) tek-düz-liste yerine 3 alt-liste: "CONFIRMED — değiştir, yeniden-yaratma" / "NEW — yaratman beklenen" / "⚠ doğrulanamadı — yazmadan önce doğrula; olması-gereken varsa DUR+NO_GO". Bu, sprint-380 modunu doğrudan kapatır.
- **Wire:** (1) planner/DIRECTIVES-parser task döndükten sonra, `.tasks/` yazımından önce; (2) `sprint-spawner.ts` `buildAllowedWriteTargets()` çağrısından hemen önce (manuel task-JSON drift'i yakala).
- **Dosyalar:** yeni `src/core/scope-gate.ts`, `src/orchestra/prompt-god-template.ts`, `src/orchestra/sprint-planner.ts`, `src/orchestra/sprint-spawner.ts`.
- **[KARAR-1]** SUSPECT → **bloke-default** (`SCOPE_GATE_SUSPECT`, `--force-scope`/`acknowledgeScopePaths` override, cost-gate-tarzı) MI, yoksa **yalnız-uyar** MI?

---

## FAZ 3 — Claude-CLI system-prompt/prefix bayrakları (L1 · kendi kararı + gerçek-binary smoke)

### F3.1 Kullanılmayan CLI bayrakları — `tmux.ts` / `claude.ts` / `subprocess.ts`
- **Bulgu (canlı binary'ye karşı):** `claude` (v2.1.204) 3 bayrak sunuyor, deckent HİÇBİRİNİ kullanmıyor:
  - `--exclude-dynamic-system-prompt-sections` — per-machine bölümleri (cwd/env/git-status) system-prompt'tan ilk-user-mesajına taşır → *"cross-user prompt-cache reuse'u iyileştirir"*. Anthropic'in **prefix-instability** için kendi sevk-ettiği fix'i (design-spec'in tam işaret ettiği blocker). **Yalnız default system-prompt'la çalışır.**
  - `--append-system-prompt <p>` — default'u KORUYARAK ekler.
  - `--system-prompt <p>` — default'u **DEĞİŞTİRİR** → CLAUDE.md/.claude-rules auto-load'u (Layer-1 Karpathy DAHİL ama IDENTITY/summary/hepsi de) tamamen keser.
- **TUZAK (advisor):** "Layer-1 dup'ı azalt" (`--system-prompt`) ile "cache için prefix'i sabitle" (`--exclude-dynamic…`) **kısmen birbirini dışlar** — ikincisi yalnız default-prompt'la çalışır. Bu ayrı bir alt-görev; gerçek-binary smoke ŞART; hızlı-kazanım DEĞİL.
- **Dosyalar:** `src/orchestra/tmux.ts`, `src/providers/claude.ts`, `src/providers/subprocess.ts`. **Smoke:** gerçek `claude -p` spawn → bayrak-etkisini doğrula.
- **(KARAR-3'e bağlı — aşağıdaki caching-derinliği ile birlikte.)**

---

## FAZ 4 — Caching-altyapı wiring (L1 · yüksek-efor · flag-gated · REJİM-CAVEAT)

### F4.1 T0/T1/T2 segmentation + ProviderCacheAdapter'ı gerçek yola bağla
- **Bulgu (benim §6):** `prompt-segmentation.ts` (`computeStablePrefix`/`stablePrefixKey`/`reorderLeadingT0`) + `cache-adapter.ts` (5-archetype `ProviderCacheAdapter`) inşa+test'li, **sıfır çağıran**. `DEFAULT_LEADING_T0_REORDER=false`, config'ten hiç flip edilmiyor. What-To-Do/Heartbeat/Result-contract ~704 tok saf-statik ama T2 (taskId-interpolasyonu yüzünden) → T0'a reclassify edilebilir → cacheable-floor ~1091→~1795 tok.
- **Fix (wiring, yeni-logic değil):** (1) `leadingT0Reorder`'ı config-flag arkasında flip; (2) `task-builder.ts`'ten `computeStablePrefix`+`stablePrefixKey(tenantId,taskClass)` çağır, `SegmentedPrompt{t0,t1,t2}`'yi aktif provider'ın `ProviderCacheAdapter.emit()`'ine geçir; (3) What-To-Do/Heartbeat/Result-contract'ı T0 reclassify.
- **⚠ REJİM-CAVEAT (advisor · zorunlu-çerçeve):** native-API cache-**read** → **F2-008'e bağlı, bloke**. Claude-CLI cross-worker paylaşımı → design-spec'te **kapalı-negatif-sonuç** (parallel-spawn race + git-status prefix-drift). Yani **baskın CLI yolunda kazanç = yalnız byte-azaltma + prefix-stabilite, cache-read DEĞİL.** Gerçek cache-read yalnız native-API path (F2-008) ya da $/token gateway'de.
- **Dosyalar:** `src/orchestra/task-builder.ts`, `src/orchestra/prompt-god-template.ts`, `src/providers/*` (adapter wire), `src/core/config.ts` (flag).
- **[KARAR-3]** derinlik/faz — aşağıda.

### F4.2 Ollama-agentic parite (düşük öncelik)
- `agentic-worker-runner`/`http-agentic-worker` `buildSystemPrompt`'u skill+agent-persona'yı HİÇ enjekte etmiyor (CLI-yolu aşırı-enjekte ederken ters-yönde eksik). Aynı geçişte parite-fix.

---

## FAZ 5 — Routing evrimi (L3 / Boyut C)

### F5.1 ADR-075 skill→agent affinity — kalıcı-limbo'yu çöz
- **Bulgu (iki analiz):** affinity 4 gerçek call-site'ta wired+reachable ama `config.routing.skill_agent_affinity` **hiç flip edilmedi** (`.deckent/config.json`'da `routing` bloğu YOK). Adanmış observability-sink (`routing-affinity-observability.ts`) **tek event kaydetmedi** (flag hiç açılmadı → null-veri). SEC/REPL task'ları yanlış-agent'a (api-builder/refactorer) gidiyor, 8/8 confidence "uncertain/low". `feedback_agent_routing_imbalance` "dead-code" diyor — daha doğrusu "live-but-off".
- **[KARAR-2]** (a) closeout-doc'un istediği **multi-sprint gözlem-sonra-flip**'e commit MI, yoksa (b) flag+sink'i **birlikte kaldır** (non-goal ilan) MI? Kısa-vade workaround zaten çalışıyor: DIRECTIVES'e `- Agent:` satırı (Skills gibi parse ediliyor).

### F5.2 `runIdentityMutation` ölü-kod → demotion-consumer (düşük öncelik)
- `promotion-pipeline.ts:285-357` (F5-008, demoted-agent'ı mutasyona uğrat) **sıfır-çağıran**. `sprint-finalizer.ts`'te `evaluateDemotions()` (`:1326`) hemen sonrasına wire → demotion "disable→dead-end" yerine "mutasyonlu-varyant öner". Fully-built, yalnız call-site eksik.

---

## FAZ 6 — Hijyen

- **F6.1** `docs/superpowers/specs/2026-06-26-worker-prompt-provider-cache-architecture-design.md` status-tablosu güncelle ("⬜ Not started" → segmentation+adapters+tests VAR; wiring eksik). Gelecek sprint yeniden-inşa etmesin.
- **F6.2** `feedback_agent_routing_imbalance` memory: "ADR-075 dead-code" → "live-but-permanently-off" (§8.2 daha kesin).

---

## Sıralama & maraton-ilişkisi

- **Maraton ön-koşulu (resume-öncesi land ÖNERİLİR):** F0.1 (phantom-skill) + F0.2 (goNogo) + F2.1 (scope-gate) — yoksa sonraki sprint'ler sahte-kriterle değerlendirir ve orphan-yol tekrar riski sürer.
- **Bağımsız/sonra:** F0.3/F0.4, FAZ 1, FAZ 3/4/5/6 — maratona paralel ya da sonra.
- **Her fix:** el-kodla → yeni test + `tsc` + gerçek-binary smoke (F0.3/F2/F3) → disk-verify → **commit** (kazanım-koruma). Build BENDE (sprint-arası).

## İlerleme (canlı — CC el-kodluyor)
| Fix | Durum | Commit | Not |
|---|---|---|---|
| **F0.1** phantom-skill kök-fix | ✅ | 01d3f494 | routing-engine forceSkills doğrula + suggest; result-collector metric; 62+80 test yeşil |
| **F0.2** goNogo parser (goCriteria/nogo) | ✅ | 9b15c8e8 | additive; 4 yeni test; downstream 53 yeşil. **Maraton ön-koşulu land oldu** |
| **F0.3** orphan-prompt arşiv (silinmez) | ✅ | 05a1fd42 | archiveOrphanPromptFile + _orphaned drain; 80 test yeşil; TRN'e veri |
| **F0.4** ADR kelime-sınırı kırpma | ✅ | 9ffbfe7b | word-boundary cap; 31 test yeşil |
| **F2.1** scope-gate (bloke-default) | ✅ | fbc2eea2 | core/scope-gate.ts (8 test, 573/518 case) + sprint-controller PLAN→SPAWN wire + CLI --force-scope/MCP acknowledgeScopePaths (parity); real-binary smoke: --force-scope help ✅ + gate dist'te ✅; 196 lifecycle yeşil |
| **F1.1** Karpathy-4 drift sil | ✅ | 42b1d493 | 5 workspace-agent'ten ~467tok×5; builtins'le eşleşti; rules-parity 39/39 + prompt-w1 18/18 |
| **F2.1b** buildScopeBlock 3-alt-liste (worker-dili) | ⏳ | — | takip: CONFIRMED/NEW/⚠ prompt rendering (bloke zaten canlı) |
| **F1.2** Idempotency-gate | ⏳ (revize) | — | **TRIVIAL DEĞİL:** mevcut default 'refactor'da düşür; genişletmek = "yalnız API-relevant sinyalde emit" default-flip + F1 pinning-testleri güncelle → taze-context'te (yargı+test-churn) |
| F1.3 ADR over-match · F3.1 CLI prefix-flag · F4.x caching · F5.x routing · F6 hijyen | ⏳ | — | KARAR-3=CLI-kazanımları+ertele |
> PRE-EXISTING (kapsam-dışı): `tmux-edge` 'skips mkdirSync' testi değişikliklerimden bağımsız kırık.

## ▶ POST-COMPACT RESUME (buradan devam et — taze context)
> **Durum:** Çekirdek teslim (8 commit: F0.1-0.4 · F2.1 · F1.1 + 2 docs). Kararlar verili (scope=bloke ✅, ADR-075=gözlem-flip, caching=CLI-kazanımları+ertele). **Ben (CC/Fable) el-kodlarım** (DISTINCT-FILE kapalı-liste). Her fix: oku→edit→test+tsc→(user-surface ise real-binary smoke)→commit. Build BENDE (sprint-arası). Sonra maraton loop'a dönülür (`.analysis/deckent-marathon-loop-state.md`).
> **Kalan sıra (öncelik):**
> 1. **F1.3 ADR over-match** — `adr-selector.ts`: code-task worker'ında routing-ADR (adr-g-006) relevance-cezası; adr-d-004 full-render koşulunu daralt (yalnız explicit-referans). Test: adr-selector.
> 2. **F2.1b buildScopeBlock 3-alt-liste** — `prompt-god-template.ts:563 buildScopeBlock`: CONFIRMED/NEW/⚠-doğrulanamadı alt-listeleri (worker-dili: "yazmadan önce DUR+NO_GO"). scope-gate classifier'ını (`core/scope-gate.ts` evaluateScopeGate) prompt-build'e getir — projectRoot/trackedFiles threading gerekir (buildScopeBlock şu an projectRoot almıyor). Bloke zaten canlı; bu worker-dili katmanı.
> 3. **F1.2 Idempotency default-flip** — `prompt-god-template.ts:553 conditionalBoilerplate`: "yalnız API-relevant sinyalde emit" (scope: connectors/providers/api/webhook/payment ∨ desc-keyword). F1 pinning-testleri yeni-sözleşmeye güncelle. YARGI + test-churn.
> 4. **F3.1 CLI prefix-bayrağı** — `tmux.ts`/`providers/claude.ts`/`subprocess.ts` claude-spawn: `--exclude-dynamic-system-prompt-sections` (prefix-stabilite, yalnız default-prompt'la çalışır) + belki `--append-system-prompt`. TUZAK: `--system-prompt` (replace) CLAUDE.md/rules auto-load'u keser — kullanma. Gerçek-binary smoke ŞART (`claude -p --help` ile flag doğrula).
> 5. **F5.1 ADR-075 gözlem-flip** — `.deckent/config.json`'a `routing.skill_agent_affinity: true` (dogfood'da aç) → `routing-affinity-observability.ts` sink canlı-veri kaydeder. Kısa-vade DIRECTIVES `- Agent:` zaten çalışıyor. Sonra multi-sprint denge-gözlem → default-on kararı.
> 6. **F6 hijyen** — `docs/superpowers/specs/2026-06-26-worker-prompt-provider-cache-architecture-design.md` status-tablosu ("⬜ Not started"→segmentation+adapter VAR/wiring-eksik) + memory `feedback_agent_routing_imbalance` ("ADR-075 dead-code"→"live-but-off").
> **Ertelendi (KARAR-3):** F4.x segmentation+ProviderCacheAdapter tam-wire → native-API/F2-008'e bağlı.

## Bekleyen 3 KARAR (Alperen) — VERİLDİ ✅ (scope=bloke · ADR-075=gözlem-flip · caching=CLI+ertele)
1. **Scope-gate** SUSPECT → bloke-default mı, yalnız-uyar mı? (KARAR-1)
2. **ADR-075 affinity** → gözlem-sonra-flip mi, flag+sink kaldır mı? (KARAR-2)
3. **Caching-derinliği** → (a) tam-wire şimdi (segmentation+adapter+CLI-flag, flag-gated, CLI'da yalnız byte+prefix) / (b) yalnız CLI-path kazanımları şimdi (F1.1/F1.2 byte + prefix-flag) + segmentation'ı F2-008/native-API'ye ertele / (c) tüm L1-caching'i maraton sonrasına ertele? (KARAR-3)
