# Analysis: src/core/file-lock.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 300 | **Effort:** max

## 1. Amaci
Deckent'in concurrent worker koordinasyonu için dosya kilitleme sistemi. Sprint 138 Task 004'te agents/worker.ts'den core'a taşınmış. Atomic lock oluşturma (O_EXCL), idempotent re-lock, stale lock temizleme, TTL-based expiry, orphan lock recovery ve observability trace desteği sağlar. Worker'lar dosya yazma öncesi kilit edinir, sprint temizliğinde kilitler serbest bırakılır.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `LockError` | class extends Error (message, filePath) | Yok ❌ (sadece constructor) |
| `acquireLock` | `(projectRoot, filePath, workerId, taskId, ttl?) => LockInfo` | Var ✓ |
| `releaseLock` | `(projectRoot, filePath, workerId) => void` | Var ✓ |
| `checkLock` | `(projectRoot, filePath) => LockInfo \| null` | Var ✓ |
| `checkLocks` | `(projectRoot) => LockInfo[]` | Var ✓ |
| `releaseAllLocks` | `(projectRoot, workerId) => number` | Var ✓ |
| `clearStaleLocks` | `(projectRoot, maxAgeMs) => number` | Var ✓ |
| `clearOrphanLocks` | `(projectRoot, activeWorkerIds: Set<string>) => string[]` | Var ✓ |
| `claimTaskLock` | `(projectRoot, filePath, workerId, taskId) => Promise<LockInfo>` | Var ✓ |

JSDoc eksik: LockError class — ama Error subclass olduğu için kabul edilebilir.

## 3. Ic Bagimliliklar
- `./constants.js`: LOCKS_DIR
- `./observability.js`: trace (claimTaskLock wrapper)
- `./utils.js`: debugLog (stale lock temizliğinde)
- `./types.js`: LockInfo (type import)

Döngüsel bağımlılık riski: YOK — utils.ts ve observability.ts file-lock'u import etmez.

## 4. Dis Bagimliliklar
Sadece Node.js built-in: `node:fs`, `node:path`. ADR-010 uyumlu ✓

## 5. Complexity
- **Fonksiyon sayısı:** 12 (9 export + 3 internal helper)
- **En karmaşık:** `acquireLock` (satır 59-115) — O_EXCL atomic creation + existing lock check + race condition handling
- **Max cyclomatic:** ~8 (acquireLock — 4 try/catch, 3 if/throw)
- **clearStaleLocks/clearOrphanLocks:** Loop + JSON parse + date arithmetic — moderate

## 6. Type Safety
- **`any` sayısı:** 0
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **`as unknown`:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** `as LockInfo` (satır 72, 105, 131, 158, 176, 203, 234, 270) — JSON.parse sonrası. Yapısal doğrulama yok ⚠️
- **`as LockInfo & { ttl?: number }`:** satır 72, 86, 234 — TTL extension'ı LockInfo type'ına dahil değil

**Risk:** JSON.parse sonucu runtime'da farklı yapıda olabilir — corrupted/tampered lock dosyası durumunda. Defensive: catch blokları corrupted dosyaları atlıyor.

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-005 (Sync I/O) | ⚠️ | Yoğun sync I/O — ama lock sistemi atomic olmalı, async alternatif daha karmaşık |
| ADR-006 (spawnSync) | ✓ | spawnSync yok |
| ADR-008 (Brain import) | ✓ | Brain/orchestra modülünü import etmiyor |
| ADR-010 | ✓ | Sadece Node built-in |
| ADR-035 (Verification Protocol) | ✓ | Lock sistemi protokolün parçası |
| Memory V2 | N/A | Lock sistemi Memory V2 ile ilgisiz |

## 8. Test Coverage
- `tests/core/file-lock.test.ts` mevcut ✓
- **Beklenen test konuları:** acquireLock (atomic, idempotent), releaseLock (owner check), checkLock, clearStaleLocks, clearOrphanLocks, LockError handling, corrupted lock dosyası
- Sprint 138 Task 004'te 30→267 LoC genişleme — test coverage'ın buna eşlik edip etmediği ayrı test analizi gerektirir

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code
Yok — tüm export'lar kullanımda (acquireLock → worker, clearStaleLocks → auditor, clearOrphanLocks → coordinator recovery).

## 11. Security
| Risk | Seviye | Detay |
|------|--------|-------|
| **Race condition (TOCTOU)** | DÜŞÜK | existsSync + readFileSync arasında race var ama O_EXCL fallback bunu telafi ediyor |
| **Lock dosyası manipülasyonu** | DÜŞÜK | Kötü niyetli worker lock dosyasını değiştirebilir — ama proje güven sınırında |
| **JSON injection in lock** | ÇOK DÜŞÜK | Lock verisindeki filePath/workerId/taskId input'tan geliyor, ama JSON.stringify güvenli |
| **Path traversal** | DÜŞÜK | `lockFilePathFor` fonksiyonunda path sanitization: `/\\/` → `__` — ama `..` pattern'ı bloklanmıyor |

**O_EXCL Atomic Pattern:** Satır 99 — `fsConstants.O_WRONLY | O_CREAT | O_EXCL` — doğru pattern. EEXIST error'da mevcut lock bilgisi okunuyor. ✓

## 12. Memory V2 Uyumu
Bu modül Memory V2 ile doğrudan ilişkili değil. Lock dosyaları .locks/ dizininde — DB dışı mekanizma, doğru. N/A ✓

## 13. i18n
- Hata mesajları İngilizce hardcoded: "File X is locked by Y"
- Debug log mesajları İngilizce
- i18n gerekli değil — internal system modülü

## 14. Dokumantasyon Tutarliligi
- Modül başı yorum bloğu mevcut — Features listesi güncel ✓
- "Sprint 138 — Task 004" migration notu ✓
- JSDoc ↔ davranış uyumlu ✓
- **Eksik:** `ttl` parametresinin LockInfo type'ında olmaması — `LockInfo & { ttl?: number }` inline extension kullanılmış. api-surface.md'deki LockInfo tanımında da ttl yok.

## 15. Performance
| Sync I/O | Sayı |
|----------|------|
| existsSync | 8 |
| readFileSync | 8 |
| writeFileSync | 1 |
| readdirSync | 4 |
| openSync/closeSync | 1 |
| unlinkSync | 4 |

**Toplam: 26 sync I/O çağrısı** — dosya kilitleme sistemi için makul ama lock sayısı artarsa performans sorunu.

**Hot path:** `checkLocks` (satır 167-184) ve `clearStaleLocks` (220-250) tüm lock dosyalarını JSON parse ediyor — O(n) disk okuma. Sprint'te 50+ worker varsa yavaşlayabilir.

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P1** | `lockFilePathFor`: `..` path traversal pattern'ını sanitize et — `filePath.replace(/\.\./g, '_')` ekle |
| **P2** | LockInfo type'ına `ttl?: number` alanını ekle — inline `& { ttl?: number }` tekrarını kaldır |
| **P2** | JSON.parse sonrası yapısal doğrulama (Zod veya manual type guard) ekle — corrupted dosya güvenliği |
| **P3** | checkLocks/clearStaleLocks'ta dosya sayısı loglansın — observability |
| **P3** | acquireLock O_EXCL + existsSync TOCTOU window'u küçük ama belgelensin |

## Verdict: ANALYZED
