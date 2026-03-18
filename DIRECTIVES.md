# DIRECTIVES — Sprint 17 (Reliability + Test Infra + Docs)

## Hedef: Sprint 16'da keşfedilen güvenilirlik sorunlarını düzelt, React test altyapısı kur, dokümantasyonu güncelle.

---

## Görev 1: MCP deckent_start Background Job
- Dosya: src/mcp/tools/start.ts, src/mcp/tools/status.ts, src/core/types.ts
- Kapsam: src/mcp/tools/, src/core/

### Problem
MCP deckent_start çağrısı runSprint'i senkron çalıştırıyor. Sprint dakikalar sürebilir — MCP timeout'a düşüyor. Claude Code "tool call timed out" hatası alıyor.

### Çözüm
1. `deckent_start` hemen bir `jobId` döndürsün: `{ success: true, jobId: "sprint-017", status: "RUNNING" }`
2. Sprint arka planda çalışsın — `runSprint` bir child process veya async task olarak başlasın
3. `.deckent/jobs/{jobId}.json` dosyasına durum yazılsın: `{ status: "RUNNING"|"COMPLETE"|"FAILED", startedAt, completedAt?, error?, sprintResult? }`
4. `deckent_status` mevcut job durumunu da döndürsün
5. Basit yaklaşım: `child_process.fork()` ile ayrı process'te çalıştır, IPC ile sonuç al

### Test
- deckent_start hemen döner (timeout yok)
- Job dosyası oluşturuluyor
- deckent_status job durumunu gösteriyor
- Job tamamlandığında sonuç dosyada
- 6+ test

---

## Görev 2: .tasks/ Cleanup Düzeltme
- Dosya: src/orchestra/brain.ts
- Kapsam: src/orchestra/

### Problem
cleanup() fonksiyonu .hb ve .log dosyalarını temizliyor ama .json, .plan, .result, .paused dosyaları kalıyor. MCP üzerinden çalıştırıldığında cleanup çağrılmıyor çünkü runSprint'in COMPLETE fazına ulaşmadan process sonlanıyor.

### Çözüm
1. cleanup() fonksiyonunu genişlet: TASK_FILE_EXTENSIONS'taki TÜM uzantıları (.json, .plan, .hb, .result, .paused, .log) temizlesin
2. Güvenlik: sadece sprint'e ait task dosyalarını sil (sprint ID prefix kontrolü)
3. `deckent cleanup` CLI'da da aynı genişletilmiş temizlik çalışsın
4. Stale task detection: 24 saatten eski .tasks/ dosyalarını da temizle

### Test
- cleanup tüm task uzantılarını temizliyor
- Sprint prefix koruması çalışıyor
- Stale dosya tespiti çalışıyor
- 5+ test

---

## Görev 3: Sprint ID Güvenliği — Config-Based
- Dosya: src/core/utils.ts, src/core/types.ts, .deckent/config.json
- Kapsam: src/core/

### Problem
getNextSprintId() sadece .brain/sprints/ dizinindeki dosyalara bakıyor. Dosya silinirse veya eksikse sprint ID geri atlıyor (Sprint 16'da 011 oldu). Fragile.

### Çözüm
1. `.deckent/config.json`'a `last_sprint_id` alanı ekle
2. getNextSprintId() önce config'den oku, dosya taramasını fallback olarak kullan
3. Sprint tamamlandığında `last_sprint_id` güncelle (brain.ts runSprint sonunda)
4. Her iki kaynaktan da max değeri al (config vs dosya taraması) — hiçbir zaman geri atlamaz

### Test
- Config'den sprint ID okunuyor
- Config yoksa dosya taraması fallback
- Max değer seçiliyor (config > dosya veya tersi)
- Sprint sonunda config güncelleniyor
- 6+ test

---

## Görev 4: Dashboard State Reset
- Dosya: src/orchestra/brain.ts, src/monitor/auditor.ts
- Kapsam: src/orchestra/, src/monitor/

### Problem
Yeni sprint başladığında .dashboard dosyası eski sprint'in verilerini içeriyor. Web dashboard ve deckent status eski veriyi gösteriyor.

### Çözüm
1. runSprint'in PLAN fazında .dashboard'u sıfırla: fresh DashboardState yaz
2. Fresh state: `{ sprint: { id, status: 'PLANNING' }, agents: [], progress: { done: 0, total: taskCount }, alerts: [], updatedAt }`
3. Auditor scan loop başladığında da dashboard'un sprint ID'sini kontrol et — uyuşmuyorsa sıfırla

### Test
- PLAN fazında dashboard sıfırlanıyor
- Fresh state doğru format
- Sprint ID uyuşmazlığında reset
- 4+ test

---

## Görev 5: React Test Altyapısı
- Dosya: src/dashboard/vitest.config.ts (yeni), src/dashboard/src/test/setup.ts (yeni), tests/dashboard/ (yeni dizin)
- Kapsam: src/dashboard/, tests/dashboard/

### Problem
Dashboard React bileşenlerinin testi yok. Sprint 16'da AgentDetail eklendi ama test yazılamadı — vitest happy-dom/jsdom setup'ı eksik.

### Çözüm
1. `src/dashboard/vitest.config.ts` oluştur: happy-dom environment, src/ alias
2. `src/dashboard/src/test/setup.ts`: minimal setup (global fetch mock)
3. `tests/dashboard/AgentDetail.test.tsx`: render, fetch mock, close button
4. `tests/dashboard/DashboardPage.test.tsx`: temel render testi
5. package.json'a `test:dashboard` script ekle: `vitest run --config src/dashboard/vitest.config.ts`
6. Ana vitest.config.ts'ten dashboard testlerini exclude et (ayrı config)

### Test
- AgentDetail render ediliyor
- AgentDetail fetch mock çalışıyor
- DashboardPage render ediliyor
- 6+ test

---

## Görev 6: Sprint 16 Dokümantasyon Güncellemesi
- Dosya: DECKENT-MASTER-BLUEPRINT.md, DECKENT-ANA-PLAN-TR.md, docs/CHANGELOG.md, docs/SPRINT-LOG.md, docs/API.md, docs/ARCHITECTURE.md, README.md
- Kapsam: docs/, root

### Problem
Sprint 16 değişiklikleri dokümantasyona yansımamış. Blueprint, API.md, CHANGELOG hala Sprint 15'te.

### Çözüm
Her dosyada Sprint 16 güncellemeleri:
- Blueprint: Section 3.2 (watch komutu, 25 CLI), Section 19 (Sprint 16 entry), Section 24 (tablo), Section 18 (worker log dosyaları)
- API.md: Section 10 (yeni endpoint: GET /api/worker/:taskId/log), Section 12 (watch + start --watch)
- CHANGELOG.md: [0.1.0-sprint16] entry
- SPRINT-LOG.md: Sprint 16 log
- README.md: 987 test, 16 sprint, watch komutu ekleme
- ARCHITECTURE.md: watch mode, worker log flow

### Test
- Manuel doğrulama — sayılar tutarlı (987 test, 26 CLI, 16 endpoint)

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — hedef: 1020+ test (987 + ~33 yeni)
- Coverage düşmemeli (%97+)
- Mevcut 987 test 0 regresyon
- MCP: 10 tool (değişiklik yok), 5 resource (değişiklik yok)
- CLI: 26 komut (watch eklenmişti Sprint 16'da)
- HTTP API: 15→16 endpoint (worker log eklendi Sprint 16'da)
- getNextSprintId hiçbir zaman geri atlamamalı
- Background job: fork() veya spawn(), ana process'i bloklamamalı
