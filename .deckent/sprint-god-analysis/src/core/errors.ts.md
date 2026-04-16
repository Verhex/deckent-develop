# Analysis: src/core/errors.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 589 | **Effort:** max

## 1. Amaci
Deckent projesinin merkezi hata yönetim modülü. `DeckentError` sınıfı (insan-dostu hata alanları: whatHappened, why, howToFix), `ErrorRegistry` (kod bazlı hata kayıt defteri — 35+ önceden tanımlı hata kodu), ve `formatHumanError` formatter fonksiyonunu sağlar. CLI, MCP, orchestra ve worker modülleri tarafından tutarlı hata mesajları üretmek için kullanılır.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `DeckentError` | class extends Error | Var ✓ (constructor parametreleri) |
| `ErrorEntry` | interface | Var ✓ |
| `ErrorRegistry` | const object (get, has, getAll, createError, register) | Her method JSDoc ✓ |
| `formatHumanError` | `(error: DeckentError) => string` | Var ✓ |

## 3. Ic Bagimliliklar
Hiçbir internal import yok — tamamen bağımsız modül. ✓
Döngüsel bağımlılık riski: SIFIR.

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. Pure TypeScript. ADR-010 uyumlu ✓

## 5. Complexity
- **Fonksiyon sayısı:** 6 (class constructor + 4 registry method + 1 formatter)
- **Registry entry sayısı:** 35 hata kodu (E001-E066 arası, boşluklu)
- **Max cyclomatic:** ~3 (formatHumanError — optional field kontrolları)
- **En karmaşık:** `formatHumanError` (satır 557-588) — 4 optional alan kontrolü
- Genel karmaşıklık: **ÇOK DÜŞÜK** — düz veri yapısı + basit logic

## 6. Type Safety
- **`any` sayısı:** 0
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **`as unknown`:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** 0

Type safety skoru: **MÜKEMMEL** ✓

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-006 | N/A | spawnSync yok |
| ADR-008 | ✓ | Hiçbir internal import yok |
| ADR-010 | ✓ | Hiçbir dış bağımlılık yok |
| ADR-033 | ✓ | Hata mesajları sadece yerel — telemetri yok |
| Memory V2 | N/A | Memory ile ilgisi yok |

## 8. Test Coverage
- `tests/core/errors.test.ts` mevcut ✓
- **Beklenen test konuları:** DeckentError oluşturma, ErrorRegistry.get/has/createError/register, formatHumanError output formatı, bilinmeyen kod fallback

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code
| Bulgu | Severity | Detay |
|-------|----------|-------|
| `ErrorEntry.docLink` | P3 | Hiçbir registry entry'de docLink set edilmemiş — ama interface'de mevcut, gelecek için |
| Bazı hata kodları kullanılmıyor olabilir | P3 | E053-E066 marketplace/experiment kodları — marketplace özelliği aktif mi? |

**Not:** Hata kodları registry'de olması "dead code" değil — defensive registration pattern. Kullanılmayanlar kaldırılabilir ama risk düşük.

## 11. Security
- **Hata mesajlarında hassas bilgi:** Yok — mesajlar genel ve teknik
- **İnjection riski:** Yok — string interpolation sadece sabit metinlerle
- **Error message disclosure:** CLI'da kullanıcıya gösterildiğinde hassas iç detay sızdırmıyor ✓

## 12. Memory V2 Uyumu
Bu modül Memory V2 ile doğrudan ilişkili değil. Herhangi bir .md parse veya readFileSync kullanımı yok. N/A ✓

## 13. i18n
- Tüm hata mesajları **İngilizce** hardcoded
- `howToFix` dizileri İngilizce
- Dashboard'daki i18n sistemi (en.ts/tr.ts) ile entegrasyon yok
- **Eksik:** TR çevirisi — ancak bu bir error registry, CLI/MCP çıktısında İngilizce kabul edilebilir

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ davranış: UYUMLU ✓
- Her ErrorEntry'de 4 alan: message, suggestion, whatHappened, why, howToFix — tutarlı format
- Hata kodu aralıkları mantıklı: E001-E010 (genel), E020-E039 (CLI), E040-E059 (orchestra), E060-E079 (agent)

## 15. Performance
- **Sync I/O:** 0 — pure in-memory Map
- **Hot path:** ErrorRegistry.get/createError — O(1) Map lookup, optimal
- Performans sorunu: YOK ✓

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P2** | Hata kodlarının kullanım denetimi — kullanılmayan kodları temizle (E053-E066 marketplace/experiment) |
| **P3** | `docLink` alanını ya doldur ya da interface'den kaldır |
| **P3** | Hata kodları için enum veya as const object düşün — string literal yerine type-safe reference |
| **P3** | i18n desteği — hata mesajları için TR çevirisi opsiyonel olarak eklenebilir |

## Verdict: ANALYZED
