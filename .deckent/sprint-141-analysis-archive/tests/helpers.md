# Test Category Analysis: helpers
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 2

---

## 1. Test Dosya Envanteri

| Dosya | describe Blokları | it Blokları | LoC |
|-------|-------------------|-------------|-----|
| paths.test.ts | 3 | 18 | ~75 |
| platform.test.ts | 4 | 17 | ~110 |

**Toplam:** 2 test dosyası | 10 describe bloğu | 35 it bloğu

### Kategori Yapısı

`tests/helpers/` dizini hem test dosyalarını hem de yardımcı utility kaynak dosyalarını içeriyor:

```
tests/helpers/
  paths.ts          — normalizePath, toUnixPath, assertPathEquals, joinUnix (test helper lib)
  paths.test.ts     — paths.ts fonksiyonlarını test eder
  platform.ts       — isWindows, isWSL, isUnixOnly, createTempDir, skipOnWindows, itUnix
  platform.test.ts  — platform.ts fonksiyonlarını test eder
```

Bu **benzersiz bir kategori**: `tests/helpers/*.ts` dosyaları `src/` değil, diğer testler tarafından kullanılan test yardımcı kütüphanesidir. Bu dosyalar hem yardımcı kütüphane hem de test hedefi rolünde.

### Test Grupları

**paths.test.ts:**
- `describe('normalizePath')` — backslash→forwardslash, mixed, empty, Windows path, no separator, trailing backslash (7 it)
- `describe('toUnixPath')` — backslash convert, passthrough, empty (3 it)
- `describe('assertPathEquals')` — identical, backslash actual, both backslash, mismatch throws, filename mismatch (5 it)
- Eksik: `joinUnix` test yok (import edilmiş ama describe yok)

**platform.test.ts:**
- `describe('platform detection')` — isWindows reflects process.platform, isUnixOnly opposite, isWSL boolean, isWSL false on Windows, isWSL false on macOS (6 it)
- `describe('skipOnWindows')` — does not throw, calls fn on non-Windows, NOT called on Windows (3 it)
- `describe('itUnix')` — returns callable test function (1 it)
- `describe('createTempDir')` — creates dir, absolute path, prefix in name, unique dirs, special chars (5 it)

---

## 2. Mock Pattern Audit

**vi.mock:** 0 referans.
**vi.spyOn:** 0 referans.
**MemoryStore:** 0 referans.
**countBrainLines / parseDebtTable:** 0 referans.

### Mock Stratejisi

`platform.test.ts` platform testlerinde `process.platform` değerini doğrudan değiştiriyor:

```typescript
afterEach(() => {
  // platform property reset
});
```

`Object.defineProperty(process, 'platform', ...)` veya benzeri bir mekanizma kullanıyor olabilir. Platform simülasyonu için vi.mock yerine property override tercih edilmiş.

**Hiç mock yok** — bu beklenen bir durum. Helper kütüphaneleri saf fonksiyonlar; bağımlılıkları `fs`, `os`, `path` gibi Node.js built-in'ler.

---

## 3. Coverage Mapping

Bu kategoride src karşılığı yoktur — helpers, test altyapısı kütüphanesidir:

| Test Dosyası | Kaynak Dosya | İlişki |
|-------------|--------------|--------|
| paths.test.ts | tests/helpers/paths.ts | YARDIMci lib testi (src/ değil) |
| platform.test.ts | tests/helpers/platform.ts | YARDIMci lib testi (src/ değil) |

**Src coverage yok** — bu tasarım gereği. `paths.ts` ve `platform.ts` dosyaları `src/` içinde değil, diğer test dosyaları (e2e, integration vb.) tarafından `import { createTempDir } from '../helpers/platform.js'` şeklinde kullanılıyor.

---

## 4. Orphan Test Tespiti

**paths.test.ts:** `joinUnix` fonksiyonu import edilmiş ama test edilmemiyor. Bu bir eksik test.

```typescript
import { normalizePath, toUnixPath, assertPathEquals, joinUnix } from './paths.js';
// joinUnix için describe bloğu yok
```

**platform.test.ts:** `itUnix` için yalnızca 1 test var ("returns a callable test function") — içerik doğrulaması yok. `itUnix`'in gerçekte Unix'te testi çalıştırıp Windows'ta skip ettiği test edilmiyor.

---

## 5. Flaky Candidate İşaretleri

| Dosya | Risk | Açıklama |
|-------|------|----------|
| paths.test.ts | SIFIR | Saf string dönüşüm testleri |
| platform.test.ts | DÜŞÜK | `createTempDir` gerçek `mkdtempSync` çağrısı — disk hatası riski teorik |

**platform detection testleri** çalıştığı platformda `process.platform` değerini mock'lamadan gerçek değerle test ediyor. WSL ortamında `isWSL` testi, `WSLENV` veya `/proc/version` içeriğine bakıyor — ortama göre sonuç değişebilir.

`createTempDir` testleri gerçek temp dosyası oluşturuyor ve afterEach/afterAll cleanup gerektirebilir — ancak test kodu `rmdirSync` ile cleanup yapıyor (platform.test.ts:2).

---

## 6. Memory V2 Mock Uyumu

`countBrainLines`: 0 referans — temiz.
`parseDebtTable`: 0 referans — temiz.
`MemoryStore`: 0 referans.

**Memory V2 Uyumu:** TAM UYUMLU. Helper kütüphaneleri memory altyapısından tamamen bağımsız.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 80/100 (B)

### Güçlü Yönler
- Cross-platform utility testleri (normalizePath, isWSL) — Windows/Linux/macOS uyumluluğu için kritik.
- Sıfır mock karmaşıklığı — saf fonksiyon testleri.
- Flaky riski minimum.
- `createTempDir` gerçek filesystem ile test ediliyor — reliability yüksek.
- Memory V2 tam uyumlu.
- `afterEach` ile platform property reset — test izolasyonu iyi.

### Zayıf Yönler
- **`joinUnix` test eksik** — import edilmiş ama test yok (kör alan).
- `itUnix` davranışı (Windows'ta skip) test edilmiyor.
- Yalnızca 2 dosya, 35 test — kategori küçük ama bu tasarım gereği.
- `rmdirSync` (platform.test.ts:2) deprecated API — `rmSync` kullanılmalı.
- Helper kütüphaneleri (`paths.ts`, `platform.ts`) hakkında kısaca bir README belgesi yok.
- `createTempDir` cleanup'ı `afterEach` yerine `afterAll` ile yapılıyor olabilir — test arası disk kirlilik riski.

### Sprint 142+ Öneriler
- `joinUnix` için test ekle (en az 3-4 senaryo: empty, trailing slash, mixed, cross-platform).
- `itUnix` davranış testi: `Object.defineProperty(process, 'platform', { value: 'win32' })` ile platform override edip skip doğrula.
- `rmdirSync` → `rmSync` refactoru (`recursive: true` desteği).
- `tests/helpers/README.md` kısa bir belge ekle — hangi utility'lerin nerede kullanıldığını açıklasın.
