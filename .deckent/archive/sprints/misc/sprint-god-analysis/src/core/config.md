# Analysis: src/core/config.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 1167 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
config.ts, Deckent'in 3-katmanli konfigurasyon birlestirme motorudur: defaults → global (~/.deckent/config.json) → project (.deckent/config.json). Mode aliasing (legacy max_plan → performance), env var override'lari (DECKENT_BRAIN_PROVIDER, DECKENT_MODE, vb.), model strategy merge, haiku_allowed backward compat, ve kapsamli validasyon saglar. Sonuc bir ResolvedConfig objesidir. CLI, MCP, Brain, ve Sprint controller tarafindan projenin tum konfigurasyonuna erismek icin kullanilir. Config metadata sistemi (CONFIG_METADATA) ile self-documenting config reference uretimi destekler.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `DEFAULT_AUTO_DOCS` | `const: AutoDocsConfig` | EKSIK |
| `MODE_ALIASES` | `Readonly<Record<string, PlanMode>>` | EKSIK |
| `resolveMode` | `(mode: string): string` | **VAR** |
| `DEFAULT_MODES` | `Record<string, PlanModeConfig>` | EKSIK |
| `ConfigValidationError` | class extends Error | EKSIK |
| `deepMerge` | `<T>(base: T, override: Partial<T>): T` | **VAR** — detayli |
| `validateConfig` | `(config: DeckentConfig): string[]` | **VAR** — detayli |
| `resolveEffectiveWorkers` | `(config, systemProfile, planLimit?): number` | **VAR** |
| `clearConfigCache` | `(): void` | **VAR** |
| `createDefaultConfig` | `(): DeckentConfig` | **VAR** |
| `getDefaultConfig` | `(): DeckentConfig` | **VAR** — alias |
| `getDefaultModes` | `(): Record<string, PlanModeConfig>` | **VAR** |
| `loadConfig` | `(projectRoot?, options?): Promise<ResolvedConfig>` | **VAR** — detayli |
| `readAuthMode` | `(projectRoot?): Promise<'subscription' \| 'api' \| 'hybrid'>` | **VAR** |
| `validatePartialConfig` | `(partial: Partial<DeckentConfig>): void` | **VAR** |
| `loadGlobalConfig` | `(configPath?): Promise<Partial<DeckentConfig> \| null>` | **VAR** |
| `saveGlobalConfig` | `(config, configPath?): Promise<void>` | **VAR** |
| `CONFIG_METADATA` | `Readonly<Record<string, ConfigMetadataEntry>>` | **VAR** |
| `ConfigMetadataEntry` | interface | EKSIK (inline) |
| `getConfigHelp` | `(key: string): ConfigMetadataEntry \| undefined` | **VAR** |
| `listConfigByCategory` | `(): Record<string, string[]>` | **VAR** |
| `generateConfigReference` | `(): string` | **VAR** |
| `mergeConfigs` | `(global, project): ResolvedConfig` | **VAR** |
| `VALID_PROVIDERS` | `readonly ProviderName[]` | EKSIK |

**Toplam: ~24 export. 17 JSDoc VAR, 7 EKSIK (const/class/interface icin).**

## 3. Ic Bagimliliklar
- `./constants.js` → PROJECT_CONFIG_PATH, GLOBAL_CONFIG_PATH, DEFAULT_LANGUAGE, DEFAULT_MODE, DECKENT_VERSION, SUPPORTED_LANGUAGES
- `./utils.js` → readJsonSafeAsync
- `./config-migration.js` → needsMigration, migrateConfig
- `./types.js` → AutoDocsConfig, DeckentConfig, PlanMode, PlanModeConfig, ResolvedConfig, SystemProfile, ALL_MODELS, PROVIDER_MODEL_MAP, ProviderName
- `./mode-presets.js` → MODE_PRESETS, ModelStrategy
- `./observability.js` → metric

Dongusel bagimllik riski: **DUSUK.** config.ts → types.ts → baska modullere yonlenmiyor (types.ts leaf).

## 4. Dis Bagimliliklar
- `node:fs/promises` → writeFile, mkdir
- `node:fs` → existsSync, statSync
- `node:path` → dirname, join, resolve

**ADR-010:** Node.js built-in modulleri — uyumlu.

## 5. Complexity
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | ~24 public + ~4 private = ~28 |
| En karmasik fonksiyon | `validateConfig()` (satir 153-353, ~200 satir, cyclomatic ~30) |
| Ikinci en karmasik | `loadConfig()` (satir 513-683, ~170 satir, cyclomatic ~15) |
| En buyuk obje | CONFIG_METADATA (satir 767-1050, ~283 satir) |

**validateConfig() P1 karmasiklik.** 200 satir icinde ~30 dallanma. Extract edilmesi onerilir: `validateModes()`, `validateSkills()`, `validateProviders()`, `validateMemory()`, `validateAuditor()`, `validateSprint()`.

## 6. Type Safety
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `as Record<string, unknown>` | 127-128 | deepMerge icinde. generic T → Record cast. Tasarim karari. |
| `as PlanMode` | 550, 564 | resolveMode sonucu → PlanMode cast. Eger alias bilinmiyorsa gecersiz string olabilir. **P2.** |
| `as ProviderName` | 555, 559 | Env var → ProviderName cast. Dogrulanmamis. **P2.** |
| `as Record<string, unknown>` | 540 | projectConfig cast for needsMigration. Guvenli. |
| `as PlanModeConfig` | 609, 1146 | modes[mode] → PlanModeConfig. Validate sonrasi, guvenli. |

**Toplam: 0 any, 0 @ts-ignore. ~5 unsafe cast, 2'si P2.**

## 7. ADR Compliance
| ADR | Uyum | Aciklama |
|-----|------|----------|
| ADR-004 | **UYUMLU** | 3-layer config merge: defaults → global → project |
| ADR-008 | **UYUMLU** | core/ icinden import |
| ADR-010 | **UYUMLU** | Node built-in only |
| ADR-023 | **UYUMLU** | Plan tier generalizasyonu — mode presets + model_strategy |
| ADR-033 | **UYUMLU** | telemetry_enabled default false |
| Memory V2 | **KISMI** | config.ts'de `memory` V2 section okunuyor ama ResolvedConfig'e tam yansimasi yok (loadConfig satir 638-643'te memory_budget/decay_after_sprints var ama memory.backend/search/export_md yok). **P2 GAP.** |

## 8. Test Coverage
- **Test dosyalari:** 11 test dosyasi mevcut
  - config.test.ts, config-validation.test.ts, config-cache.test.ts, config-migration.test.ts, config-global.test.ts, config-edge.test.ts, config-metadata.test.ts, config-types.test.ts, config-sprint063.test.ts, config-sprint064.test.ts, config-backup-rotation.test.ts
- **Kapsamli test suite.** Ancak Memory V2 config section testi olup olmadigini dogrulamak gerekir.

## 9. TODO/FIXME/HACK inventory
**SIFIR.**

## 10. Dead Code
- `getDefaultConfig()` (satir 486-488): `createDefaultConfig()` icin alias. **Dead code degil** — backward compat icin kullaniliyor.
- `CONFIG_METADATA` icinde `memory_budget.default: 600` (satir 986) ama `createDefaultConfig()`'te `memory_budget: 5000`. **TUTARSIZLIK!** Metadata'daki default yanlis — Sprint 140 pre-flight guncellememis. **P1 BUG.**

## 11. Security
| Alan | Durum | Aciklama |
|------|-------|----------|
| API key exposure | **DIKKAT** | `config.api_keys` Record<string, string> — API key'ler config dosyasinda saklanabilir. Validasyon sadece obje kontrolu (satir 271-275), key-specific guvenlik yok. |
| Env var injection | **DUSUK RISK** | Env var override'lari dogrudan cast ediliyor (satir 553-568). Kotu niyetli env var gecersiz provider/mode set edebilir ama validate sonrasi yakalanir. |
| Config file permissions | **EKSIK** | Global config (~/.deckent/config.json) dosya izinleri kontrol edilmiyor. Diger kullanicilar okuyabilir. |
| JSON parse | **GUVENLI** | `readJsonSafeAsync` ile try/catch sarili. |

## 12. Memory V2 Uyumu
- **DeckentConfig.memory** section tanimli (config-types.ts satir 170-187): backend, search, semantic_provider, decay_after_sprints, export_md, export_trigger, custom_types, keyword_aliases.
- **loadConfig()** bu section'i OKUYOR (deepMerge ile) ama **ResolvedConfig'e AKTARMIYOR!** ResolvedConfig'te `memory` alani yok. Sadece legacy flat alanlar (memory_budget, decay_after_sprints) aktariliyor.
- **Sonuc:** Memory V2 config'i okunuyor ama resolved config'te kayip. Brain/CLI memory.backend'e erismek icin DeckentConfig'e geri donmek zorunda. **P2 — ResolvedConfig'e memory section eklenmeli.**

## 13. i18n
- `SUPPORTED_LANGUAGES = ['en', 'tr']` — config.language dogrulanir.
- Config metadata description'lari tamamen Ingilizce.
- Hata mesajlari (ConfigValidationError) Ingilizce.

## 14. Dokumantasyon Tutarliligi
- **CONFIG_METADATA.memory_budget.default:** 600. Gercek default: 5000. **TUTARSIZ — P1.**
- **CONFIG_METADATA.decay_after_sprints.default:** 5. Gercek default: 20. **TUTARSIZ — P1.**
- **DECKENT.md:** memory.backend, memory.search belgelenilmis ama ResolvedConfig'te yok. **Kismi uyum.**
- **mergeConfigs()** (satir 1128-1166): ResolvedConfig'in farkli bir alt kumesini uretir (loadConfig'ten daha az alan). **Drift riski.**

## 15. Performance
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `existsSync` | 540, 745 | Sync file check. Hot path'te degil (config load 1x/sprint). Kabul edilebilir. |
| `statSync` | 402 | Cache invalidation icin mtime kontrolu. Sync ama lightweight. |
| Config cache | 382-393 | Module-level cache. mtime + project root ile invalidation. **Iyi performans pattern.** |
| `structuredClone` | 125, 139, 416, 495 | Deep clone. Config objeleri icin makul. |

## 16. Oneriler
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| **P1** | CONFIG_METADATA default'lari guncelle | memory_budget: 600→5000, decay_after_sprints: 5→20 |
| **P2** | Memory V2 ResolvedConfig gap | ResolvedConfig'e `memory` section ekle, loadConfig'te aktar |
| **P2** | Env var cast safety | ProviderName/PlanMode cast'lerini validate et |
| P2 | validateConfig karmasikligi | 200 satiri 5-6 alt fonksiyona bol |
| P3 | mergeConfigs() drift | loadConfig ile ayni ResolvedConfig uretimine yaklastir |
| P3 | API key file permissions | saveGlobalConfig'te dosya izinlerini 600 yap |

## Verdict: ANALYZED
