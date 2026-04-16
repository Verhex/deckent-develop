# Analysis: src/cli/helpers/review-actions.ts
**Task ID:** 142-023 | **Model:** opus | **LoC:** 107 | **Effort:** max

## 1. Amaç
Sprint review kararlarını yöneten modül. Task bazında approve/reject/retry kararlarını JSON dosyası olarak `.tasks/review-{sprintId}.json` formatında saklar. Review komutu ve sprint-finalizer tarafından kullanılır. State persistence ile birden fazla review döngüsünü destekler.

## 2. Public API
- `type ReviewDecision = 'approved' | 'rejected' | 'retry' | 'pending'` — JSDoc YOK
- `interface ReviewEntry { taskId, decision, reason?, reviewedAt? }` — JSDoc YOK
- `interface ReviewState { sprintId, entries, createdAt, updatedAt }` — JSDoc YOK
- `class ReviewActions` — JSDoc YOK
  - `constructor(tasksDir: string)` — JSDoc YOK
  - `approveTask(taskId, sprintId): void` — JSDoc YOK, EKSIK
  - `rejectTask(taskId, sprintId, reason?): void` — JSDoc YOK, EKSIK
  - `retryTask(taskId, sprintId, reason?): void` — JSDoc YOK, EKSIK
  - `getReviewStatus(taskId, sprintId): ReviewEntry | null` — JSDoc YOK, EKSIK
  - `getAllReviewStatuses(sprintId): Map<string, ReviewDecision>` — JSDoc YOK, EKSIK
  - `isReviewComplete(sprintId): boolean` — JSDoc YOK, EKSIK
  - `loadState(sprintId): ReviewState` — JSDoc YOK (public — `review-summary.ts` kullanıyor)
  - `saveState(state): void` — JSDoc YOK

## 3. İç Bağımlılıklar
- `node:fs` — readFileSync, writeFileSync, mkdirSync
- `node:path` — path.join, path.dirname
- Döngüsel bağımlılık riski: YOK

## 4. Dış Bağımlılıklar
Hiçbir dış bağımlılık yok. ADR-010 uyumu: TAM ✓

## 5. Complexity
- Fonksiyon sayısı: 10 (8 public + 2 private)
- Max cyclomatic: ~3 (setDecision — find + if/else)
- En karmaşık fonksiyon: `setDecision` (satır 65) — find + update/push pattern

## 6. Type Safety
- `any` sayısı: 0 ✓
- `JSON.parse(raw) as ReviewState` (satır 90): Unsafe cast — runtime validation YOK
  - Risk: Corrupt JSON dosyası → beklenmeyen davranış
  - Severity: P2
- Tip güvenliği: ORTA (JSON cast riski)

## 7. ADR Compliance
- ADR-005 (deprecated sync I/O): readFileSync/writeFileSync kullanıyor — ADR-005 deprecated olduğundan uyum sorusu belirsiz
- ADR-006: spawnSync yok ✓
- ADR-008: Brain import yok ✓
- ADR-010: TAM uyum ✓
- ADR-022: `review` CLI komutu var, MCP `review` tool var ✓
- Memory V2: Review state DB'ye yazılmıyor — dosya tabanlı kalıyor
  - **BULGU**: Review durumu Memory V2 DB'ye migrate edilmemiş. Bu bilinçli bir karar mı?
  - Severity: P3 (review state geçici sprint verisi, DB'ye gerek olmayabilir)

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/review-actions.test.ts` MEVCUT ✓
- Kritik senaryolar: approve→reject geçişi, aynı task için multiple decision, corrupt JSON, boş state

## 9. TODO/FIXME/HACK Inventory
Hiç yok ✓

## 10. Dead Code
- `loadState` public ama doğrudan dışarıdan çağrılıyor mu? Grep: `review-summary.ts` import ediyor → KULLANILIYOR ✓
- `saveState` public — aynı kontrol gerekli
- Dead code: YOK ✓

## 11. Security
- **JSON.parse unsafe cast** (satır 90): Corrupt veya manipüle edilmiş JSON dosyası runtime hatasına veya beklenmeyen davranışa yol açabilir
  - Mitigation: try/catch mevcut (satır 88), boş state döndürüyor — güvenli fallback ✓
- **Path traversal**: `sprintId` doğrudan dosya adında kullanılıyor (satır 83)
  - Risk: Eğer sprintId dışarıdan geliyorsa `../../etc/passwd` gibi değerler geçilebilir
  - Mitigation: sprintId genelde Brain tarafından üretilir, dışarıdan gelmez
  - Severity: P3 (düşük risk, iç kullanım)
- Dosya yazma: mkdirSync recursive ✓

## 12. Memory V2 Uyumu
- Review state dosya tabanlı, DB'ye yazılmıyor
- Bu bilinçli olabilir — review state geçici sprint verisi
- Eski .md parse yok ✓

## 13. i18n
N/A — Kullanıcıya dönük string yok, sadece veri I/O.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 10 public member'ın HEPSINDE EKSİK — P2
- DECKENT.md'de review-actions ayrıca belirtilmemiş (review komutu var)

## 15. Performance
- Sync I/O: 3 (readFileSync satır 89, writeFileSync satır 104, mkdirSync satır 103)
- Hot path: Hayır (sprint review sırasında bir/birkaç kez çağrılır)
- Performans sorunu: YOK (düşük frekanslı I/O)

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | `JSON.parse as ReviewState` — zod veya basit runtime validation ekle |
| P2 | JSDoc eklenmeli (10 public member) |
| P3 | SprintId path traversal — basit sanitize (alphanumeric + dash only) |
| P3 | Memory V2 migration değerlendirmesi (review state DB'ye gerekli mi?) |

## Verdict: ANALYZED
