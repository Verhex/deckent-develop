# Test Category Analysis: api
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 11

---

## 1. Test Dosya Envanteri

| Dosya | describe | it | Notlar |
|-------|----------|----|--------|
| config-editor.test.ts | 1 | 14 | Server config editing endpoint |
| health.test.ts | 2 | 4 | Health check endpoint |
| rate-limiter.test.ts | 2 | 14 | RateLimiter sınıfı |
| request-logging.test.ts | 1 | 4 | Request logging middleware |
| security-headers.test.ts | 2 | 6 | Security header kontrolü |
| server-auth.test.ts | 5 | 17 | Bearer auth middleware |
| server-body-schemas.test.ts | 5 | 9 | Request body doğrulama |
| server-edge.test.ts | 7 | 43 | Edge case ve hata senaryoları |
| server-security.test.ts | 10 | 17 | Güvenlik testleri |
| server.test.ts | 34 | 90 | Ana HTTP sunucu testleri |
| watcher.test.ts | 5 | 13 | File system watcher |
| **TOPLAM** | **74** | **231** | — |

API kategorisi 11 dosya ve 231 it bloğuyla orta ölçekli ama kritik bir kategori. Özellikle `server.test.ts` (34 describe, 90 it) çok kapsamlı.

---

## 2. Mock Pattern Audit

**Toplam vi.mock çağrısı: 58+ (tüm dosyalarda)**

### Her dosyanın mock stratejisi:

| Dosya | vi.mock Sayısı | Temel Mocklar |
|-------|---------------|--------------|
| server.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| config-editor.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| request-logging.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| server-body-schemas.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| server-auth.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| security-headers.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| server-security.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| health.test.ts | 7 | node:fs, doctor.js, tmux.js, config.js, worker.js, utils.js, brain.js |
| server-edge.test.ts | 6 | node:fs, doctor.js, tmux.js, config.js, worker.js, brain.js |
| rate-limiter.test.ts | 0 | Saf unit test — mock yok |
| watcher.test.ts | 1 | node:fs |

**Önemli pattern:** Server split testleri (server-auth, server-body-schemas, server-edge, server-security, health, request-logging, security-headers) tamamı aynı 7-mock boilerplate'i kullanıyor. Bu **copy-paste anti-pattern**'dir — ortak bir `setupMocks()` helper'a refactor edilmeli.

**`rate-limiter.test.ts`:** Saf unit test, mock yok. `vi.useFakeTimers()` ile zamanlama kontrolü yapılıyor — bu doğru bir pattern.

---

## 3. Coverage Mapping

### src/api/ dosyaları ve test durumları:

| Kaynak Dosya | Test Dosyası | Durum |
|-------------|-------------|-------|
| src/api/server.ts | server.test.ts | MATCH (ana) |
| src/api/server.ts | server-auth.test.ts | EK (split) |
| src/api/server.ts | server-body-schemas.test.ts | EK (split) |
| src/api/server.ts | server-edge.test.ts | EK (split) |
| src/api/server.ts | server-security.test.ts | EK (split) |
| src/api/server.ts | health.test.ts | EK (split) |
| src/api/server.ts | request-logging.test.ts | EK (split) |
| src/api/server.ts | security-headers.test.ts | EK (split) |
| src/api/server.ts | config-editor.test.ts | EK (split) |
| src/api/rate-limiter.ts | rate-limiter.test.ts | MATCH |
| src/api/watcher.ts | watcher.test.ts | MATCH |
| src/api/auth.ts | server-auth.test.ts | PARTIAL (auth.ts de import ediliyor) |

**NOT:** `src/api/` içinde 4 dosya var (`auth.ts`, `rate-limiter.ts`, `server.ts`, `watcher.ts`). `auth.ts` için ayrı bir test dosyası yok — `server-auth.test.ts` hem server.ts hem auth.ts fonksiyonlarını test ediyor.

### server.ts split pattern analizi:

`server.ts` çok büyük bir dosya olduğu için 9 farklı test dosyasına bölünmüş. Bu organizasyonel olarak anlamlı ancak mock boilerplate tekrarı problemi yaratıyor.

---

## 4. Orphan Test Tespiti

### Gerçek orphan yok — ama örtük orphan var:

**Kısmi orphan:** `config-editor.test.ts` — `src/api/` içinde `config-editor.ts` dosyası yok. Test `src/api/server.ts`'den config editing endpoint'ini test ediyor. İsim yanıltıcı; içeriği `server.ts`'nin bir alt bölümünü kapsar.

**`src/api/auth.ts` için ayrı test yok:** `server-auth.test.ts` hem auth.ts'den (`resolveAuthToken`, `verifyBearerToken`, `bearerAuthMiddleware`) hem server.ts'den fonksiyonları import ediyor. `auth.ts` için dedicated bir test dosyası bulunmuyor.

---

## 5. Flaky Candidate İşaretleri

### Tespit edilen riskler:

| Dosya | Satır | Risk Türü | Açıklama |
|-------|-------|-----------|----------|
| server.test.ts | 916, 934 | `setTimeout(r, 50)` | Async bekleme için sabit 50ms delay — CI'da yavaş sistemlerde zaman aşımına uğrayabilir |
| server-edge.test.ts | 478 | `setTimeout(r, 50)` | Aynı pattern |
| server-security.test.ts | 171, 358, 366 | `setTimeout(r, 50)` | 3 ayrı kullanım — en riskli dosya |
| rate-limiter.test.ts | 47, 54, 75, 82 | `vi.useFakeTimers()` + `vi.advanceTimersByTime()` | DOĞRU pattern — flaky değil |

**Genel değerlendirme:**
- `vi.useFakeTimers()` kullanan `rate-limiter.test.ts`: flaky riski sıfır, deterministik
- `setTimeout(r, 50)` pattern'i kullanan dosyalar: **düşük-orta flaky riski** — 50ms çok kısa, CI'da farklı iş yükü altında potansiyel race condition
- `server-security.test.ts` en riskli — 3 ayrı `setTimeout(r, 50)` kullanımı

**Öneri:** `setTimeout(r, 50)` kullanımlarını `vi.useFakeTimers()` + `vi.advanceTimersByTime()` ile değiştirmek flakiness'i ortadan kaldırır.

---

## 6. Memory V2 Mock Uyumu

### Sonuç: TEMIZ

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` mock varlığı | YOK |
| `parseDebtTable` mock varlığı | YOK |
| `MemoryStore` import/mock | YOK |
| `memory.db` referansı | YOK |
| Eski `.md` parse mock'u | YOK |

**Değerlendirme:** API testleri Memory V2 ile tam uyumlu. HTTP API katmanı hafıza yönetimiyle doğrudan etkileşime girmediğinden bu beklenen bir durum. `brain.js` mock'u (`vi.mock('../../src/orchestra/brain.js', ...)`) tüm API testlerinde mevcut — brain fonksiyonlarına olan bağımlılık doğru şekilde soyutlanmış.

---

## 7. Genel Değerlendirme

**Sağlık Skoru: 72/100 (C+)**

### Güçlü Yönler:
- `rate-limiter.test.ts` model bir unit test — `vi.useFakeTimers()` ile deterministik
- 231 it bloğuyla kapsamlı coverage
- `server-auth.test.ts` Bearer auth'u ayrı test ediyor — güvenlik ayrımı iyi
- Memory V2 uyumu mükemmel
- `server.ts`'nin 9 dosyaya bölünmesi okunabilirliği artırıyor

### Eksikler / Öneriler:
1. **P1: Mock Boilerplate Tekrarı** — 9 test dosyası aynı 7 `vi.mock()` bloğunu kopyalıyor. Ortak bir `__mocks__/server-setup.ts` helper veya `vi.mock` factory fonksiyonu oluşturulmalı. Bu bakım yükünü ciddi azaltır.
2. **P2: `setTimeout(r, 50)` Flaky Riski** — `server.test.ts`, `server-edge.test.ts`, `server-security.test.ts` içindeki sabit sleep'ler `vi.useFakeTimers()` ile değiştirilebilir.
3. **P2: `auth.ts` için dedicated test yok** — `resolveAuthToken`, `verifyBearerToken` fonksiyonları `server-auth.test.ts` içinde dolaylı test ediliyor; dedicated `auth.test.ts` daha net coverage sağlar.
4. **P3: `config-editor.test.ts` ismi yanıltıcı** — İsim `src/api/config-editor.ts` varlığını ima ediyor ama bu dosya yok; rename veya yorum eklenmeli.

### Kritik Risk:
`server-security.test.ts` içindeki 3× `setTimeout(r, 50)` güvenlik testleri için risk taşıyor. Güvenlik testlerinin flaky olması kabul edilemez; öncelikli fix adayı.
