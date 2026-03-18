# DIRECTIVES — Sprint 23 (AI Planner Post-Validation Fallback + 12-Task Doğrulama)

## Hedef: AI planner post-validation fallback fix (Görev 1 — zaten tamamlandı), Sprint 22 özelliklerinin 11 doğrulama dokümanı. 12 görev — task queue dalga testi (8 worker + 4 kuyruk).

---

## Görev 1: AI Planner Post-Validation Fallback Fix (TAMAMLANDI)
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain.test.ts
- Kapsam: src/orchestra/, tests/orchestra/

### Açıklama
planSprint() içinde AI planner sonucu directive görev sayısıyla karşılaştırılıyor. AI eksik döndürürse structured fallback'e düşülüyor. +10 test eklendi. 1402 test geçiyor.

### Test
- 10 yeni test eklendi ve geçiyor

---

## Görev 2: Decay Fix Doğrulama
- Dosya: tmp-test/decay-fix-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 Görev 1 (runDecay DEBT.md Resolved Retention Fix) doğrulaması:
1. shouldRemoveResolvedDebt fonksiyonu var mı? Nerede tanımlı?
2. parseSprintNumber doğru çalışıyor mu?
3. DEBT-002 korunuyor mu? `cat .brain/DEBT.md` ile kontrol
4. resolved + 1 sprint → keep, resolved + 3+ sprint → remove mantığı doğru mu?
5. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 3: Auto Setup Wizard Doğrulama
- Dosya: tmp-test/auto-setup-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 Görev 2 (auto-setup.ts) doğrulaması:
1. src/cli/auto-setup.ts dosyası var mı?
2. generateSetupRecommendation fonksiyonu export ediliyor mu?
3. SetupRecommendation interface types.ts'de var mı?
4. Subscription bazlı mode seçimi doğru mu?
5. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 4: MCP Enrichment Infrastructure Doğrulama
- Dosya: tmp-test/enrich-infra-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 Görev 3 (enrich.ts) doğrulaması:
1. src/mcp/helpers/enrich.ts dosyası var mı?
2. enrichResponse fonksiyonu export ediliyor mu?
3. EnrichedMeta interface doğru mu?
4. _enriched alanı mevcut response alanlarını bozmuyor mu?
5. tr/en lokalizasyon çalışıyor mu?
6. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 5: MCP Enrichment Tools Batch 1 Doğrulama
- Dosya: tmp-test/enrich-tools-batch1-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 Görev 4 (directives + plan + start + status enrichment) doğrulaması:
1. src/mcp/tools/directives.ts'de enrichResponse import var mı?
2. src/mcp/tools/plan.ts'de enrichResponse import var mı?
3. src/mcp/tools/start.ts'de enrichResponse import var mı?
4. src/mcp/tools/status.ts'de enrichResponse import var mı?
5. Her tool'un response'unda _enriched alanı var mı?
6. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 6: MCP Enrichment Tools Batch 2 Doğrulama
- Dosya: tmp-test/enrich-tools-batch2-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 Görev 5 (doctor + init + retro + history + sync + analyze enrichment) doğrulaması:
1. 6 tool dosyasında enrichResponse import var mı?
2. doctor → recommendations, init → nextSteps, retro → highlights
3. history → trend, sync → changeCount, analyze → configSuggestion
4. Geriye uyumluluk korunuyor mu?
5. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 7: CLI Hints System Doğrulama
- Dosya: tmp-test/hints-system-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 Görev 6 (hints.ts + messages.ts) doğrulaması:
1. src/cli/helpers/hints.ts dosyası var mı?
2. src/cli/helpers/messages.ts dosyası var mı?
3. getContextualHints fonksiyonu export ediliyor mu?
4. getMessage fonksiyonu export ediliyor mu?
5. COMPLETE, EXECUTE, PLAN, IDLE fazları için hint var mı?
6. tr/en lokalizasyon çalışıyor mu?
7. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 8: Doctor Profile Flag Doğrulama
- Dosya: tmp-test/doctor-profile-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 Görev 7 (doctor --profile) doğrulaması:
1. src/cli/commands/doctor.ts'de --profile option var mı?
2. src/mcp/tools/doctor.ts'de includeProfile parametresi var mı?
3. --profile ile sistem profili gösteriliyor mu?
4. --profile olmadan mevcut davranış korunuyor mu?
5. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 9: Sprint 22 Test Coverage Doğrulama
- Dosya: tmp-test/test-coverage-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 22 sonrası test durumu:
1. Toplam test sayısı: npx vitest run ile kontrol
2. Sprint 21'den Sprint 22'ye test artışı: 1260 → ?
3. Sprint 23 sonrası hedef: 1402+
4. Yeni test dosyaları listesi
5. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 10: AI Planner Fallback Fix Doğrulama
- Dosya: tmp-test/planner-fallback-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 23 Görev 1 (bu sprint) doğrulaması:
1. brain.ts satır 483 civarında post-validation kodu var mı?
2. parseStructuredDirectives ile directive görev sayısı kontrol ediliyor mu?
3. plannerResult = null yapılıyor mu?
4. mode=ai'de fallback yapılmıyor mu?
5. 10 yeni test geçiyor mu?
6. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 11: Task Queue Wave Doğrulama
- Dosya: tmp-test/task-queue-wave-verify.md (yeni)
- Kapsam: tmp-test/

### Açıklama
12 görevli sprint'te task queue wave sistemi doğrulaması:
1. .tasks/ dizininde task-023-*.json dosya sayısı
2. max_workers=8 ile ilk dalga 8 worker spawn mı?
3. Kalan 4 görev kuyrukta mı?
4. .dashboard'da progress.total = 12 mi?
5. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Görev 12: Sprint History Karşılaştırma
- Dosya: tmp-test/sprint-history-compare.md (yeni)
- Kapsam: tmp-test/

### Açıklama
Sprint 18-23 karşılaştırması:
1. Her sprint'te kaç görev planlandı ve kaçı tamamlandı?
2. Test sayısı trendi: 1027 → 1123 → 1260 → 1402 → ?
3. Hangi sprint'lerde task queue kullanıldı?
4. DEBT.md entry sayısı trendi
5. AI planner vs structured planner kullanım oranı
6. Sonuçları markdown dosyasına yaz

### Test
- Dosya oluşturulmuş

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut 1402 test 0 regresyon
- Task queue: 12 görev planlanmalı, 8 worker spawn + 4 kuyruk
- DEBT-002 decay sonrası korunmalı
- tmp-test/ dosyaları doc task olarak tanınmalı