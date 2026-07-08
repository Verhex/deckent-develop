# Prompt / Scope / Agent-Skill Mekanizma Devrimi — Fable Çalışma Planı

> **Amaç:** Prompt üretim + scope doğrulama + agent/skill seçim-evrim mekanizmasını **canlı gelişen, evrimleşen** bir yapıya taşımak. deckent'in milyonlar tarafından doğru+kolay kabulü buna bağlı. **Ben (CC/Fable) doğrudan el-kodlayacağım** — hedeflerin neredeyse tamamı DISTINCT-FILE kapalı-liste (sprint-utils/routing-engine/prompt-god-template/adr-selector/quality-assessor/result-collector) → worker sprint'ine route EDİLMEZ.
> **Kaynaklar:** (1) `PROMPT-MECHANICS-ANALYSIS.md` (benim ajanım, 345 satır, `file:line`-temelli, 3 boyut) + (2) diğer-oturum Sprint-383 prompt-tutarsızlık analizi (7 tutarsızlık + 6 kazanım). **Çapraz-doğrulanan** bulgular ⭐ ile işaretli; tek-kaynak olanlar kodda birebir doğrulandı.
> **Tarih:** 2026-07-08 · Alperen review-bekliyor (uygulama ONAY sonrası).

---

## 🔴 LIVE-PROMPT AUDIT (2026-07-08, mixed-fleet-test sprint-384/385 gerçek worker-prompt'u — Alperen+Fable, 2 bağımsız analiz)

**Bağlam:** Gemini-test sprint'inin GERÇEK claude-worker prompt'u (384-001, tek-satır scratch-dosya task'ı) 2 bağımsız analizle **62/100** puanlandı (eski ~89→62 endişesi). Post-build (385) prompt'ta doğruladım: **F1.2 ✅ (idempotency-block kalktı) + F2.1b ✅ (scope 3-alt-liste landing) — REGRESYON YOK, iyileşme VAR.** Ama analizler benim hedefli-fix'lerimin **ULAŞMADIĞI daha derin sorunları** doğru yakaladı. 62 puanı bunları yansıtıyor, benim değişikliklerimi değil.

**⭐ ORTAK KÖK-NEDEN (iki analiz de işaret etti):** görev **tek-noktadan sınıflandırılmıyor**; farklı şablon-katmanları bağımsız sınıflandırma yapıyor → çelişki. Kod-kanıtı: `classifyTaskIntent` default = **`core-dev`** + `TASK_TYPE_ADR_PRESETS['core-dev'] = [adr-d-001, adr-d-004, adr-g-006]` → **sınıflanamayan task (scratch smoke) → core-dev default → tam bu 3 kod-ADR'si preset-enjekte.** Aynı yanlış-sınıflandırma DoD-şablonunu da "kod-task" (tsc+test) yapıyor.

**Yeni iş-kalemleri (kapsamlı tur — öncelik sırası):**
1. ~~**⭐ LP-1 · Tek-kaynak tier/tip sınıflandırması**~~ ✅ TESLİM (commit `0f60dbdf`) — **LP-1+2+3'ü BİRLİKTE çözdü** (advisor-öngörülü). (a) `isDocumentWriteTask` genişletildi (docs/-only → non-source doc-ext) → non-docs/ .md=documentation; (b) verify-steps tek-kanonik `task.type`'tan türer. Cascade doğrulandı: scratch .md → type=documentation → ADR=docs (3 kod-ADR YOK) → verify=doc → DoD tsc-yok. Regresyon-temiz (source-bitişik README kod kalır). 464/464 test.
2. ~~**⭐ LP-2 · ADR preset relevance-gating**~~ ✅ LP-1 (a) ile ÇÖZÜLDÜ — task.type=documentation → `taskKindToAdrDomain`=docs → docs-preset (adr-g-015), core-dev 3-ADR force-inject YOK. (Not: F1.3 keyword-path'i, LP-1 preset-path'i çözdü — ADR-over-injection'ın iki yolu da kapandı.)
3. ~~**LP-3 · DoD↔VERIFY-STEPS tek-tip**~~ ✅ LP-1 (b) ile ÇÖZÜLDÜ — DoD (task.type via criteria-deriver) + verify-steps (task.type) artık aynı kanonik kaynaktan → drift imkansız.
4. ~~**LP-4 · Scope-taxonomy: `.tasks/` operational-exemption**~~ ✅ TESLİM (commit `ce9fe016`) — buildScopeBlock iki-branch'ine açık exemption cümlesi: ".tasks/ protocol dosyaları her zaman yazılabilir, scope-audit'ten muaf, scope-mutasyonu sayılmaz." Metin artık auditor-whitelist'iyle eşleşiyor.
5. ~~**LP-5 · Effort kalibrasyonu**~~ ✅ KOD-FİX GEREKMEDİ — `resolveWorkerEffort` zaten complexity-aware (`calculateModelScore` → trivial→low); analiz-edilen "medium" DIRECTIVES'te elle-set `Effort: normal`'dan geldi (→medium), default'tan değil. (Analiz-2 bu noktada yanılmış; effort-türetme sağlam.)
6. ~~**LP-6 · Tier-aware koşullu-içerik budaması**~~ ✅ TESLİM (commit `ce9fe016`) — npm-advisory (incident-anlatısı) doc-only task'lardan çıkarıldı (doc-worker npm çalıştırmaz → saf gürültü). Karpathy kısa+evrensel → bırakıldı. LP-1 zaten kod-ADR/verify/DoD ağırlığını doc-task'tan kaldırmıştı → doc-prompt artık çok hafif.

**⭐ LP-SONUÇ (ROUND 1):** Canlı-audit'in 6 bulgusunun tümü kapandı (LP-1/2/3 tek-kök · LP-4 · LP-6 fix; LP-5 non-issue). Regenerated scratch doc-prompt: type=documentation, 3-kod-ADR yok (docs-preset), doc-verify (tsc yok), idempotency yok (F1.2), scope-exemption var, npm-advisory yok. **BUILD yapıldı → canlı** (sprint-386 gerçek prompt'unda LP-4/F2.1b imzaları doğrulandı).

## 🔴 LIVE-PROMPT AUDIT ROUND 2 (2026-07-08, sprint-386 gerçek prompt'ları — 386-001/006, 2 bağımsız analiz + result-contract bulgusu)

**Bağlam:** Maraton sprint-386 iyileştirilmiş-promptlarla koştu. İki analiz (codex 82/87, fable) DOĞRULADI: LP-1..6 landing yaptı (tier-tutarlılık, .tasks-exemption, scope-3-alt-liste, precedence hepsi çalışıyor). **Ama kalan kaçak ŞABLON'dan ROUTING+RESULT katmanına KAYDI** (analizfable: "kalan iş artık şablonda değil, routing katmanında"). Kök-nedenler kod+task-JSON'da doğrulandı.

**⭐ En büyük kalan kaçak = PERSONA/AGENT ROUTING MISMATCH** (doğrudan Alperen'in "agent/skill decision-mekanizması" P0-vurgusu):
- **LP-7 · Routing-mismatch** (EMPİRİK: task-JSON'da doğrulandı). (a) **DOMAIN-mismatch:** 386-001 (`src/cli/repl/native-tool-registry.ts`, MCP-tool bugfix) → **`api-builder`** (REST/HTTP/Zod/OpenAPI persona → gürültü + `nogo`-ihlaline itiyor: "schema validation" vs "description'ı required yapma"). routeTaskV2 domain-match `src/cli/repl` path'inden "api" keyword'üne atlıyor. (b) **OPERATION-CLASS mismatch:** 386-006 (corrective bugfix "cmd oku") → **`refactorer`** (çekirdek-misyon "Preserve Behavior — zero functional change" → task'ın amacıyla ÇELİŞİYOR; refactorer→corrective mismatch ders-kitabı örneği). **Fix yönü:** routeTaskV2'ye (i) operation-class sinyali (corrective/additive/refactor ayrımı — refactorer'ı davranış-değiştiren task'tan uzak tut), (ii) path-tabanlı domain sinyalini güçlendir (src/cli/repl → CLI/REPL/tool-registry persona, "api" keyword-sıçramasını engelle). `routing-engine.ts` routeTaskV2 + agent-pool.
- **LP-9 · refactorer persona yarım-yamalı** — Safety-Protocol yaması "task's verify block is the authority" diyor AMA en-alt Verification-Steps hâlâ "Run npx vitest run to verify all tests pass" diyor (precedence runtime'da bastırıyor ama persona dosyası tamamlanmalı). `.deckent/agents/refactorer/PROMPT.md`.

**ADR injection — kısmi-iyi, tutarsız-fallback:**
- **LP-8 · ADR path-fallback tutarsızlığı** (doğrulandı): 386-001 (src/cli) → **ALAKALI context-sensitive** ADR'ler (G-034 native-terminal, D-012 terminal-risk, D-013 NL-dispatch) — F1.3/LP-1 bu path'te ÇALIŞIYOR ✅. Ama 386-006 (`src/agent/loop.ts`, permission-fix) → **statik-default trio D-004/G-006/D-001** (D-004 agent/ için marjinal, G-006 alakasız; asıl-gereken security/RBAC ADR'leri gelmedi). **Fix:** (i) src/agent/ path'ine relevance-eşleşme (permission→security/RBAC ADR), (ii) eşleşme-yoksa fallback = **minimal (yalnız build-baseline)**, "son-3-ADR" DEĞİL. (iii) `Active constraint: none` ADR'ler "mandatory, ihlal=NO_GO" başlığı altında → **advisory-context'e ayır ya da hiç enjekte etme** (karışık-sinyal). (iv) G-006 özet-truncation ("V1 PURGED…") hâlâ pending (summarizer). `adr-selector.ts`.

**🔴 RESULT-CONTRACT REGRESYONU (Alperen-bulgusu, doğrulandı):**
- **LP-10 · `.result` filesChanged/linesAdded/linesRemoved BOŞ** — 386-001/006 `filesChanged=[]`, TÜM task'larda `linesAdded/linesRemoved=None`; eski sprint-309 tam-doluydu (`filesChanged=[2]`, `linesAdded=6`, `linesRemoved=2`). **KRİTİK:** bu disk-verify'ı + evaluation-şeffaflığını kırıyor + sprint-386'da 6/8 DONE ama git-diff yalnız 3-dosya → **olası false-DONE gözlenemiyor.** İlgili [[project_worker_output_contract_wiring]] (token/cost wiring Step-3; filesChanged/lines aynı sözleşmede regresе etmiş olabilir). **Fix:** worker `.result` yazımında (worker.ts/result-collector) filesChanged'i git-diff'ten doğru doldur + linesAdded/Removed'ı numstat'tan hesapla (host-side, worker-claim'e güvenme — `feedback_trust_brain_eval_not_worker`). `result-assembler.ts`/`result-collector.ts` (git numstat zaten disk-verify'da var → aynı kaynaktan result'a yaz).

**Küçük bulgular:** (m1) test-dosyası "Existing — modify in place" anotasyonu regression-test YENİ ise yanlış → fs-stat-tabanlı olduğundan emin ol (şablon-default değil). (m2) 386-001 goCriteria "mevcut registry testleri yeşil" ↔ verify "targeted-only" hafif-gerilim → goCriteria'yı verify-tier diliyle hizala ("targeted registry test file(s)"). (m3) task-gövde-TR/scaffolding-EN mixed → zayıf-model mixed-provider sprint'te tek-dile normalize düşünülebilir.

**⭐ ROUND-2 SONUÇ + ÖNCELİK:** Analizlerin yargısı: 384→386 şablon ciddi olgunlaştı; **kalan iş routing + result-contract katmanında.**

### ROUND 2 — 3. bağımsız analiz teyidi + KESKİNLEŞTİRME (disk/kod-kanıtlı)
- **⭐ RC-2 = LP-8'in KESİN kökü (kod-doğrulandı):** `AdrTaskType` (`work-model.ts:216-226`) domain'leri: core-dev/docs/test/cli/mcp/security/observability/orchestra/provider/dashboard — **`src/agent/` (native agent-loop) için domain YOK.** → src/agent task → **core-dev default** → `TASK_TYPE_ADR_PRESETS['core-dev']=[adr-d-001,adr-d-004,adr-g-006]` (`adr-selector.ts:51`) **GARANTİ-enjekte.** KRİTİK: 386-006'daki G-006 keyword-overmatch DEĞİL (F1.3 o yolu kapattı, DOĞRU çalışıyor) — **preset-guaranteed-inclusion F1.3'ü BYPASS ediyor.** LP-2 preset-yolunu yalnız `documentation` için kapatmıştı; core-dev default hâlâ açık. 386-001'in isabetli seti (G-034/D-012/D-013) src/cli sınıflaması + IDF-keyword yolundan → asimetrinin nedeni bu.
- **m1 DÜZELTİLDİ (analiz #3):** LP-minör "Existing anotasyonu şablon-default olabilir" ENDİŞESİ YERSİZ — anotasyon **fs-truth** (F2.1b classifier, dosya diskte VAR). Çıkar.
- **G-006 truncation ◑ KISMEN:** mid-word fix (F0.4) çalışıyor, kalan sorun **cap'in kendisi** (DB'deki active-constraint prompt-cap'ten uzun → kelime-sınırında kesik ama cümle-yarım). Kozmetik (R-5a: ADR'lere prompt-amaçlı `prompt_summary` alanı).
- **🆕 Yan-gözlem (maraton-verimliliği, prompt-dışı):** 386-001/006 = sprint-383'ün AYNI born-item'ları (born-552/519), 383'te DONE + test-dosyaları diskte. 386 aynılarını yeniden koşuyor + -fix'ler var → ya 383-sonuçları evaluation'da düşürüldü ya da **maraton-loop born-backlog state'i tamamlananları düşmüyor.** LP-10 (boş filesChanged) bunu besliyor — disk-verify olmayınca loop neyin bittiğini bilemiyor. **Ayrı bakılmalı** (born-backlog dedup/state).

### R-SERİSİ (analiz #3 önerisi = LP-7..10'un daha temiz çerçevesi; benimsendi)
- **R-1 = LP-7 (persona-routing):** (R-1-ara-önlem, BUGÜN, 0-kod) maraton DIRECTIVES'lerine `- Agent:` yaz (parser destekliyor) — SEC→security-auditor, REPL→terminal-ux-engineer. → (R-1a, davranış-nötr) path→agent affinity SHADOW-mode (mevcut vs önerilen logla, N-sprint veri) → (R-1b, gözlem-sonra-flip = F5.1) affinity-flip.
- **R-2 = LP-8 kökü (küçük el-kod, DISTINCT-FILE-dışı):** (R-2a) `AdrTaskType`+detectTaskType'a `src/agent/` domain ekle; (R-2b) core-dev preset'i "garanti-enjeksiyon"→"relevance-eşiği" (F1.3 IDF-disipliniyle tutarlı; G-006 kod-task sızması tam kapanır). [KARAR-4: agent-domain preset = terminal-surface [g-034,d-012,d-013] mi minimalist [d-001] mi — ya da R-2b relevance ile fixed-preset gereksiz mi?]
- **R-3 = LP-8(iii) enforcement-tier render:** "Active constraint: none" kayıtları "mandatory/NO_GO" başlığından ayır → "Binding" vs "Advisory context" iki-tier. [KARAR: iki-tier mi hiç-enjekte mi — analiz-#3 iki-tier öneriyor (D-012/D-013 REPL-task'a gerçek-bağlam taşıyor)].
- **R-4 = minör-m2 (goCriteria authoring-lint):** plan-time full-suite-ima eden ifadeyi ("mevcut testleri","tüm testler") yakala→uyarı; parser'a dokunma (F0.2 additive kalır). Brain-yazım-kuralı (maliyet 0).
- **R-5 = kozmetik:** (a) ADR `prompt_summary`, (b) TR/EN normalize (mixed-fleet/ollama penceresine bağla), (c) F6 (R-1b'ye bağlı).
- **LP-10 = 🔴 result-contract (analiz-#3 kapsamı-dışı ama Alperen-bulgusu, EN ACİL):** filesChanged/linesAdded/linesRemoved boş → git-numstat'tan host-side doldur. Yan-gözlemi (born-rerun) da besliyor.

### 🔴🔴 NEDENSELLİK DÜZELTMESİ (advisor-disiplini, kod-doğrulandı) — "routing→6 NO_GO" YANLIŞTI
**İddia çürütüldü:** sprint-386'nın 6 NO_GO'su routing-skew'den DEĞİL. **Kök: DUPLICATE born-item'lar.** SPRINT-3 DIRECTIVES = sprint-383'ün AYNI 8 born-item'ı (born-552/550/542/532/520/519/510/511); `git 8bcb0e32 fix(sprint-383): 8 tasks verified` bunları ZATEN fix'lemişti. Worker-notes kanıt: 386-001 *"DUPLICATE of already-completed 383-001"*, 386-006 *"already reads args['cmd']"*, 386-003 *"already handled"*. Worker'lar dürüstçe araştırıp zaten-çözülü buldu → 0-değişim → Brain doğru şekilde NO_GO. **Routing-skew GERÇEK ama bu başarısızlıkların SEBEBİ DEĞİL.** LP-10 (linesAdded=None) da gerçek ama NO_GO-sebebi değil (self-stub gate `!testsPassed` ister, testsPassed=True'ydu).

### ⭐ GERÇEK ÖNCELİK (düzeltilmiş)
1. **🔴 BORN-BACKLOG DEDUP/STATE — YENİ #1 (marathon-efficiency).** Maraton-loop tamamlanmış born-item'ları düşmüyor → koca bir sprint zaten-yapılmışı yeniden koştu (8 duplicate → 6 NO_GO + israf). `.analysis/deckent-marathon-loop-state.md` + born-backlog.json completed-item state'i tutmalı; plan/dispatch öncesi `git log`/arşiv-result'a karşı dedup. **En yüksek kaldıraç — maratonun kendisini yiyor.**
2. **🔴 LP-10 result-contract** — filesChanged/linesAdded/linesRemoved boş → git-numstat host-side. Disk-verify + born-dedup'ı da besler (loop neyin bittiğini görebilsin).
3. ~~**R-1a routing RETROSPEKTİF-shadow**~~ ✅ KOŞTURULDU (2026-07-08, offline 39-task korpus, 0-risk). **KANIT:** ACTUAL dağılım = **refactorer(24)+api-builder(15) — yalnız 2 agent/39 task (%100 skew)**; PROPOSED (aday path→agent) = terminal-ux-engineer(20)+security-auditor(12)+bug-fixer(7); **mismatch 39/39 (%100).** Mevcut routing hiç domain-uygun agent seçmiyor. Kök: refactorer triggerScope=`src/` (HER task) + api-builder spurious-api. Uyarı: %100-mismatch "farklı"yı kanıtlar, "daha-iyi"yi değil (outcome-korelasyon born-rerun'la confound); aday-mantık tuning-ister (security-regex açgözlü). **R-1b FLIP (routing-engine.ts değişimi) için KANIT HAZIR — Alperen flip-kararı bekliyor.** [KARAR-5: refactorer-scope daralt + path→agent sinyali → flip mi, aday-mantığı-tuning-sonra-flip mi?]
4. R-2 (ADR src/agent domain) → R-3 (KARAR) → R-4 → R-5.
**DERS:** nedensellik-iddiasını kod'a-yatırmadan önce doğrula (advisor); disk-verify-ground-truth ([[feedback_trust_brain_eval_not_worker]]).

**Analiz kalite-notu:** iki analiz de yüksek-kalite + bağımsız-yakınsıyor (güçlü sinyal). analiz-1 kök-neden'de daha keskin (single-source classification). analiz-2 #3'ü "çözümsüz politika-çatışması" diye biraz abartıyor — gerçekte auditor `.tasks`'ı exempt ediyor, yani metin-çelişkisi (worker fiilen bloke DEĞİL); ama önerilen fix (explicit exemption) doğru. **Korunacak iyi-taraflar:** result field-shape strict+örnekli (notes-tek-string parser-koruması), tokenUsage "tahmin-etme-0-bırak" gerekçesi, idempotency (API-task'ta), heartbeat currentAction, "read-scope write-vermez", npm-advisory escalation-JSON.

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
> 1. ~~**F1.3 ADR over-match**~~ ✅ TESLİM (commit `f8c8a640`). **BULGU (audit-driven, resume-notu geçersizledi):** canlı injection-audit (8345 kayıt) preset-cezasının yanlış hedef olduğunu gösterdi — adr-g-006 %93 enjekte, preset-only yalnız %2.9; asıl sürücü `scoreKeywordMatch`'in geniş-vokabüllü ADR'lerde jenerik kelimeyle (task/worker/model/agent) aşırı-tetiklenmesi. **Fix:** `buildIdfLookup` (pool-IDF) → keyword-match IDF-ağırlıklı; geniş ADR yalnız DISTINCTIVE vokabül paylaşımıyla eşleşir. adr-d-004 full-render'ın 2. yarısı zaten PCOMP-W4 (operative constraint-tier condensed) ile canlıydı → tekrar yapılmadı. Test: adr-selector 21/21 (+1), ADR-suite 60/60, tsc 0.
> 2. ~~**F2.1b buildScopeBlock 3-alt-liste**~~ ✅ TESLİM (commit `351f5e8f`). buildScopeBlock, `evaluateScopeGate`'i (ack=true → yalnız-sınıfla) yeniden kullanarak WRITE-listesini Existing/New/⚠-Unverified'e böler (worker-dili: "DUR+NO_GO, orphan yaratma" + "did you mean"). Threading: `SprintContext.trackedFiles` (opsiyonel) + task-builder best-effort `git ls-files` (<10ms fail-soft); absent → düz legacy byte-identical. Uçtan-uca gerçek-repo doğrulandı. Test: +3, tsc 0.
> 3. ~~**F1.2 Idempotency default-flip**~~ ✅ TESLİM (commit `7319e39c`). `conditionalBoilerplate.idempotency` artık `touchesExternalApi(task)` (opt-in, `touchesHostConfig` aynası) — connectors/providers/api/gateway/webhook/payment yolları ∨ metin-sinyalleri; bare `api` dışlandı. Güvenlik-endişesi kod-doğrulamayla çözüldü: docker `IDEMPOTENCY_KEY` env-var'ı koşulsuz enjekte (block düşse de gerçek-key akar). 9 pinned-test re-baseline (prompt-w1 + key-format suites + 2 non-API quality-regression senaryosu). tsc 0.
> 4. ~~**F3.1 CLI prefix-bayrağı**~~ ✅ TESLİM (commit `a396ad70`) + CANLI-SMOKE GEÇTİ. `--exclude-dynamic-system-prompt-sections` 4 claude-arg builder'a tutarlı wire (provider-command-spec/subprocess/claude-provider/tmux; Law #2), config `prompt.exclude_dynamic_system_prompt_sections` **default-TRUE**, sprint-spawner her spawn-path'e geçirir. Provider-agnostik guard (codex/gemini spec-flag=null → asla emit). Canlı-binary smoke (wired-args + subscription): agent-loop OK, **usage-envelope sağlam** (cache_read=20709 → subscription-cache okunuyor). Dürüst-payoff: cross-worker DEĞİL (CLI cache paylaşmaz); git-status prefix'ten çıkınca mid-sprint commit'ler subscription/session-cache'i invalidate etmez. Test +5, tsc 0. **Takip:** maraton'da cache-hit-rate gözle → gerekirse default gözden geçir.
> 5. **F5.1 ADR-075 gözlem-flip** — ⏸️ ERTELENDİ (dedike gözlem-penceresi). BULGU: `routing.skill_agent_affinity: true` planın varsaydığı gibi saf-observability DEĞİL — `routing-engine.ts:946` `affinityCtx`'i aktive edip **agent-seçimini değiştiriyor**. Kalite-odaklı prompt-close-out'a + maraton-öncesine routing-davranış değişikliği bundle'lamak yanlış; ADR-075 flip kendi gözlem-sprint'inde (before/after routing-dağılımı ölçümü) yapılmalı. Kısa-vade DIRECTIVES `- Agent:` zaten çalışıyor.
> 6. **F6 hijyen** — ⏸️ ERTELENDİ (premise F5.1'e bağlı). Memory `feedback_agent_routing_imbalance` "dead-code"→"live-but-off" güncellemesi ancak F5.1 flip'lenince geçerli; flip ertelendi → memory doğru kalıyor (config-off). Spec-doc status-tablosu düşük-değer.

## ▶ PROMPT-MEKANİZMASI QUALITY REVAMP — TAMAMLANDI (2026-07-08)
Çekirdek + canlı-audit'in tümü teslim: **F0.1-0.4 · F1.1 · F1.2 · F1.3 · F2.1 · F2.1b · F3.1 · LP-1(+2+3) · LP-4 · LP-6** (13 substantive commit). LP-5 non-issue, F5.1/F6 dedike-pencereye ertelendi. Kanıt: regenerated scratch doc-prompt artık type-tutarlı (documentation), 3-kod-ADR yok, doc-verify (tsc yok), idempotency yok, scope-exemption var, npm-advisory yok. **BUILD sonrası maraton'a dönülür.**
> **Ertelendi (KARAR-3):** F4.x segmentation+ProviderCacheAdapter tam-wire → native-API/F2-008'e bağlı.

## Bekleyen 3 KARAR (Alperen) — VERİLDİ ✅ (scope=bloke · ADR-075=gözlem-flip · caching=CLI+ertele)
1. **Scope-gate** SUSPECT → bloke-default mı, yalnız-uyar mı? (KARAR-1)
2. **ADR-075 affinity** → gözlem-sonra-flip mi, flag+sink kaldır mı? (KARAR-2)
3. **Caching-derinliği** → (a) tam-wire şimdi (segmentation+adapter+CLI-flag, flag-gated, CLI'da yalnız byte+prefix) / (b) yalnız CLI-path kazanımları şimdi (F1.1/F1.2 byte + prefix-flag) + segmentation'ı F2-008/native-API'ye ertele / (c) tüm L1-caching'i maraton sonrasına ertele? (KARAR-3)
