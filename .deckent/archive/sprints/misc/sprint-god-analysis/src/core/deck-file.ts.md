# Analysis: src/core/deck-file.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 199 | **Effort:** max

## 1. Amaci
ADR-014 (.deck Secret File System) implementasyonu. Proje kökündeki `.deck` dosyasının (Deckent'in .env eşdeğeri) yönetimini sağlar: parse (KEY=VALUE formatı, yorum desteği, quoted değerler), load, validate (bilinen anahtarlar listesi), template oluşturma, .gitignore entegrasyonu ve git tracking güvenlik kontrolü. Brain secrets'ı buradan okur ve worker'lara seçici şekilde iletir.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `DECK_FILE_NAME` | const '.deck' | Var ✓ |
| `KNOWN_DECK_KEYS` | const readonly string[] (9 key) | Var ✓ |
| `KnownDeckKey` | type | Yok ❌ |
| `DeckFileValidation` | interface | Var ✓ |
| `parseDeckFile` | `(content: string) => Record<string, string>` | Var ✓ |
| `loadDeckSecrets` | `(projectRoot: string) => Record<string, string>` | Var ✓ |
| `validateDeckFile` | `(secrets: Record<string, string>) => DeckFileValidation` | Var ✓ |
| `createDeckTemplate` | `(projectRoot: string) => void` | Var ✓ |
| `ensureDeckGitignore` | `(projectRoot: string) => void` | Var ✓ |
| `isDeckFileCommitted` | `(projectRoot: string) => boolean` | Var ✓ |

## 3. Ic Bagimliliklar
Hiçbir core modülü import edilmez — tamamen bağımsız. ✓
- `node:fs`: existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync
- `node:child_process`: execSync
- `node:path`: join

## 4. Dis Bagimliliklar
Sadece Node.js built-in. ADR-010 uyumlu ✓

## 5. Complexity
- **Fonksiyon sayısı:** 6 export + 0 internal
- **En karmaşık:** `parseDeckFile` (satır 45-77) — line-by-line parse, comment/blank skip, quote strip
- **Max cyclomatic:** ~6 (parseDeckFile — 5 continue/if branch)
- Genel karmaşıklık: **DÜŞÜK**

## 6. Type Safety
- **`any` sayısı:** 0
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **`as unknown`:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** `key as KnownDeckKey` (satır 113) — KNOWN_DECK_KEYS.includes() kontrolünden sonra, GÜVENLİ

Type safety skoru: **MÜKEMMEL** ✓

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-006 (spawnSync) | ⚠️ İHLAL | `execSync` kullanımı (satır 187) — `git ls-files --error-unmatch .deck`. ADR-006 spawnSync security pattern'ı gerektiriyor ama execSync'te timeout/maxBuffer yok |
| ADR-008 | ✓ | Internal import yok |
| ADR-010 | ✓ | Sadece Node built-in |
| ADR-014 | ✓ | .deck secret system ana implementasyonu |
| ADR-033 | ✓ | Secrets dışarıya sızdırılmıyor |
| Memory V2 | N/A | Secret system ayrı alan |

## 8. Test Coverage
- `tests/core/deck-file.test.ts` mevcut ✓
- **Beklenen:** parseDeckFile (comments, quotes, empty, malformed), loadDeckSecrets (missing file), validateDeckFile (known/unknown keys, invalid format), createDeckTemplate, ensureDeckGitignore (idempotent), isDeckFileCommitted

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code
- `KNOWN_DECK_KEYS` → `DECKENT_TELEMETRY_ID` — ADR-033 product vision telemetriyi devre dışı bırakıyor. Bu key hala geçerli mi?
- `DECKENT_DB_URL`, `DECKENT_SMTP_*` — bu özellikler aktif mi? Bilinen key listesinde ama kullanıldıkları yer belirsiz
- Kesin dead code: YOK — ancak bazı key'lerin kullanım noktası doğrulanmalı

## 11. Security — KRİTİK ANALİZ
| Alan | Değerlendirme |
|------|---------------|
| **parseDeckFile:** | ✓ Basit KEY=VALUE parser — injection riski yok |
| **loadDeckSecrets:** | ✓ Dosya okuma, process.env'ye enjekte etmiyor — güvenli |
| **isDeckFileCommitted:** | ⚠️ `execSync('git ls-files --error-unmatch .deck')` — command injection riski yok (hardcoded komut) ama timeout/maxBuffer eksik |
| **.gitignore entegrasyonu:** | ✓ ensureDeckGitignore idempotent — .deck'in commit edilmesini önlüyor |
| **Dosya izinleri:** | ❌ EKSİK — createDeckTemplate .deck dosyasını 0o644 (default) ile oluşturuyor. 0o600 olmalı! Hassas bilgi dosyası. |
| **Key validation:** | ✓ validateDeckFile alphanumeric + underscore pattern kontrolü |

**P0 Güvenlik Bulgusu:** `createDeckTemplate` (satır 128-156) `.deck` dosyasını default permission'la oluşturuyor — bu dosya API key'leri içerecek, 0o600 olmalı!

## 12. Memory V2 Uyumu
N/A — .deck secret system Memory V2'den tamamen bağımsız.

## 13. i18n
- Template yorum satırları İngilizce
- Hata mesajları İngilizce — internal modül, uygun

## 14. Dokumantasyon Tutarliligi
- JSDoc'lar fonksiyonların davranışını doğru açıklıyor ✓
- `KNOWN_DECK_KEYS` listesi 9 key — hepsi belgeli
- parseDeckFile format açıklaması: "KEY=VALUE lines, # comments, blank lines skipped, whitespace trimmed, quoted values" ✓
- **Tutarsızlık:** DECKENT.md'de .deck dosyası referansı ADR-014 olarak belirtilmiş ama KNOWN_DECK_KEYS'deki bazı key'ler (DB_URL, SMTP) için feature yokmuş gibi görünüyor

## 15. Performance
| Sync I/O | Sayı | Fonksiyon |
|----------|------|-----------|
| existsSync | 3 | loadDeckSecrets, ensureDeckGitignore (2×) |
| readFileSync | 2 | loadDeckSecrets, ensureDeckGitignore |
| writeFileSync | 2 | createDeckTemplate, ensureDeckGitignore |
| appendFileSync | 1 | ensureDeckGitignore |
| mkdirSync | 1 | createDeckTemplate |
| execSync | 1 | isDeckFileCommitted |

**Toplam: 10 sync I/O** — `init` sırasında tek seferlik çalıyor, hot path değil.

**execSync riski:** `isDeckFileCommitted` git komutu çalıştırıyor — git repo değilse exception, timeout/maxBuffer belirlenmemiş.

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P0** | `createDeckTemplate`: dosya izinlerini 0o600 yap — `writeFileSync(deckPath, ..., { mode: 0o600 })` |
| **P1** | `isDeckFileCommitted` execSync'e timeout + maxBuffer ekle — ADR-006 uyumu |
| **P2** | KNOWN_DECK_KEYS'den kullanılmayan key'leri (DECKENT_DB_URL, SMTP_*, TELEMETRY_ID) doğrula veya kaldır |
| **P3** | KnownDeckKey type'ına JSDoc ekle |

## Verdict: ANALYZED
