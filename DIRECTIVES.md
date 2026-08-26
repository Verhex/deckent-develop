# DOGFOOD-SKILL EVRİMİ — DALGA-2: DOGFOOD-SÜİTİ (SSOT=skill; owner-onaylı plan, 2026-08-26)

## Goal

Deckent'in KENDİ işçilik-kanunları skill-kataloğuna taşınır (SSOT=skill): dört yeni
builtin skill (deckent-hermetic-testing, deckent-worker-evidence,
deckent-repair-alignment, deckent-config-authority), iki mevcut skill revizyonu
(i18n-quality, ci-testing) ve test-guardian builtin agent'ı. Ürün karşılığı: her
Deckent kullanıcısının worker'ları bu disiplinleri prompt-seviyesinde hazır bulur;
dogfood karşılığı: 7094-F1c (test-quality specialization) kapanır.

## Execution contract

- Şablon: `src/core/builtins/skills/provider-cli-matrix/` (manifest.json + SKILL.md
  deseni birebir; manifestVersion 2, activation.rules + triggers + stackDetection).
- HER yeni manifest elle-yazılmış canonical V3 `profile` taşır (domains/workTypes/
  expertise/deliverables; priority 6-8) — Dalga-1'in unroutable-gate'i profilsiz
  manifest'i FAIL eder; 30-girdilik yalnız-azalma baseline'ı BÜYÜTÜLEMEZ.
- SKILL.md içerikleri İngilizce (katalog dili); kod-yolu string'i yok, i18n-FIRST
  yalnız CLI-yüzeyi için geçerli (bu dalgada CLI dokunuşu yok).
- İçerik REPO-GERÇEĞİNDEN türetilir: SKILL.md'lerde atıf yapılan komut/script/gate
  adları gerçekte var olmalı (uydurma komut yasak); Reads listesindeki kaynaklardan
  damıt. Assertion zayıflatma/test silme yasak.
- Her task kendi Test komutunu koşar; koşum kanıtı .result notes'a.

## Task 1: Yeni builtin skill'ler — deckent-hermetic-testing + deckent-worker-evidence
- Files: src/core/builtins/skills/deckent-hermetic-testing/manifest.json, src/core/builtins/skills/deckent-hermetic-testing/SKILL.md, src/core/builtins/skills/deckent-worker-evidence/manifest.json, src/core/builtins/skills/deckent-worker-evidence/SKILL.md
- Reads: src/core/builtins/skills/provider-cli-matrix/manifest.json, src/core/builtins/skills/provider-cli-matrix/SKILL.md, src/core/skill-types.ts, src/core/skill-profile-derivation.ts, scripts/lint-test-hermeticity.mjs, scripts/lint-mock-factories.mjs, tests/hermeticity/runtime-write-guard.ts, .claude/rules/worker-default.md
- Priority: HIGH
- Agent: doc-writer
- Test: node scripts/lint-manifests.mjs && VITEST_MAX_FORKS=2 npx vitest run tests/core/skill-pool.test.ts
### Description
deckent-hermetic-testing: tmpdir-hermetik test yazımı (fresh-checkout'ta geçer;
global state/tracked dosya mutasyonu yok), VITEST_MAX_FORKS=2 disiplini, hermeticity
ledger ritüeli (count/digest tarihli-yorumlu güncelleme; digest EN SON pinlenir),
mock-factory only-shrink baseline kuralı, runtime-write-guard'ın open-flag
semantiği. deckent-worker-evidence: .result kanıt-disiplini (files_changed,
gerçek koşum çıktısı, DONE/GO_WITH_TECH_DEBT/NO_GO dürüstlüğü, typed NO_GO),
disk-kanıt-önce-iddia (status-çıktısı kanıt değildir), proof-of-function
(user-surface işte gerçek-binary koşu). İkisi de repo'daki gerçek gate/script
adlarına atıfla yazılır (Reads'ten damıt). Manifest'ler provider-cli-matrix şablonu
+ elle canonical V3 profile (priority 7).

## Task 2: Yeni builtin skill'ler — deckent-repair-alignment + deckent-config-authority
- Files: src/core/builtins/skills/deckent-repair-alignment/manifest.json, src/core/builtins/skills/deckent-repair-alignment/SKILL.md, src/core/builtins/skills/deckent-config-authority/manifest.json, src/core/builtins/skills/deckent-config-authority/SKILL.md
- Reads: src/core/builtins/skills/provider-cli-matrix/manifest.json, src/core/builtins/skills/provider-cli-matrix/SKILL.md, src/core/skill-types.ts, src/core/config-write-authority.ts, src/core/config.ts, scripts/lint-config-writers.mjs, docs/governance/lane-briefs/ci-repair-test-slim-2026-08-26.md
- Priority: HIGH
- Agent: doc-writer
- Test: node scripts/lint-manifests.mjs && VITEST_MAX_FORKS=2 npx vitest run tests/core/skill-pool.test.ts
### Description
deckent-repair-alignment: kırmızı-test onarım disiplini — bayat-pin vs gerçek
ürün-bug sınıflandırması (bug kanıtında dosyaya dokunmadan NO_GO ve exact kaynak-konum kanıtı, dosya adı ile satır numarası), assertion zayıflatma/silme/skip yasağı, kontrat-öğrenme — Reads listesindeki kaynak kodu okuyarak hizalama yapılır, repro-before-red. deckent-config-authority: config yazımı
YALNIZ config-write-authority üzerinden (writeConfigJsonAtomic tmp+fsync+rename,
withConfigWriteLock, CONFIG_CONCURRENT_REVISION_HOLD semantiği), 3-katman merge,
typed HOLD desenleri, lint-config-writers only-shrink gate'i; elle RMW/truncate
config yazımı yasak. Manifest'ler şablon + elle V3 profile (priority 7; config
skill'i priority 8 — authority-kritik).

## Task 3: Mevcut skill revizyonu — i18n-quality + ci-testing bugünkü gerçeklerle
- Files: src/core/builtins/skills/i18n-quality/manifest.json, src/core/builtins/skills/i18n-quality/SKILL.md, src/core/builtins/skills/ci-testing/manifest.json, src/core/builtins/skills/ci-testing/SKILL.md
- Reads: src/cli/helpers/messages.ts, scripts/lint-i18n.mjs, .github/workflows/ci.yml, scripts/security/secret-baseline.mjs, scripts/lint-test-hermeticity.mjs, docs/governance/lane-briefs/ci-repair-test-slim-2026-08-26.md
- Priority: MEDIUM
- Agent: doc-writer
- Test: node scripts/lint-manifests.mjs && VITEST_MAX_FORKS=2 npx vitest run tests/core/skill-pool.test.ts
### Description
i18n-quality: getMessage(key, lang) kataloğu (messages.ts en+tr çifti ZORUNLU;
katalogda olmayan key = stderr missing-key), mekanizma-modülü string-free kuralı,
hardcoded user-facing string yasağı — mevcut SKILL.md bugünkü katalog-gerçeğiyle
güncellenir (var olmayan dosya/komut atıfları temizlenir). ci-testing: CI shard
yapısının bugünü — test job'larında dist-prebuild adımı (real-binary testler
dist/cli/entry.js ister), secret-baseline gate, hermeticity/mock ratchet'ları,
Windows fsync 'r+' dersi (read-only handle FlushFileBuffers EPERM), pipe-exit
kuralı (cmd > log 2>&1; echo $?). Mevcut activation/trigger yapısı korunur,
içerik güncellenir; profile alanları varsa V3'e elle hizalanır.

## Task 4: test-guardian builtin agent — 7094-F1c kapanışı
- Files: src/core/builtins/agents/test-guardian/agent.json, src/core/builtins/agents/test-guardian/AGENT.md
- Reads: src/core/builtins/agents/ci-guardian/, src/core/builtins/agents/code-reviewer/, src/core/agent-types.ts, src/core/agent-pool.ts, .claude/rules/worker-default.md
- Priority: HIGH
- Agent: doc-writer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/agent-pool.test.ts && node scripts/lint-manifests.mjs
### Description
ci-guardian emsal-deseniyle (dizin/dosya yapısı, capability-şeması birebir)
test-guardian agent'ı: uzmanlık = build×test kalitesi — hermetik test yazımı,
test-onarım hizalaması, ratchet/ledger bakımı, coverage-dürüstlüğü; writeAuthority
tests/** + scripts/lint-* sınıfı (emsal agent'lardaki authority alan-adlarıyla
birebir aynı şema). Routing'in bu agent'ı test-kind task'larda seçebilmesi için
capability/keyword alanları test/hermetic/ratchet/vitest sinyalleriyle donatılır.
Var olmayan capability alanı İCAT EDİLMEZ — agent-types şemasında ne varsa o.
