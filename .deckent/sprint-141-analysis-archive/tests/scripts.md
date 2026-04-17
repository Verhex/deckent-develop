# Test Category Analysis: scripts
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 10

---

## 1. Test Dosya Envanteri

**Toplam:** 10 dosya | **describe blokları:** 68 | **it() blokları:** 208

| Dosya | Açıklama |
|-------|----------|
| `adr-validator.test.ts` | `scripts/adr-validator.mjs` — ADR parse ve validasyon |
| `build-verify.test.ts` | `scripts/build-verify.ts` — TypeScript build + dist doğrulama |
| `dead-code-audit.test.ts` | `scripts/dead-code-audit.mjs` — Kullanılmayan export tespiti |
| `pack-test.test.ts` | `scripts/pack-test.ts` — npm pack pipeline test |
| `pre-flight-health-check.test.ts` | `scripts/pre-flight-health-check.mjs` — Sprint öncesi sağlık kontrolü |
| `prepublish.test.ts` | `scripts/prepublish.ts` — Yayın öncesi doğrulama |
| `publish-workflow.test.ts` | `.github/workflows/publish.yml` — CI/CD YAML doğrulama |
| `publish.test.ts` | `scripts/publish.ts` — npm publish akışı |
| `scripts.test.ts` | `scripts/verify-publish.sh`, `changelog.sh`, `bump-version.sh` — Shell script testi |
| `validate-publish.test.ts` | `scripts/validate-publish.ts` — Paket içerik doğrulama |

---

## 2. Mock Pattern Audit

### vi.mock kullanımı

| Dosya | Mock Modülleri |
|-------|----------------|
| `prepublish.test.ts` | `node:fs`, `node:child_process` |
| `pack-test.test.ts` | `node:child_process` |
| `pre-flight-health-check.test.ts` | `node:child_process`, `node:fs` |
| `publish.test.ts` | `node:child_process`, `node:fs` |
| `build-verify.test.ts` | `node:fs`, `node:child_process` |
| `adr-validator.test.ts` | Mock YOK (doğrudan import + gerçek dosya) |
| `dead-code-audit.test.ts` | `node:fs` (kısmi), `node:child_process` |
| `scripts.test.ts` | Mock YOK (gerçek shell exec + platform skip) |
| `validate-publish.test.ts` | `node:fs` kısmi, tmpdir kullanımı |
| `publish-workflow.test.ts` | Mock YOK (YAML dosyası doğrulama) |

### vi.mocked typed mock kullanımı

- `prepublish.test.ts` — `mockedExistsSync`, `mockedStatSync`, `mockedReaddirSync`, `mockedReadFileSync`, `mockedExecSync` (5 typed mock)
- `pre-flight-health-check.test.ts` — `spawnSyncMock`, `existsSyncMock`, `readdirSyncMock`, `readFileSyncMock`, `statSyncMock` (5 typed mock)
- `publish.test.ts` — `mockedExecSync`, `mockedReadFileSync` (2 typed mock)
- `pack-test.test.ts` — `mockedExecSync` (1 typed mock)
- `build-verify.test.ts` — fs + execSync mock'ları

### Fake Timer Kullanımı

**0 adet** `useFakeTimers` — scripts kategori zamanlama bağımlısı test içermiyor.

---

## 3. Coverage Mapping

### scripts/ src dosyaları vs testler

| Src Dosyası | Test Dosyası | Durum |
|-------------|-------------|-------|
| `adr-validator.mjs` | `adr-validator.test.ts` | OK |
| `build-verify.ts` | `build-verify.test.ts` | OK |
| `dead-code-audit.mjs` | `dead-code-audit.test.ts` | OK |
| `pack-test.ts` | `pack-test.test.ts` | OK |
| `pre-flight-health-check.mjs` | `pre-flight-health-check.test.ts` | OK |
| `prepublish.ts` | `prepublish.test.ts` | OK |
| `publish.ts` | `publish.test.ts` | OK |
| `validate-publish.ts` | `validate-publish.test.ts` | OK |
| `check-error-handling.mjs` | **YOK** | **GAP** |
| `copy-assets.mjs` | **YOK** | **GAP** |
| `migrate-brain-v2.mjs` | **YOK** | **KRİTİK GAP** |
| `generate-cli-docs.ts` | **YOK** | **GAP** |
| `verify-publish.sh` | `scripts.test.ts` (kısmi) | PARTIAL |
| `changelog.sh` | `scripts.test.ts` (kısmi) | PARTIAL |
| `bump-version.sh` | `scripts.test.ts` (kısmi) | PARTIAL |

**Ek coverage:**
- `.github/workflows/publish.yml` — `publish-workflow.test.ts` (YAML doğrulama)
- `scripts/scripts.test.ts` platform-bağımlı (`describe.skipIf(isWindows)`)

**Kapsama oranı:** ~8/12 = %67

---

## 4. Orphan Test Tespiti

| Test Dosyası | Durumu |
|-------------|--------|
| `publish-workflow.test.ts` | Src script değil, CI YAML dosyasını test ediyor — PSEUDO-ORPHAN ama geçerli |
| `scripts.test.ts` | `verify-publish.sh`, `changelog.sh`, `bump-version.sh` shell scriptlerini test ediyor — geçerli |

**Gerçek orphan yok** — `publish-workflow.test.ts` `.github/workflows/publish.yml` dosyasını kapsıyor, bu bir scripts değil ama CI pipeline doğrulama olarak mantıklı.

---

## 5. Flaky Candidate İşaretleri

### setTimeout / Date.now() kullanımı

| Dosya | Satır | Kullanım | Risk |
|-------|-------|----------|------|
| `pre-flight-health-check.test.ts:184` | `new Date(Date.now() - 600_000)` | Stale heartbeat simülasyonu | Düşük |
| `pre-flight-health-check.test.ts:196` | `statSyncMock.mockReturnValue({ mtimeMs: Date.now() - 600_000 })` | Stale dosya zamanı | Düşük |

**Fake timer kullanımı: 0** — sıfır fake timer.

### Platform-Gated Testler

`scripts.test.ts`:
```typescript
describe.skipIf(isWindows)('OSS Scripts', () => {
```

Bu shell script testleri Windows'ta tamamen atlanıyor. Linux/macOS ortamlarında çalışıyor. **WSL2'de güvenli.** CI'da platform tutarlılığı sağlanmış.

### Gerçek Shell Exec Riski

`scripts.test.ts` gerçek `execSync` çağrıları yapıyor (mock değil). Bu testler:
- Gerçek ortam bağımlılıkları var (git, npm, node)
- Çalışma dizini bağımlısı (workspace var sayılıyor)
- Ağ bağlantısı gerektirmemeli ama npm komutları yavaş olabilir

**Risk:** `changelog.sh` veya `bump-version.sh` testleri yan etki oluşturabilir (dosya yazımı) — `afterEach` cleanup ile hafifletilmiş mi kontrol edilmeli.

### validate-publish.test.ts tmpdir kullanımı

`validate-publish.test.ts` geçici dizin (`mkdtempSync`) kullanıyor — bu genellikle güvenli, ancak cleanup başarısız olursa disk dolumu riski var (CI'da önemsiz).

---

## 6. Memory V2 Mock Uyumu

### MemoryStore Kullanımı

Scripts kategorisinde **hiç MemoryStore kullanımı yok** — 0 mock, 0 import.

Bu beklenen: `scripts/` build, publish ve validation araçlarıdır. Memory V2 DB ile doğrudan etkileşimleri yok.

### countBrainLines / parseDebtTable

Scripts kategorisinde **hiç countBrainLines veya parseDebtTable mock'u yok.**

### KRİTİK BULGU: migrate-brain-v2.mjs Testi Yok

`scripts/migrate-brain-v2.mjs` — Memory V2 migration'ı gerçekleştiren kritik script. Bu script:
- Eski `.brain/DECISIONS.md`, `MEMORY.md`, `DEBT.md` dosyalarını parse ediyor
- Bunları SQLite `memory.db`'ye aktarıyor
- Tek çalışma window'u var (idempotent değilse)

**Bu script için hiç test yok.** Sprint 139'da yazıldı ve doğrulama hâlâ manuel. Memory V2'nin temel altyapısını oluşturan bu script'in test edilmemesi önemli bir risk.

### dead-code-audit.mjs Memory V2 Bağlantısı

`dead-code-audit.test.ts` — `findExports`, `auditKnownSuspects`, `generateReport` testleri mevcut. Bu test ADR-038 dead code disposition policy'sinin doğrulanmasına yardımcı oluyor. Sprint 139'daki dead code tespiti bu script ile yapıldı.

### adr-validator.mjs Memory V2 Bağlantısı

`adr-validator.test.ts` — `parseADRs`, `validateADRs`, `validate` testleri mevcut. ADR governance (ADR-036) için kritik. Ancak bu script `.brain/DECISIONS.md` dosyasından okuyorsa (Memory V2 DB yerine), V1 bağımlılığı devam ediyor demektir.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 72/100 (B-)

### Güçlü Yönler

1. **Ana publish/build pipeline'ı tam kapsanmış** — adr-validator, build-verify, dead-code-audit, pack-test, pre-flight-health-check, prepublish, publish, validate-publish
2. **CI workflow YAML doğrulaması** — `publish-workflow.test.ts` PR'da YAML değişikliklerini yakalıyor
3. **Platform-gated shell testleri** — `skipIf(isWindows)` doğru pattern
4. **Sıfır flaky Date.now() riski** — zamanlama testleri minimal ve güvenli
5. **Typed mock pattern tutarlı** — `vi.mocked` yaygın kullanım

### Zayıf Yönler

1. **`migrate-brain-v2.mjs` TAMAMEN TESTSİZ** — Memory V2'nin en kritik migrasyonu test dışında. Yeniden çalıştırılırsa veri kaybı riski var.
2. **%67 kapsama** — 4 src dosyası test dışında (check-error-handling, copy-assets, generate-cli-docs, migrate-brain-v2)
3. **`scripts.test.ts` gerçek execSync** — yan etki riski, cleanup doğrulanmamış
4. **`adr-validator.mjs` V2 uyumu şüpheli** — DECISIONS.md'yi okuyorsa DB-first değil

### Sprint 142+ Öneriler

1. **P0: `migrate-brain-v2.mjs` için test yaz** — idempotency, partial migration, conflict handling
2. **P1: `generate-cli-docs.ts` için test** — CLI docs pipeline doğrulama
3. **P2: `check-error-handling.mjs` için test** — error handling coverage detection
4. **`adr-validator.mjs`** — Memory V2 DB okuma path'i için test ekle
5. **`scripts.test.ts` cleanup** — afterEach side effect temizliğini doğrula
