# CLI-SURFACE-REFORM DİLİM-1a: SURFACE-CONTRACT REGISTRY + ÜRETİLEN HELP (MASTER 545; owner v2.1 onayı)

## Goal

CLI komut-yüzeyi tek makine-okunur kaynaktan yönetilir hale gelir: surface-contract
registry (T1) komut-ağacını, grupları, EN-açıklama-anahtarlarını ve durumu (visible /
advanced / deprecated→removal) taşır; kök `-h` çıktısı bu registry'den ÜRETİLİR (T2 —
4 grup + Advanced, owner v2.1 şeması, EN-default); registry↔gerçek-kayıt uyum-gate'i
drift'i fail-closed yakalar (T3); mevcut `cli-mcp-parity` gate'i registry'yi tek-kaynak
olarak tüketir (T4). Ürün karşılığı: "80 düz komut" enkazı biter; help/docs/parity tek
kaynaktan; unutulan-bağlantılı-yüzey sınıfı build-hatasına döner.

## Execution contract

- Kalite barı aynen (i18n-FIRST · 0-hardcode · hermetik test · mevcut-pattern · assertion
  zayıflatma yasak). Test komutları TASK-SCOPED ve TEKİL. Authority dosyaları Reads'te.
- Bu dilim DAVRANIŞ değiştirmez: komutlar çalışmaya devam eder; yalnız help-yüzeyi ve
  gate'ler değişir. Kaldırma/birleştirme (12'lik liste, approvals-federasyonu, audit verify)
  DİLİM-1b'nin işidir — burada YAZILMAZ.
- Kök `-h` EN-default; TR config-lang ile (mevcut i18n mekanizması).

## Task 1: Surface-contract registry — tek makine-okunur komut-kaynağı
- Files: src/cli/surface-registry.ts, tests/cli/surface-registry.test.ts
- Reads: src/cli/index.ts, src/cli/commands/gateway.ts, scripts/cli-mcp-parity-baseline.json, follow-up-works/cli-surface-reform-karar.md
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/surface-registry.test.ts
### Description
Yeni modül src/cli/surface-registry.ts: her top-level komut için typed kayıt —
{name, group: 'run'|'observe'|'control'|'system'|'advanced', summaryKey (i18n anahtarı,
EN metin messages kataloğunda), aliases, status: 'visible'|'advanced'|'deprecated',
deprecation?: {replacement, removalNote}} — owner-onaylı v2.1 şeması Reads'teki
karar-dokümanının §5'inde (Run: do·run·plan·start·runs·review / Observe:
status·watch·inspect·history·retro / Control: approvals·kill·recover·cleanup·autonomous·
nervous·xverify / System: init·config·doctor·sync·upgrade·connect·limits·usage·agent·
skill·models·memory·serve·bot·mcp / geri kalan HER kayıtlı komut: advanced;
dashboard·attach·output·plan-nl·archive-debt·confirmations·checkpoint·audit-verify·
autonomous-mission·explain·recall·remember: status deprecated + replacement). Kayıt-evreni
src/cli/index.ts'teki register* çağrılarının TAMAMIDIR (gizli gateway-runtime dahil,
status advanced+hidden-notu). Registry pure-data + tip-güvenli erişim fonksiyonları
(listByGroup, findCommand, deprecatedSet) sunar; komut-davranışına DOKUNMAZ. Test:
şema-doğruluğu, grup-kapsayışı (register-evreni ⊆ registry), deprecated-replacement
bütünlüğü, i18n-anahtarlarının EN kataloğunda varlığı.

## Task 2: Üretilen kök-help — 4 grup + Advanced, EN-default
- Files: src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/root-help-generated.test.ts
- Reads: src/cli/surface-registry.ts, follow-up-works/cli-surface-reform-karar.md, src/cli/helpers/i18n.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/root-help-generated.test.ts
### Description
Kök `deckent -h` artık commander'ın 80-satır düz listesini basmaz: registry'den üretilen
gruplu özet basar — v2.1 şablonu (karar-dokümanı §5): usage satırı + prompt-ipucu satırları
+ 4 grup-satırı (grup-adı EN + komut-adları) + `Advanced   deckent help advanced` satırı +
deprecated-uyarı bloğu. commander configureHelp/addHelpText mevcut-pattern'iyle yapılır
(komut kayıtları SİLİNMEZ — davranış aynen; yalnız görüntü). `deckent help advanced`
registry'nin advanced+deprecated tam listesini basar. Tüm görünür metinler getMessage
en+tr (EN-default; mevcut dil-çözümü). Test: gerçek commander-instance ile üretilen help
string'i — 5 başlık var, 80-düz-liste yok, deprecated-blok replacement'ları doğru,
advanced-listesi registry ile birebir.

## Task 3: Registry↔kayıt uyum-gate'i — fail-closed drift
- Files: scripts/lint-cli-surface.mjs, tests/scripts/lint-cli-surface.test.ts, package.json
- Reads: src/cli/surface-registry.ts, src/cli/index.ts, scripts/lint-layer-shims.mjs
- Priority: HIGH
- Agent: implementer
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/lint-cli-surface.test.ts
### Description
Yeni gate scripts/lint-cli-surface.mjs: (a) src/cli/index.ts register-evrenini statik
çıkarır (register* çağrıları), (b) registry kayıt-setiyle iki-yönlü karşılaştırır —
kayıtlı-ama-registry'siz komut = FAIL (yeni-komut registry'siz giremez), registry'de-olup-
kayıtsız = FAIL (ölü kayıt); (c) deprecated-set'in replacement'ları registry'de var-olan
komutlar olmalı. package.json lint:gates zincirine eklenir (mevcut gate-ekleme deseni).
Test: tmpdir-fixture ile üç FAIL sınıfı + gerçek-repo yeşil koşusu.

## Task 4: MCP-parity gate'inin registry-tüketimi
- Files: scripts/lint-cli-mcp-parity.mjs, tests/scripts/cli-mcp-parity-registry.test.ts
- Reads: src/cli/surface-registry.ts, scripts/cli-mcp-parity-baseline.json
- Priority: NORMAL
- Agent: implementer
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/cli-mcp-parity-registry.test.ts
### Description
Mevcut cli-mcp-parity gate'i CLI-komut listesini kendi taramasıyla çıkarıyor; registry
tek-kaynak olunca gate CLI-tarafını registry'den okur (MCP-tarafı mevcut kalır);
baseline-ratchet semantiği ve mevcut baseline dosyası AYNEN korunur — yalnız kaynak
değişir, sayılar oynamaz (oynarsa dürüst FAIL). Test: registry-kaynaklı liste ile
eski-tarama listesinin bugünkü repo'da birebir eşitliği (geçiş-güvence pini) + gate'in
gerçek-repo yeşil koşusu.
