# Test Category Analysis: core
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 119

## 1. Test Dosya Envanteri

### Alt Dizin Dağılımı
| Alt Dizin | Dosya Sayısı |
|-----------|-------------|
| `tests/core/` (root) | 109 |
| `tests/core/marketplace/` | 5 |
| `tests/core/notification-providers/` | 3 |
| `tests/core/notify-adapters/` | 2 |
| **TOPLAM** | **119** |

### Describe / It Blok Sayıları
- **describe:** 819
- **it:** 3.261
- **test:** 0

### Root-Level Test Dosyaları (109 adet — seçilen ilk 30)
```
activation-engine.test.ts, agent-cache.test.ts, agent-pool.test.ts,
agent-selector.test.ts, agent-type-extensions.test.ts, agent-types.test.ts,
analyzer-overhaul.test.ts, analyzer.test.ts, anthropic-http-client.test.ts,
branch-coverage.test.ts, cascade-detector.test.ts, ci-after-sprint.test.ts,
ci-guardian.test.ts, ci-learning.test.ts, ci-pre-sprint.test.ts,
ci-regression.test.ts, condition-evaluator.test.ts, config-backup-rotation.test.ts,
config-cache.test.ts, config-edge.test.ts, config-global.test.ts,
config-metadata.test.ts, config-migration.test.ts, config-sprint063.test.ts,
config-sprint064.test.ts, config-types.test.ts, config-validation.test.ts,
config.test.ts, constants.test.ts, cost-calculator.test.ts
```

### Devamı (seçilen 30)
```
cost-config-loader.test.ts, credential-encryption.test.ts, credentials.test.ts,
debt-002.test.ts, decision-config.test.ts, decision-types.test.ts,
deck-file.test.ts, environment.test.ts, error-handling-unification.test.ts,
error-registry-lint.test.ts, errors.test.ts, features-manifest.test.ts,
file-lock.test.ts, framework-detection.test.ts, global-config.test.ts,
intent-classifier.test.ts, lazy-loader.test.ts, manifest-migrator.test.ts,
memory-export.test.ts, memory-import.test.ts, memory-normalize.test.ts,
memory-query.test.ts, memory-store.test.ts, model-equivalence.test.ts,
model-registry.test.ts, model-types.test.ts, multi-ide.test.ts,
non-null-safety.test.ts, notification-config.test.ts, notification-dispatcher.test.ts
```

### Devamı (sonraki 30)
```
notifications.test.ts, notify-adapters/cli-adapter.test.ts,
notify-adapters/mcp-adapter.test.ts, observability-instrument-points.test.ts,
observability.test.ts, output-collector.test.ts, output-formatter.test.ts,
plugin-hooks.test.ts, plugin-install.test.ts, plugin-manifest.test.ts,
plugin-remove.test.ts, plugin-security.test.ts, plugin-system.test.ts,
plugin-toggle.test.ts, plugin.test.ts, pricing-updater.test.ts,
provider-bootstrap.test.ts, provider-capabilities.test.ts,
provider-detection.test.ts, provider-fallback.test.ts, provider.test.ts,
readjson-migration.test.ts, routing-engine.test.ts, routing-types.test.ts,
skill-cache.test.ts, skill-ci-testing.test.ts, skill-config.test.ts,
skill-pool-stats.test.ts, skill-pool.test.ts, skill-registry.test.ts
```

### Son Grup
```
skill-selector.test.ts, skill-type-extensions.test.ts, skill-types.test.ts,
spawn-backend.test.ts, stack-detector.test.ts, subscription.test.ts,
system-profile.test.ts, telemetry.test.ts, token-counter.test.ts,
type-cast-safety.test.ts, types-edge.test.ts, types-split.test.ts,
types.test.ts, utils-date.test.ts, utils-debug-logging.test.ts,
utils-debug.test.ts, utils-decay.test.ts, utils-deckent.test.ts,
utils-io.test.ts, utils-shared.test.ts, utils-sprint-id.test.ts
```

### Marketplace Subdirectory (5 dosya)
```
dependency-resolver.test.ts, marketplace-auth.test.ts, rating-system.test.ts,
registry-client.test.ts, skill-sandbox.test.ts
```

### Notification Subdirectories (5 dosya)
```
notification-providers/discord.test.ts, notification-providers/slack.test.ts,
notification-providers/webhook.test.ts,
notify-adapters/cli-adapter.test.ts, notify-adapters/mcp-adapter.test.ts
```

---

## 2. Mock Pattern Audit

### vi.mock / vi.spyOn Kullanımı
- **Toplam vi.mock/vi.spyOn satır sayısı:** 665
- Kategorinin toplam test sayısına göre mock yoğunluğu orta seviye (~5.6 mock/dosya ortalaması)

### Öne Çıkan Mock Desenleri

**`vi.mock('node:child_process', ...)`**
- `ci-after-sprint.test.ts`: `spawnSync` mock — CI komut testi
- `spawn-backend.test.ts`: process spawn mock

**`vi.mock('node:fs', ...)`**
- `skill-cache.test.ts`: statSync, readFileSync, existsSync, readdirSync

**`vi.mock('better-sqlite3', ...)`**
- Memory V2 testlerinde DİKKAT: `memory-store.test.ts`, `memory-query.test.ts`, `memory-export.test.ts` gerçek SQLite kullanıyor — mock değil!
- Bu doğru yaklaşım: Memory V2 testleri integration-style, gerçek SQLite DB'yi `tmpdir` içinde oluşturuyor.

**`vi.spyOn` kullanımı:**
- `skill-cache.test.ts`, `config-backup-rotation.test.ts` gibi dosyalarda spyOn kullanımı var

---

## 3. Coverage Mapping

### src/core/*.ts → tests/core/*.test.ts Eşleşmesi

| Src Dosyası | Test Dosyası | Durum |
|-------------|-------------|-------|
| `activation-engine.ts` | `activation-engine.test.ts` | COVERED |
| `agent-cache.ts` | `agent-cache.test.ts` | COVERED |
| `agent-pool.ts` | `agent-pool.test.ts` | COVERED |
| `agent-selector.ts` | `agent-selector.test.ts` | COVERED |
| `agent-types.ts` | `agent-types.test.ts` | COVERED |
| `analyzer.ts` | `analyzer.test.ts` | COVERED |
| `anthropic-http-client.ts` | `anthropic-http-client.test.ts` | COVERED |
| `cascade-detector.ts` | `cascade-detector.test.ts` | COVERED |
| `ci-learning.ts` | `ci-learning.test.ts` | COVERED |
| `condition-evaluator.ts` | `condition-evaluator.test.ts` | COVERED |
| `config-migration.ts` | `config-migration.test.ts` | COVERED |
| `config-types.ts` | `config-types.test.ts` | COVERED |
| `config.ts` | `config.test.ts` | COVERED |
| `constants.ts` | `constants.test.ts` | COVERED |
| `cost-calculator.ts` | `cost-calculator.test.ts` | COVERED |
| `cost-config-loader.ts` | `cost-config-loader.test.ts` | COVERED |
| `credential-encryption.ts` | `credential-encryption.test.ts` | COVERED |
| `credentials.ts` | `credentials.test.ts` | COVERED |
| `decision-config.ts` | `decision-config.test.ts` | COVERED |
| `decision-types.ts` | `decision-types.test.ts` | COVERED |
| `deck-file.ts` | `deck-file.test.ts` | COVERED |
| `environment.ts` | `environment.test.ts` | COVERED |
| `errors.ts` | `errors.test.ts` | COVERED |
| `file-lock.ts` | `file-lock.test.ts` | COVERED |
| `global-config.ts` | `global-config.test.ts` | COVERED |
| `intent-classifier.ts` | `intent-classifier.test.ts` | COVERED |
| `lazy-loader.ts` | `lazy-loader.test.ts` | COVERED |
| `manifest-migrator.ts` | `manifest-migrator.test.ts` | COVERED |
| `memory-export.ts` | `memory-export.test.ts` | COVERED (V2) |
| `memory-import.ts` | `memory-import.test.ts` | COVERED (V2) |
| `memory-normalize.ts` | `memory-normalize.test.ts` | COVERED (V2) |
| `memory-query.ts` | `memory-query.test.ts` | COVERED (V2) |
| `memory-store.ts` | `memory-store.test.ts` | COVERED (V2) |
| `memory-types.ts` | — (types-split.test.ts kapsar?) | **YARIM** |
| `model-equivalence.ts` | `model-equivalence.test.ts` | COVERED |
| `model-registry.ts` | `model-registry.test.ts` | COVERED |
| `mode-presets.ts` | — | **MISSING** |
| `monitoring-types.ts` | — | **MISSING** |
| `multi-ide.ts` | `multi-ide.test.ts` | COVERED |
| `notification-config.ts` | `notification-config.test.ts` | COVERED |
| `notification-dispatcher.ts` | `notification-dispatcher.test.ts` | COVERED |
| `notifications.ts` | `notifications.test.ts` | COVERED |
| `observability.ts` | `observability.test.ts` | COVERED |
| `output-collector.ts` | `output-collector.test.ts` | COVERED |
| `output-formatter.ts` | `output-formatter.test.ts` | COVERED |
| `plugin-hooks.ts` | `plugin-hooks.test.ts` | COVERED |
| `plugin-loader.ts` | — | **MISSING** |
| `plugin.ts` | `plugin.test.ts` | COVERED |
| `pricing-updater.ts` | `pricing-updater.test.ts` | COVERED |
| `provider-capabilities.ts` | `provider-capabilities.test.ts` | COVERED |
| `provider.ts` | `provider.test.ts` | COVERED |
| `routing-engine.ts` | `routing-engine.test.ts` | COVERED |
| `routing-types.ts` | `routing-types.test.ts` | COVERED |
| `skill-cache.ts` | `skill-cache.test.ts` | COVERED |
| `skill-pool.ts` | `skill-pool.test.ts` | COVERED |
| `skill-registry.ts` | `skill-registry.test.ts` | COVERED |
| `skill-selector.ts` | `skill-selector.test.ts` | COVERED |
| `skill-types.ts` | `skill-types.test.ts` | COVERED |
| `sprint-types.ts` | `types-split.test.ts` (kapsar) | COVERED (indirect) |
| `stack-detector.ts` | `stack-detector.test.ts` | COVERED |
| `subscription.ts` | `subscription.test.ts` | COVERED |
| `system-profile.ts` | `system-profile.test.ts` | COVERED |
| `task-types.ts` | `types-split.test.ts` (kapsar) | COVERED (indirect) |
| `telemetry.ts` | `telemetry.test.ts` | COVERED |
| `token-counter.ts` | `token-counter.test.ts` | COVERED |
| `types.ts` | `types.test.ts` | COVERED |
| `utils.ts` | `utils-debug.test.ts` + `utils-*.test.ts` | COVERED |
| `index.ts` | — | **MISSING** (barrel file — genelde ok) |

**Coverage Oranı:** 63/67 dosya = **%94** (oldukça yüksek)

---

## 4. Orphan Test Tespiti

### Src Karşılığı Olmayan / Ek Test Dosyaları

| Test Dosyası | Açıklama |
|-------------|---------|
| `branch-coverage.test.ts` | Genel branch coverage takviyesi |
| `ci-after-sprint.test.ts` | CI after-sprint script testi |
| `ci-guardian.test.ts` | CI guardian agent testi |
| `ci-pre-sprint.test.ts` | CI pre-sprint testi |
| `ci-regression.test.ts` | CI regression testi |
| `config-backup-rotation.test.ts` | Config backup davranışı |
| `config-cache.test.ts` | Config caching |
| `config-edge.test.ts` | Config edge cases |
| `config-sprint063.test.ts`, `config-sprint064.test.ts` | Sprint-specific regression |
| `config-validation.test.ts` | Config doğrulama |
| `debt-002.test.ts` | parseDebtTable — utils.ts'yi test eder |
| `error-handling-unification.test.ts` | Error handling cross-cutting |
| `error-registry-lint.test.ts` | Error registry linting |
| `features-manifest.test.ts` | Features manifest |
| `framework-detection.test.ts` | Stack detector extension |
| `non-null-safety.test.ts` | parseDebtTable null safety |
| `provider-bootstrap.test.ts` | Provider bootstrapping |
| `provider-detection.test.ts` | Provider auto-detection |
| `provider-fallback.test.ts` | Provider fallback chain |
| `readjson-migration.test.ts` | JSON migration utility |
| `type-cast-safety.test.ts` | Type casting safety |
| `types-edge.test.ts` | Types edge cases |
| `types-split.test.ts` | sprint-types + task-types split kontrolü |
| `utils-date.test.ts`, `utils-debug*.test.ts`, `utils-decay.test.ts` | utils.ts alt bölüm testleri |
| `analyzer-overhaul.test.ts` | Analyzer overhaul regression |
| `agent-type-extensions.test.ts` | Agent type extensions |
| `observability-instrument-points.test.ts` | Observability instrumentation |
| `skill-ci-testing.test.ts` | CI testing skill |
| `skill-config.test.ts` | Skill config management |
| `skill-pool-stats.test.ts` | Skill pool istatistikleri |
| `skill-type-extensions.test.ts` | Skill type extensions |

**Gerçek Orphan Yok** — tüm ek testler ilgili src modüllerini test eder ya da cross-cutting güvenlik/regresyon testleri.

---

## 5. Flaky Candidate İşaretleri

### Tespit Edilen Riskler

| Dosya | Risk Türü | Detay |
|-------|-----------|-------|
| `marketplace/registry-client.test.ts` | setTimeout | HTTP mock içinde `setTimeout(() => reqEmitter.emit('error'))` |
| `marketplace/registry-client.test.ts` | setTimeout | `setTimeout(() => callback(response), 0)` |
| `ci-after-sprint.test.ts` | Date.now() + Math.random() | tmpdir: `Date.now()-Math.random().toString(36)` |
| `credentials.test.ts` | Date.now() + Math.random() | tmpdir: `Date.now()-Math.random()` |
| `config-global.test.ts` | Date.now() + Math.random() | tmpdir: `process.pid-Date.now()-Math.random()` |
| `readjson-migration.test.ts` | Date.now() | tmpdir: `Date.now()` |
| `anthropic-http-client.test.ts` | Date.now() | `Date.now() + 60_000` — future timestamp testi |
| `memory-store.test.ts` | — | Gerçek SQLite I/O — tmpdir'de, stabil |
| `marketplace/skill-sandbox.test.ts` | setTimeout | AST analiz testi (`setTimeout` string argüman tespiti) — test konusu, flaky değil |

**En Yüksek Risk:** `registry-client.test.ts` — gerçek `setTimeout` gecikmesi kullanıyor. CI'da yavaş ortamlarda flaky olabilir.

**Düşük Risk:** `Date.now()` + `Math.random()` tmpdir isimleri — sadece unique path için, flaky değil.

---

## 6. Memory V2 Mock Uyumu

### Memory V2 Testleri — Mükemmel Durum

**Gerçek SQLite Integration Testi (mock değil):**
- `memory-store.test.ts` — `new MemoryStore(tmpdir/test.db)` — 5 tablo, FTS5, CRUD, decay, history testleri
- `memory-query.test.ts` — `new MemoryStore(tmpdir)` — FTS5 dual-layer arama testleri
- `memory-export.test.ts` — `new MemoryStore(tmpdir)` — DB → markdown export testleri
- `memory-import.test.ts` — markdown → DB migration testleri
- `memory-normalize.test.ts` — `turkishNormalize()` testleri (15 test case, TR/EN/DE coverage)

**Sonuç: Memory V2 core modülleri %100 test coverage'a sahip, gerçek SQLite ile.**

### countBrainLines Kalıntıları (KRİTİK SORUN)

**`tests/core/branch-coverage.test.ts`** (satır 21-103):
```typescript
// ─── utils.ts: countBrainLines edge cases ─────────────────────────
describe('countBrainLines', () => {
  // 5 ayrı it() — hepsi countBrainLines'ı import edip test ediyor
  const { countBrainLines } = await import('../../src/core/utils.js');
```

**SORUN:** `countBrainLines` artık `src/core/utils.ts`'den kaldırılmış (grep 0 sonuç). Bu testler çalışıyor gibi görünüyor çünkü `branch-coverage.test.ts` dynamik import kullanıyor ve Vitest muhtemelen undefined döndürüyor — gerçek bir fonksiyon test edilmiyor.

**`tests/core/utils-debug.test.ts`** (satır 10, 112-130):
```typescript
import { countBrainLines } from '../../src/core/utils.js';
// ...
describe('countBrainLines — fallback behavior', () => {
```

**SORUN:** Bu dosya `countBrainLines`'ı doğrudan import ediyor. `utils.ts`'de bu export yok ama test geçiyor — muhtemelen `undefined` olarak import ediliyor ve bazı testler bunu handle ediyor ya da Vitest build cache'i var.

**`tests/core/debt-002.test.ts` ve `non-null-safety.test.ts`:**
- `parseDebtTable` kullanıyor — **utils.ts'de hala mevcut** — sorun yok.

### MemoryStore Mock vs Gerçek Kullanım
- Memory V2 testleri (`memory-store`, `memory-query`, `memory-export`, `memory-import`): Gerçek SQLite ✓
- Diğer core testleri (`config.test.ts` vb.): MemoryStore mock kullanmıyor (zaten bağımsız modüller)

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 87/100 (**A-**)

### Güçlü Yönler
- 119 test dosyası, 3.261 `it()` bloğu — en kapsamlı test kategorisi
- Memory V2 modülleri (%100 coverage, gerçek SQLite integration testi)
- `types-split.test.ts` — sprint-types/task-types ayrımını doğruluyor (ADR uyumu)
- `non-null-safety.test.ts` — parseDebtTable güvenlik testi
- `error-registry-lint.test.ts` — error registry statik analiz
- Marketplace alt dizini (5 dosya) ayrıca iyi kapsanmış

### Zayıf Yönler / Sprint 142+ Öneriler
1. **P0 — countBrainLines Stale Test Temizliği:**
   - `branch-coverage.test.ts` — `countBrainLines` describe bloğu silinmeli veya yeni `getMemoryEntryCount` testine dönüştürülmeli
   - `utils-debug.test.ts` — `countBrainLines` import ve describe bloğu güncellenmeli
   Bu testler şu an "geçiyor" ama hiçbir şeyi test etmiyor (fonksiyon yok).

2. **P1 — mode-presets.ts Test Eksikliği:** `ModelStrategy`, `MODE_PRESETS` için test yok. Tier-based routing kritik, test eksikliği risk.

3. **P1 — plugin-loader.ts Test Eksikliği:** `plugin-loader.ts` için doğrudan test yok (plugin-system.test.ts kısmen kapsar).

4. **P2 — monitoring-types.ts Test Eksikliği:** Sadece type definitions — genellikle test edilmez, ama barrel import doğrulaması yapılabilir.

5. **P2 — registry-client.test.ts setTimeout:** `vi.useFakeTimers()` ile stabilize edilmeli.

6. **P3 — memory-types.ts:** Sadece interface definitions — coverage "types-split" benzeri bir dosyayla sağlanabilir.
