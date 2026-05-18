# Test Category Analysis: workflows
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 1

---

## 1. Test Dosya Envanteri

| Dosya | Satır | describe | it blokları |
|-------|-------|----------|-------------|
| `tests/workflows/publish.test.ts` | 133 | 2 | 24 |

**Toplam:** 1 dosya, 2 describe bloğu, 24 it bloğu

### Describe Blokları:
1. `.github/workflows/publish.yml` — 19 it
2. `.github/workflows/release.yml` — 5 it

### Test Edilen Özellikler:

**publish.yml testleri (19 test):**
- Dosya varlığı (`length > 0`)
- `release:published` trigger event
- Tag-based push trigger (`v*`)
- OIDC permissions (`contents: read`, `id-token: write`)
- Node.js 22.x kullanımı
- `npm ci` adımı
- `npm run build` adımı
- `npx vitest run` test adımı
- `--dry-run` adımı (gerçek publish öncesinde)
- `npm publish --dry-run --access public`
- `npm publish --provenance --access public`
- `NODE_AUTH_TOKEN` ve `secrets.NPM_TOKEN`
- `registry-url` → `https://registry.npmjs.org`
- `ubuntu-latest` runner
- `actions/checkout@v4`
- `actions/setup-node@v4`
- `cache: npm`
- `npm run lint` (type check)
- `NODE_AUTH_TOKEN` ≥2 kez (hem dry-run hem publish adımında)

**release.yml testleri (5 test):**
- Dosya varlığı
- Tag-based push trigger (`v*`)
- `contents: write` (GitHub Release oluşturma yetkisi)
- `id-token: write` (OIDC provenance)
- `npm publish --provenance --access public`

### Import Profili:
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
```
**Not:** `readFileSync` için `'fs'` (legacy alias) kullanılmış, `'node:fs'` değil. ADR-001 uyumsuzluğu.

### Hata Yönetimi (try/catch):
```typescript
try {
  workflowContent = readFileSync(resolve('.github/workflows/publish.yml'), 'utf-8');
} catch (e) {
  workflowContent = '';
}
```
Dosya bulunamazsa tüm testler fail eder (`length > 0` assertion). Bu yöntem explicit fail yerine sessiz empty string kullanır — hata mesajı okunaksız olabilir.

---

## 2. Mock Pattern Audit

**vi.mock:** SIFIR — hiç mock kullanılmamış.
**vi.spyOn:** SIFIR
**MemoryStore mock:** YOK

Bu test kategorisi tamamen mock-free, salt I/O tabanlıdır. Gerçek `.github/workflows/*.yml` dosyalarını okur ve string içeriklerini kontrol eder.

**Mock gereksizliği:** YAML dosyaları değişmez fixture olarak düşünüldüğünde, mock gerekmez. Test aslında CI workflow konfigürasyonunun doğruluğunu validate eder — bu bir "configuration test" pattern'ıdır.

---

## 3. Coverage Mapping

| Test Dosyası | Hedef Dosya | Durum |
|-------------|------------|-------|
| `tests/workflows/publish.test.ts` | `.github/workflows/publish.yml` | EŞLEŞME VAR (dosya mevcut) |
| `tests/workflows/publish.test.ts` | `.github/workflows/release.yml` | EŞLEŞME VAR (dosya mevcut) |

Her iki YAML dosyasının varlığı `ls` ile doğrulandı.

### Test → Kaynak İlişkisi:
- `publish.yml` → 19 test — kapsamlı: tüm kritik özellikler (OIDC, dry-run sırası, Node version, cache) kontrol edilmekte
- `release.yml` → 5 test — temel: sadece kritik özellikleri (trigger, permissions, publish) kontrol ediyor

### Kapsanmayan Workflow Dosyaları:
`ls .github/workflows/` çıktısına göre sadece `publish.yml` ve `release.yml` için testler var. Eğer proje başka workflow dosyaları içeriyorsa (örn. CI test workflow, dependabot config) bunlar bu kategoride test edilmemektedir. Ancak `tests/github/workflows/` altında ayrı bir kategori mevcuttur — bu kapsam olabilir.

---

## 4. Orphan Test Tespiti

### Orphan Test: YOK
Test edilen her iki workflow dosyası da disk'te mevcuttur.

### Potansiyel Ek Orphan Risk:
`tests/github/workflows/` kategorisi ayrıca mevcuttur (DIRECTIVES.md'de `github(5)` olarak listelenmektedir). Bu kategori ile `tests/workflows/` arasında kapsam çakışması veya duplikasyon olup olmadığı kontrol edilmeli.

**Öneri:** İki kategoriyi (workflows vs github/workflows) birleştirmeyi değerlendirin — ikisi de GitHub workflow dosyalarını test ediyorsa ayrı kategoriler konfüzyon yaratabilir.

---

## 5. Flaky Candidate İşaretleri

**setTimeout:** YOK
**Date.now():** YOK
**Math.random():** YOK
**Async/await:** YOK
**Ağ erişimi:** YOK

Bu test kategorisi **sıfır flaky risk**e sahiptir. Statik YAML dosyası içeriği kontrol edilmektedir — çalışma zamanı bağımlılıkları yoktur.

**Tek potansiyel başarısızlık kaynağı:** `.github/workflows/publish.yml` veya `release.yml` dosyası silinirse veya içeriği değişirse testler fail eder. Bu kasıtlı regression protection'dır, flaky değil.

**`resolve('.github/workflows/publish.yml')` dikkat:** `resolve()` (path.resolve) çalışma dizinine göre path'i çözümler. Testler proje root'undan çalıştırılmalıdır, aksi halde dosya bulunamaz. Bu minor portability riskidir.

---

## 6. Memory V2 Mock Uyumu

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` mock | YOK — temiz |
| `parseDebtTable` mock | YOK — temiz |
| `MemoryStore` import/mock | YOK |
| DB erişimi | YOK |
| Eski `.brain/` parse kodu | YOK |

Workflows kategorisi Memory V2 ile tamamen bağımsızdır. Test edilen içerik GitHub Actions YAML dosyalarıdır. Memory V2 uyumu tam.

---

## 7. Genel Değerlendirme

### Güçlü Yönler:
- **publish.yml için kapsamlı test**: OIDC provenance, dry-run sırası (dry-run önce gelir), `NODE_AUTH_TOKEN` ≥2 kez — güvenlik açısından kritik özellikler doğrulanıyor
- **Dry-run order assertion**: `dryRunIndex < publishProvenanceIndex` — çok önemli bir invariant; accidental publish'i önler
- **Negative test yok**: Bu tür statik testlerde negatif assert gerekmez
- Sıfır flaky risk, sıfır mock karmaşıklığı
- `release.yml` OIDC ve permissions testi: `contents: write` (GitHub Release) doğru

### Zayıf Yönler:
- **`'fs'` import** yerine `'node:fs'` kullanılmalı (ADR-001, satır 2)
- **try/catch sessiz fail**: Dosya bulunamazsa `workflowContent = ''` atanıyor ve tüm testler `length > 0`'da fail eder — hata mesajı `expected 0 to be greater than 0` gibi belirsiz. `beforeAll` + `expect(workflowContent).toBeTruthy()` daha net hata mesajı verirdi.
- **release.yml sadece 5 test**: `publish.yml`'nin 19 testine kıyasla `release.yml` zayıf kapsanmış — Node version, cache, checkout version kontrolleri yok
- **`path.resolve` cwd bağımlılığı**: Proje root'undan çalıştırılmıyorsa dosya bulunamaz — CI güvenilirlik riski

### Kritik Bulgu: Kapsam Duplikasyon Riski
`tests/github/workflows/` kategorisi (5 dosya) ve `tests/workflows/` kategorisi (1 dosya) arasındaki ilişki netleştirilmeli. İki kategori paralel olarak CI workflow'larını test ediyorsa kapsam çakışması ya da boşluk olabilir.

### Öneriler (Sprint 142+):
1. `import { readFileSync } from 'fs'` → `import { readFileSync } from 'node:fs'` (ADR-001)
2. `try/catch` pattern'ı `beforeAll` bloğuna taşı + descriptive skip message
3. `release.yml` test coverage'ını genişlet (Node version, checkout, cache)
4. `tests/github/workflows/` kategorisiyle kapsam haritası çıkar — duplikasyonu önle
5. `resolve()` yerine `import.meta.url` + `fileURLToPath` kullan (ESM uyumu)

**Sağlık Skoru:** 72/100 (B-)

Gerekçe: `publish.yml` testleri mükemmel (OIDC, dry-run order, provenance) ve gerçek deployment güvenliğini koruyor. `release.yml` yetersiz kapsam, `'fs'` import ESM uyumsuzluğu ve sessiz try/catch pattern skoru düşürmektedir.
