# Analysis: src/cli/helpers/selective-retry.ts
**Task ID:** 142-023 | **Model:** opus | **LoC:** 91 | **Effort:** max

## 1. Amaç
Seçici yeniden deneme yönetim modülü. Başarısız task'ları retry kuyruğuna ekler, kuyruk dosyasını yönetir ve retry sprint için DIRECTIVES üretir. Review komutu ile entegre çalışır. `retry-queue-{sprintId}.json` formatında dosya tabanlı kuyruk yönetimi sağlar.

## 2. Public API
- `interface RetryQueue { sprintId, taskIds, createdAt, updatedAt? }` — JSDoc YOK
- `class SelectiveRetry` — JSDoc YOK
  - `constructor(tasksDir: string)` — JSDoc YOK
  - `queueForRetry(taskIds, sprintId): void` — JSDoc YOK, EKSIK
  - `getRetryQueue(sprintId): RetryQueue | null` — JSDoc YOK, EKSIK
  - `clearRetryQueue(sprintId): void` — JSDoc YOK, EKSIK
  - `generateRetryDirectives(taskIds, originalTasks): string` — JSDoc YOK, EKSIK

## 3. İç Bağımlılıklar
- `node:fs` — readFileSync, writeFileSync, unlinkSync, mkdirSync
- `node:path` — path.join, path.dirname
- `../../core/types.js` → `Task`
- `../../core/model-registry.js` → `modelRegistry`
- Döngüsel bağımlılık riski: YOK

## 4. Dış Bağımlılıklar
Hiçbir dış bağımlılık yok. ADR-010: TAM ✓

## 5. Complexity
- Fonksiyon sayısı: 5 (4 public + 1 private)
- Max cyclomatic: ~4 (generateRetryDirectives — for + conditional model lookup)
- En karmaşık fonksiyon: `generateRetryDirectives` (satır 54) — task iteration + optional chaining + fallback logic

## 6. Type Safety
- `any` sayısı: 0 ✓
- `JSON.parse(raw) as RetryQueue` (satır 39): Unsafe cast — runtime validation YOK
  - Severity: P2 (aynı pattern review-actions.ts'te de var)
- `original?.model` optional chaining: güvenli ✓
- Tip güvenliği: ORTA (JSON cast riski)

## 7. ADR Compliance
- ADR-005 (deprecated sync I/O): readFileSync/writeFileSync/unlinkSync kullanıyor
- ADR-006: N/A ✓
- ADR-008: Brain import yok ✓
- ADR-010: TAM ✓
- ADR-022: CLI retry mekanizması, MCP karşılığı: `deckent_start` retry parametresi
- Memory V2: Retry kuyruk dosya tabanlı, DB'ye yazılmıyor
  - Severity: P3 (geçici sprint verisi, DB migration gerekmeyebilir)

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/selective-retry.test.ts` MEVCUT ✓
- Kritik: queue merge (mevcut + yeni), boş kuyruk, clearRetryQueue sonrası getRetryQueue=null, corrupt JSON

## 9. TODO/FIXME/HACK Inventory
Hiç yok ✓

## 10. Dead Code
- `generateRetryDirectives`: Bu method aktif olarak çağrılıyor mu?
  - Grep: src/ içinde sadece bu dosyada — **POTANSIYEL DEAD CODE**
  - Severity: P2 (büyük bir fonksiyon, 30 satır, kullanılmıyorsa kaldırılmalı)
- `clearRetryQueue`: cleanup komutu çağırıyor mu? Kontrol gerekli
  - Severity: P3

## 11. Security
- `JSON.parse as RetryQueue` — corrupt dosya riski, try/catch ile korunuyor ✓
- `unlinkSync` (satır 48): Try/catch ile korunuyor ✓
- `sprintId` path traversal: Aynı review-actions.ts riski
  - Severity: P3

## 12. Memory V2 Uyumu
- Retry queue dosya tabanlı — DB'ye migrate edilmemiş
- Bu tasarım kararı belirtilmemiş ama mantıklı (geçici kuyruk verisi)

## 13. i18n
- Hardcoded EN string'ler: "# DIRECTIVES -- Retry Sprint", "## Goal: Retry failed tasks", "retry", "Retry of task"
- Severity: P3 (iç yardımcı, düşük i18n öncelik)

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 5/5 public member EKSİK — P2
- `generateRetryDirectives` fonksiyonu DIRECTIVES format rehberine uygun çıktı üretiyor ✓

## 15. Performance
- Sync I/O: 4 (readFileSync, writeFileSync, unlinkSync, mkdirSync)
- Hot path: Hayır (review/retry sırasında bir kez)
- `new Set([...existing, ...taskIds])` — dedup stratejisi verimli ✓

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | `generateRetryDirectives` dead code kontrolü — kullanılmıyorsa kaldır |
| P2 | `JSON.parse as RetryQueue` — runtime validation ekle |
| P2 | JSDoc eklenmeli (5 public member) |
| P3 | i18n: Hardcoded EN string'ler |
| P3 | `modelRegistry.getByProviderAndTier` fallback chain (satır 73): `?? 'opus'` hardcoded — config'dan okunabilir |

## Verdict: ANALYZED
