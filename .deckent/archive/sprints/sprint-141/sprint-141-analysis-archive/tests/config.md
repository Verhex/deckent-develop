# Test Category Analysis: config
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 1

## 1. Test Dosya Envanteri

### Dosya Listesi
```
tests/config/isolation.test.ts
```

### Describe / It Blok Sayıları
- **describe:** 5
- **it:** 5
- **test:** 0

### Dosya İçeriği Özeti
`isolation.test.ts` — Build izolasyon testi. 3 describe grubu:
1. `tsconfig.json` — `src/dashboard` exclude kontrolü (2 it)
2. `vitest.config.ts` — `src/dashboard/**` coverage exclusion kontrolü (1 it)
3. `.gitignore` — `src/dashboard/node_modules`, `src/dashboard/dist` gitignore kontrolü (2 it)

**Amaç:** Dashboard ve ana proje build'lerinin birbirini kirletmediğini doğrular. ADR-001 (TypeScript + ESM) uyum testi niteliğinde.

---

## 2. Mock Pattern Audit

### vi.mock / vi.spyOn Kullanımı
**Hiç `vi.mock` veya `vi.spyOn` kullanımı yok.**

Bu test kategorisi tamamen statik dosya okuma (`readFileSync`) ve varlık kontrolü (`existsSync`) üzerine kurulu. Mock gerekmez çünkü gerçek proje dosyaları (tsconfig.json, vitest.config.ts, .gitignore) okunuyor.

**Pattern:** Read-only filesystem test — doğru yaklaşım. Dosya sistemi durumunu doğrulayan bu tip testler mock kullanmamalı.

---

## 3. Coverage Mapping

### Neyi Test Ediyor?

`isolation.test.ts` bir src/core/*.ts dosyasını değil, proje konfigürasyon dosyalarını test ediyor:

| Hedef Dosya | Test Kontrolü |
|-------------|--------------|
| `tsconfig.json` | `exclude` array'inde `src/dashboard` var mı? |
| `vitest.config.ts` | Coverage exclusion `'src/dashboard/**'` var mı? |
| `.gitignore` | `src/dashboard/node_modules`, `src/dashboard/dist` var mı? |

**Coverage Mapping Sonucu:** Bu test kategorisi, kaynak kod dosyalarını değil, yapısal izolasyon konfigürasyonunu test eder. `src/config/` gibi bir dizin yok — tek test dosyası konfigürasyon dosyalarını kontrol eder.

### Eksik Kontroller
`tests/config/isolation.test.ts` şunları kontrol **etmiyor:**
- `tsconfig.json` → `include` veya `paths` konfigürasyonu
- `vitest.config.ts` → test timeout, coverage provider
- `.gitignore` → `.brain/memory.db` gitignore kontrolü (Memory V2 kritik!)
- `package.json` → `better-sqlite3` dependency varlığı

---

## 4. Orphan Test Tespiti

**Orphan test yok.** Tek dosya `isolation.test.ts` amaçlı ve gerçek konfigürasyon dosyalarını test ediyor.

Ancak `tests/config/` dizini sadece 1 dosya içermesi nedeniyle son derece az kapsamlı. Aşağıdaki konfigürasyon alanları için test eksik:

- `.deckent/config.json` schema doğruluğu
- `src/core/config.ts` yükleme mantığı → (bu `tests/core/config.test.ts`'de var, doğru yer)
- Memory V2 config section (`memory.backend`, `memory.search`, `memory.decay_after_sprints`)

---

## 5. Flaky Candidate İşaretleri

**Hiç flaky candidate yok.** `isolation.test.ts` içinde:
- `setTimeout` kullanımı: 0
- `Date.now()` kullanımı: 0
- `Math.random()` kullanımı: 0

Test tamamen deterministik — proje dosyalarını okur ve string/array içerik kontrolü yapar. CI ortamında stabil.

---

## 6. Memory V2 Mock Uyumu

### countBrainLines / parseDebtTable Kalıntıları
**Hiç `countBrainLines`, `parseDebtTable`, `generateDebtTable` kullanımı yok.**

### MemoryStore Kullanımı
**Hiç `MemoryStore` kullanımı yok.**

### Memory V2 Özel Kontrol Eksikliği
`tests/config/isolation.test.ts` şu kritik Memory V2 build izolasyon kontrollerini **yapmıyor:**

1. `.gitignore` → `.brain/memory.db` gitignored mi? (Sprint 140 Task 10'da ele alınacak)
2. `tsconfig.json` → `better-sqlite3` types dahil edilmiş mi?
3. `package.json` → `better-sqlite3` devDependencies değil dependencies'de mi?

Bu eksiklikler `tests/config/isolation.test.ts`'ye eklenebilecek düşük maliyetli testlerdir.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 58/100 (**C**)

### Güçlü Yönler
- Mevcut tek test doğru ve stabil çalışıyor
- Mock kullanmama kararı yerinde — gerçek dosyaları okumak bu test tipi için doğru
- Build izolasyonu kritik bir özellik ve test edilmesi değerli

### Zayıf Yönler / Sprint 142+ Öneriler
1. **P1 — Kategori Genişliği:** Sadece 1 test dosyası ile `config` kategorisi yetersiz. En az 3-4 test dosyası beklenir.
2. **P1 — Memory V2 İzolasyon Testleri:** `.gitignore` içinde `memory.db` kontrolü eklenmeli. `package.json` içinde `better-sqlite3` dependency kontrolü eklenmeli.
3. **P2 — `.deckent/config.json` Schema Testi:** Proje config dosyasının beklenen alanları içerdiğini doğrulayan bir test eklenmeli (`memory.backend`, `memory.search`, `brain_tier`, `worker_tier` vs).
4. **P2 — vitest.config.ts Memory V2 Kontrolü:** Test runner konfigürasyonunun `tests/core/memory-*.test.ts` dosyalarını kapsamaya dahil ettiğini doğrulayan kontrol eklenmeli.
5. **P3 — tsconfig.json Paths Kontrolü:** ESM path mapping konfigürasyonunun beklenen şekilde ayarlandığını test et.

### Not
`config` kategorisi diğer kategorilere (özellikle `core`) kıyasla bakımsız görünüyor. Sprint 134 ve öncesinde bu kategori belki anlamlıydı, ama Memory V2 ile birlikte yeni konfigürasyon alanları eklendi ve bu testler güncellenmedi.
