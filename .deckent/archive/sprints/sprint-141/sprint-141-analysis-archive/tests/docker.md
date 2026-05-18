# Test Category Analysis: docker
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 1

## 1. Test Dosya Envanteri

### Dosya Listesi
```
tests/docker/dockerfile.test.ts
```

### Describe / It Blok Sayıları
- **describe:** 3
- **it:** 15
- **test:** 0

### Test Yapısı

**`dockerfile.test.ts`** iki ana describe grubuna sahip:

**describe('Dockerfile')** — 9 test:
1. `Dockerfile exists` — dosya varlık kontrolü
2. `uses node:22-slim as base image` — FROM satırı kontrolü
3. `is currently a single-stage build` — tek FROM satırı (single-stage)
4. `installs tmux and git` — tmux, git dependency
5. `copies package files` — `COPY package*.json` pattern
6. `runs npm ci for dependency installation` — `npm ci` komutu
7. `runs npm run build for TypeScript compilation` — `npm run build`
8. `sets workspace directory` — `WORKDIR /workspace`
9. `has an ENTRYPOINT directive` — ENTRYPOINT varlığı

**describe('docker-compose.yml')** — 6 test:
1. `docker-compose.yml exists` — dosya varlığı
2. `defines a deckent service` — `deckent:` service tanımı
3. `mounts .deckent volume` — `.deckent` volume mount
4. `mounts .brain volume` — `.brain` volume mount
5. `exposes port 3100` — port 3100 expose
6. `has healthcheck configuration` — `healthcheck:` direktifi

**Not:** Describe sayısı 3 görünüyor çünkü Vitest'te yukarı düzey describe context dahil edildi. Gerçekte 2 describe bloğu var (Dockerfile, docker-compose.yml).

---

## 2. Mock Pattern Audit

### vi.mock / vi.spyOn Kullanımı
**Hiç `vi.mock` veya `vi.spyOn` kullanımı yok.**

Test tamamen `readFileSync` ve `existsSync` üzerine kurulu — gerçek Dockerfile ve docker-compose.yml dosyalarını okuyor. Bu doğru yaklaşım: container config dosyaları static text içerir, mock gereksiz.

### Import Listesi
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
```

---

## 3. Coverage Mapping

### Docker Kaynak Dosyaları vs. Testler

| Kaynak Dosya | Test Kapsamı | Durum |
|-------------|-------------|-------|
| `Dockerfile` | `dockerfile.test.ts` — 9 it | COVERED (statik) |
| `docker-compose.yml` | `dockerfile.test.ts` — 6 it | COVERED (statik) |
| `src/orchestra/spawn-backend-docker.ts` | — | **MISSING** |

**Kritik Gap:** `spawn-backend-docker.ts` (`DockerSpawnBackend` class, ~500+ LoC) için hiç unit test yok. Bu dosya Sprint 135'te Docker graceful shutdown fix'i içeren kritik bir implementasyon — test coverage sıfır.

Docker backend mantığı (container lifecycle, heartbeat, timeout, `atomicWriteFileSync`, SIGTERM handler) test edilmiyor. E2E testleri `tests/e2e/` altında olabilir — bakınız:

```bash
find /workspace/tests/e2e -name "*docker*"
```

---

## 4. Orphan Test Tespiti

**Orphan test yok.** Tek dosya amacı net — Dockerfile ve docker-compose.yml statik doğrulaması.

Ancak kategori kapsamı son derece dar. `docker` kategorisi adıyla Docker backend implementasyonunu (`spawn-backend-docker.ts`) kapsamaması semantik uyumsuzluk.

---

## 5. Flaky Candidate İşaretleri

**Hiç flaky candidate yok.**

Test tamamen deterministik:
- `setTimeout` kullanımı: 0
- `Date.now()` kullanımı: 0
- `Math.random()` kullanımı: 0
- Ağ bağlantısı: 0
- Gerçek Docker daemon çağrısı: 0

Test sadece local filesystem dosyalarını okuyup string içeriği kontrol ediyor — CI'da %100 stabil.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines / parseDebtTable
**Hiç `countBrainLines`, `parseDebtTable`, `generateDebtTable` kullanımı yok.** Docker testleri bu pattern'lerden tamamen bağımsız.

### MemoryStore Kullanımı
**Hiç `MemoryStore` kullanımı yok.**

Bu beklenen — Docker config testleri memory layer'a bağımlı değil.

### Özel Kontrol
`docker-compose.yml` içinde `.brain` volume mount'u test ediliyor (`mounts .brain volume`). Bu Memory V2 açısından doğru — `.brain/memory.db`'nin container'da erişilebilir olması gerekiyor. Ancak `memory.db`'nin özellikle volume kapsamında olduğu doğrulanmıyor — sadece `.brain` string varlığı kontrol ediliyor.

**Öneri:** docker-compose.yml testine `.brain` mount'un `memory.db`'yi içerdiğini doğrulayan daha spesifik bir kontrol eklenebilir.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 48/100 (**D+**)

### Güçlü Yönler
- Mevcut 15 test deterministik ve stabil
- Dockerfile ve docker-compose.yml kritik konfigürasyon alanlarını kapsamlı kontrol ediyor
- node:22-slim base image, single-stage build kontrolü sprint memory'yle uyumlu
- tmux + git bağımlılığı kontrolü önemli

### Zayıf Yönler / Sprint 142+ Öneriler

1. **P0 — spawn-backend-docker.ts Test Eksikliği:**
   `DockerSpawnBackend` class'ının unit testleri yok. Bu sprint 135'ten beri süren kritik eksiklik. Test edilmesi gereken alanlar:
   - `atomicWriteFileSync` — Sprint 139 P0 fix
   - SIGTERM fsync handler (15s grace period)
   - Container lifecycle (spawn, kill, cleanup)
   - Heartbeat yazma mekanizması
   - `cleanupContainer` ve `waitForContainer` metodları

2. **P1 — Docker Backend Integration Test:**
   `tests/e2e/` altında Docker backend E2E testleri var mı kontrol edilmeli. Eğer varsa, bu `tests/docker/` kategorisiyle bağlantı kurulmalı.

3. **P1 — docker-compose.yml Memory V2 Kontrolü:**
   `.brain/memory.db` volume path'inin mount konfigürasyonunda açıkça tanımlı olduğunu doğrulayan test eklenmeli.

4. **P2 — Dockerfile Node Version Kontrolü:**
   `node:22-slim` sabit versiyon — Node.js 22 LTS minimum sürüm gereksinimi (Node >=18 belgelenmiş) kontrolü eklenebilir.

5. **P3 — Multi-Stage Build Hazırlığı:**
   `is currently a single-stage build` testi var — bu test kasıtlı olarak single-stage enforciyor. Multi-stage build'e geçişte bu test güncellenecek. Geçiş planı varsa (prod/dev ayrımı) ADR ile belgelenmeli.

### Kritik Eksik
Sprint 139'da P0 Docker HB core fix yapıldı (+382 LoC). Bu fix'in testleri `tests/docker/dockerfile.test.ts`'ye EKLENMEDİ. `atomicWriteFileSync` ve SIGTERM handler'ın davranışsal testleri yokluğu, gelecekte bu fix'in regresyon tespitini güçleştirir.
