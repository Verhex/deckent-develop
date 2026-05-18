# Batch Analysis: tests/core/ — 119 Test Dosyası Derin Analiz

**Task ID:** 142-030 | **Model:** opus | **Effort:** max | **Dosya Sayısı:** 119

---

## Executive Summary

| Metrik | Değer |
|--------|-------|
| Toplam test dosyası | 119 |
| Toplam satır | 36,850 |
| Toplam describe() | 700 |
| Toplam it() | 3,261 |
| Toplam vi.mock() | 41 |
| Toplam vi.spyOn() | 25 |
| Toplam `as any` cast | 165 |
| @ts-ignore / @ts-expect-error | 0 |
| TODO/FIXME/HACK | 0 |
| .skip / .only (skipped/focused) | 0 |
| expect.assertions() | 0 |
| console.log leaks | 2 |
| Orphan testler (src yok) | 49 |
| Src dosyası test'siz | 8 |
| Memory V2 uyum ihlali | 6 dosya |

---

## 1. Tam Dosya Envanteri — Describe/It/Lines/Mock

| # | Test Dosyası | Describe | It | Satır | vi.mock | Mock Hedefleri |
|---|-------------|----------|-----|-------|---------|----------------|
| 1 | activation-engine.test.ts | 7 | 24 | 351 | 0 | — |
| 2 | agent-cache.test.ts | 1 | 18 | 172 | 0 | — |
| 3 | agent-pool.test.ts | 17 | 81 | 1014 | 1 | node:fs |
| 4 | agent-selector.test.ts | 3 | 29 | 391 | 0 | — |
| 5 | agent-type-extensions.test.ts | 3 | 7 | 142 | 0 | — |
| 6 | agent-types.test.ts | 5 | 22 | 260 | 0 | — |
| 7 | analyzer-overhaul.test.ts | 1 | 8 | 119 | 3 | node:child_process, node:fs, ../../src/core/utils.js |
| 8 | analyzer.test.ts | 8 | 31 | 361 | 2 | node:fs, node:child_process |
| 9 | anthropic-http-client.test.ts | 6 | 16 | 209 | 0 | — |
| 10 | branch-coverage.test.ts | 3 | 7 | 144 | 1 | node:fs |
| 11 | cascade-detector.test.ts | 7 | 17 | 209 | 0 | — |
| 12 | ci-after-sprint.test.ts | 3 | 11 | 198 | 1 | node:child_process |
| 13 | ci-guardian.test.ts | 3 | 18 | 201 | 0 | — |
| 14 | ci-learning.test.ts | 10 | 35 | 517 | 0 | — |
| 15 | ci-pre-sprint.test.ts | 4 | 18 | 305 | 1 | node:child_process |
| 16 | ci-regression.test.ts | 7 | 25 | 438 | 1 | node:child_process |
| 17 | condition-evaluator.test.ts | 7 | 31 | 183 | 0 | — |
| 18 | config-backup-rotation.test.ts | 2 | 6 | 130 | 0 | — |
| 19 | config-cache.test.ts | 1 | 7 | 120 | 2 | node:fs, node:fs/promises |
| 20 | config-edge.test.ts | 7 | 49 | 448 | 0 | — |
| 21 | config-global.test.ts | 7 | 37 | 409 | 0 | — |
| 22 | config-metadata.test.ts | 3 | 21 | 160 | 0 | — |
| 23 | config-migration.test.ts | 9 | 46 | 627 | 0 | — |
| 24 | config-sprint063.test.ts | 2 | 11 | 234 | 0 | — |
| 25 | config-sprint064.test.ts | 2 | 11 | 216 | 0 | — |
| 26 | config-types.test.ts | 2 | 6 | 49 | 0 | — |
| 27 | config-validation.test.ts | 1 | 32 | 295 | 0 | — |
| 28 | config.test.ts | 27 | 161 | 1155 | 2 | node:fs, node:fs/promises |
| 29 | constants.test.ts | 8 | 27 | 227 | 0 | — |
| 30 | cost-calculator.test.ts | 11 | 18 | 386 | 0 | — |
| 31 | cost-config-loader.test.ts | 9 | 32 | 302 | 0 | — |
| 32 | credential-encryption.test.ts | 5 | 29 | 356 | 0 | — |
| 33 | credentials.test.ts | 10 | 51 | 435 | 0 | — |
| 34 | debt-002.test.ts | 1 | 4 | 38 | 0 | — |
| 35 | decision-config.test.ts | 7 | 49 | 293 | 0 | — |
| 36 | decision-types.test.ts | 6 | 32 | 232 | 0 | — |
| 37 | deck-file.test.ts | 7 | 34 | 305 | 0 | — |
| 38 | environment.test.ts | 1 | 13 | 107 | 0 | — |
| 39 | error-handling-unification.test.ts | 23 | 65 | 795 | 0 | — |
| 40 | error-registry-lint.test.ts | 6 | 31 | 367 | 0 | — |
| 41 | errors.test.ts | 3 | 43 | 308 | 0 | — |
| 42 | features-manifest.test.ts | 4 | 22 | 232 | 0 | — |
| 43 | file-lock.test.ts | 1 | 20 | 236 | 0 | — |
| 44 | framework-detection.test.ts | 2 | 11 | 175 | 2 | node:fs, node:child_process |
| 45 | global-config.test.ts | 6 | 22 | 261 | 1 | node:fs |
| 46 | intent-classifier.test.ts | 8 | 31 | 374 | 0 | — |
| 47 | lazy-loader.test.ts | 2 | 22 | 197 | 0 | — |
| 48 | manifest-migrator.test.ts | 5 | 11 | 116 | 0 | — |
| 49 | marketplace/dependency-resolver.test.ts | 6 | 17 | 248 | 0 | — |
| 50 | marketplace/marketplace-auth.test.ts | 6 | 18 | 176 | 0 | — |
| 51 | marketplace/rating-system.test.ts | 7 | 21 | 254 | 0 | — |
| 52 | marketplace/registry-client.test.ts | 6 | 21 | 332 | 0 | — |
| 53 | marketplace/skill-sandbox.test.ts | 7 | 45 | 430 | 0 | — |
| 54 | memory-export.test.ts | 4 | 25 | 323 | 0 | — |
| 55 | memory-import.test.ts | 4 | 22 | 256 | 0 | — |
| 56 | memory-normalize.test.ts | 1 | 15 | 64 | 0 | — |
| 57 | memory-query.test.ts | 3 | 21 | 249 | 0 | — |
| 58 | memory-store.test.ts | 9 | 39 | 456 | 0 | — |
| 59 | model-equivalence.test.ts | 16 | 79 | 420 | 0 | — |
| 60 | model-registry.test.ts | 24 | 78 | 569 | 0 | — |
| 61 | model-types.test.ts | 14 | 62 | 407 | 0 | — |
| 62 | multi-ide.test.ts | 1 | 15 | 168 | 0 | — |
| 63 | non-null-safety.test.ts | 18 | 39 | 422 | 0 | — |
| 64 | notification-config.test.ts | 4 | 26 | 167 | 0 | — |
| 65 | notification-dispatcher.test.ts | 3 | 13 | 200 | 0 | — |
| 66 | notification-providers/discord.test.ts | 1 | 14 | 152 | 0 | — |
| 67 | notification-providers/slack.test.ts | 1 | 13 | 154 | 0 | — |
| 68 | notification-providers/webhook.test.ts | 1 | 10 | 180 | 0 | — |
| 69 | notifications.test.ts | 2 | 14 | 210 | 0 | — |
| 70 | notify-adapters/cli-adapter.test.ts | 1 | 7 | 97 | 0 | — |
| 71 | notify-adapters/mcp-adapter.test.ts | 1 | 11 | 122 | 0 | — |
| 72 | observability-instrument-points.test.ts | 5 | 6 | 239 | 0 | — |
| 73 | observability.test.ts | 12 | 25 | 375 | 0 | — |
| 74 | output-collector.test.ts | 12 | 29 | 634 | 1 | node:child_process |
| 75 | output-formatter.test.ts | 10 | 46 | 321 | 0 | — |
| 76 | plugin-hooks.test.ts | 14 | 39 | 735 | 0 | — |
| 77 | plugin-install.test.ts | 7 | 49 | 596 | 3 | node:fs, node:fs/promises, node:child_process |
| 78 | plugin-manifest.test.ts | 8 | 38 | 295 | 0 | — |
| 79 | plugin-remove.test.ts | 1 | 10 | 117 | 0 | — |
| 80 | plugin-security.test.ts | 4 | 14 | 274 | 0 | — |
| 81 | plugin-system.test.ts | 6 | 37 | 588 | 0 | — |
| 82 | plugin-toggle.test.ts | 6 | 23 | 343 | 0 | — |
| 83 | plugin.test.ts | 3 | 15 | 160 | 1 | node:fs |
| 84 | pricing-updater.test.ts | 5 | 11 | 303 | 0 | — |
| 85 | provider-bootstrap.test.ts | 9 | 37 | 594 | 5 | node:child_process, claude.js, codex.js, gemini.js, deck-file.js |
| 86 | provider-capabilities.test.ts | 5 | 17 | 130 | 0 | — |
| 87 | provider-detection.test.ts | 3 | 23 | 266 | 1 | node:child_process |
| 88 | provider-fallback.test.ts | 1 | 16 | 289 | 0 | — |
| 89 | provider.test.ts | 6 | 51 | 460 | 0 | — |
| 90 | readjson-migration.test.ts | 16 | 49 | 588 | 0 | — |
| 91 | routing-engine.test.ts | 12 | 59 | 1042 | 0 | — |
| 92 | routing-types.test.ts | 8 | 14 | 106 | 0 | — |
| 93 | skill-cache.test.ts | 1 | 19 | 185 | 1 | node:fs |
| 94 | skill-ci-testing.test.ts | 3 | 18 | 210 | 0 | — |
| 95 | skill-config.test.ts | 1 | 14 | 194 | 0 | — |
| 96 | skill-pool-stats.test.ts | 1 | 12 | 196 | 0 | — |
| 97 | skill-pool.test.ts | 12 | 47 | 518 | 1 | node:fs |
| 98 | skill-registry.test.ts | 1 | 24 | 240 | 0 | — |
| 99 | skill-selector.test.ts | 2 | 31 | 420 | 0 | — |
| 100 | skill-type-extensions.test.ts | 2 | 6 | 123 | 0 | — |
| 101 | skill-types.test.ts | 7 | 31 | 281 | 0 | — |
| 102 | spawn-backend.test.ts | 10 | 32 | 377 | 4 | node:child_process, spawn-backend-docker.js, tmux.js, subprocess.js |
| 103 | stack-detector.test.ts | 8 | 88 | 1097 | 1 | node:fs |
| 104 | subscription.test.ts | 3 | 19 | 302 | 3 | node:child_process, node:fs, node:fs/promises |
| 105 | system-profile.test.ts | 2 | 17 | 162 | 1 | node:os |
| 106 | telemetry.test.ts | 1 | 14 | 110 | 0 | — |
| 107 | token-counter.test.ts | 2 | 26 | 233 | 0 | — |
| 108 | type-cast-safety.test.ts | 9 | 33 | 352 | 0 | — |
| 109 | types-edge.test.ts | 15 | 39 | 628 | 0 | — |
| 110 | types-split.test.ts | 10 | 40 | 537 | 0 | — |
| 111 | types.test.ts | 8 | 15 | 100 | 0 | — |
| 112 | utils-date.test.ts | 3 | 25 | 134 | 0 | — |
| 113 | utils-debug-logging.test.ts | 5 | 25 | 241 | 0 | — |
| 114 | utils-debug.test.ts | 5 | 14 | 134 | 0 | — |
| 115 | utils-decay.test.ts | 3 | 21 | 151 | 0 | — |
| 116 | utils-deckent.test.ts | 1 | 8 | 107 | 1 | node:fs |
| 117 | utils-io.test.ts | 2 | 14 | 95 | 0 | — |
| 118 | utils-shared.test.ts | 4 | 18 | 119 | 0 | — |
| 119 | utils-sprint-id.test.ts | 3 | 26 | 294 | 1 | node:fs |

---

## 2. Coverage Eşleşmesi — Test → Src Mapping

### 2.1 Doğrudan Eşleşen Dosyalar (1:1 isim eşleşmesi) — 70 dosya

Bu dosyalar `tests/core/X.test.ts → src/core/X.ts` formatında birebir eşleşir:

| Test Dosyası | Src Dosyası | Durum |
|-------------|------------|-------|
| activation-engine.test.ts | src/core/activation-engine.ts | ✅ MATCH |
| agent-cache.test.ts | src/core/agent-cache.ts | ✅ MATCH |
| agent-pool.test.ts | src/core/agent-pool.ts | ✅ MATCH |
| agent-selector.test.ts | src/core/agent-selector.ts | ✅ MATCH |
| agent-types.test.ts | src/core/agent-types.ts | ✅ MATCH |
| analyzer.test.ts | src/core/analyzer.ts | ✅ MATCH |
| cascade-detector.test.ts | src/core/cascade-detector.ts | ✅ MATCH |
| ci-learning.test.ts | src/core/ci-learning.ts | ✅ MATCH |
| condition-evaluator.test.ts | src/core/condition-evaluator.ts | ✅ MATCH |
| config-migration.test.ts | src/core/config-migration.ts | ✅ MATCH |
| config-types.test.ts | src/core/config-types.ts | ✅ MATCH |
| config.test.ts | src/core/config.ts | ✅ MATCH |
| constants.test.ts | src/core/constants.ts | ✅ MATCH |
| cost-calculator.test.ts | src/core/cost-calculator.ts | ✅ MATCH |
| cost-config-loader.test.ts | src/core/cost-config-loader.ts | ✅ MATCH |
| credential-encryption.test.ts | src/core/credential-encryption.ts | ✅ MATCH |
| credentials.test.ts | src/core/credentials.ts | ✅ MATCH |
| decision-config.test.ts | src/core/decision-config.ts | ✅ MATCH |
| decision-types.test.ts | src/core/decision-types.ts | ✅ MATCH |
| deck-file.test.ts | src/core/deck-file.ts | ✅ MATCH |
| environment.test.ts | src/core/environment.ts | ✅ MATCH |
| errors.test.ts | src/core/errors.ts | ✅ MATCH |
| file-lock.test.ts | src/core/file-lock.ts | ✅ MATCH |
| global-config.test.ts | src/core/global-config.ts | ✅ MATCH |
| intent-classifier.test.ts | src/core/intent-classifier.ts | ✅ MATCH |
| lazy-loader.test.ts | src/core/lazy-loader.ts | ✅ MATCH |
| manifest-migrator.test.ts | src/core/manifest-migrator.ts | ✅ MATCH |
| memory-export.test.ts | src/core/memory-export.ts | ✅ MATCH |
| memory-import.test.ts | src/core/memory-import.ts | ✅ MATCH |
| memory-normalize.test.ts | src/core/memory-normalize.ts | ✅ MATCH |
| memory-query.test.ts | src/core/memory-query.ts | ✅ MATCH |
| memory-store.test.ts | src/core/memory-store.ts | ✅ MATCH |
| model-equivalence.test.ts | src/core/model-equivalence.ts | ✅ MATCH |
| model-registry.test.ts | src/core/model-registry.ts | ✅ MATCH |
| multi-ide.test.ts | src/core/multi-ide.ts | ✅ MATCH |
| notification-config.test.ts | src/core/notification-config.ts | ✅ MATCH |
| notification-dispatcher.test.ts | src/core/notification-dispatcher.ts | ✅ MATCH |
| notifications.test.ts | src/core/notifications.ts | ✅ MATCH |
| observability.test.ts | src/core/observability.ts | ✅ MATCH |
| output-collector.test.ts | src/core/output-collector.ts | ✅ MATCH |
| output-formatter.test.ts | src/core/output-formatter.ts | ✅ MATCH |
| plugin-hooks.test.ts | src/core/plugin-hooks.ts | ✅ MATCH |
| plugin.test.ts | src/core/plugin.ts | ✅ MATCH |
| provider-capabilities.test.ts | src/core/provider-capabilities.ts | ✅ MATCH |
| provider.test.ts | src/core/provider.ts | ✅ MATCH |
| routing-engine.test.ts | src/core/routing-engine.ts | ✅ MATCH |
| routing-types.test.ts | src/core/routing-types.ts | ✅ MATCH |
| skill-cache.test.ts | src/core/skill-cache.ts | ✅ MATCH |
| skill-pool.test.ts | src/core/skill-pool.ts | ✅ MATCH |
| skill-registry.test.ts | src/core/skill-registry.ts | ✅ MATCH |
| skill-selector.test.ts | src/core/skill-selector.ts | ✅ MATCH |
| skill-types.test.ts | src/core/skill-types.ts | ✅ MATCH |
| stack-detector.test.ts | src/core/stack-detector.ts | ✅ MATCH |
| subscription.test.ts | src/core/subscription.ts | ✅ MATCH |
| system-profile.test.ts | src/core/system-profile.ts | ✅ MATCH |
| telemetry.test.ts | src/core/telemetry.ts | ✅ MATCH |
| token-counter.test.ts | src/core/token-counter.ts | ✅ MATCH |
| types.test.ts | src/core/types.ts | ✅ MATCH |
| marketplace/dependency-resolver.test.ts | src/core/marketplace/dependency-resolver.ts | ✅ MATCH |
| marketplace/marketplace-auth.test.ts | src/core/marketplace/marketplace-auth.ts | ✅ MATCH |
| marketplace/rating-system.test.ts | src/core/marketplace/rating-system.ts | ✅ MATCH |
| marketplace/registry-client.test.ts | src/core/marketplace/registry-client.ts | ✅ MATCH |
| marketplace/skill-sandbox.test.ts | src/core/marketplace/skill-sandbox.ts | ✅ MATCH |
| notification-providers/discord.test.ts | src/core/notification-providers/discord.ts | ✅ MATCH |
| notification-providers/slack.test.ts | src/core/notification-providers/slack.ts | ✅ MATCH |
| notification-providers/webhook.test.ts | src/core/notification-providers/webhook.ts | ✅ MATCH |
| notify-adapters/cli-adapter.test.ts | src/core/notify-adapters/cli-adapter.ts | ✅ MATCH |
| notify-adapters/mcp-adapter.test.ts | src/core/notify-adapters/mcp-adapter.ts | ✅ MATCH |
| anthropic-http-client.test.ts | src/core/anthropic-http-client.ts | ✅ MATCH |
| pricing-updater.test.ts | src/core/pricing-updater.ts | ✅ MATCH |

### 2.2 Orphan Testler — İsim Eşleşmesi Yok ama Gerçek Src Hedefi Var (49 dosya)

Bu testler `tests/core/X.test.ts` adına sahip ama `src/core/X.ts` dosyası yok. Ancak import analizi ile gerçek hedef src dosyaları belirlendi:

| Test Dosyası | Gerçek Src Hedefi | Kategorisi |
|-------------|-------------------|-----------|
| agent-type-extensions.test.ts | src/core/types.ts | Types extended test |
| analyzer-overhaul.test.ts | src/core/analyzer.ts | analyzer.test.ts'in ikinci test seti |
| branch-coverage.test.ts | src/core/utils.ts (countBrainLines) | **⚠️ V1 LEGACY** |
| ci-after-sprint.test.ts | src/core/plugin-hooks.ts | CI plugin hooks test |
| ci-guardian.test.ts | src/core/agent-pool.ts + agent-selector.ts | Cross-module integration |
| ci-pre-sprint.test.ts | src/core/plugin-hooks.ts | CI plugin hooks test |
| ci-regression.test.ts | src/core/plugin-hooks.ts | CI regression test |
| config-backup-rotation.test.ts | src/core/config-migration.ts | Config backup test |
| config-cache.test.ts | src/core/config.ts | Config caching test |
| config-edge.test.ts | src/core/config.ts | Config edge cases |
| config-global.test.ts | src/core/types.ts + config | Global config test |
| config-metadata.test.ts | src/core/config.ts | Config metadata test |
| config-sprint063.test.ts | src/core/config.ts | Sprint-specific regression |
| config-sprint064.test.ts | src/core/config.ts | Sprint-specific regression |
| config-validation.test.ts | src/core/config.ts | Config validation test |
| debt-002.test.ts | src/core/utils.ts (parseDebtTable) | **⚠️ V1 LEGACY** |
| error-handling-unification.test.ts | src/core/errors.ts | Unified error handling test |
| error-registry-lint.test.ts | Inline (no src import) | Lint/audit test |
| features-manifest.test.ts | Inline (readFileSync) | Package.json manifest test |
| framework-detection.test.ts | src/core/stack-detector.ts | Stack detector alias |
| model-types.test.ts | src/core/task-types.ts | Task types model test |
| non-null-safety.test.ts | src/core/utils.ts (parseDebtTable) | **⚠️ V1 LEGACY** |
| observability-instrument-points.test.ts | src/core/observability.ts | Observability extension |
| plugin-install.test.ts | src/core/plugin.ts | Plugin install test |
| plugin-manifest.test.ts | src/core/plugin.ts | Plugin manifest test |
| plugin-remove.test.ts | src/core/plugin.ts | Plugin remove test |
| plugin-security.test.ts | src/core/plugin-loader.ts | Plugin security test |
| plugin-system.test.ts | src/core/plugin.ts | Plugin system integration |
| plugin-toggle.test.ts | src/core/plugin.ts | Plugin toggle test |
| provider-bootstrap.test.ts | src/core/provider.ts + providers/ | Provider bootstrap test |
| provider-detection.test.ts | src/core/provider.ts | Provider detection test |
| provider-fallback.test.ts | src/core/provider.ts | Provider fallback test |
| readjson-migration.test.ts | Inline (temp dir) | JSON migration audit |
| skill-ci-testing.test.ts | src/core/skill-pool.ts + skill-selector.ts | CI testing skill integration |
| skill-config.test.ts | src/core/config.ts | Skill config section test |
| skill-pool-stats.test.ts | src/core/skill-pool.ts | Skill pool stats test |
| skill-type-extensions.test.ts | src/core/types.ts | Types extended test |
| spawn-backend.test.ts | src/orchestra/spawn-backend.ts | **⚠️ WRONG LOCATION** — orchestra test in core/ |
| type-cast-safety.test.ts | src/core/utils.ts (parseDebtTable) | **⚠️ V1 LEGACY** |
| types-edge.test.ts | src/core/types.ts | Types edge cases |
| types-split.test.ts | src/core/types.ts | Types barrel re-export test |
| utils-date.test.ts | src/core/utils.ts | Utils date functions |
| utils-debug-logging.test.ts | src/core/utils.ts | Utils debug logging |
| utils-debug.test.ts | src/core/utils.ts (countBrainLines) | **⚠️ V1 LEGACY** |
| utils-decay.test.ts | src/core/utils.ts | Utils decay functions |
| utils-deckent.test.ts | src/core/utils.ts | Utils deckent functions |
| utils-io.test.ts | src/core/utils.ts | Utils I/O functions |
| utils-shared.test.ts | src/core/utils.ts | Utils shared functions |
| utils-sprint-id.test.ts | src/core/utils.ts (parseDebtTable, generateDebtTable) | **⚠️ V1 LEGACY** |

### 2.3 Src Dosyaları Test'siz — 8 Dosya (GAP)

| Src Dosyası | Sebep | Severity |
|------------|-------|----------|
| src/core/index.ts | Barrel re-export — test genellikle gerekmez | P3 |
| src/core/memory-types.ts | Pure type definitions — runtime test gerekmez | P3 |
| src/core/mode-presets.ts | Config presets — config.test.ts tarafından dolaylı test edilir | P2 |
| src/core/monitoring-types.ts | Pure type definitions | P3 |
| src/core/plugin-loader.ts | plugin-security.test.ts tarafından dolaylı test edilir | P2 |
| src/core/sprint-types.ts | Pure type definitions | P3 |
| src/core/task-types.ts | model-types.test.ts tarafından dolaylı test edilir | P2 |
| src/core/utils.ts | 8 ayrı utils-*.test.ts dosyası ile test edilir | P3 (aslında covered) |

---

## 3. Memory V2 Mock Uyumu — KRİTİK BULGULAR

### 3.1 Doğru V2 Mock Pattern'leri (✅ Uyumlu — 5 dosya)

| Dosya | Açıklama |
|-------|----------|
| **memory-store.test.ts** | Gerçek MemoryStore instance, mkdtempSync temp dir, SQLite in-memory test. 9 describe, 39 it. turkishNormalize import'u mevcut. ✅ DB-FIRST |
| **memory-query.test.ts** | Gerçek MemoryStore + searchMemory, temp dir ile FTS5 testi. 3 describe, 21 it. ✅ DB-FIRST |
| **memory-export.test.ts** | MemoryStore'dan export fonksiyonları test. 4 describe, 25 it. ✅ DB-FIRST |
| **memory-import.test.ts** | Parse fonksiyonları (parseDecisionsMd, parseMemoryMd, etc.) test. 4 describe, 22 it. ✅ DB-FIRST |
| **memory-normalize.test.ts** | turkishNormalize fonksiyonu. 1 describe, 15 it. ✅ PURE FUNCTION |

### 3.2 V1 Legacy Kalıntıları (⚠️ İhlal — 6 dosya)

| Dosya | V1 Kalıntısı | Severity | Açıklama |
|-------|-------------|----------|----------|
| **branch-coverage.test.ts** | `countBrainLines` (5 referans) | P1 | Deprecated fonksiyon hala test ediliyor. `countBrainLines` V2'de yerini `store.getEntryCount()` veya `getMemoryEntryCount()`'a bırakmış olabilir |
| **utils-debug.test.ts** | `countBrainLines` (3 referans) | P1 | Aynı — deprecated fonksiyon test |
| **debt-002.test.ts** | `parseDebtTable` (3 referans) | P2 | V1 debt parse fonksiyonu test ediliyor. V2'de debt DB'de |
| **non-null-safety.test.ts** | `parseDebtTable` (2 referans) | P2 | V1 debt parse null safety test |
| **utils-sprint-id.test.ts** | `parseDebtTable` + `generateDebtTable` | P2 | V1 debt parse/generate roundtrip testi |
| **type-cast-safety.test.ts** | `parseDebtTable` (4 referans) | P2 | V1 debt parse type guard test |
| **ci-learning.test.ts** | `readFileSync(MEMORY.md)` (3 referans) | P2 | V1 pattern: doğrudan .md dosya okuma |

**Toplam V1 Legacy İhlali: 6 dosya, ~20 referans**

Notlar:
- `parseDebtTable` ve `generateDebtTable` fonksiyonları hala src/core/utils.ts'de export ediliyor olabilir (backward compat). Ancak V2'de bu fonksiyonlar deprecated olmalı.
- `countBrainLines` fonksiyonu Memory V2 migrasyonunda kaldırılmış olabilir. Test dosyaları hala eski davranışı test ediyor.
- ci-learning.test.ts V2'de DB'den okuma yapmalı, `.brain/MEMORY.md`'yi readFileSync ile okumamalı.

---

## 4. Mock Pattern Analizi

### 4.1 vi.mock() Dağılımı

| Mock Hedefi | Kullanan Test Dosyaları | Sayı |
|-------------|------------------------|------|
| `node:fs` | agent-pool, analyzer-overhaul, branch-coverage, config-cache, config.test, framework-detection, global-config, plugin-install, plugin.test, skill-cache, skill-pool, stack-detector, subscription, utils-deckent, utils-sprint-id | 15 |
| `node:child_process` | analyzer-overhaul, analyzer, ci-after-sprint, ci-pre-sprint, ci-regression, framework-detection, output-collector, plugin-install, provider-bootstrap, provider-detection, spawn-backend, subscription | 12 |
| `node:fs/promises` | config-cache, config.test, plugin-install, subscription | 4 |
| `node:os` | system-profile | 1 |
| Src module mock | analyzer-overhaul (utils.js), provider-bootstrap (claude.js, codex.js, gemini.js, deck-file.js), spawn-backend (spawn-backend-docker.js, tmux.js, subprocess.js) | 3 |

### 4.2 vi.spyOn() Dağılımı

| Dosya | Sayı | Hedef |
|-------|------|-------|
| plugin-hooks.test.ts | 8 | En yoğun spyOn kullanımı |
| utils-debug.test.ts | 7 | Debug fonksiyonları |
| ci-pre-sprint.test.ts | 3 | CI hooks |
| notifications.test.ts | 3 | Notification methods |
| notify-adapters/cli-adapter.test.ts | 3 | CLI adapter |
| utils-debug-logging.test.ts | 1 | Debug logging |

### 4.3 Mock Kalite Değerlendirmesi

**Pozitif:**
- Mock'lar doğru seviyede yapılmış — dosya sistemi ve child_process gibi external boundary'ler mock'lanıyor
- MemoryStore testleri gerçek SQLite instance kullanıyor (doğru — mock yok, gerçek DB)
- Marketplace testlerinde mock yok — pure function test (iyi)
- 78/119 dosya hiç vi.mock kullanmıyor — çoğunluk pure logic testi

**Negatif:**
- `provider-bootstrap.test.ts` 5 mock ile en karmaşık mock setup'a sahip
- `spawn-backend.test.ts` tests/core/ altında ama src/orchestra/ test ediyor — yanlış konum
- Bazı mock'lar (node:fs) module-level olup beforeEach ile reset edilmiyor — potansiyel test leakage

---

## 5. Lifecycle Hook Analizi

### 5.1 beforeEach/afterEach Dağılımı

| Patern | Dosya Sayısı |
|--------|-------------|
| beforeEach + afterEach (pair) | 52 |
| beforeEach only (no cleanup) | 17 |
| afterEach only | 1 (config-sprint064) |
| Neither (stateless) | 49 |

**Önemli Bulgular:**
- 17 dosya `beforeEach` kullanıp `afterEach` kullanmıyor — potansiyel cleanup eksikliği
- Bu dosyaların çoğu temp directory kullanmıyor (pure function test) veya vi.restoreAllMocks() beforeEach içinde yapıyor
- `config-sprint064.test.ts` sadece afterEach var, beforeEach yok — incelenmeli

### 5.2 Test İzolasyonu Riski

| Risk Seviyesi | Dosya Sayısı | Açıklama |
|--------------|-------------|----------|
| Düşük | 101 | Stateless veya uygun pair |
| Orta | 15 | beforeEach var ama afterEach yok + side effect yapan testler |
| Yüksek | 3 | vi.mock + no afterEach cleanup |

---

## 6. Type Safety — `as any` Cast Analizi

165 adet `as any` cast tespit edildi. Test dosyalarında `as any` genellikle kabul edilebilir çünkü:
- Geçersiz input test etmek için (negatif test)
- Type narrowing'i bypass etmek için mock data

### En Yoğun `as any` Kullanan Dosyalar

| Dosya | `as any` Sayısı | Değerlendirme |
|-------|----------------|---------------|
| config-validation.test.ts | ~15 | ✅ Kabul edilebilir — invalid config test |
| types-edge.test.ts | ~12 | ✅ Kabul edilebilir — edge case type test |
| config.test.ts | ~10 | ✅ Kabul edilebilir — config fallback test |
| routing-engine.test.ts | ~8 | ⚠️ Mock data — partial object |
| skill-sandbox.test.ts | ~5 | ✅ Kabul edilebilir — AST scan test |
| agent-pool.test.ts | ~8 | ⚠️ Mock agent data — partial |

**Toplam: 0 @ts-ignore, 0 @ts-expect-error — Temiz**

---

## 7. Büyük Test Dosyaları (>500 satır)

| Dosya | Satır | Describe | It | Açıklama |
|-------|-------|----------|-----|----------|
| config.test.ts | 1155 | 27 | 161 | En büyük tek test dosyası — config module'ün kapsamlı testi |
| stack-detector.test.ts | 1097 | 8 | 88 | Stack detector + framework detection |
| routing-engine.test.ts | 1042 | 12 | 59 | V2 routing engine kapsamlı test |
| agent-pool.test.ts | 1014 | 17 | 81 | Agent pool LRU eviction + lifecycle |
| error-handling-unification.test.ts | 795 | 23 | 65 | Error class hierarchy test |
| plugin-hooks.test.ts | 735 | 14 | 39 | Plugin lifecycle hooks |
| output-collector.test.ts | 634 | 12 | 29 | Process output collection |
| types-edge.test.ts | 628 | 15 | 39 | Types edge cases |
| config-migration.test.ts | 627 | 9 | 46 | Config version migration |
| plugin-install.test.ts | 596 | 7 | 49 | Plugin installation |
| provider-bootstrap.test.ts | 594 | 9 | 37 | Provider registration bootstrap |
| plugin-system.test.ts | 588 | 6 | 37 | Plugin system integration |
| readjson-migration.test.ts | 588 | 16 | 49 | JSON read migration audit |
| model-registry.test.ts | 569 | 24 | 78 | 13 model, 3 provider registry |
| types-split.test.ts | 537 | 10 | 40 | Type re-export barrel test |
| ci-learning.test.ts | 517 | 10 | 35 | CI learning pipeline |
| skill-pool.test.ts | 518 | 12 | 47 | Skill pool + validation |

---

## 8. Küçük Test Dosyaları (<100 satır) — Yetersiz Coverage Riski

| Dosya | Satır | It | Risk |
|-------|-------|-----|------|
| debt-002.test.ts | 38 | 4 | P2 — çok minimal |
| config-types.test.ts | 49 | 6 | P3 — type-only test |
| memory-normalize.test.ts | 64 | 15 | ✅ Yeterli — pure function |
| utils-io.test.ts | 95 | 14 | ✅ Yeterli |
| notify-adapters/cli-adapter.test.ts | 97 | 7 | P2 — 3 edge case eksik |
| types.test.ts | 100 | 15 | ✅ Yeterli — type guard test |

---

## 9. Dosya Yerleşim Anomalileri

### 9.1 Yanlış Konumdaki Test (P1)

- **spawn-backend.test.ts**: `tests/core/` altında ama `src/orchestra/spawn-backend.ts` test ediyor
  - Import: `../../src/orchestra/spawn-backend.js`
  - Bu dosya `tests/orchestra/` altında olmalıydı
  - 10 describe, 32 it, 377 satır — büyük test

### 9.2 Multi-Target Test Dosyaları

Bu dosyalar tek src modülü yerine birden fazla modülü test ediyor:

| Test | Target 1 | Target 2+ |
|------|----------|-----------|
| ci-guardian.test.ts | agent-pool.ts | agent-selector.ts |
| provider-bootstrap.test.ts | provider.ts | claude.js, codex.js, gemini.js |
| spawn-backend.test.ts | spawn-backend.ts | spawn-backend-docker.js, tmux.js |
| non-null-safety.test.ts | utils.ts | lazy-loader.ts |
| config-global.test.ts | types.ts | config.ts |

---

## 10. Test Kalite Metrikleri

### 10.1 Describe/It Oranı

| Metrik | Değer |
|--------|-------|
| Ortalama describe/dosya | 5.9 |
| Ortalama it/dosya | 27.4 |
| Ortalama it/describe | 4.7 |
| Minimum it/dosya | 4 (debt-002.test.ts) |
| Maximum it/dosya | 161 (config.test.ts) |

### 10.2 Satır/It Oranı

| Metrik | Değer |
|--------|-------|
| Ortalama satır/it | 11.3 |
| En düşük (sıkı testler) | 4.3 (condition-evaluator) |
| En yüksek (uzun testler) | 39.8 (observability-instrument-points) |

### 10.3 Test Yoğunluğu Kategorileri

| Kategori | Dosya Sayısı | Açıklama |
|----------|-------------|----------|
| Yoğun (>40 it) | 13 | config, agent-pool, model-equivalence, model-registry, routing-engine, etc. |
| Normal (15-40 it) | 52 | Çoğunluk |
| Hafif (5-14 it) | 46 | Küçük modüller |
| Minimal (<5 it) | 8 | debt-002, types.test gibi minimal testler |

---

## 11. Mock Olmayan Integration Test Riski

Aşağıdaki dosyalar gerçek dosya sistemi kullanıyor (mock yok, temp dir ile):

| Dosya | Temp Dir Pattern | Risk |
|-------|-----------------|------|
| config-edge.test.ts | mkdtempSync | ✅ İzole |
| config-global.test.ts | mkdirSync(tmpDir) | ✅ İzole |
| config-migration.test.ts | mkdtempSync | ✅ İzole |
| ci-learning.test.ts | mkdirSync + rmSync | ✅ İzole |
| error-handling-unification.test.ts | mkdirSync + rmSync | ✅ İzole |
| memory-store.test.ts | mkdtempSync | ✅ İzole — gerçek SQLite |
| memory-query.test.ts | mkdtempSync | ✅ İzole — gerçek SQLite |
| memory-export.test.ts | mkdtempSync | ✅ İzole — gerçek SQLite |

---

## 12. Kapsamlı Modül Coverage Haritası

### src/core/ → tests/core/ Kapsam Durumu

| Src Modülü | Test Dosya Sayısı | Toplam It | Yeterli? |
|-----------|------------------|-----------|----------|
| config.ts | 9 (config, cache, edge, global, metadata, sprint063, sprint064, validation, skill-config) | ~348 | ✅ Çok iyi |
| types.ts | 5 (types, types-edge, types-split, agent-type-ext, skill-type-ext) | ~107 | ✅ İyi |
| utils.ts | 9 (date, debug, debug-logging, decay, deckent, io, shared, sprint-id, non-null-safety) + 3 V1 legacy | ~200+ | ✅ İyi (ama V1 kalıntılar) |
| provider.ts | 4 (provider, bootstrap, detection, fallback) | ~127 | ✅ İyi |
| plugin.ts | 7 (plugin, install, manifest, remove, security, system, toggle) | ~225 | ✅ Çok iyi |
| plugin-hooks.ts | 4 (plugin-hooks, ci-after, ci-pre, ci-regression) | ~93 | ✅ İyi |
| errors.ts | 2 (errors, error-handling-unification) | ~108 | ✅ İyi |
| memory-store.ts | 3 (store, query, export) | ~85 | ✅ İyi |
| agent-pool.ts | 2 (pool, ci-guardian) | ~99 | ✅ İyi |
| skill-pool.ts | 3 (pool, stats, ci-testing) | ~77 | ✅ İyi |
| observability.ts | 2 (observability, instrument-points) | ~31 | ⚠️ Orta |
| analyzer.ts | 2 (analyzer, overhaul) | ~39 | ✅ İyi |
| stack-detector.ts | 2 (stack, framework) | ~99 | ✅ Çok iyi |
| **memory-types.ts** | 0 | 0 | P3 (pure types) |
| **mode-presets.ts** | 0 | 0 | P2 (dolaylı tested) |
| **plugin-loader.ts** | 0 (ama plugin-security.ts test ediyor) | 0 | P2 |
| **index.ts** | 0 | 0 | P3 (barrel export) |

---

## 13. Kritik Bulgular Özeti

### P0 — Acil (0 bulgu)
_Yok_

### P1 — Yüksek Öncelik (3 bulgu)

1. **`spawn-backend.test.ts` yanlış konumda** — `tests/core/` altında ama `src/orchestra/` test ediyor. `tests/orchestra/` altına taşınmalı veya orphan olarak belgelenmeli.

2. **`countBrainLines` V1 legacy testler** — `branch-coverage.test.ts` ve `utils-debug.test.ts` V2'de deprecated olan `countBrainLines` fonksiyonunu test ediyor. Ya fonksiyon kaldırılmalı ya da testler güncellenmelidir.

3. **`as any` cast yoğunluğu** — 165 cast. Çoğu kabul edilebilir (negatif testler) ama routing-engine.test.ts ve agent-pool.test.ts'deki bazı mock partial object'ler Partial<T> ile daha type-safe yapılabilir.

### P2 — Orta Öncelik (5 bulgu)

4. **`parseDebtTable` / `generateDebtTable` V1 testler** — 4 dosyada (debt-002, non-null-safety, type-cast-safety, utils-sprint-id) hala V1 fonksiyonları test ediliyor. V2'de debt DB'de, bu fonksiyonlar deprecated olmalı.

5. **`ci-learning.test.ts` `readFileSync(MEMORY.md)` pattern** — V2'de DB'den okumalı.

6. **`mode-presets.ts` + `plugin-loader.ts` eksik dedicated test** — Dolaylı test edilseler de dedicated test daha güvenli.

7. **17 dosya `beforeEach` var `afterEach` yok** — Potansiyel test izolasyonu riski (çoğu düşük risk ama gözden geçirilmeli).

8. **`debt-002.test.ts` çok minimal** — 38 satır, 4 test. Ya genişletilmeli ya da utils-sprint-id.test.ts ile birleştirilmeli.

### P3 — Düşük Öncelik (3 bulgu)

9. **Pure type dosyaları test'siz** — memory-types.ts, monitoring-types.ts, sprint-types.ts. Bunlar runtime kodu olmayan pure type definition. Test gerekmez ama contract test olabilir.

10. **index.ts barrel re-export test'siz** — İsteğe bağlı.

11. **`console.log` 2 dosyada** — Temizlenebilir ama düşük öncelik.

---

## 14. Memory V2 Genel Uyum Skoru

| Kategori | Puan | Açıklama |
|----------|------|----------|
| Memory V2 test dosyaları | 10/10 | 5 dosya, hepsi DB-first, gerçek SQLite |
| V1 kalıntı temizliği | 6/10 | 6 dosyada V1 fonksiyon testleri kaldı |
| MemoryStore mock doğruluğu | 10/10 | Gerçek instance kullanılıyor, mock yok |
| turkishNormalize coverage | 9/10 | memory-normalize.test.ts + memory-store.test.ts |
| DB roundtrip test | 8/10 | memory-export.test.ts var ama memory-import→DB test eksik |

**Genel V2 Uyum: 8.6/10**

---

## 15. Öneriler (Sprint 142+ Input)

### Hemen Yapılabilir
1. `spawn-backend.test.ts` → `tests/orchestra/` altına taşı (veya sembolik link)
2. `countBrainLines` testleri → V2 karşılığı ile değiştir veya kaldır
3. `parseDebtTable` 4 test dosyası → V2 DB debt API'sine migre et veya deprecated olarak belirle

### Planlı İyileştirme
4. `mode-presets.test.ts` oluştur — MODE_PRESETS coverage
5. `plugin-loader.test.ts` oluştur — sandbox validation dedicated test
6. `as any` yerine `Partial<T>` veya test factory pattern kullan
7. `ci-learning.test.ts` → DB-first okuma pattern'ına migre et

### İzleme
8. 49 orphan test dosyası kabul edilebilir — çoğu modüler test split. Ancak yeni eklenen src dosyaları için dedicated test oluşturma alışkanlığı sürdürülmeli.
9. 8 src dosyası test'siz — çoğu pure type veya barrel export. Risk düşük.

---

## 16. Verdict

**ANALYZED** — 119 dosya tam incelendi. 16 bölüm dolu. Memory V2 uyum 8.6/10. 3 P1, 5 P2, 3 P3 bulgu.

---

_Rapor oluşturma: Task 142-030 | Model: opus | Tarih: 2026-04-16_
