# Sprint 21 Observation Report — Motor Altyapısı + Parametrik Orkestrasyon

**Tarih:** 2026-03-18
**Hedef:** Planner fix, sistem profili, subscription tespiti, katmanlı model seçimi, auto worker, deckent test+run komutları
**Sonuç:** 8/8 planlanan görev tamamlandı (7 DONE, 1 GO_WITH_TECH_DEBT). 12 görevden 8'i planlandı.

---

## Özet

Sprint 21, deckent motoruna 4 yeni altyapı modülü (system-profile, subscription, resolveTaskModel, resolveEffectiveWorkers) ve 2 yeni CLI komutu (test, run) ekledi. Planner task limit fix'i (P0) ve doc criteria genişletme (P1) düzeltildi. 137 yeni test eklendi (1123 → 1260). tsc clean, 0 regresyon. Planner yine sadece 8 görev planladı — görev 9-12 (auto-setup, enrich, hints, doctor --profile) kararlanacakplan.md'den eksik kaldı.

---

## Görev Sonuçları

| # | Görev | Değerlendirme | Yeni Dosya |
|---|-------|---------------|------------|
| 1 | planSprint Task Limit Fix (P0) | DONE | - (brain.ts + planner.ts değişiklik) |
| 2 | evaluateResult Doc Criteria | DONE | - (brain.ts değişiklik) |
| 3 | system-profile.ts | DONE | src/core/system-profile.ts + test |
| 4 | subscription.ts | GO_WITH_TECH_DEBT | src/core/subscription.ts + test |
| 5 | resolveTaskModel | DONE | tests/orchestra/resolve-task-model.test.ts |
| 6 | max_workers auto | DONE | - (config.ts + types.ts + brain.ts değişiklik) |
| 7 | deckent test | DONE | src/cli/commands/test-run.ts + test |
| 8 | deckent run | DONE | src/cli/commands/run.ts + test |
| 9 | Auto Setup Wizard | PLANLANMADI | - |
| 10 | MCP Enrichment | PLANLANMADI | - |
| 11 | CLI Hints | PLANLANMADI | - |
| 12 | doctor --profile | PLANLANMADI | - |

### Planlanmayan Görevler Analizi
Planner hala max_workers=8 ile sınırlı görev oluşturuyor. **Görev 1 (planner fix) yazıldı ama bu sprint'in planner'ı eski kodu kullandı.** Fix ancak Sprint 22'de etkili olacak.

---

## Kaynak Kod Değişiklikleri

| Dosya | Değişiklik |
|-------|-----------|
| src/orchestra/brain.ts | +222: resolveTaskModel, resolveEffectiveWorkers, testMode, planSprint fix |
| src/orchestra/planner.ts | +3: max_workers limitini kaldırma |
| src/core/types.ts | +21: SystemProfile, SubscriptionProfile, max_workers union type |
| src/core/config.ts | +35: auto validation, 1-100 range, warning |
| src/core/system-profile.ts | YENİ: getSystemProfile() |
| src/core/subscription.ts | YENİ: detectSubscription() |
| src/core/index.ts | +8: barrel exports |
| src/cli/commands/test-run.ts | YENİ: deckent test komutu |
| src/cli/commands/run.ts | YENİ: deckent run komutu |
| src/cli/index.ts | +4: register test + run |

---

## Test Metrikleri

| Metrik | Önceki | Sonraki | Fark |
|--------|--------|---------|------|
| Test sayısı | 1123 | 1260 | +137 |
| Test dosyası | 40 | 46 | +6 |
| Passed | 1123 | 1260 | +137 |
| Failed | 0 | 0* | 0 |
| tsc --noEmit | Clean | Clean | - |

*debt-002 testi DEBT.md decay sorunu nedeniyle tekrar kırıldı, manuel düzeltildi.

---

## Yeni Yetenekler

### 1. Sistem Profili (system-profile.ts)
- `getSystemProfile()`: CPU core, RAM, önerilen worker sayısı
- Formül: `max(1, min(floor(freeMem/400), cpuCores-1, 30))`
- Config'e `system_profile` olarak kaydedilebilir

### 2. Subscription Tespiti (subscription.ts)
- `detectSubscription()`: claude opus model testi
- max/pro/unknown tespit, 15s timeout, graceful fallback
- GO_WITH_TECH_DEBT: bazı edge case'ler eksik olabilir

### 3. Katmanlı Model Seçimi (resolveTaskModel)
- 4 katman: plan erişim → usage baskısı → görev tipi → skor
- Pro plan'da opus atanmaz, docs scope → max sonnet

### 4. Auto Worker (max_workers: 'auto')
- Config'de `max_workers: number | 'auto'` desteği
- auto modda sistem profili bazlı hesaplama
- 1-100 arası, 20+ warning

### 5. deckent test
- Sprint başlatır, RETRO/MEMORY/sprint log yazmaz
- `--keep`, `--timeout` flags

### 6. deckent run
- Tek seferlik görev, sprint döngüsü yok
- `--model`, `--scope` flags

---

## DEBT.md Decay Sorunu (Tekrarlayan)

Sprint cleanup/decay sırasında DEBT.md tablosu tekrar boşaltıldı. debt-002.test.ts kırıldı. **Bu 3. kez aynı sorun** (Sprint 18, 19-fix, 21).

**Kök neden:** `decay()` fonksiyonu DEBT.md'yi overwrite ederken sadece header yazıyor, mevcut resolved entry'leri korumuyor.

**Gerekli fix:** `decay()` veya `cleanup()` fonksiyonunda DEBT.md'yi sadece header ile overwrite etme — mevcut entry'leri koru.

---

## Sprint 22 İçin Öneriler

1. **Planner fix doğrulama** — 12+ görev vererek tüm görevlerin planlandığını doğrula
2. **DEBT.md decay fix** — resolved entry'leri koruyan decay
3. **Kalan kararlanacakplan.md görevleri**: auto-setup, MCP enrichment, CLI hints, doctor --profile
4. **E2E test** — deckent test komutuyla smoke test

---

## Metrikler

| Metrik | Değer |
|--------|-------|
| Planlanan | 8/12 |
| Tamamlanan | 8/8 |
| DONE | 7 |
| GO_WITH_TECH_DEBT | 1 |
| NO_GO | 0 |
| Süre | 631s (~10.5 dk) |
| Yeni test | +137 |
| Yeni dosya | 6 kaynak + 6 test |
| tsc | CLEAN |
| CLI komut | 26 → 28 |
