# Analysis: src/core/global-config.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 74 | **Effort:** max

## 1. Amaci
Deckent'in global (~/.deckent/) konfigürasyon yönetim modülü. ADR-004 (3-Layer Config Merge) kapsamında: global config dosyası (read/write), dizin oluşturma (ensure), proje config'iyle birleştirme (merge), dosya yolu ve varlık kontrolü sağlar. CLI `deckent config set --global` ve startup'ta config merge için kullanılır.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `ensureGlobalDir` | `() => void` | Var ✓ |
| `readGlobalConfig` | `() => Partial<DeckentConfig> \| null` | Var ✓ |
| `writeGlobalConfig` | `(config: Partial<DeckentConfig>) => void` | Var ✓ |
| `mergeWithProjectConfig` | `(projectConfig, globalConfig) => DeckentConfig` | Var ✓ |
| `getGlobalConfigPath` | `() => string` | Var ✓ |
| `isGlobalConfigPresent` | `() => boolean` | Var ✓ |

Tüm JSDoc'lar mevcut ve doğru. ✓

## 3. Ic Bagimliliklar
- `./constants.js`: GLOBAL_CONFIG_PATH, GLOBAL_CREDENTIALS_DIR, GLOBAL_DECKENT_DIR
- `./types.js`: DeckentConfig
- `./config.js`: deepMerge
- `./utils.js`: readJsonSafe

Döngüsel bağımlılık riski: YOK — config.js'den sadece deepMerge utility import ediliyor.

## 4. Dis Bagimliliklar
Sadece Node.js built-in: `node:fs`. ADR-010 uyumlu ✓

## 5. Complexity
- **Fonksiyon sayısı:** 6
- **En karmaşık:** `mergeWithProjectConfig` (satır 52-59) — çift deepMerge çağrısı
- **Max cyclomatic:** ~2 (readGlobalConfig — existsSync check)
- Genel karmaşıklık: **ÇOK DÜŞÜK**

## 6. Type Safety
- **`any` sayısı:** 0
- **@ts-ignore:** 0
- **`as unknown`:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** 0

Type safety skoru: **MÜKEMMEL** ✓

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-004 (3-Layer Config) | ✓ | Global config merge implementasyonu |
| ADR-006 | N/A | spawnSync yok |
| ADR-008 | ✓ | Brain/orchestra import yok |
| ADR-010 | ✓ | Sadece Node built-in |
| Memory V2 | N/A | Config sistemi ayrı |

## 8. Test Coverage
- `tests/core/global-config.test.ts` mevcut ✓
- **Beklenen:** ensureGlobalDir (idempotent), readGlobalConfig (missing file, valid, malformed), writeGlobalConfig, mergeWithProjectConfig (project priority), getGlobalConfigPath, isGlobalConfigPresent

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code
Yok — tüm fonksiyonlar CLI config komutları ve startup tarafından kullanılıyor.

## 11. Security
| Alan | Değerlendirme |
|------|---------------|
| **Dizin izinleri:** | ⚠️ `ensureGlobalDir` mkdirSync mode parametresi belirtmiyor — default umask'a bağlı. Hassas credential'lar bu dizinde saklanıyor, 0o700 olmalı. |
| **Config yazma:** | ✓ writeGlobalConfig JSON.stringify + writeFileSync — injection riski yok |
| **readGlobalConfig JSDoc tutarsızlığı:** | ⚠️ JSDoc "Throws on malformed JSON" diyor ama readJsonSafe kullanıyor — readJsonSafe catch yapıp null döndürür, THROW ETMEZ. JSDoc YANLIŞ. |

## 12. Memory V2 Uyumu
N/A — global config sistemi Memory V2'den bağımsız. memory.backend config alanı config-types.ts'de tanımlı olmalı — bu modül sadece read/write/merge yapıyor.

## 13. i18n
N/A — config dosyası JSON formatında, dil bağımsız.

## 14. Dokumantasyon Tutarliligi
- JSDoc'lar genel olarak doğru ✓
- **HATA:** `readGlobalConfig` JSDoc: "Throws on malformed JSON" — gerçekte readJsonSafe null döndürür, throw etmez. **P1 tutarsızlık!**
- ensureGlobalDir "Idempotent" açıklaması doğru ✓
- mergeWithProjectConfig: "Project config takes priority" doğru ✓

## 15. Performance
| Sync I/O | Sayı | Fonksiyon |
|----------|------|-----------|
| existsSync | 4 | ensureGlobalDir (2×), readGlobalConfig, isGlobalConfigPresent |
| mkdirSync | 2 | ensureGlobalDir (2× recursive) |
| writeFileSync | 1 | writeGlobalConfig |

**Toplam: 7 sync I/O** — startup'ta bir kez çağrılır, hot path değil.

**mergeWithProjectConfig performans notu:** Çift deepMerge çağrısı (satır 57-58) — `deepMerge(projectConfig, globalConfig)` sonra `deepMerge(result, projectConfig)`. Bu iki kez deep copy + merge yapıyor. Tek deepMerge yeterli olmalı (global → project override).

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P1** | `readGlobalConfig` JSDoc'unu düzelt: "Throws on malformed JSON" → "Returns null on malformed JSON" |
| **P1** | `ensureGlobalDir`: mkdirSync'e `{ mode: 0o700 }` ekle — hassas dizin |
| **P2** | `mergeWithProjectConfig` çift deepMerge — tek seferde `deepMerge(globalConfig, projectConfig)` yeterli, gereksiz overhead |
| **P3** | writeGlobalConfig: dosya izni 0o600 olarak belirlenebilir |

## Verdict: ANALYZED
