# 2026-07-21 — `scripts/` Tek-Tek Analiz Notu

> **Amaç:** Temizlik-programının scripts-ayağı: 97 girdi (93 script + 4 baseline-JSON + 3 alt-dizin)
> tek tek sınıflandırıldı — kritik / aktif-gate / manuel-araç / tek-seferlik-bayat / kırık.
> **Yöntem:** 2 bağımsız keşif (baş-yorum + npm/CI/test/script-arası bağlanma + git-tarih + bayatlık) +
> yük-taşıyan iddialarda el-teyidi. **Yalnız analiz — aksiyon yok; kararlar Alperen'den.**
> Kayıt yeri bu klasör; kardeş-defter: `2026-07-21-dokuman-temizlik-karar-tablosu.md`.
> **✅ Karar-turu (Alperen 2026-07-21): SEÇMELİ** — 14 SİL-aday için toptan-onay YOK; her script
> temizlik-gününde tek-tek onaya sunulacak. Aksiyon yok.

## Özet dağılım

| Hüküm | Adet | Anlam |
|---|---|---|
| **KRİTİK** | 6 | build/publish/CI-güvenlik zinciri — dokunulmaz |
| **AKTİF-GATE** | ~35 | lint/test/docs/CI kapısı olarak canlı |
| **MANUEL-ARAÇ** | ~35 | elle çalıştırılan canlı dev-aracı |
| **TEK-SEFERLİK-BAYAT** | 12 | işi bitmiş sprint-artığı — **SİL-ADAYI** |
| **KIRIK/DEVREDİLMİŞ** | 2 | yerine geçen var — SİL-ADAYI (testiyle birlikte) |

## 1. KRİTİK (6) — dokunulmaz

| Script | Rol |
|---|---|
| `copy-assets.mjs` | `npm run build` zinciri (asset kopyalama + fix:bin) |
| `clean.mjs` | build zinciri dist-temizliği |
| `build-dashboard.mjs` | `build:all` dashboard-vite ayağı |
| `validate-publish.mjs` | publish 6-gate otoritesi (npm + publish.yml + release.yml; `pack-baseline.json` okur) |
| `check-dependency-audit.mjs` | CI güvenlik-gate'i (ci.yml + release.yml; `audit-exceptions.json` okur) |
| `security/secret-baseline.mjs` | secret-scan.yml CI gate'i (`.secrets-baseline` okur) |

## 2. AKTİF-GATE (canlı kapılar — TUT)

- **`lint:gates` zinciri (CI'da `npm run lint` içinde):** lint-cli-mcp-parity · lint-i18n-hardcode ·
  lint-layer-shims · lint-test-hermeticity · verify-gitignore · routing-distribution(--ci) ·
  lint-desktop-api-sync · lint-manifests · builtins-drift-check.
- **Ayrı CI adımları:** lint-mcp-instructions (ci.yml) · xplat-install-smoke (cross-platform-e2e.yml).
- **Publish-anı gate'leri:** lint-identity-md + update-readme-stats (release + prepublishOnly) ·
  lint-links (validate-publish gate-6; ayrıca `lint:link`).
- **npm-gate + testli:** adr-validator (lint:adr) · check-error-handling (lint:errors) ·
  gen-reference-docs (docs:ref:check) · generate-cli-docs (docs:generate-cli) ·
  ccverify-affected + affected-tests (verify:affected).
- **ci-sim kümesi (9 modül, `test:ci-sim`):** ci-sim-{capacity, dependencies, durable-json, process,
  receipt, runner, snapshot, state, workspace} — test-ci-sim.mjs'nin kütüphane-modülleri; küme bütündür,
  tek dosyası silinemez.
- **Test-korumalı smoke-lib'ler (CI'da testleri koşar):** agentic-do-verify · auth-mode-resolution-smoke ·
  autonomous-smoke · chat-native-smoke · dashboard-e2e-smoke · directives-stress-simulator
  (⚠️ DIRECTIVES.md'ye yazar — env/--force korumalı).

## 3. MANUEL-ARAÇ (canlı, elle — TUT)

test-ci-sim (npm `test:ci-sim` girişi) · test-e2e-surfaces · pre-flight-health-check
(**`deckent doctor --pre-flight` spawn eder** — doctor.ts:1517, silinmemeli) · release-prepare
(sürüm-üçlü+CHANGELOG; bump-version.sh'ı emdi) · sync-manifest (features-manifest üretici; runtime tüketiyor) ·
sync-core-memory · series-metrics · repl-smoke-verify · serve-localhost-smoke · multi-provider-smoke ·
multi-provider-fleet-smoke · rt-latency-verify (verify:rt-latency) · ink-pty-{test, tool-verify, native-verify}
(verify:repl-tools / verify:native-repl) · extract-traces · token-usage-report · measure-prompt-cost ·
prompt-linter (PROMPT.md kalite-skoru — lint-* ailesiyle mükerrer DEĞİL) · dead-code-audit ·
audit-user-surfaces · ci-baseline-detect · run-self-audit.ts · clean-clone-smoke · fresh-env-test.sh ·
smoke-deck-lifecycle · smoke-init-noninteractive · provider-free-smoke · backfill-relations
(memory-CLI'ın önerdiği admin-aracı) · sprint-retroactive-reclassify (DB-admin) · memory/export-adr-fs
(ADR-046 ters-senkron) · bundle-builtins (⚠️ kendi başlığı premisinin geçersizleştiğini yazıyor
[:13-16] — körce çalıştırılmamalı; gözden-geçir-adayı) · **sync-to-product** (ADR-D-008: tek-seferlik
GA-2 göç-aracı, recurring YASAK — **2026-07-26 göçünün building-block'u, testli, göçe kadar TUT**).

## 4. TEK-SEFERLİK-BAYAT (12) — SİL-ADAYI ⬜

| Script | Kanıt |
|---|---|
| `589-prototip-daemon.mjs` | sprint-589 tasarım-turu daemon'u; tur bitti, wiring yok |
| `nova-tasarim-loop.mjs` | aynı 589 tasarım-turu koşucusu; unwired |
| `dt1-telsiz-smoke.mjs` | sprint-583 DT-1 tek-atış smoke; wiring yok |
| `n3-desktop-pty-smoke.mjs` | sprint-583/N3 tek-atış; unwired (+ desktop NEGATIVE-SPACE) |
| `n4-git-smoke.mjs` | sprint-583/N4 tek-atış; unwired |
| `surf-approval-smoke.mjs` | SURF-treni tek-atış; unwired |
| `surf6-cross-surface-smoke.mjs` | SURF-6 dogfood tek-atış; unwired |
| `surf7-readonly-smoke.mjs` | SURF-7 cutover tek-atış; unwired |
| `generate-analysis-inventory.mjs` | hardcoded `TODAY='2026-07-18'` + sabit çıktı-yolu (:14-16) — tek-güne çakılı |
| `backfill-sprint-log-rows.mjs` | Sprint-198 tek-seferlik reconstruction (testli — silinirse testi de) |
| `memory/backfill-stub-entries.mjs` | Sprint-169 tek-seferlik migration (testli — silinirse testi de) |
| `bump-version.sh` | RETIRED stub — release-prepare.mjs'ye yönlendiriyor (:2); testi de var |

## 5. KIRIK / DEVREDİLMİŞ (2) — SİL-ADAYI ⬜

| Script | Durum |
|---|---|
| `verify-publish.sh` | En eski dosya (2026-03-24); rolünü validate-publish.mjs devraldı. **Tam-orphan DEĞİL** (el-teyit): `tests/scripts/scripts.test.ts:82-97` hâlâ 3 testle koşuyor → silme = script + o describe-bloğu birlikte |
| `archive/validate-publish.ts.bak` | Eski yedek; referans sıfır — düz sil |

## 6. Baseline-JSON eşlemesi (5/5 sahipli — hepsi TUT, sahibiyle yaşar)

`audit-exceptions.json`→check-dependency-audit · `cli-mcp-parity-baseline.json`→lint-cli-mcp-parity ·
`model-literal-baseline.json`→lint-no-model-literal · `pack-baseline.json`→validate-publish ·
`spawnsync-baseline.json`→lint-no-spawnsync.

## 7. Yol-boyu bulgular (temizlikten bağımsız; born-adayı)

1. **İki ratchet CI'da zorlanmıyor:** `lint:spawnsync` (Kanun/test-hermetiklik kuralı) ve
   `lint:model-literal` (Kanun-10 bekçisi!) npm-alias'ı var ama `lint:gates` zincirinde DEĞİL ve hiçbir
   workflow'da yok (el-teyit: workflows grep=0) — fiilen manuel-ratchet. Kanun-10'un mekanik bekçisinin
   CI-dışı olması dikkat çekici.
2. **Mükerrer çift:** `zero-hardcode-audit.mjs` (Sprint-208 eski yaklaşım) ≈ `lint-no-model-literal.mjs`
   (born-431 baseline-ratchet) — ikisi de src'de model-literal arıyor; eskisi emeklilik-adayı.
3. **Gate-kalitesinde ama bağsız:** `lint-rule-vocabulary.mjs` (born-589) + `validate-guidance.mjs`
   (U4/PCOMP-8) hiçbir npm/CI/test'e bağlı değil — ya bağlanmalı ya bayat-listesine.
4. **`bundle-builtins.mjs` premisi çürümüş** (kendi W7-notu: ".deckent canonical" varsayımı artık geçersiz).
5. **Göç-bağı:** `sync-to-product.mjs` 26 Temmuz göçünün aracı — scripts-temizliği göçten ÖNCE yapılırsa
   bu dosya kesinlikle korunmalı.
