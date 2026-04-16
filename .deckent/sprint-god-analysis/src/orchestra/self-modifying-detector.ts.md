# Analysis: src/orchestra/self-modifying-detector.ts
**Task ID:** 142-011 | **Model:** opus | **LoC:** 163 | **Effort:** max

## 1. Amacı
ADR-039'un implementasyonu. Deckent'in kendi kaynak kodunu değiştiren sprint'leri (dogfood mode) tespit eder. User project ile Deckent repo'sunu ayırt etmek için `package.json` → `"name": "deckent"` kontrolü yapar. Self-modifying sprint'ler sıralı execution, cache invalidation ve MCP restart gerektirdiğinden bu ayrım kritiktir.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `SelfModifyCheckable` | interface | ✅ Var — "Minimal task shape" |
| `DECKENT_SOURCE_PATTERNS` | `readonly string[]` (11 pattern) | ✅ Var — detaylı açıklama |
| `clearDetectionCache()` | `() => void` | ✅ Var — "Useful for testing" |
| `detectDeckentRepo()` | `(projectRoot: string) => boolean` | ✅ Kapsamlı JSDoc — 2 koşul açıklandı |
| `isSelfModifying()` | `(task, projectRoot) => boolean` | ✅ Detaylı |
| `isSelfModifyingSprint()` | `(tasks[], projectRoot) => boolean` | ✅ Detaylı |

JSDoc coverage: **%100**.

## 3. İç Bağımlılıklar
- `../core/task-types.js` → `TaskScope` (type-only import)
- **Döngüsel bağımlılık riski:** Yok. Saf core/ tipi import.

## 4. Dış Bağımlılıklar
- `node:fs` → `readFileSync`, `existsSync`
- `node:path` → `join`
- **ADR-010 uyumu:** ✅ Sadece Node.js built-in.

## 5. Complexity
- **Fonksiyon sayısı:** 5 (4 export, 1 private: matchesDeckentSource)
- **En karmaşık fonksiyon:** `detectDeckentRepo()` (satır 74-95) — basit: existsSync + JSON.parse + name check
- **Max cyclomatic complexity:** ~3 — çok düşük
- **Genel karmaşıklık:** ÇOK DÜŞÜK. Modül sade ve tek amaçlı.

## 6. Type Safety
- **any sayısı:** 0
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **as unknown:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** 1 — satır 84: `JSON.parse(...) as { name?: string }` — acceptable, optional field ile güvenli

**Değerlendirme:** Mükemmel tip güvenliği.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-008 (brain import) | ✅ | Sadece core/ import |
| ADR-010 (tek dep) | ✅ | Built-in only |
| ADR-039 (self-modifying) | ✅ | **Bu dosya ADR-039'un implementasyonu** |

## 8. Test Coverage
- **Test dosyası:** `tests/orchestra/self-modifying-detector.test.ts` (247 satır)
- **Eşleşme:** ✅ Var
- **Test kalitesi:** İyi — detectDeckentRepo, isSelfModifying, isSelfModifyingSprint, DECKENT_SOURCE_PATTERNS, clearDetectionCache test ediliyor
- **Edge case coverage:** package.json parse hatası, .deckent/ yok, boş scope

## 9. TODO/FIXME/HACK Inventory
**Yok.** 0 adet.

## 10. Dead Code
### 🔴 KRİTİK BULGU: self-modifying-detector.ts HİÇBİR YERDEN İMPORT EDİLMİYOR

`grep -r "from.*self-modifying-detector" src/` sonucu: **0 eşleşme**.

Bu modül:
- `src/orchestra/index.ts`'de re-export EDİLMİYOR
- Hiçbir sprint-spawner, sprint-controller, authority-enforcer veya worker tarafından import EDİLMİYOR
- `authority-enforcer.ts` kendi `isSelfModifyingSprint` parametresini alıyor ama bu modülden çağırmıyor

**Sonuç:** Bu modül tam bir DEAD CODE. ADR-039'da tanımlanan deteksiyon mekanizması RUNTIME'DA BAĞLI DEĞİL. authority-enforcer'daki `isSelfModifyingSprint` flag'i caller tarafından sağlanıyor — ama kimse bu detektörü çağırıp flag'i üretmiyor.

**Severity: P0** — ADR-039 enforcement'ı kağıt üzerinde var ama runtime'da aktif değil.

## 11. Security
- **Injection riski:** Yok — sadece dosya okuma ve path karşılaştırma
- **False positive riski:** `package.json → name === 'deckent'` çok spesifik — düşük
- **Cache poisoning:** `repoDetectionCache` process lifetime boyunca geçerli — çalışma dizini değişirse stale olabilir ama pratik risk çok düşük

## 12. Memory V2 Uyumu
- N/A — Memory V2 ile doğrudan ilişkisi yok
- `readFileSync` sadece `package.json` okumak için — eski .md parse değil

## 13. i18n
- Hardcoded string yok (user-facing output yok)
- **Değerlendirme:** Temiz

## 14. Dokümantasyon Tutarlılığı
- Dosya başındaki ADR-039 referansı doğru
- JSDoc ↔ davranış: Tutarlı
- **Ama:** IDENTITY.md'de "ADR-038 Self-Modifying Task Detection" olarak listeleniyor — ADR numarası karışıklığı. IDENTITY.md'de ADR-038 olarak geçen karar aslında dosyada ADR-039 referansı var. **Cross-validation gerekli.**

## 15. Performance
- **Sync I/O:** existsSync(×2) + readFileSync(×1) — ama per-projectRoot cache ile 1 kez çalışır
- **Hot path:** `isSelfModifying()` her task için çağrılsa bile `detectDeckentRepo()` cache'li — O(1) amortized
- **Değerlendirme:** Performans optimal

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| **P0** | **DEAD CODE: Modül hiçbir yerden import edilmiyor. sprint-spawner'a wire edilmeli veya silinmeli** |
| P1 | orchestra/index.ts'den re-export ekle, sprint-spawner'da `isSelfModifyingSprint()` çağrısı ekle |
| P2 | ADR-038 vs ADR-039 numarası karışıklığını IDENTITY.md'de düzelt |
| P3 | Cache invalidation mekanizması ekle (test ortamında clearDetectionCache var ama production'da hiç çağrılmıyor) |

## Verdict: ANALYZED
