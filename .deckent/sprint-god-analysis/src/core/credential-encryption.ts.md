# Analysis: src/core/credential-encryption.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 140 | **Effort:** max

## 1. Amaci
AES-256-GCM tabanlı credential şifreleme modülü. ADR-014 (.deck Secret File System) kapsamında, API anahtarlarını ve hassas bilgileri disk üzerinde şifreli saklamak için kullanılır. Master key yönetimi (env var → keyring dosyası → otomatik oluşturma), encrypt/decrypt fonksiyonları ve encrypted entry detection sağlar. CredentialManager tarafından kullanılır.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `EncryptedPayload` | interface { iv, ciphertext, tag } | Yok ❌ |
| `CredentialEncryptionError` | class extends Error | Yok ❌ |
| `getMasterKey` | `(options?: { keyringPath? }) => Buffer` | Var ✓ |
| `encrypt` | `(plaintext: string, masterKey: Buffer) => EncryptedPayload` | Var ✓ |
| `decrypt` | `(encrypted: EncryptedPayload, masterKey: Buffer) => string` | Var ✓ |
| `isEncryptedEntry` | `(entry: unknown) => entry is { encrypted: EncryptedPayload }` | Var ✓ |

**Eksik JSDoc:** EncryptedPayload interface ve CredentialEncryptionError class.

## 3. Ic Bagimliliklar
Hiçbir internal import yok — tamamen bağımsız. ✓

## 4. Dis Bagimliliklar
- `node:crypto`: randomBytes, createCipheriv, createDecipheriv
- `node:fs`: existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync
- `node:path`: join
- `node:os`: homedir

Tüm Node built-in. ADR-010 uyumlu ✓

## 5. Complexity
- **Fonksiyon sayısı:** 4 export + 0 internal
- **En karmaşık:** `getMasterKey` (satır 35-78) — 3-aşamalı fallback (env → file → generate)
- **Max cyclomatic:** ~5 (getMasterKey — 3 branch + 2 error check)
- Genel karmaşıklık: **DÜŞÜK** — kriptografi wrapper, temiz implementasyon

## 6. Type Safety
- **`any` sayısı:** 0
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **`as unknown`:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** `as Record<string, unknown>` (satır 135, 138) — `isEncryptedEntry` type guard içinde, GÜVENLİ

Type safety skoru: **MÜKEMMEL** ✓

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-006 | ✓ | spawnSync yok |
| ADR-008 | ✓ | Internal import yok |
| ADR-010 | ✓ | Sadece Node built-in |
| ADR-014 (.deck) | ✓ | .deck secret system implementasyonunun parçası |
| ADR-033 | ✓ | Hassas veri dışarı sızmıyor |
| Memory V2 | N/A | Credential sistemi Memory V2'den bağımsız |

## 8. Test Coverage
- `tests/core/credential-encryption.test.ts` mevcut ✓
- **Beklenen:** encrypt/decrypt roundtrip, wrong key detection, invalid key length, getMasterKey (env/file/auto), isEncryptedEntry type guard

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code
Yok — tüm export'lar credentials.ts tarafından kullanılıyor.

## 11. Security — KRİTİK ANALİZ
| Alan | Değerlendirme |
|------|---------------|
| **Algoritma:** AES-256-GCM | ✓ DOĞRU — NIST onaylı, authenticated encryption |
| **IV boyutu:** 12 byte (96-bit) | ✓ DOĞRU — GCM için önerilen standart |
| **Key boyutu:** 32 byte (256-bit) | ✓ DOĞRU |
| **IV oluşturma:** `randomBytes(12)` | ✓ DOĞRU — CSPRNG kullanımı |
| **Auth tag:** `cipher.getAuthTag()` | ✓ DOĞRU — tamper detection |
| **Tag verification:** `decipher.setAuthTag(tag)` | ✓ DOĞRU — decrypt'te kontrol |
| **Key storage (file):** 0o600 permission | ✓ İYİ — owner-only read/write |
| **Key storage (dir):** 0o700 permission | ✓ İYİ — owner-only access |
| **Env var fallback:** `DECKENT_MASTER_KEY` | ⚠️ ORTA RİSK — env var process listesinde görünebilir |
| **Key rotation:** YOK | ⚠️ ORTA RİSK — master key değiştirilirse tüm credential'lar okunamaz |
| **Memory safety:** Key Buffer GC'ye bağlı | ⚠️ DÜŞÜK RİSK — key scrubbing yok |

**Genel güvenlik skoru:** İYİ — kriptografik implementasyon doğru, standartlara uygun.

## 12. Memory V2 Uyumu
N/A — credential sistemi Memory V2'den tamamen bağımsız.

## 13. i18n
- Hata mesajları İngilizce — internal kriptografi modülü için uygun
- Kullanıcıya gösterilmiyor (CLI/CredentialManager wrap ediyor)

## 14. Dokumantasyon Tutarliligi
- Section başlıkları (Types, Constants, Master Key, Encrypt/Decrypt) — düzenli ✓
- `getMasterKey` 3-aşamalı fallback iyi belgelenmiş ✓
- **Eksik:** EncryptedPayload interface JSDoc, CredentialEncryptionError JSDoc

## 15. Performance
| Sync I/O | Sayı | Fonksiyon |
|----------|------|-----------|
| existsSync | 2 | getMasterKey (keyring check, dir check) |
| readFileSync | 1 | getMasterKey (keyring read) |
| writeFileSync | 1 | getMasterKey (keyring create) |
| mkdirSync | 1 | getMasterKey (dir create) |
| chmodSync | 1 | getMasterKey (permission set) |

**Toplam: 6 sync I/O** — sadece ilk çağrıda keyring oluşturma, sonra cachelenmeli (credentials.ts'de her çağrıda yeni CredentialManager → yeni getMasterKey çağrısı — caching eksik!).

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P1** | Master key caching ekle — her encrypt/decrypt çağrısında getMasterKey disk okuyor |
| **P2** | Key rotation mekanizması planlansın — mevcut yapıda key değişimi tüm credential'ları kırar |
| **P2** | EncryptedPayload ve CredentialEncryptionError'a JSDoc ekle |
| **P3** | Master key Buffer scrubbing (`buf.fill(0)`) güvenlik artırımı — opsiyonel |
| **P3** | DECKENT_MASTER_KEY env var riski belgelen — `keyringPath` tercih edilmeli |

## Verdict: ANALYZED
