# DIRECTIVES — DALGA-4 full-suite borç-ödeme (landing-öncesi; codex; 2026-08-21)

## Goal

Full-suite 35-dosya/98-test kırmızısının ödenmesi — landing bu paket yeşile
dönmeden YAPILMAZ. Kök-neden-1 (tek fix ~20 kırık): F4-tier threading'i
getModelTier'ı fail-hard çağırıyor; legacy-alias/fixture modellerinde
('sonnet', 'qwen3.6:27b') prompt-kompozisyonu THROW ediyor — prompt-builder
ASLA fırlatmamalı. Kalanlar: cursor-katalog sayım-pinleri + repo-ratchet
borçları + closure-scan senkron-regen'i. Pinler AMAÇ KORUNARAK hizalanır —
pin-gevşetme/silme YASAK; davranış-değişimi tespit edilirse NO_GO + rapor.
Prose'da dosya-adı DAİMA tam-yol.

## Task 1: tier-çözümü fail-soft (kök-neden-1)

### Description
src/orchestra/prompt-god-template.ts ve/veya src/orchestra/task-builder.ts
içindeki F4-tier çözümü (getModelTier çağrısı) fail-soft yapılır: model
registry'de yoksa THROW yerine tier=undefined → tier-koşullu prompt-eklemeleri
sessizce düşer, kompozisyon aynen devam eder (fail-soft sözleşmesi:
tests/orchestra/allowlist-flag-wire.test.ts 'fails soft to off... no throw'
pini bunun kanunu). Fix sonrası şu ALTI dosya koşulur ve yeşile döner; hâlâ
kırık kalan pin varsa amaç-koruyarak hizalanır (örn. byte-identical pinleri
kanonik-model fixture'ıyla tier-bloğu içerecek şekilde ya da alias-fixture'da
bloksuz — pinin AMACI neyse o):
tests/orchestra/allowlist-flag-wire.test.ts, tests/orchestra/ctx-population-wire.test.ts,
tests/orchestra/handoff-prompt-inject.test.ts, tests/orchestra/dependency-aggregate-fix-aware.test.ts,
tests/e2e/worker-comms-flow.test.ts, tests/orchestra/as2-p2-mixed-fleet.test.ts,
tests/core/agent-pool.test.ts
- Files: src/orchestra/prompt-god-template.ts, src/orchestra/task-builder.ts, tests/orchestra/allowlist-flag-wire.test.ts, tests/orchestra/ctx-population-wire.test.ts, tests/orchestra/handoff-prompt-inject.test.ts, tests/orchestra/dependency-aggregate-fix-aware.test.ts, tests/e2e/worker-comms-flow.test.ts, tests/orchestra/as2-p2-mixed-fleet.test.ts, tests/core/agent-pool.test.ts
- Test: npx vitest run tests/orchestra/allowlist-flag-wire.test.ts tests/orchestra/ctx-population-wire.test.ts tests/orchestra/handoff-prompt-inject.test.ts tests/orchestra/dependency-aggregate-fix-aware.test.ts tests/e2e/worker-comms-flow.test.ts tests/orchestra/as2-p2-mixed-fleet.test.ts tests/core/agent-pool.test.ts tests/orchestra/prompt-god-template.test.ts && npx tsc --noEmit
- Model: gpt-5.6-sol

### GO Criteria
Bilinmeyen-model fixture'larında prompt-kompozisyonu fırlatmaz (fail-soft pin);
yedi kırık test-dosyası + prompt-god-template regresyonu yeşil; tier-bloğu
kanonik-modellerde çalışmaya devam eder (pin); tsc temiz.

## Task 2: cursor-katalog sayım-pinleri

### Description
CURSOR_MODELS'in CANONICAL_MODELS'e girmesi (sprint-592 kök-çözümü) sayım/üyelik
pinlerini kırdı. tests/core/model-equivalence.test.ts (4 kırık: MODEL_TIERS
toplam-sayı + üç getModelsInTier tier-üyelik testi) ve
tests/core/model-types.test.ts (2 kırık: '18-model canonical offline catalog'
sayımı + identity API-id tutarlılığı) yeni kataloğa hizalanır — cursor-grok-4.6
4'lüsü (low→economy, medium→standard, high→premium, xhigh→premium_plus)
beklenen-kümelere eklenir, toplam-sayı sabitleri güncellenir. Pin-amaçları
korunur (sayım-pini sayım-pini kalır; gevşetme yok).
- Files: tests/core/model-equivalence.test.ts, tests/core/model-types.test.ts
- Test: npx vitest run tests/core/model-equivalence.test.ts tests/core/model-types.test.ts && npx tsc --noEmit
- Model: gpt-5.6-sol

### GO Criteria
Altı kırık test yeşil; pinler yeni katalog-gerçeğini TAM sayımla doğruluyor
(cursor-4'lü açıkça listede); tsc temiz.

## Task 3: mesaj-katalog + komut-kayıt ratchet borçları

### Description
591/592 dalgalarının kataloğa eklediği anahtarlar ve yeni CLI alt-komutu
ratchet/registry testlerini kırdı. Düzeltilecekler:
(1) tests/cli/command-registry.test.ts — 'approvals rules' alt-komut ailesi
COMMAND_REGISTRY'ye (cli yüzeyiyle) kaydedilir (kayıt-dosyasını testin işaret
ettiği registry kaynağında yap).
(2) tests/cli/cli-surface-consolidation-battery.test.ts (2 kırık) +
tests/cli/stale-adr-surface.test.ts — yeni eklenen messages.ts anahtarlarında
numeric-ADR/legacy-ADR atıfı taraması: ihlal-eden anahtar metni varsa metin
mekanizma-atfına çevrilir (anahtar SİLİNMEZ); ratchet-pin listeleri gerçek
duruma hizalanır. (3) tests/cli/cli-surface-consolidation-battery.test.ts (d)
parity-lint: scripts/lint-cli-mcp-parity.mjs'nin gerçek-repo koşusu — yeni
'approvals rules' yüzeyinin MCP-parity kaydı/muafiyeti parity-lint'in KENDİ
sözleşmesine göre eklenir. (4) tests/brain/decisions.test.ts — .brain/exports/
decisions.md ADR format-pini: kırılma generated-export'tan geliyorsa export'u
yeniden üretmek yerine testin işaret ettiği eksik alanın kaynağını düzelt;
generated dosya elle DÜZENLENMEZ, kaynağından regen edilir.
- Files: src/cli/commands/approvals.ts, src/cli/helpers/messages.ts, tests/cli/command-registry.test.ts, tests/cli/cli-surface-consolidation-battery.test.ts, tests/cli/stale-adr-surface.test.ts, tests/brain/decisions.test.ts
- Not: COMMAND_REGISTRY ve parity-kayıt dosyaları farklı yerlerdeyse (testin
  import'larından bul) o dosyaları da düzenle ve result-notes'ta bildir.
- Test: npx vitest run tests/cli/command-registry.test.ts tests/cli/cli-surface-consolidation-battery.test.ts tests/cli/stale-adr-surface.test.ts tests/brain/decisions.test.ts && npx tsc --noEmit
- Model: gpt-5.6-sol

### GO Criteria
Altı kırık test yeşil; hiçbir messages-anahtarı silinmedi; parity-lint gerçek
repoda exit-0; tsc temiz.

## Task 4: kod-ratchet + envanter borçları

### Description
Yeni üretim-modülleri/hata-yolları kod-ratchet'larını kırdı:
(1) tests/core/error-registry-lint.test.ts (2) + tests/core/error-handling-unification.test.ts —
yeni raw-throw/hata-sınıfları (approval-rules-engine dahil) kanonik baseline'a
ratchet-disipliniyle işlenir (baseline SIKILAŞIR ya da yeni kayıt tipli-kayda
bağlanır; headroom-gevşetme YASAK — testlerin kendi yorumlarındaki prosedürü izle).
(2) tests/docs/layer-shims.test.ts — yeni governed-dosya geçişleri
layer-shims.json registry'sine kaydedilir (gerçek-crossing yoksa kod düzeltilir).
(3) tests/governance/agent-discovery-census.test.ts — census tasarım-§1
kümesiyle çift-yön drift: yeni keşfedilen agent-yüzeyi census-kaynağına eklenir
ya da yanlış-keşif düzeltilir (testin drift-raporunu oku, gerçeğe göre karar ver
ve result-notes'ta hangi yönde düzelttiğini kanıtla).
- Files: scripts/lint-error-registry.mjs, tests/core/error-registry-lint.test.ts, tests/core/error-handling-unification.test.ts, tests/docs/layer-shims.test.ts, tests/governance/agent-discovery-census.test.ts
- Not: baseline/registry gerçek dosyaları (error-baseline, layer-shims.json,
  census kaynağı) testlerin import-yollarından bulunur — onları da düzenle ve
  result-notes'ta tam-yollarıyla bildir.
- Test: npx vitest run tests/core/error-registry-lint.test.ts tests/core/error-handling-unification.test.ts tests/docs/layer-shims.test.ts tests/governance/agent-discovery-census.test.ts && npx tsc --noEmit
- Model: gpt-5.6-sol

### GO Criteria
Beş kırık test yeşil; hiçbir ratchet gevşetilmedi (baseline-sayıları yönü
result-notes'ta kanıtlı); tsc temiz.
