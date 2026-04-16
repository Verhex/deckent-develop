# Analysis: src/core/config-migration.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 569 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
config-migration.ts, eski (minimal) config.json dosyalarini yeni (tam) formata goceren migration yardimcisidir. Mevcut degerler korunur — sadece eksik alanlar default degerlerle eklenir. Legacy mode isimlerini (max_plan, max5x_plan, pro_plan) kanonik isimlere (performance, balanced, economic) donusturur. V1→V2 migration ile model-based config'i tier-based config'e cevirir (brain_model → brain_tier, haiku_allowed → min_tier). Otomatik backup olusturur ve eski backup'lari prune eder (keepCount=3). loadConfig() tarafindan otomatik cagrılır.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `MigrationResult` | interface (4 alan) | EKSIK |
| `getMissingFields` | `(existing: Record<string, unknown>): string[]` | **VAR** — detayli |
| `needsMigration` | `(existing: Record<string, unknown>): boolean` | **VAR** |
| `migrateConfig` | `(configPath: string, options?: { dryRun?: boolean }): MigrationResult` | **VAR** — detayli |
| `pruneConfigBackups` | `(configPath: string, keepCount?: number): string[]` | **VAR** |
| `migrateConfigInMemory` | `(existing: Record<string, unknown>): { config; addedFields }` | **VAR** |
| `migrateConfigFull` | `(existing: Record<string, unknown>): { config; addedFields; v2Changes }` | **VAR** |
| `modelToTier` | `(model: string): ModelTier` | **VAR** |
| `ConfigModelStrategy` | interface | EKSIK |
| `ConfigProviders` | interface | EKSIK |
| `migrateConfigV1ToV2` | `(config: Record<string, unknown>): { migrated; changes }` | **VAR** — detayli migration rules |
| `needsV2Migration` | `(existing: Record<string, unknown>): boolean` | **VAR** |
| `collectKeys` | (re-export for testing) | EKSIK |
| `getNestedValue` | (re-export for testing) | EKSIK |
| `setNestedValue` | (re-export for testing) | EKSIK |

**Toplam: ~15 export. 10 JSDoc VAR, 5 EKSIK (interface + test re-export).**

## 3. Ic Bagimliliklar
- `./config.js` → createDefaultConfig
- `./observability.js` → structuredLog
- `./types.js` → DeckentConfig
- `./model-equivalence.js` → ModelTier (type import)
- `./task-types.js` → ProviderName (type import)

Dongusel risk: config-migration.ts → config.ts. config.ts → config-migration.ts. **DIKKAT: Potansiyel circular!** Ancak config.ts'de `import { needsMigration, migrateConfig } from './config-migration.js'` var. config-migration.ts'de `import { createDefaultConfig } from './config.js'` var. **Bu bir circular dependency!** Node.js ESM bunu handle edebilir (deferred execution) ama risk mevcut.

## 4. Dis Bagimliliklar
- `node:fs` → readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, unlinkSync
- `node:path` → dirname, basename

**ADR-010:** Node built-in only. Uyumlu.

## 5. Complexity
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | ~15 |
| En karmasik fonksiyon | `migrateConfig()` (satir 166-289, ~123 satir, cyclomatic ~10) |
| Ikinci en karmasik | `migrateConfigV1ToV2()` (satir 468-551, ~83 satir, cyclomatic ~12) |
| Ucuncu en karmasik | `getMissingFields()` (satir 90-139, ~49 satir, cyclomatic ~8) |

## 6. Type Safety
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `Record<string, unknown>` everywhere | Multiple | Tum migration fonksiyonlari `Record<string, unknown>` ile calisir. Gerekli — config JSON'u untyped. |
| `existing['mode'] as string` | 204 | String cast. typeof kontrolu var. Guvenli. |
| `as unknown as Record<string, unknown>` | 91, 253, 351, 379 | createDefaultConfig() → Record cast. Gerekli. |
| `as unknown as DeckentConfig` | 365, 399 | merged → DeckentConfig cast. Migration sonucu — type safety migration sinirlari icinde makul. |
| `as string` | 72 | `parts[i]` cast. Loop icinde guvenli. |

**Toplam: 0 any, 0 @ts-ignore. ~6 `as` cast — migration context'inde kacinilmaz.**

## 7. ADR Compliance
| ADR | Uyum | Aciklama |
|-----|------|----------|
| ADR-004 | **UYUMLU** | Config migration 3-layer merge'i destekler |
| ADR-008 | **DIKKAT** | config.ts ↔ config-migration.ts circular import. Teknik olarak calisir ama ADR-008'in tek yonlu import ruhuna aykiri olabilir. |
| ADR-010 | **UYUMLU** | Node built-in |
| ADR-023 | **UYUMLU** | modelToTier() V1→V2 tier migration uygular |
| Memory V2 | **N/A** | Config migration, memory migration degil |

## 8. Test Coverage
- **Test dosyasi:** `tests/core/config-migration.test.ts` — MEVCUT
- Ek test dosyalari: config-backup-rotation.test.ts (pruneConfigBackups)
- Beklenen testler: missing field detection, legacy mode rename, V1→V2 tier migration, backup creation, dry-run, in-memory migration

## 9. TODO/FIXME/HACK inventory
**SIFIR.**

## 10. Dead Code
- `collectKeys()` (satir 38-50): Internal helper + test re-export. `getMissingFields` icinde dogrudan kullanilMIYOR — leaf key toplama icin tanimlanmis ama `getMissingFields` farkli bir mantik kullaniyor. **POTANSIYEL DEAD CODE.** P3.
- `ConfigModelStrategy` (satir 436-443): migrateConfigV1ToV2 icinde kullaniliyor. Dead code DEGIL.
- `ConfigProviders` (satir 448-453): migrateConfigV1ToV2 icinde kullaniliyor. Dead code DEGIL.

## 11. Security
| Alan | Durum | Aciklama |
|------|-------|----------|
| File operations | **DIKKATLI** | readFileSync, writeFileSync, copyFileSync, unlinkSync kullaniliyor. Config path disaridan geliyor — path traversal riski dusuk (config.ts tarafindan resolve ediliyor). |
| Backup pruning | **GUVENLI** | Regex ile sadece `.bak.YYYY-MM-DDT*` pattern'ina uyan dosyalar silinir. |
| JSON parse | **GUVENLI** | try/catch ile sarili (satir 182-191). |
| File race condition | **DUSUK RISK** | readFileSync → process → writeFileSync. Concurrent migration calismasi nadir ama TOCTOU riski var. |

## 12. Memory V2 Uyumu
- **Config migration, memory DB migration DEGIL.** Farkli sorumluluk.
- **V1→V2 tier migration:** model isimlerini tier'lere cevirir — config katmaninda. Memory V2'nin config.memory section'i migration'a tabi degil (yeni alan — default undefined).
- Bu dosya DB-first kavramini dogrudan iceRMEZ — config.json migration'u yapar.

## 13. i18n
- Log mesajlari Ingilizce: `'config_backups_pruned'`, `'config_backups_prune_failed'` (structuredLog event isimleri).
- Hata mesajlari Ingilizce.

## 14. Dokumantasyon Tutarliligi
- **modelToTier() mapping:**
  - `o3` → standard. **DIKKAT:** DECKENT.md'de `o3` "premium_plus" tier'inde. modelToTier `standard` donduruyor. **TUTARSIZLIK!** P1.
  - `gemini-3.1-pro-preview` modelToTier'da TANIMLI DEGIL → default 'standard'. DECKENT.md'de premium_plus. **TUTARSIZLIK!** P1.
  - `o4-mini` → economy. DECKENT.md'de standard. **TUTARSIZLIK!** P1.
- Bu tutarsizliklar, modelToTier()'in DECKENT.md tier tablosu ile senkronize OLMADIĞINI gosteriyor. **P1 BUG — tier mapping hatali.**

## 15. Performance
| Sorun | Satir | Aciklama |
|-------|-------|----------|
| `readFileSync` | 183 | Config dosyasi okuma. Tek seferlik. Kabul edilebilir. |
| `writeFileSync` | 267 | Config dosyasi yazma. Tek seferlik. |
| `copyFileSync` | 250 | Backup olusturma. Tek seferlik. |
| `readdirSync` | 306 | Backup prune icin dizin okuma. Tek seferlik. |
| `unlinkSync` | 328 | Eski backup silme. Tek seferlik. |

Tumu migration/prune context'inde — hot path DEGIL. Performans kabul edilebilir.

## 16. Oneriler
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| **P1** | modelToTier() tier mapping hatasi | o3 → premium_plus (standard degil), o4-mini → standard (economy degil), gemini-3.1-pro-preview → premium_plus ekle |
| P2 | Circular import | config.ts ↔ config-migration.ts arasindaki circular dependency'yi kes (createDefaultConfig'i constants.ts'e tasimak gibi) |
| P3 | collectKeys() dead code | Kullanilmiyorsa kaldir veya getMissingFields'i collectKeys kullanacak sekilde refactor et |
| P3 | TOCTOU race | File lock veya atomic write kullan (migration nadir oldugu icin dusuk oncelik) |

## Verdict: ANALYZED
