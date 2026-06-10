# DIRECTIVES — Sprint 273: F1-TOK Faz 0+1+1,5 — Limit-Ledger + Prefix-Stab + Prompt-Cons

## Goal: deckent token/limit tüketimini GERÇEK veriyle ölçer (transcript-ledger — `.result` beyanları 3-5× düşük çıktı, artık güvenilmiyor), worker-prompt'ları cache-dostu ve çelişkisiz hale getirir. Kaynak: `docs/alperen-analysis/2026-06-10-weekly-limit-reverse-engineering.md` (§9 plan + §10 kanıtlar: boot-cw fleet yazımının %44-63'ü; goCriteria↔verify çelişkisi; ADR-012 açık-referans kaçırması + ADR-037 %48-balast; prompt skorları 85/90 → hedef ≥97, SIFIR işlev kaybı). MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (opus 1 · sonnet 10 · haiku 2; fable yalnız planlama).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable fs/spawn; testte GERÇEK `~/.claude` OKUNMAZ (sahte transcript fixture'ları tmpdir'de); gerçek ağ YASAK; spawnSync YASAK.
- **İÇERİK KORUNUMU (bu sprint'in özel kuralı):** prompt-şablon/persona değişikliklerinde bilgi SİLİNMEZ — yalnız yeniden-sıralama, tekrar-tekleme, yanlış-ifade düzeltme (feedback_prompt_completeness_over_brevity). Şüphede: koru.
- **Davranış korunumu:** her şey additive/opt-in; default çıktı değişiyorsa (blok sırası gibi) snapshot testleri bilinçli güncellenir + .result notes'a yazılır.
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başkasının yarım dosyası NO_GO sebebi değil (notes'a).
- **i18n-FIRST:** user-facing string `getMessage(key, lang)` (en+tr).
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. Tier-1 gerçek-binary smoke CC sprint-sonu (ADR-079).

---

## Task 1: limit-ledger çekirdeği — transcript parse + maliyet-eşdeğeri birim
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: performance-analyzer
- Skills: typescript-expert, testing-expert
- Files: src/core/limit-ledger.ts, tests/core/limit-ledger.test.ts
- Scope: src/core/, tests/core/

### Description
**YENİ `src/core/limit-ledger.ts`** (F1-TOK Faz 0 — kaynak desen: `scripts/token-usage-report.mjs`, analiz §3/§10). API: `parseTranscriptUsage(opts: { root?: string; readDir?, openStream? (injectable); since?: string; until?: string; projectFilter?: (dirName: string) => boolean }): Promise<UsageRecord[]>` — `~/.claude/projects/**/*.jsonl` satırlarından `message.usage` çek, **message-id dedupe**, `<synthetic>`/non-claude atla, `UsageRecord { ts, model, sessionFile, projectDir, in, out, cacheRead, cacheWrite }`. + `limitCost(records, prices): number` — **maliyet-eşdeğeri birim: `in·$in + out·$out + cacheWrite·1.25·$in`, cacheRead=0** (tersine-mühendislik kalibrasyonu §3). Fiyatlar `.deckent/cost-config.json`'dan (mevcut cost-config loader'ı varsa onu kullan — grep'le bul, yeniden icat etme; alias eşleme: model-id → cost-config girdisi). Hata toleransı: bozuk satır/dosya atla, asla throw etme. Testler: tmpdir'de sahte .jsonl fixture'ları — dedupe, pencere filtresi, model filtresi, birim hesabı (bilinen sayılarla), bozuk-satır toleransı, boş dizin.

**Kanıt:** `npx vitest run tests/core/limit-ledger.test.ts` yeşil; `grep -n "cacheRead" src/core/limit-ledger.ts | head -2` ≥ 1 (birimde cr'nin 0-ağırlık olduğu yorumla belgeli). **Test:** 8+.

---

## Task 2: ledger session→task eşleme + sprint agregasyonu
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: performance-analyzer
- Skills: typescript-expert, testing-expert
- Files: src/core/limit-ledger-report.ts, tests/core/limit-ledger-report.test.ts
- Dependencies: 273-001
- Scope: src/core/, tests/core/

### Description
**YENİ `src/core/limit-ledger-report.ts`** (Task 1 tiplerini import eder). (1) `mapSessionToTask(firstUserMessageText): string|null` — `.tasks/task-(\d{3}-\d{3}(?:-fix)*)\.` deseni (analiz §10.1'de kanıtlanan yöntem; en-spesifik eşleşme: `-fix-fix` > `-fix` > base). Session'ın ilk ~6 satırından task-id çıkarımı için `extractTaskIdFromStream(lines)` yardımcıları. (2) `summarizeSprint(records, taskMap): SprintUsageSummary` — task başına `{ taskId, model, calls, in, out, cacheRead, cacheWrite, bootstrapCw (ilk çağrının cw'si), limitCost, hitRate }` + sprint toplamı + `bootstrapShare`. (3) **Süre transcript'ten DEĞİL** — `durationMs` alanı opsiyonel parametre (heartbeat verisi caller'dan; analiz §10.1 #5: kesintili task'larda transcript süresi güvenilmez — yorumla belgele). Testler: sentetik kayıtlarla eşleme (fix-zinciri dahil), bootstrap tespiti, hit-rate, sprint toplamı.

**Kanıt:** `npx vitest run tests/core/limit-ledger-report.test.ts` yeşil; `grep -n "bootstrapCw\|fix" src/core/limit-ledger-report.ts | head -3` ≥ 2. **Test:** 7+.

---

## Task 3: `deckent usage` CLI — pencere + sprint görünümü
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/usage.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/usage-command.test.ts
- Dependencies: 273-001, 273-002
- Scope: src/cli/, tests/cli/

### Description
**YENİ `deckent usage` komutu** (register pattern ADR-012, `src/cli/index.ts`'e kayıt): (a) default: son 7 gün model-bazlı tablo (istek, in/out/cw, **limit-yakım $-eşdeğeri**, cache hit-rate) + altta "haftalık bütçe referansı ~$650-eşdeğer" bilgi satırı (hardcode DEĞİL: config `usage.weekly_budget_equiv` opsiyonel alanından, yoksa satır gizli); (b) `--sprint <N>`: Task 2 özeti — task başına tablo (model, calls, out, cw, boot-cw, $); (c) `--since/--until` ISO pencere; (d) `--json` ham çıktı. Transcript dizini yoksa dürüst i18n mesajı, exit 0. i18n en+tr (tablo başlıkları dahil). Testler: injectable ledger ile tablo render, --json shape, --sprint eşlemesi, dizin-yok yolu.

**Kanıt:** `npx vitest run tests/cli/usage-command.test.ts` yeşil; `grep -n "registerUsage" src/cli/index.ts` ≥ 1. **Smoke (Tier-1, CC sprint-sonu):** `node dist/cli/entry.js usage --json | head -c 200` → JSON başlıyor. **Test:** 7+.

---

## Task 4: sprint-reporter "limit-yakım" satırı — retro entegrasyonu
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter-usage.test.ts
- Dependencies: 273-002
- Scope: src/orchestra/, tests/orchestra/
- ModelEffort: low

### Description
Retro/sprint özeti üretimine opsiyonel "Limit yakımı" metrik satırı: sprint sonunda ledger çağrılır (best-effort, try/catch — **ledger hatası retroyu ASLA düşürmez**, satır atlanır + debugLog), `Limit burn | $X.XX eşdeğer (task-başı $Y.YY, boot-cw %Z)` satırı mevcut Metrics tablosuna eklenir. ADR-008'e dikkat: sprint-reporter orchestra'da, ledger core'da — import yönü uyumlu. Mevcut retro testleri yeşil kalır (satır yokken davranış aynı). Testler: mock ledger ile satır render, ledger-throw → satırsız retro, format.

**Kanıt:** `npx vitest run tests/orchestra/sprint-reporter-usage.test.ts` yeşil; `grep -n "limit" src/orchestra/sprint-reporter.ts | head -2` ≥ 1. **Test:** 4+.

---

## Task 5: result-evaluator tokenUsage hizalaması — beyan artık zorunlu değil
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/result-evaluator.ts, tests/orchestra/result-evaluator-tokenusage.test.ts
- Dependencies: 273-008
- Scope: src/orchestra/, tests/orchestra/

### Description
Kanıt (analiz §10.1 #2): worker tokenUsage beyanları gerçeğin ~%30'u — beyan zorunluluğu kurumsallaşmış kurgu. `src/orchestra/result-evaluator.ts:1438` civarı ("tokenUsage field is missing — Sprint 140 will reject as NO_GO" uyarısı) ve tokenUsage'a dokunan TÜM değerlendirme yolları (önce grep'le envanter: `grep -n tokenUsage src/orchestra/result-evaluator.ts`): eksik tokenUsage hiçbir koşulda NO_GO/downgrade SEBEBİ OLMAZ; alan varsa `estimate` olarak etiketlenir/taşınır (ledger gerçek sayım kaynağı — Task 1-2). Uyarı metni güncellenir ("self-estimate; ground truth = limit-ledger"). Task 8'in prompt-metin değişikliğiyle tutarlılık (Dependencies bu yüzden — mesaj ve evaluator aynı sözleşmeyi söylesin). Mevcut evaluator testleri yeşil kalır; tokenUsage'lı eski .result'lar aynen kabul.

**Kanıt:** `npx vitest run tests/orchestra/result-evaluator-tokenusage.test.ts` yeşil; `grep -cn "will reject as NO_GO" src/orchestra/result-evaluator.ts` = 0. **Test:** 4+.

---

## Task 6: .gitignore sprint-runtime artıkları — git-status prefix stabilizasyonu
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: devops-engineer
- Skills: git-expert
- Files: .gitignore
- Scope: ./

### Description
Kanıt (analiz §8 silent-invalidator bulgusu): `heartbeat.pid`, `sprint.lock`, `memory.db.backup-*`, `.playwright-mcp/` git-status'ta untracked görünüyor → her sprint koşusunda değişen snapshot CC worker'larının system-prompt prefix'ini bölüyor (cache divergence). `.gitignore`'a ekle: `.deckent/heartbeat.pid`, `.deckent/sprint.lock`, `.deckent/mcp-server.pid`, `.deckent/pids/`, `.brain/memory.db.backup-*`, `.playwright-mcp/`. Mevcut tracked dosya ETKİLENMEZ (hepsi zaten untracked — `git ls-files` ile doğrula, tracked olanı ekleme). Yorum satırıyla gerekçe (cache-prefix stability, analiz referansı).

**Kanıt:** `git status --porcelain | grep -cE "heartbeat.pid|sprint.lock|memory.db.backup|playwright-mcp"` = 0; `git ls-files .deckent/heartbeat.pid | wc -l` = 0 (tracked değildi, değişmedi). **Test:** yok — .result YAZ.

---

## Task 7: prompt-determinizm guard testi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/prompt-determinism.test.ts
- Dependencies: 273-008
- Scope: tests/orchestra/

### Description
YENİ guard testi (Task 8'in yeni düzeni ÜZERİNE — Dependencies bu yüzden): (1) aynı task+ctx ile `buildTaskPrompt` İKİ kez → **bayt-bayt aynı** çıktı (timestamp/UUID/sıralama sızıntısı yakalar); (2) ADR listesi farklı sırayla verilse bile render aynı (seçici/sıralama deterministik); (3) skill listesi aynı kümeyse render aynı; (4) blok SIRASI sözleşmesi: Skills bloğu Agent bloğundan ÖNCE (Task 8'in yeni düzeni — regression kilidi); (5) prompt içinde `new Date`/ISO-timestamp deseni YOK (regex). Bu test gelecekteki her şablon değişikliğinde cache-bozucu drift'i yakalar.

**Kanıt:** `npx vitest run tests/orchestra/prompt-determinism.test.ts` yeşil. **Test:** 5+.

---

## Task 8: prompt-template revizyonu — Skills-first blok sırası + tokenUsage metni (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/prompt-god-template.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
İKİ cerrahi değişiklik, İÇERİK KORUNUMU mutlak (analiz §10.3 fix #5 + #6):
(1) **Blok sırası:** render `Agent → Skills → ADR → ...` yerine **`Skills → Agent → ADR → ...`** (en-paylaşılandan en-task-özele; kanıt: skills blokları task'lar arası md5-birebir-aynı, agent bloğu task-başına değişiyor — mevcut sıra paylaşılabilir cache prefix'ini 1. bayttan kırıyor). Blokların İÇERİĞİ bayt-bayt aynı kalır, yalnız konum değişir. Snapshot/sıra assert'i olan mevcut testler bilinçli güncellenir (.result notes'a hangileri).
(2) **tokenUsage cümlesi** (`:663` civarı): "ALL four fields ... a missing tokenUsage is rejected as NO_GO" → tokenUsage **opsiyonel self-estimate**: "optionally include tokenUsage as your best self-estimate { ... }; ground-truth accounting comes from the transcript ledger — a missing tokenUsage is NOT a failure" (Task 5 evaluator'la aynı sözleşme).
Başka HİÇBİR metin/blok değişmez (goCriteria Task 9'un, ADR render Task 12'nin alanı — dokunma). Karpathy: minimum-diff.

**Kanıt:** `npx vitest run tests/orchestra/prompt-god-template.test.ts` yeşil; `grep -n "rejected as NO_GO" src/orchestra/prompt-god-template.ts | wc -l` = 0; blok-sıra kanıtı: testte Skills-index < Agent-index assert'i. **Test:** mevcut suite + 3 yeni.

---

## Task 9: goCriteria şablonu — full-suite çelişkisi + Kanıt-interpolasyon fix'i
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/core/criteria-deriver.ts, tests/core/criteria-deriver.test.ts
- Scope: src/core/, tests/core/

### Description
Kanıt (analiz §10.2 T1 — canlı 271 prompt'larında): goCriteria "`npx vitest run` passes" (TAM suite) üretiyorken aynı prompt'un CRITICAL VERIFY bölümü "full suite KOŞMA (~67 pre-existing fail)" diyor — Definition-of-Done ↔ verify talimatı doğrudan çelişkisi (false-NO_GO riski; 257 CODE-FULLSUITE-NOGO'nun şablonda yaşayan artığı). `src/core/criteria-deriver.ts:77-84` civarı: (1) test komutu cümlesi "targeted test file(s) pass" diline çevrilir — task'ın Files/Kanıt'ından test dosyası çıkarılabiliyorsa somut komutla (`npx vitest run <files>`), çıkarılamıyorsa "the targeted test file(s) for the modules you changed pass"; build cümlesi (`npx tsc` succeeds) kalır. (2) **`*Kanıt:**` bozuk-markdown artifact'ı**: Kanıt-extract'inin yıldız/bold kırpma hatasını düzelt (271-004/010 goCriteria satırında görülen `*Kanıt:**`). DİKKAT: Brain evaluation goCriteria string'ini tüketiyor — result-evaluator'da bu metne bağımlı regex/koşul var mı ÖNCE grep'le doğrula, varsa notes'a yaz (davranış korunumu). Testler: yeni dil, Kanıt-extract temizliği, test-dosyası-çıkarımlı/çıkarımsız iki yol.

**Kanıt:** `npx vitest run tests/core/criteria-deriver.test.ts` yeşil; `grep -n "vitest run\` passes" src/core/criteria-deriver.ts | wc -l` = 0. **Test:** 5+.

---

## Task 10: persona/skill "full test suite" envanteri + targeted-verify hizalaması
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, testing-expert
- Files: src/core/builtins/agents/bug-fixer/PROMPT.md, src/core/builtins/agents/ci-guardian/PROMPT.md, src/core/builtins/agents/migration-specialist/PROMPT.md, src/core/builtins/skills/testing-expert/SKILL.md, src/core/builtins/skills/git-expert/SKILL.md, src/core/builtins/skills/migration-expert/SKILL.md
- Scope: src/core/builtins/

### Description
Kanıt (analiz §10.2 T2): bug-fixer personası 5 yerde "run the FULL test suite / full suite passes yoksa NO_GO" diyor — harness'ın targeted-verify kuralı ve self-assessment merdiveniyle (minor→GO_WITH_TECH_DEBT) doğrudan çelişiyor; worker çatışmayı kendisi çözmek zorunda kalıyor. ÖNCE envanter: `grep -rn "full test suite" src/core/builtins/` → TÜM eşleşmeleri .result notes'a listele. SONRA düzelt — **silme YOK, ifade düzeltme**: worker-verify bağlamındaki "run the full test suite" → "run the project-configured verify scope (targeted test files by default — the harness instructions define the exact commands)"; NO_GO merdiveni cümleleri harness'ın 3-kademeli sözleşmesine ("DONE / GO_WITH_TECH_DEBT / NO_GO" + targeted-pass koşulu) hizalanır. **NÜANS:** CI/PR bağlamındaki ifadeler (örn. testing-expert "Run the full test suite on every pull request" — CI Integration bölümü) DOĞRU ve KALIR; yalnız worker'ın kendi verify-döngüsünü anlatan satırlar düzeltilir. Her düzeltme öncesi/sonrası .result notes'a.

**Kanıt:** `grep -rn "full test suite" src/core/builtins/agents/ | wc -l` = 0 (agent persona'larında kalmadı); skills'te yalnız CI-bağlamı kaldı (notes'ta gerekçeli liste). **Test:** yok — .result YAZ (envanter + diff özeti).

---

## Task 11: ADR seçici — açık `ADR-NNN` referansı topN'e zorla dahil
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/adr-selector.ts, tests/orchestra/adr-selector-explicit-ref.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Kanıt (analiz §10.2 K1 — canlı 271-004): task description'ı açıkça "register pattern **ADR-012**" derken `selectRelevantAdrs` (topN=3) ADR-012'yi SEÇMEMİŞ; yerine görevle ilgisi düşük ~5,4K-token ADR-037 girmiş. Fix: `selectRelevantAdrs`'a ön-aşama — task title+description'da `/ADR-?(\d{1,3})/gi` desenleriyle geçen ADR id'leri, ADR havuzunda mevcutsa **sonuca zorla dahil edilir** (relevance skorundan bağımsız, listenin başına); kalan slotlar mevcut skorlamayla dolar (topN toplamı korunur ya da açık-referanslar +1 taşma hakkı — hangisini seçtiğini gerekçesiyle notes'a). Regression testi: 271-004 vakası birebir — description "ADR-012" içerir, havuzda adr-012 + yüksek-skorlu adr-037 varken seçim adr-012'yi İÇERİR. Edge: var olmayan ADR referansı (ADR-999) sessizce atlanır; çoklu referans; case-insensitive.

**Kanıt:** `npx vitest run tests/orchestra/adr-selector-explicit-ref.test.ts` yeşil; `grep -n "ADR-\?" src/orchestra/adr-selector.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 12: ADR render dedupe + operative-extract (opt-in, default-off)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/adr-selector.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/adr-render.test.ts
- Dependencies: 273-011
- Scope: src/orchestra/, src/core/, tests/orchestra/, tests/core/

### Description
Kanıt (analiz §10.2 M1 + fix #4; Dependencies: 011 aynı dosyayı değiştirir — serileştirildi). İKİ parça:
(1) **Dedupe (default-ON, güvenli):** `buildAdrPromptSection` her ADR'de başlık+status'u iki kez basıyor (`## adr-001: ... **Status:** accepted` + içerikteki `# ADR-001: ... **Status:** accepted **Date:**`) — dış başlığı tekle, içerik gövdesi AYNEN kalır (bilgi kaybı sıfır, saf tekrar düşer).
(2) **Operative-extract (opt-in, default-OFF):** config `prompt.adr_render: 'full' (default) | 'operative'`. `'operative'` modunda bir ADR'nin gövdesinde `<!-- worker-operative-start -->` / `<!-- worker-operative-end -->` işaretli bölüm VARSA yalnız o bölüm basılır ("[full text: .brain/memory.db adr-NNN]" dipnotuyla); işaret yoksa FULL basılır. Hiçbir ADR içeriği otomatik özetlenmez/kırpılmaz — extract bölümünü İNSAN/CC yazar (ADR-037 için ayrı iş, bu task'ın kapsamı DEĞİL — notes'a hatırlatma). Default davranış bayt-bayt değişmez (dedupe hariç — o da testle sabitlenir). Testler: dedupe çıktısı, full-mode aynılık, operative-mode işaretli/işaretsiz yollar, config validasyonu.

**Kanıt:** `npx vitest run tests/orchestra/adr-render.test.ts` yeşil; `grep -n "worker-operative" src/orchestra/adr-selector.ts` ≥ 1. **Test:** 7+.

---

## Task 13: doc senkronu — features + MASTER-PLAN işaretleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md, docs/reference/cli-commands.md, docs/MASTER-PLAN.md
- Dependencies: 273-003, 273-004
- Scope: docs/

### Description
DİSKTEKİ koddan (Dependencies inmeden yazma; inmemişse yalnız mevcut olanı belgele + notes'a): (1) `docs/reference/features.md`'e limit-ledger + `deckent usage` satırları (tetikleyen komut/bayraklarla); (2) `docs/reference/cli-commands.md`'e `usage` komutu bölümü (default/--sprint/--json); (3) `docs/MASTER-PLAN.md` F1-TOK maddesinde Faz 0 + Faz 1 (gitignore/determinizm/blok-sırası) + Faz 1,5 (goCriteria/persona/ADR-seçici) işaretleri — tek-satır "✅ Sprint 273: ..." ekleri, mevcut metni SİLME. Uydurma özellik YAZMA — her satırı `ls`/`grep` ile doğrula.

**Kanıt:** `grep -cE "deckent usage|limit-ledger" docs/reference/features.md docs/reference/cli-commands.md` ≥ 2; `grep -c "Sprint 273" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

**Beklenen:** 13 mikro task (10 kod/test + 1 config-dosyası + 2 doc), model-katmanlı (**opus 1** [Task 8 — prompt-pipeline kritik] · **sonnet 10** · **haiku 2** · fable 0 worker — planlama Brain'de). Dependency zincirleri: `002→001 · 003→001,002 · 004→002 · 005→008 · 007→008 · 012→011 · 013→003,004` (dosya çakışmaları serileştirildi: prompt-god-template.ts → 008 tek sahip; adr-selector.ts → 011→012; result-evaluator mesaj-tutarlılığı → 005, 008'den sonra). CC sprint sonu: dep spot-check + tsc + yeni testler + **gerçek-binary doğrulama** (`deckent usage` smoke + bir sonraki sprint'te 2 worker-prompt dosyasının yeni düzen/≥97 kontrolü + transcript'te 2. worker'ın `cache_read > cache_creation` Faz-1 gate ölçümü) + commit/push + 🔨 BUILD sinyali. **Bilinçli sprint-dışı:** Faz 2 CACHE-WARM (first-worker-warm spawn stratejisi — bu sprint'in ledger'ı onun gate ölçümünü mümkün kılar), ADR-037 operative bölümünün yazılması (insan/CC işi), F1-LIM park davranışı. Sonraki: Faz 2 + A/B kanıt sprint'i (hedef: task-başı ≤$0,45, kalite sabit).
