# Test Category Analysis: github
**Tarih:** 2026-04-16 | **Task:** 141-007 | **Dosya Sayısı:** 5

---

## 1. Test Dosya Envanteri

| Dosya | describe Blokları | it Blokları | LoC | Test Hedefi |
|-------|-------------------|-------------|-----|-------------|
| .github-files.test.ts | 3 | 36 | ~160 | .github/ISSUE_TEMPLATE/security.md + FUNDING.yml |
| ci-workflow.test.ts | 6 | 33 | ~180 | .github/workflows/ci.yml |
| dependabot.test.ts | 4 | 17 | ~120 | .github/dependabot.yml |
| workflows/ci.test.ts | 5 | 17 | ~100 | .github/workflows/ci.yml |
| workflows/release.test.ts | 6 | 35 | ~130 | .github/workflows/release.yml |

**Toplam:** 5 dosya | 40 describe bloğu | 138 it bloğu

### Dosya Açıklamaları

**`.github-files.test.ts`:** `.github/ISSUE_TEMPLATE/security.md` YAML frontmatter, güvenlik etiketi, bölüm başlıkları (Vulnerability Type, Severity Assessment, CVSS score, Steps to Reproduce, Impact Assessment, Responsible Disclosure, Proposed Fix, Timeline & Patches) ve `.github/FUNDING.yml` yapısını doğrular.

**`ci-workflow.test.ts`:** `.github/workflows/ci.yml` için kapsamlı doğrulama: workflow adı, trigger (push to master), actions (checkout@v4, setup-node@v4), coverage job, npm audit security scanning, test-docs-scripts isolation job, dashboard build verification. `beforeAll` ile dosya okunuyor.

**`dependabot.test.ts`:** `.github/dependabot.yml` — npm ve github-actions ecosystem konfigürasyonu, schedule, open-pull-requests-limit, commit-message prefix, labels, ignore yapılandırması.

**`workflows/ci.test.ts`:** CI workflow'un yapısını doğrular: job listesi, Node.js versiyonları (matrix), typecheck, test jobs, build job. `ci-workflow.test.ts` ile kısmi örtüşme var.

**`workflows/release.test.ts`:** `.github/workflows/release.yml` doğrulama: tag push trigger (`v*`), permissions, checkout (`fetch-depth: 0`), setup-node, npm ci, lint, test, build, changelog extract, npm publish, GitHub release.

---

## 2. Mock Pattern Audit

**vi.mock:** 0 referans — hiçbir test modül mock'u kullanmıyor.
**vi.spyOn:** 0 referans.
**MemoryStore:** 0 referans.
**countBrainLines / parseDebtTable:** 0 referans.

### Test Yaklaşımı

Tüm github testleri **dosya sistemi okuma** tabanlıdır:
- `readFileSync` ile `.github/` dizinindeki YAML/YML dosyalarını okur.
- String match, includes, regex kontrolü yapar.
- Mock gerektirmez — doğrudan dosya içeriği doğrulanıyor.

Bu yaklaşım sağlam: CI'da gerçek config dosyalarının içeriğini test ediyor.

---

## 3. Coverage Mapping

Bu kategori, TypeScript kaynak kodu test etmiyor — `.github/` dizinindeki yapılandırma dosyalarını doğruluyor. "Coverage mapping" kavramı burada farklı uygulanır:

| Test Dosyası | Doğrulanan Dosya | Durum |
|-------------|-----------------|-------|
| .github-files.test.ts | .github/ISSUE_TEMPLATE/security.md + .github/FUNDING.yml | MATCH |
| ci-workflow.test.ts | .github/workflows/ci.yml | MATCH |
| dependabot.test.ts | .github/dependabot.yml | MATCH |
| workflows/ci.test.ts | .github/workflows/ci.yml | MATCH (örtüşme!) |
| workflows/release.test.ts | .github/workflows/release.yml | MATCH |

**Eksik coverage:**
- `.github/workflows/docs.yml` — test yok
- `.github/workflows/publish.yml` — test yok
- `.github/CODEOWNERS` — test yok
- `.github/pull_request_template.md` — test yok
- `.github/ISSUE_TEMPLATE/bug_report.md` — test yok
- `.github/ISSUE_TEMPLATE/feature_request.md` — test yok

---

## 4. Orphan Test Tespiti

**Örtüşme Problemi (Pseudo-Orphan):**

`ci-workflow.test.ts` (6 describe, 33 it) ve `workflows/ci.test.ts` (5 describe, 17 it) aynı `.github/workflows/ci.yml` dosyasını test ediyor. İki farklı açıdan yaklaşıyorlar (ci-workflow daha detaylı, workflows/ci daha yapısal), ancak bazı testler çakışıyor:

Çakışan testler:
- "should trigger on push to master" — her ikisinde de var
- "should use checkout@v4" / "should use actions/checkout@v4" — eşdeğer
- Workflow name kontrolü — her ikisinde

Bu **teknik orphan değil** (her ikisi de ilgili dosyayı test ediyor) ama **test duplikasyonu** var. Birleştirilmeli veya sorumluluklar net ayrılmalı.

---

## 5. Flaky Candidate İşaretleri

**setTimeout:** 0 referans.
**Date.now():** 0 referans.
**Race condition:** Yok.

**Potansiyel kırılganlık (Flaky değil ama Brittle):**

Testler dosya içeriğini string olarak kontrol ediyor. `.github/workflows/ci.yml` değiştirildiğinde testler kırılır — bu **intended behavior** (config değişimi tespiti), ancak bakım yükü yüksek. Örnek:

```typescript
it('should run core tests', () => {
  expect(workflowContent).toContain('npm run test:core');
});
```

CI workflow güncellendikçe bu testler elle güncellenmeli.

---

## 6. Memory V2 Mock Uyumu

`countBrainLines`: 0 referans — temiz.
`parseDebtTable`: 0 referans — temiz.
`MemoryStore`: 0 referans — bu kategori memory altyapısına dokunmuyor.

**Memory V2 Uyumu:** TAM UYUMLU. GitHub config testleri tamamen bağımsız bir katman.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 72/100 (C+)

### Güçlü Yönler
- CI config dosyalarının içeriğini otomatik doğrulama — "config drift" tespiti için değerli.
- Mock bağımlılığı yok — saf dosya okuma testi.
- Flaky riski sıfır.
- `release.yml` testi kapsamlı (fetch-depth, npm publish, GitHub release steps dahil).
- Memory V2 uyumu tam.

### Zayıf Yönler
- **Kritik:** `ci-workflow.test.ts` ve `workflows/ci.test.ts` aynı dosyayı test eden 50 test (33+17) ikiliği — duplikasyon.
- `.github/workflows/docs.yml`, `publish.yml` için test yok.
- `.github/CODEOWNERS`, `pull_request_template.md`, `bug_report.md`, `feature_request.md` için test yok.
- Testler string tabanlı (`toContain`) — YAML parse edilerek yapısal doğrulama daha sağlam olurdu.
- `beforeAll` ile dosya okuma — dosya bulunamazsa tüm suite crash eder (error message zayıf).
- `workflows/` alt dizini ayrı klasörde (`tests/github/workflows/`) ama vitest config `tests/**/*.test.ts` ile buluyor — düzen tutarsızlığı.

### Sprint 142+ Öneriler
- `ci-workflow.test.ts` ve `workflows/ci.test.ts` birleştir — tek otorite.
- `docs.yml` ve `publish.yml` için test ekle.
- `js-yaml` veya `@actions/yaml-parser` ile YAML parse tabanlı doğrulama düşün.
- `beforeAll` içine `existsSync` guard ekle, dosya yoksa `test.skip` ile graceful handle et.
