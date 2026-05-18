# Test Category Analysis: security
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 3

---

## 1. Test Dosya Envanteri

**Toplam:** 3 dosya | **describe blokları:** 9 | **it() blokları:** 27

| Dosya | Açıklama |
|-------|----------|
| `api-auth.test.ts` | HTTP API Bearer Token kimlik doğrulama (src/api/server.ts) |
| `lock-atomicity.test.ts` | Dosya kilidi atomiklik ve yarış durumu güvenliği (src/core/file-lock.ts) |
| `shell-injection.test.ts` | Shell enjeksiyon koruması (src/orchestra/tmux.ts + worker spawn) |

---

## 2. Mock Pattern Audit

### vi.mock kullanımı

**api-auth.test.ts:**
```
node:fs
../../src/cli/commands/doctor.js
../../src/orchestra/tmux.js
../../src/core/config.js
../../src/agents/worker.js
../../src/orchestra/brain.js
```
6 adet vi.mock — HTTP server'ı izole etmek için geniş kapsamlı mocking.

**lock-atomicity.test.ts:**
```
node:fs (openSync, closeSync, constants dahil)
```
1 adet vi.mock — atomik dosya kilidi operasyonlarını izole ediyor.

**shell-injection.test.ts:**
```
node:child_process
node:fs
node:crypto
```
3 adet vi.mock — shell command execution tamamen mock'lanmış.

### vi.mocked typed mock kullanımı

- `lock-atomicity.test.ts` — `mockedReadFileSync`, `mockedWriteFileSync`, `mockedExistsSync`, `mockedOpenSync`, `mockedCloseSync` (5 typed mock — kapsamlı)
- `api-auth.test.ts` — `mockExistsSync`, `mockWriteFileSync` (2 typed mock)
- `shell-injection.test.ts` — `mockedSpawnSync`, `mockedWriteFileSync`, `mockedUnlinkSync` (3 typed mock)

### vi.spyOn kullanımı

0 adet vi.spyOn — kategoride tüm testler vi.mock kullanıyor.

### Fake Timer Kullanımı

0 adet `useFakeTimers` — security testleri zamanlama bağımlısı değil.

---

## 3. Coverage Mapping

Security testleri domain-cross özellikli — birden fazla src modülünü kapsar:

### api-auth.test.ts Kapsama

| Kapsanan Src | Özellik |
|-------------|---------|
| `src/api/server.ts` | `createHttpServer`, `generateApiToken`, `_resetActiveJob` — doğrudan import |
| `src/core/config.ts` | Config yükleme (mock) |
| `src/orchestra/tmux.ts` | Worker spawn (mock) |
| `src/orchestra/brain.ts` | Brain entry point (mock) |
| `src/agents/worker.ts` | Worker execution (mock) |
| `src/cli/commands/doctor.ts` | Doctor command (mock) |

**HTTP API güvenliği için kapsanan senaryolar:**
- Bearer token kimlik doğrulama (401 vs 200)
- Geçersiz token reddi
- Token oluşturma ve saklama
- Active job sıfırlama
- Çoklu istek izolasyonu

### lock-atomicity.test.ts Kapsama

| Kapsanan Src | Özellik |
|-------------|---------|
| `src/core/file-lock.ts` | Kilit edinme, serbest bırakma, atomiklik |

**Kapsanan güvenlik senaryoları:**
- Atomik dosya yaratma (openSync + O_EXCL flag)
- Çift kilit edinme girişimi (race condition)
- Stale kilit tespiti ve zorla serbest bırakma
- Kilit içeriği bütünlüğü

### shell-injection.test.ts Kapsama

| Kapsanan Src | Özellik |
|-------------|---------|
| `src/orchestra/tmux.ts` | Tmux oturum yönetimi (spawnSync çağrıları) |
| `src/agents/worker.ts` (dolaylı) | Worker spawn güvenliği |

**Kapsanan güvenlik senaryoları:**
- Kötü niyetli tmux oturum adı enjeksiyonu
- Shell metacharacter geçiş denemesi (`; rm -rf /`)
- Oturum kimliği sanitizasyonu
- spawnSync `shell: false` zorunluluğu (ADR-006 compliance)

---

## 4. Orphan Test Tespiti

| Test Dosyası | Durumu |
|-------------|--------|
| `api-auth.test.ts` | `src/api/server.ts` kapsıyor — orphan değil |
| `lock-atomicity.test.ts` | `src/core/file-lock.ts` kapsıyor — orphan değil |
| `shell-injection.test.ts` | `src/orchestra/tmux.ts` shell güvenliği kapsıyor — orphan değil |

**Gerçek orphan yok.** Security testleri ise kasıtlı olarak cross-domain — belirli güvenlik özelliklerini test ediyor.

### Kapsanmayan Güvenlik Alanları (Olası Boşluklar)

Şu anda `tests/security/` altında test bulunmayan potansiyel güvenlik noktaları:

| Alan | Src | Risk |
|------|-----|------|
| MCP input validation | `src/mcp/server.ts` | ORTA |
| CLI arg sanitization | `src/cli/*.ts` | ORTA |
| Task scope enforcement | `src/orchestra/authority-enforcer.ts` | YÜKSEK (ADR-037) |
| Worker prompt injection | `src/agents/worker.ts` | ORTA |
| SQL injection (SQLite) | `src/core/memory-store.ts` | YÜKSEK |
| File path traversal | `src/core/file-lock.ts` + I/O utils | ORTA |

---

## 5. Flaky Candidate İşaretleri

### setTimeout / Date.now() kullanımı

Security kategorisinde **hiç `setTimeout`, `setInterval` veya `Date.now()` kullanımı yok.**

Bu, en temiz test kategorilerinden biri. Tüm testler senkron mock-tabanlı.

### Potansiyel Yarış Durumu Analizi

`lock-atomicity.test.ts` — kilitleme atomikliği testleri:
- `openSync + O_EXCL` kombinasyonu gerçek atomikliği test ediyor mu yoksa mock davranışını mı? 
- Mock ile test edildiğinde gerçek yarış durumu simüle edilemiyor — bu bir sınırlama.
- Gerçek çoklu thread/process atomiklik testi için in-process paralel promise testi gerekir.

**Risk:** Lock atomiklik testleri `vi.mock('node:fs')` ile tamamen mock edilmiş. Bu birim testi anlamında doğru, ancak gerçek dosya sistemi race condition'ı yakalamaz. Gerçek OS-level atomiklik testi için integration testi gerekir.

---

## 6. Memory V2 Mock Uyumu

### MemoryStore Kullanımı

Security kategorisinde **hiç MemoryStore kullanımı yok** — 0 mock, 0 import.

Bu beklenen: güvenlik testleri HTTP API, dosya kilitleme ve shell injection'ı test ediyor. Memory V2 SQL'e yönelik güvenlik testi (SQL injection, unauthorized DB access) **eksik**.

### countBrainLines / parseDebtTable

Security kategorisinde **hiç countBrainLines veya parseDebtTable mock'u yok.** Bekleniyor.

### Memory V2 Güvenlik Boşluğu

**KRİTİK BULGU: SQLite injection testi yok**

`src/core/memory-store.ts` `better-sqlite3` kullanıyor. Prepared statement kullanılıyor mu, doğrudan string interpolation var mı kontrol edilmedi. Güvenlik testi yok:

```typescript
// Potansiyel risk — test edilmiyor:
store.search({ text: "'; DROP TABLE entries; --" });
store.insert({ title: "Robert'); DROP TABLE entries; --" });
```

`tests/security/` altında `memory-store-injection.test.ts` eksik.

### api-auth.test.ts Memory V2 Bağlantısı

API authentication testleri Bearer token'ı doğruluyor ancak token'ın Memory V2 DB'de saklanıp saklanmadığını test etmiyor (mevcut implementation dosya tabanlı görünüyor).

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 58/100 (C+)

### Güçlü Yönler

1. **ADR-006 uyumu test ediliyor** — `shell-injection.test.ts` spawnSync güvenliği doğruluyor
2. **Lock atomiklik testi mevcut** — `lock-atomicity.test.ts` dosya kilitleme güvenliğini kapsıyor
3. **HTTP API Bearer token testi** — authentication flow tam kapsanmış
4. **Sıfır flaky risk** — setTimeout/Date.now kullanımı yok, tamamen senkron
5. **Typed mock kullanımı kapsamlı** — her dosyada tutarlı vi.mocked pattern

### Zayıf Yönler

1. **Yalnızca 3 dosya, 27 test** — projenin büyüklüğüne kıyasla güvenlik test kapsamı çok az
2. **SQLite injection testi tamamen yok** — Memory V2 DB en az bir güvenlik testi gerektiriyor
3. **MCP input validation testi yok** — MCP tools kullanıcı girdilerini sanitize ediyor mu?
4. **Authority enforcer testi security/ değil orchestra/** — ADR-037 RBAC testi güvenlik kategorisinde olmalı (şu an orchestra/)
5. **File path traversal testi yok** — `../../` saldırıları vs scope enforcement
6. **Lock atomiklik testleri gerçek OS-level değil** — mock tabanlı, gerçek race condition yakalamıyor
7. **Worker prompt injection testi yok** — kötü niyetli task description → prompt manipulation

### Sprint 142+ Öneriler

1. **P0: `memory-store-injection.test.ts`** — SQLite prepared statement güvenlik doğrulaması
2. **P0: MCP input sanitization testi** — tüm MCP araçları için kötü niyetli input testi
3. **P1: Worker prompt injection testi** — task.description → worker prompt manipulation senaryosu
4. **P1: File path traversal testi** — `scope.directories` bypass denemeleri
5. **P2: `authority-enforcer.test.ts` security/ klasörüne taşı** — ADR-037 RBAC güvenlik testi
6. **Gerçek lock atomiklik E2E testi** — OS düzeyinde çakışmalı kilit denemesi (tmpdir tabanlı)
