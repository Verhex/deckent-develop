# DIRECTIVES — SPRINT-12: HAVUZ-PAKETİ (born-585·587·588·594·595·599, 6 task)

## Goal
Loop-havuzunun temiz-worker paketi: projectRoot-threading · ölü-signal-listener migrasyonu ·
start-exit-dürüstlüğü · testing-intent sahipliği · overrideWarnings-yüzeyi · voice-tip-fixi.
Kanıt-tabanları: `.analysis/born-backlog.json` ilgili kayıtlar + `.analysis/sprint-agent-skill-prompt-audit-2026-07-10.md`
(594/595) + advisor-consult reçeteleri (587=serve-deseni `6a2d7016`). SSOT: marathon GOAL-v2. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **TEK-YAZAR istisnaları:** `result-collector.ts` YALNIZ Task 1 · `routing-engine.ts` YALNIZ Task 4 ·
  `sprint-planner.ts` YALNIZ Task 5. Diğer kapalılar (result-evaluator/sprint-phases/sprint-controller/server.ts/config.ts/entry.ts) KAPALI.
- git stash/reset/checkout/clean YASAK · hermetik test (tmpdir; gitignored-state okumadan) · spawnSync yasak ·
  i18n getMessage (user-facing) · `notes` TEK STRING · Self DÜRÜST · surgical minimum-diff.
- **REPRODUCE-first:** davranış-fix'lerinde (587/588/595) önce RED-test/kanıt, sonra fix.
- Her task kanıt-komutlarını koşar; mevcut GEÇEN testleri bozma (intent-koruyan güncelleme serbest, gevşetme yasak).

## Task 1: born-585 — PROJECTROOT-THREAD — buildWorkerPrompt 7 çağrı-sitesine gerçek projectRoot (P2)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-spawner.ts, src/orchestra/task-mode-runner.ts, src/orchestra/result-collector.ts, src/mcp/tools/run.ts, src/cli/commands/spawn.ts, src/cli/commands/run.ts, tests/orchestra/buildworkerprompt-projectroot-thread.test.ts
- Scope: src/orchestra/, src/mcp/, src/cli/, tests/orchestra/
- Dependencies: none
### Description
sprint-391 T1 `buildWorkerPrompt`'un projectRoot parametresini onardı; 7 production çağrı-sitesi hâlâ 3-arg
(cwd-default): sprint-spawner.ts:647/936 · task-mode-runner.ts:250 · result-collector.ts:1164 (satırlar kaymış
olabilir — grep'le doğrula) · mcp/tools/run.ts:127 · cli/commands/spawn.ts:217 · cli/commands/run.ts:355.
FIX: her çağrıya çağıranın ZATEN elindeki projectRoot'u geç — **TAM OLARAK komşu `resolveAgentPrompt`
çağrısının kullandığı değişkeni** (advisor-şartı: yanlış-root seçimini yapısal-imkânsız kılar).
Bugün cwd==projectRoot olduğundan davranış byte-identik; MCP-cwd≠projectRoot + global-install senaryosunu açar.
DİKKAT result-collector: yalnız buildWorkerPrompt çağrı-satırı — cost-guard/drain/dispatch bölgelerine DOKUNMA.
### goNogo
- goCriteria: 7 site 4-arg; unit-test: en az spawn-yolu + collector-yolu fixture'ında buildWorkerPrompt'un caller-projectRoot aldığı test-pinli; tests/orchestra/task-builder.test.ts + cost-guard-enabled-path + result-collector suite yeşil; tsc temiz.
- nogo: buildWorkerPrompt imzasını değiştirme; default'u kaldırma; result-collector'da başka satır.
- Kanıt: `npx vitest run tests/orchestra/buildworkerprompt-projectroot-thread.test.ts tests/orchestra/task-builder.test.ts tests/orchestra/cost-guard-enabled-path.test.ts tests/orchestra/result-collector.test.ts` → 0 fail.

## Task 2: born-587 — DEAD-LISTENER-MIGRATION — 5 komut shutdown-hook registry'ye (P1)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/nervous.ts, src/cli/commands/chat.ts, src/cli/commands/flow.ts, src/cli/commands/heartbeat.ts, src/cli/commands/dashboard.ts, tests/cli/dead-listener-migration.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
Advisor-kanıtlı sınıf (serve = 1. üye, fix `6a2d7016` DESENİ birebir): entry.ts bootstrap-onSignal kayıt-sırası
kazanır + senkron exit(0) → sonradan kayıtlı `process.on(SIGINT/SIGTERM)` listener'ları HİÇ koşmaz. 5 üye:
nervous.ts:541 · chat.ts:401-402 · flow.ts:228 · heartbeat.ts:67-68 · dashboard.ts:213-214 (satır-kayması olabilir).
HER komut için ÖNCE reachability doğrula (bazıları sinyal-dışı yoldan da çıkıyor olabilir — cleanup'ın gerçek
işlevini oku), SONRA: ölü listener'ları kaldır + cleanup'ı `registerShutdownHook`'a taşı
(`src/cli/helpers/shutdown-hooks.ts`; İDEMPOTENT-hook kontratı — modül-doc'u oku; sinyal-agnostik; exit entry'de).
Komut normal-yoldan çıkarken unregister-fonksiyonunu çağır (stale-hook bırakma).
### goNogo
- goCriteria: 5 komutta sıfır doğrudan signal-listener; her cleanup hook-kayıtlı + idempotent; unit-test: her komutun hook'u kayıt/çağrı/unregister test-pinli (mock-registry); sigterm-cleanup + sigterm-teardown + shutdown-hooks suite'leri DOKUNULMADAN yeşil.
- nogo: entry.ts/shutdown-hooks.ts'e dokunma; cleanup SEMANTİĞİNİ değiştirme (yalnız taşı); reachability-belirsizse o komut için NO_GO+not (blind taşıma).
- Kanıt: `npx vitest run tests/cli/dead-listener-migration.test.ts tests/cli/sigterm-cleanup.test.ts tests/cli/sigterm-teardown.test.ts tests/cli/shutdown-hooks.test.ts` → 0 fail.

## Task 3: born-588 — START-EXIT-HONESTY — gate-blok `deckent start` non-zero exit (P2)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/start.ts, tests/cli/start-gate-exit.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
Canlı-vaka (2026-07-10): scope-gate BLOK'u BrainError fırlatır, `deckent start` mesajı basar ama **exit 0**
döner — script/CI için dishonest. FIX: start.ts'in BrainError/gate-blok yakalama yolunda `process.exitCode = 1`
(mesaj/format aynı). start.ts'teki DİĞER hata-çıkış yollarının exit-code envanterini çıkar (notes'a);
yalnız gate-blok sınıfını fix'le (kapsam-disiplini). REPRODUCE-first: RED-test = gate-blok fixture → exitCode!==0.
### goNogo
- goCriteria: gate-blok → exitCode 1 (test: BrainError-fırlatan runSprint mock'u); normal tamamlanma exit 0 korunur; mevcut start testleri yeşil.
- nogo: mesaj/i18n değiştirme; runSprint'e dokunma; tüm hataları battaniye-1 yapma (yalnız gate/BrainError sınıfı, envanter notes'a).
- Kanıt: `npx vitest run tests/cli/start-gate-exit.test.ts tests/cli/commands/start.test.ts` → 0 fail.

## Task 4: born-594 — TESTING-INTENT — test-ağırlıklı task'lar testing sınıflansın + sahiplik (P1)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/core/routing-engine.ts, tests/core/testing-intent-ownership.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
Audit §kök-neden-3 (rapor-maddesini OKU): %100 test-dosyası yazan task `implementation` sınıflanıyor;
`testing` intent'i test-writer'ın arşivinden (sprint-148) beri SAHİPSİZ; evolved-rules ci-guardian/bug-fixer'ı
implementation'dan dışlamış → forceAgent her sprint 9/9 overrideWarning. FIX (routing-engine TEK-YAZAR):
(a) intent-sınıflandırmada test-dominant sinyal (scope/files çoğunluğu `tests/` + title/description test-fix
deseni) → `testing`; (b) `testing` intent'inin canlı sahipleri: ci-guardian + bug-fixer activation'larının bu
intent'te ateş alabildiğini routing-testiyle KANITLA (manifest'e dokunmadan mümkün değilse NO_GO+not — manifest
işi born-601'in). DAVRANIŞ-DEĞİŞİMİ KASITLI (Alperen-onaylı hijyen, 589-emsali): mevcut routing-testleri
intent-koruyarak güncellenebilir, gevşetilemez; alias-katmanına (589) DOKUNMA. **Advisor-notu (classifier=DOĞRU
katman — emisyonun kendisi yanlış, domains'teki vocabulary-köprüsü durumu DEĞİL):** eski yanlış-intent altında
birikmiş stats dormant kalır, 'testing'-anahtarlı öğrenme cold-start olur — backfill YOK (notes'a yaz);
`updateEntityPerformance`'ın daha-önce-görülmemiş intent-anahtarını tolere ettiğini TEST-PİNLE (outcome-tracker).
### goNogo
- goCriteria: fixture: sprint-391-tipi test-sweep task'ı → intent=testing + ci-guardian/bug-fixer overrideWarning'SIZ seçilebilir; mevcut routing suite (routing-engine/route-domain-scope/affinity/health/domain-alias) yeşil; tsc temiz.
- nogo: skorlama-formülü genel-değişikliği; alias-map'e dokunma; manifest-dosyası düzenleme.
- Kanıt: `npx vitest run tests/core/testing-intent-ownership.test.ts tests/core/routing-engine.test.ts tests/core/route-domain-scope.test.ts tests/core/routing-domain-alias.test.ts tests/orchestra/routing-affinity-enable.test.ts tests/orchestra/agent-routing-health.test.ts` → 0 fail.

## Task 5: born-595 — OVERRIDE-WARNING-SURFACE — router uyarıları plan-çıktısına (P1)
- Model: sonnet
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-planner.ts, src/cli/commands/plan.ts, src/cli/helpers/messages.ts, tests/orchestra/override-warning-surface.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/
- Dependencies: none
### Description
Audit: sprint-391'de 9/9 task `overrideWarnings` taşıdı, HİÇBİR yüzeyde görünmedi. FIX (sprint-planner TEK-YAZAR):
plan-akışında task'ların overrideWarnings'ini topla → `deckent plan` çıktısında (dry-run dahil) prompt-gate-WARN
formatının eşleniğiyle listele (i18n anahtarı: `plan.override_warnings_header` en+tr — messages.ts'e ekle) +
plan-tablosunun altında task-id'li satırlar. REPRODUCE-first: RED-test = overrideWarnings'li plan fixture'ı →
çıktıda görünür. Sessiz-kalma sıfır; warning YOKsa çıktı byte-identik.
### goNogo
- goCriteria: overrideWarnings'li fixture → plan-çıktısında task-id'li uyarı-bloğu (en+tr anahtarlı); warning'siz plan çıktısı DEĞİŞMEZ (regresyon-testi); mevcut plan/planner testleri yeşil; tsc temiz.
- nogo: routing/override ÜRETİMİNE dokunma (yalnız yüzeye taşıma); prompt-gate bloklarını değiştirme.
- Kanıt: `npx vitest run tests/orchestra/override-warning-surface.test.ts tests/orchestra/sprint-planner*.test.ts tests/cli/commands/plan*.test.ts` → 0 fail — **TAM plan-test-dosyalarını koş** (tek-test değil; ~10 stdout-assert var). MCP wrapResponse'a alan eklersen YALNIZ additive (mevcut anahtarları yeniden-yapılandırma).

## Task 6: born-599 — VOICE-BODYINIT — Buffer→Uint8Array fetch-body tip-fixi (P2)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/connectors/voice/local-voice.ts, tests/connectors/voice-bodyinit.test.ts
- Scope: src/connectors/, tests/connectors/
- Dependencies: none
### Description
DOM-lib tsconfig altında (desktop-projesi) latent tip-hatası: local-voice.ts:22 fetch body'sine Buffer geçiyor —
BodyInit'e atanamaz. FIX: `new Uint8Array(buffer)` (runtime-eşdeğer — Buffer zaten Uint8Array alt-sınıfı; iki
lib'de de geçerli BodyInit). Regresyon-muhafızı: `npx tsc --noEmit -p src/desktop` yeşil kalır (kanıt-komutuna ekle).
### goNogo
- goCriteria: root tsc + `tsc -p src/desktop` temiz; mevcut voice testleri yeşil; davranış-değişimi yok (unit: gönderilen body byte'ları aynı).
- nogo: voice akışını yeniden-tasarlama; başka fetch-çağrısına dokunma.
- Kanıt: `npx vitest run tests/connectors/ 2>/dev/null | tail` + `npx tsc --noEmit -p src/desktop` → 0 hata.
