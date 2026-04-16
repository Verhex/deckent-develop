# Analysis: src/cli/helpers/review-summary.ts
**Task ID:** 142-023 | **Model:** opus | **LoC:** 127 | **Effort:** max

## 1. Amaç
Sprint review özetini üretme ve formatlama modülü. Review kararlarını (approved/rejected/retry/pending) sayarak özet veri yapısı oluşturur. Hem terminal formatı hem Markdown rapor dosyası üretir. `review` CLI komutu ve sprint-finalizer tarafından kullanılır.

## 2. Public API
- `interface ReviewSummaryData { sprintId, totalReviewed, approvedCount, rejectedCount, pendingCount, retryQueuedCount, rejectedTasks, retryTasks }` — JSDoc YOK
- `class ReviewSummary` — JSDoc YOK
  - `generate(sprintId, reviewStatus, rejectionReasons?, retryTaskIds?): ReviewSummaryData` — JSDoc YOK, EKSIK
  - `formatReviewSummary(summary): string` — JSDoc YOK, EKSIK
  - `writeReviewReport(summary, outputPath): void` — JSDoc YOK, EKSIK

## 3. İç Bağımlılıklar
- `node:fs` — mkdirSync, writeFileSync
- `node:path` — path.dirname
- `./review-actions.js` → `ReviewDecision` (type import only)
- Döngüsel bağımlılık riski: YOK

## 4. Dış Bağımlılıklar
Hiçbir dış bağımlılık yok. ADR-010: TAM ✓

## 5. Complexity
- Fonksiyon sayısı: 3 (generate, formatReviewSummary, writeReviewReport)
- Max cyclomatic: ~5 (generate — for + 4 if/else if)
- En karmaşık fonksiyon: `generate` (satır 18) — decision counting + retry merging logic

## 6. Type Safety
- `any` sayısı: 0 ✓
- `[_, d]` destructuring (satır 59): Underscore convention doğru ✓
- Tip güvenliği: İYİ

## 7. ADR Compliance
- ADR-006: N/A ✓
- ADR-008: Brain import yok ✓
- ADR-010: TAM ✓
- ADR-022: review CLI ve MCP'de var ✓
- Memory V2: N/A (çıktı formatter)

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/review-summary.test.ts` MEVCUT ✓
- Kritik: retry logic (retryTaskIds override vs evaluations fallback), boş özet, tüm rejected

## 9. TODO/FIXME/HACK Inventory
Hiç yok ✓

## 10. Dead Code
- `writeReviewReport`: src/ içinde çağrılıyor mu?
  - Grep: sadece bu dosyada tanımlı — **POTANSIYEL DEAD CODE** (review komutu çağırıyor mu kontrol edilmeli)
  - Severity: P3
- Diğer export'lar aktif ✓

## 11. Security
- `outputPath` path traversal: Parametre olarak geliyor, sanitize yok
  - Mitigation: İç kullanım, dışarıdan parametre gelmez genelde
  - Severity: P3
- writeFileSync: Dosya üzerine yazma — mevcut dosya kaybı riski
  - Mitigation: Sprint review sırasında bir kez çağrılır
  - Severity: P3

## 12. Memory V2 Uyumu
N/A — Çıktı formatter, DB ile etkileşim yok.

## 13. i18n
- Hardcoded EN string'ler: "Review Summary for", "Total reviewed:", "Approved:", "Rejected:", "Pending:", "Queued for retry:", "Rejected tasks:", "Retry queued:", "# Review Report:"
- Severity: P3 (CLI output)

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 3/3 public method EKSİK — P3
- ReviewSummaryData interface belgelenmemiş

## 15. Performance
- Sync I/O: 2 (writeFileSync satır 124, mkdirSync satır 123)
- Hot path: Hayır (bir kez çağrılır)
- String building: Array.join pattern — verimli ✓

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P3 | `writeReviewReport` kullanım kontrolü — dead code candidate |
| P3 | JSDoc eklenmeli (3 public method + 1 interface) |
| P3 | i18n: Hardcoded EN string'ler locale-aware yapılabilir |

## Verdict: ANALYZED
