# DIRECTIVES — Sprint 21 (Motor Altyapısı + Parametrik Orkestrasyon + MCP Enrichment)

## Hedef: Planner task limit fix, sistem profili, subscription tespiti, katmanlı model seçimi, auto worker, auto setup wizard, MCP zengin çıktılar, deckent test + run komutları. 12 görev — task queue dalga testi.

---

## Görev 1: planSprint Task Limit Fix (P0 — KRİTİK)
- Dosya: src/orchestra/brain.ts, src/orchestra/planner.ts
- Kapsam: src/orchestra/

### Problem
planSprint() ve parseStructuredDirectives() max_workers'dan bağımsız çalışmalı. Directive'deki TÜM görevleri parse et ve task JSON oluştur. max_workers sadece spawnWorkers/processQueue tarafında kalsın.

### Çözüm
1. `parseStructuredDirectives()` (planner.ts) — max_workers limitini kaldır, tüm `## Görev N:` bloklarını parse et
2. `planSprint()` (brain.ts) — plannerdan gelen tüm görevleri task JSON olarak yaz
3. `spawnWorkers()` — ilk batch `Math.min(taskCount, max_workers)`, kalan kuyrukta
4. Dashboard `progress.total` = tüm görev sayısı

### Test
- 14 görev directive, 8 max_workers → 14 task JSON oluşmalı
- 20 görev directive → 20 task JSON oluşmalı
- max_workers sadece spawn'u etkiliyor
- Dashboard total = tüm görev sayısı
- 10+ test

---

## Görev 2: evaluateResult Doc Criteria Genişletme (P1)
- Dosya: src/orchestra/brain.ts
- Kapsam: src/orchestra/

### Problem
evaluateResult sadece docs/ scope'unu doc task olarak tanıyor. tmp-test/, scripts/, root MD dosyaları tanınmıyor.

### Çözüm
1. `isDocTask(scope)` helper: kaynak kod dışı tüm scope'lar → doc task
2. Kaynak kod scope'ları: `src/`, `tests/`, `lib/` — bunlar dışındakiler doc task
3. Doc task'larda coverage check atla, testsPassed + dosya oluşturulmuş → DONE
4. Mixed scope (docs/ + src/) → normal evaluation

### Test
- docs/ scope → doc task (coverage atlanır)
- tmp-test/ scope → doc task
- scripts/ scope → doc task
- src/ scope → normal task
- Mixed scope → normal task
- 8+ test

---

## Görev 3: system-profile.ts — Sistem Kaynak Taraması
- Dosya: src/core/system-profile.ts (yeni), src/core/types.ts, src/core/index.ts
- Kapsam: src/core/

### Açıklama
Yeni dosya: `getSystemProfile()` fonksiyonu.
- `os.cpus().length` → CPU core sayısı
- `os.totalmem()` / `os.freemem()` → RAM bilgisi
- `recommendedMaxWorkers` formülü: `max(1, min(floor(freeMem/400), cpuCores-1, 30))`
- `SystemProfile` interface types.ts'e ekle
- Barrel export index.ts'e ekle

### Test
- Formül doğrulama (farklı RAM/CPU senaryoları)
- Düşük RAM (2GB) → düşük limit
- Yüksek CPU (32 core) → 30 cap
- os API mock
- 8+ test

---

## Görev 4: subscription.ts — Claude Plan Tespiti
- Dosya: src/core/subscription.ts (yeni), src/core/types.ts, src/core/index.ts
- Kapsam: src/core/

### Açıklama
Yeni dosya: `detectSubscription()` fonksiyonu.
1. `spawnSync('claude', ['-p', 'respond with just your model name', '--model', 'opus'])` → opus erişimi testi
2. Başarılıysa `detected: 'max'`, değilse `detected: 'pro'`, CLI yoksa `detected: 'unknown'`
3. `SubscriptionProfile` interface: `{ detected, opusAvailable, testedAt, method }`
4. Config'e `subscription` olarak kaydedilsin
5. Soft validation: config.mode ile uyumsuzluk varsa uyar ama engelleme
6. Timeout: 15 saniye, timeout olursa `detected: 'unknown'`

### Test
- opus var → detected: 'max'
- opus hata → detected: 'pro'
- Claude CLI yok → detected: 'unknown'
- Timeout → graceful fallback
- Config uyumsuzluk uyarısı
- 8+ test

---

## Görev 5: resolveTaskModel — Katmanlı Model Seçimi
- Dosya: src/orchestra/brain.ts
- Kapsam: src/orchestra/

### Açıklama
Yeni fonksiyon: `resolveTaskModel(title, desc, scope, config, usage)`. 4 katman:

1. **Plan erişim filtresi**: Pro plan'da opus → sonnet, haiku_allowed=false → sonnet
2. **Usage baskısı**: %80+ usage → opus → sonnet downgrade
3. **Görev tipi filtresi**: docs scope → max sonnet, test-only → max sonnet
4. **Skor sistemi**: Mevcut calculateModelScore alt katman olarak kalır

Karar: `resolveTaskModel` planSprint'te her task için çağrılır, `inferModelFromDirective` kaldırılmaz ama `resolveTaskModel` üst katman olur.

### Test
- Pro + cross-module task → sonnet (opus değil)
- Max + düşük usage + cross-module → opus
- haiku_allowed=false + basit task → sonnet (haiku değil)
- Usage %80+ → opus downgrade to sonnet
- docs/ scope → max sonnet
- 10+ test

---

## Görev 6: max_workers auto + resolveEffectiveWorkers
- Dosya: src/core/types.ts, src/core/config.ts, src/orchestra/brain.ts
- Kapsam: src/core/, src/orchestra/

### Açıklama
1. `PlanModeConfig.max_workers` type: `number | 'auto'`
2. Config validasyon: 'auto' string kabul, sayı 1-100 arası, 20+ için warning
3. `resolveEffectiveWorkers(config, systemProfile, usage)`:
   - auto modda: `min(systemProfile.recommendedMaxWorkers, plan_limit)`
   - number modda: doğrudan config değeri
4. planSprint ve spawnWorkers'a entegrasyon

### Test
- auto mod + 16GB RAM + 8 core → ~7 worker
- max_workers: 50 → uyarı ama geçerli
- max_workers: 101 → validation error
- auto mod + düşük RAM → düşük worker
- 8+ test

---

## Görev 7: deckent test CLI Komutu
- Dosya: src/cli/commands/test-run.ts (yeni), src/orchestra/brain.ts, src/cli/index.ts
- Kapsam: src/cli/, src/orchestra/

### Açıklama
Yeni komut: `deckent test`
1. DIRECTIVES.md'yi okur, sprint başlatır
2. `runSprint` fonksiyonuna `testMode: boolean` opsiyonu ekle
3. testMode=true: RETRO yazmaz, MEMORY güncellemez, sprint log yazmaz, decay çalıştırmaz
4. Sprint sonunda normal cleanup
5. `--keep` flag: cleanup'ı atla, dosyaları bırak
6. `--timeout <ms>` flag: max süre (varsayılan 300000ms = 5dk)
7. Exit code: 0 = tüm görevler DONE, 1 = herhangi NO_GO var
8. CLI'da register et

### Test
- test komutu kayıtlı
- testMode retro yazmaz
- testMode memory güncellemez
- --keep flag çalışıyor
- --timeout flag çalışıyor
- Exit code doğru
- 8+ test

---

## Görev 8: deckent run CLI Komutu
- Dosya: src/cli/commands/run.ts (yeni), src/cli/index.ts
- Kapsam: src/cli/

### Açıklama
Yeni komut: `deckent run "görev açıklaması"`
1. Tek seferlik görev — sprint döngüsü yok
2. Verilen açıklamadan tek task JSON oluştur
3. Tek worker spawn et (tmux)
4. Result bekle, raporla
5. Temizle (task JSON, .hb, .result sil)
6. `--model <opus|sonnet|haiku>` flag: model seçimi (varsayılan sonnet)
7. `--scope <dir>` flag: worker scope'u (varsayılan ./)
8. Exit code: 0 = DONE, 1 = NO_GO

### Test
- run komutu kayıtlı
- tek task JSON oluşuyor
- tek worker spawn ediliyor
- result beklenip raporlanıyor
- temizleme çalışıyor
- 6+ test

---

## Görev 9: Auto Setup Wizard (auto-setup.ts)
- Dosya: src/cli/auto-setup.ts (yeni), src/cli/commands/init.ts, tests/cli/auto-setup.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Açıklama
`generateSetupRecommendation(systemProfile, subscription, projectAnalysis)` fonksiyonu:
1. Subscription bazlı mode seçimi: max→max_plan, pro→pro_plan, unknown→pro_plan
2. Sistem bazlı worker sayısı: `systemProfile.recommendedMaxWorkers`
3. Proje bazlı ayar: small→0.5x, medium→0.75x, large→1x çarpan
4. `SetupRecommendation` interface: mode, maxWorkers, brainModel, defaultModel, planning, reasons
5. `deckent init` akışına entegrasyon: auto detect → öneri göster → kullanıcı onay/override
6. `deckent init --manual` ile auto'yu atla

### Test
- Max subscription + 16GB + small proje → max_plan, ~4 worker
- Pro subscription + 8GB + large proje → pro_plan, ~3 worker
- Unknown → pro_plan güvenli varsayılan
- Manuel override kabul
- 8+ test

---

## Görev 10: MCP Response Enrichment — enrich.ts
- Dosya: src/mcp/helpers/enrich.ts (yeni), src/mcp/tools/directives.ts, src/mcp/tools/plan.ts, src/mcp/tools/start.ts, src/mcp/tools/status.ts
- Kapsam: src/mcp/

### Açıklama
1. `enrichResponse(toolName, response, context)` fonksiyonu — her tool çıktısına summary + hints ekle
2. `set_directives`: breakdown (code/docs/test/analysis sayıları), estimatedModels, hints
3. `plan`: waveBreakdown, modelDistribution, riskAssessment
4. `start`: activeWorkers, queuedTasks, estimatedDuration
5. `status`: summary, progressBar (████░░), eta, workerSummary, alertSummary
6. Geriye uyumlu: mevcut alanlar korunur, yeni alanlar eklenir
7. Config language'a göre tr/en summary

### Test
- enrichResponse mevcut alanları koruyor
- set_directives breakdown doğru
- status progressBar doğru formatlı
- tr lokalizasyon çalışıyor
- 8+ test

---

## Görev 11: CLI Hints + Lokalizasyon
- Dosya: src/cli/helpers/hints.ts (yeni), src/cli/helpers/messages.ts (yeni)
- Kapsam: src/cli/

### Açıklama
1. `getContextualHints(phase, status)` — faz bazlı yönlendirici öneriler
2. `messages.ts` — tr/en lokalize mesajlar (sprint complete, next step, tasks detected vb.)
3. COMPLETE: "Sprint tamamlandı! deckent retro ile retrospektif okuyun"
4. EXECUTE: "Görevler çalışıyor. deckent status --watch ile izleyin"
5. Config language ile entegrasyon

### Test
- COMPLETE fazı doğru hint
- EXECUTE fazı doğru hint
- tr/en dil desteği
- 6+ test

---

## Görev 12: doctor --profile Flag
- Dosya: src/cli/commands/doctor.ts, src/mcp/tools/doctor.ts
- Kapsam: src/cli/, src/mcp/

### Açıklama
1. `deckent doctor --profile` flag ekle
2. Sistem profili çıktısı: CPU, RAM, recommendedMaxWorkers
3. Subscription durumu (varsa)
4. MCP doctor tool'a da systemProfile opsiyonel alanı ekle
5. Çıktı formatı: mevcut doctor checks + sistem profili tablosu

### Test
- --profile flag çalışıyor
- Sistem profili çıktıda görünüyor
- Flag olmadan mevcut davranış korunuyor
- 6+ test

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut 1123 test 0 regresyon
- Her görev için test yazılmalı — hedef: 1220+ test (1123 + ~97 yeni)
- Coverage düşmemeli (%97.5+)
- MCP: 10 tool, 5 resource (değişiklik yok — sadece çıktı zenginleştirme)
- CLI: 26→28 komut (test + run ekleniyor)
- HTTP API: 16 endpoint (değişiklik yok)
- Yeni dosyalar: system-profile.ts, subscription.ts, auto-setup.ts, enrich.ts, hints.ts, messages.ts, test-run.ts, run.ts
- Task queue: 12 görev planlanmalı (görev 1 fix'i bu sprint'te etkili olmayacak — beklenen)
