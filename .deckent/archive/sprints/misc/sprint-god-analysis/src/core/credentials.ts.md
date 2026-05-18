# Analysis: src/core/credentials.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 266 | **Effort:** max

## 1. Amaci
Deckent'in credential yönetim modülü. CredentialManager sınıfı (~/.deckent/credentials/ dizininde) provider bazlı API anahtarlarını güvenli şekilde saklar (AES-256-GCM şifreli). CRUD operasyonları (store, get, delete, update, list, has), eski plaintext entry desteği (backward compat), ve convenience helper'lar sağlar. CLI `deckent config set` komutları ve provider adapter'lar tarafından kullanılır.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `CredentialEntry` | interface { provider, key, storedAt } | Yok ❌ |
| `EncryptedCredentialEntry` | interface { provider, encrypted, storedAt } | Yok ❌ |
| `CredentialNotFoundError` | class extends Error | Yok ❌ |
| `CredentialStorageError` | class extends Error | Yok ❌ |
| `CredentialManager` | class | JSDoc per-method ✓ |
| `storeCredential` | `(provider, key) => void` | Var ✓ |
| `getCredential` | `(provider) => string \| null` | Var ✓ |
| `listCredentials` | `() => string[]` | Var ✓ |

**Eksik JSDoc:** 4 type/class tanımı.

## 3. Ic Bagimliliklar
- `./constants.js`: GLOBAL_CREDENTIALS_DIR
- `./utils.js`: readJsonSafe
- `./credential-encryption.js`: encrypt, decrypt, getMasterKey, isEncryptedEntry, EncryptedPayload

Döngüsel bağımlılık riski: YOK — tek yönlü.

## 4. Dis Bagimliliklar
Sadece Node.js built-in: `node:fs`, `node:path`. ADR-010 uyumlu ✓

## 5. Complexity
- **Fonksiyon sayısı:** 10 (7 class method + 3 convenience helper)
- **En karmaşık:** `getCredential` (satır 132-153) — encrypted vs plaintext branch
- **Max cyclomatic:** ~5 (getCredential — encrypted check + decryption + fallback)
- Genel karmaşıklık: **DÜŞÜK** — CRUD pattern, temiz

## 6. Type Safety
- **`any` sayısı:** 0
- **@ts-ignore:** 0
- **`as unknown`:** 2 (satır 151, 229) — `raw as unknown as CredentialEntry`
- **Non-null `!`:** 0

**`as unknown as CredentialEntry` riski:** JSON.parse sonucu doğrulanmadan CredentialEntry'ye cast ediliyor. Corrupted dosyada runtime error riski var. `entry?.key ?? null` (satır 152) nullish coalescing ile kısmen korunuyor ama type guard eksik.

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-006 | ✓ | spawnSync yok |
| ADR-008 | ✓ | Brain/orchestra import yok |
| ADR-010 | ✓ | Sadece Node built-in |
| ADR-014 (.deck) | ✓ | Credential storage implementasyonu |
| ADR-033 | ✓ | Hassas veri güvenli saklanıyor |
| Memory V2 | N/A | Credential sistemi ayrı |

## 8. Test Coverage
- `tests/core/credentials.test.ts` mevcut ✓
- **Beklenen:** storeCredential (encrypted + plaintext), getCredential (encrypted + legacy), deleteCredential, listCredentials, updateCredential (not found error), directory traversal sanitization

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code
- `CredentialNotFoundError`: updateCredential'da kullanılıyor ✓
- `CredentialStorageError`: storeCredential'da kullanılıyor ✓
- `EncryptedCredentialEntry`: tip olarak kullanılıyor (satır 92) ✓
- Dead code: YOK

## 11. Security
| Alan | Değerlendirme |
|------|---------------|
| **Path traversal koruması:** | ✓ `credentialFilePath` satır 73: `provider.replace(/[^a-zA-Z0-9_-]/g, '_')` — güvenli sanitization |
| **Dosya izinleri:** | ✓ 0o600 (owner read/write only) + chmod retry |
| **Dizin izinleri:** | ✓ 0o700 (owner only) |
| **Şifreleme:** | ✓ AES-256-GCM (credential-encryption.ts) |
| **Plaintext fallback:** | ⚠️ Legacy plaintext entry'ler okunabiliyor (satır 151) — migration path |
| **Input validation:** | ✓ provider ve key non-empty string check (satır 83-87) |
| **Credential listing:** | ⚠️ `listCredentials` provider name'leri açığa çıkarıyor — düşük risk |

## 12. Memory V2 Uyumu
N/A — credential sistemi Memory V2'den bağımsız.

## 13. i18n
- Hata mesajları İngilizce — internal modül için uygun
- Kullanıcıya CLI üzerinden gösterildiğinde İngilizce — kabul edilebilir

## 14. Dokumantasyon Tutarliligi
- Class method JSDoc'ları mevcut ve doğru ✓
- **Eksik:** 4 type/class definition JSDoc
- getCredentialEntry fonksiyonunun dökümanı doğru ✓
- Convenience helper'ların amacı açık ✓

## 15. Performance
| Sync I/O | Sayı | Fonksiyon |
|----------|------|-----------|
| existsSync | 4 | ensureDir, credentialFilePath check, deleteCredential, hasCredential |
| writeFileSync | 1 | storeCredential |
| unlinkSync | 1 | deleteCredential |
| chmodSync | 1 | storeCredential |
| readdirSync | 1 | listCredentials |

**Toplam: 8 sync I/O** — her storeCredential çağrısında getMasterKey + disk yazma. Batch operasyonlarda (multi-provider setup) darboğaz olabilir.

**Convenience helper'lar:** `storeCredential`, `getCredential`, `listCredentials` — her çağrıda yeni CredentialManager instance oluşturuyor. getMasterKey her seferinde disk okuyor — **P1 caching sorunu** (credential-encryption.ts raporunda da belirtildi).

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P1** | Convenience helper'larda shared CredentialManager instance veya getMasterKey caching |
| **P2** | `as unknown as CredentialEntry` cast'larını type guard ile değiştir |
| **P2** | Legacy plaintext entry migration — yeniden kaydederek şifrele |
| **P3** | Interface ve class JSDoc'larını ekle |
| **P3** | listCredentials çıktısının hassas bilgi içermediğini doğrula (provider name'ler OK) |

## Verdict: ANALYZED
