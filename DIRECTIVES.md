# DIRECTIVES — Sprint 19 (Motor Onarımı — Sprint 18 Bug Fix'leri)

## Hedef: Sprint 18 gözlem raporundaki 6 bug'ı düzelt, eksik 2 dokümanı tamamla. Orkestrasyon motorunu güvenilir hale getir.

---

## Görev 1: Task Queue — Planner Task Sayısı vs Worker Limiti Ayrımı
- Dosya: src/orchestra/brain.ts
- Kapsam: src/orchestra/

### Problem
Planner `max_workers` değerini görev sayısı limiti olarak kullanıyor. 10 görev verildiğinde sadece 8'ini planlıyor. Kalan 2 görev hiç oluşturulmuyor.

### Çözüm
1. `planSprint()` — tüm görevleri planla (max_workers limitinden bağımsız)
2. `spawnWorkers()` — ilk batch: `Math.min(taskCount, max_workers)` kadar worker spawn et
3. Kuyruk mekanizması: biten worker'ın yerine kuyruktaki sonraki task'ı spawn et
4. `waitForResults()` içinde veya ayrı bir `processQueue()` fonksiyonunda — .result dosyası oluşan worker'ın tmux window'unu kapat, sonraki task'ı yeni window'da başlat
5. Dashboard `progress.total` tüm görev sayısını göstersin (sadece aktif worker sayısını değil)

### Test
- 10 görev planlandığında 10 task JSON oluşuyor
- İlk dalga max_workers kadar worker spawn ediyor
- Biten worker'ın yerine kuyruktan yeni task spawn ediliyor
- Dashboard total = tüm görev sayısı
- 8+ test

---

## Görev 2: Heartbeat Timestamp Fix
- Dosya: src/orchestra/brain.ts (buildWorkerPrompt), src/monitor/auditor.ts
- Kapsam: src/orchestra/, src/monitor/

### Problem
Worker heartbeat dosyalarına yanlış timestamp yazıyor (saatler farkla). Auditor tüm worker'ları "stale agent" olarak işaretliyor. Sprint 18'de 42 false positive alert oluştu.

### Çözüm
1. `buildWorkerPrompt()` içindeki heartbeat talimatını kontrol et — worker'a `new Date().toISOString()` kullanmasını söyle
2. Auditor `isStaleAgent()` hesaplamasını kontrol et — heartbeat timestamp ile `Date.now()` arasındaki farkı doğru hesapla
3. Timezone normalizasyonu: her iki tarafta da UTC kullan
4. Stale threshold: 2 dakika (mevcut) ama timestamp parse hatasında agent'ı stale sayma

### Test
- Doğru timestamp'li heartbeat stale değil
- 2+ dakika eski heartbeat stale
- Malformed timestamp stale sayılmıyor (resilient)
- 6+ test

---

## Görev 3: Dashboard Progress — Auditor .result Taraması
- Dosya: src/monitor/auditor.ts (writeScanToDashboard)
- Kapsam: src/monitor/

### Problem
Dashboard `done` counter sadece EVALUATE fazında güncelleniyor. Sprint çalışırken progress 0 gösteriyor — yanıltıcı.

### Çözüm
1. `scanHeartbeats()` veya `writeScanToDashboard()` içinde `.tasks/task-*.result` dosyalarını da tara
2. `.result` dosyası olan task'ları `done` olarak say
3. Dashboard güncelle: `progress.done = resultCount`, `progress.active = activeWorkerCount`
4. Agent status: `.result` dosyası olan agent'ın statusunu DONE olarak güncelle

### Test
- .result dosyası olan task done sayılıyor
- Dashboard progress.done doğru güncelleniyor
- Aktif worker sayısı doğru
- 5+ test

---

## Görev 4: inferModelFromDirective Skor Tabanlı Sistem
- Dosya: src/orchestra/brain.ts (inferModelFromDirective)
- Kapsam: src/orchestra/

### Problem
`inferModelFromDirective()` opus'u çok agresif atıyor. Doküman görevlerine bile opus atanabiliyor.

### Çözüm
Skor tabanlı sistem:
- Cross-module scope (2+ dizin, farklı modüller): +3
- Mimari keyword (refactor, redesign, migrate, breaking): +2
- Dosya sayısı: filesWrite.length > 5 → +1, > 10 → +2, > 15 → +3
- docs/ veya config scope: -2
- Tek dizin scope: -1
- Test-only görev: -1

Karar:
- Skor >= 4: opus
- Skor <= -1: haiku
- Arası: sonnet

### Test
- Cross-module + mimari keyword → opus
- Tek docs/ dizini → sonnet veya haiku
- Test-only → haiku
- Basit config değişikliği → haiku
- 8+ test

---

## Görev 5: Alert Dedup — Auditor Tekrar Engelleme
- Dosya: src/monitor/auditor.ts
- Kapsam: src/monitor/

### Problem
Aynı alert her scan cycle'da tekrar oluşturuluyor. Sprint 18'de 42+ duplicate "stale agent" alerti oluştu.

### Çözüm
1. Alert eklemeden önce mevcut alert listesini kontrol et
2. `source + message` kombinasyonu zaten varsa tekrar ekleme
3. Opsiyonel: alert'e `count` field ekle — aynı alert tekrarlandığında count artır, yeni alert oluşturma
4. Alert listesi max 50 (eski alertler silinir)

### Test
- Aynı source+message tekrar eklenmiyor
- Farklı source ile aynı message eklenebiliyor
- Count artışı çalışıyor
- Max 50 limit
- 6+ test

---

## Görev 6: Auto Doc Update — Sprint Sonrası Dokümantasyon
- Dosya: src/orchestra/brain.ts
- Kapsam: src/orchestra/

### Problem
Sprint tamamlandığında CHANGELOG, SPRINT-LOG, README, Blueprint güncellemeleri manuel yapılıyor. Bu otomatik olmalı.

### Çözüm
1. `updateProjectDocs(sprintResult: SprintResult)` fonksiyonu oluştur
2. RETRO fazından sonra (veya TRANSITION fazında) çağır
3. Güncellemeler:
   - CHANGELOG.md: Yeni sprint entry (tarih, görev sayısı, highlights)
   - docs/SPRINT-LOG.md: Sprint bölümü (metrikler, görev listesi)
   - README.md: Sprint sayısı, test sayısı güncelle
4. Markdown template tabanlı — sprintf/replace pattern
5. Hata durumunda sprint'i bozmasın (try/catch, non-critical)

### Test
- CHANGELOG güncelleniyor
- SPRINT-LOG güncelleniyor
- README sayıları güncelleniyor
- Hata sprint'i bozmuyor
- 6+ test

---

## Görev 7: Doc Task Criteria — evaluateResult Görev Tipine Duyarlı
- Dosya: src/orchestra/brain.ts (evaluateResult)
- Kapsam: src/orchestra/

### Problem
Doküman görevlerinde coverage check anlamsız. Sprint 18'de 5/8 task false GO_WITH_TECH_DEBT olarak değerlendirildi çünkü coverage düşük çıktı.

### Çözüm
1. Task scope'una bak: sadece `docs/` dizinindeyse → doc task
2. Doc task'larda coverage threshold'u kaldır veya %0 eşik uygula
3. Doc task evaluation: testsPassed + dosya oluşturulmuş → DONE
4. Mevcut kaynak kod görevleri için mevcut kurallar korunur

### Test
- docs/ scope'lu task coverage check atlanıyor
- Normal task'larda coverage check devam ediyor
- Doc task testsPassed=true → DONE
- Mixed scope (docs/ + src/) → normal evaluation
- 6+ test

---

## Görev 8: Eksik Dokümanlar — BRAIN-GUIDE.md + DASHBOARD-GUIDE.md
- Dosya: docs/BRAIN-GUIDE.md (yeni), docs/DASHBOARD-GUIDE.md (yeni)
- Kapsam: docs/

### Açıklama
Sprint 18'de planlanmayan 2 dokümanı tamamla:

1. **docs/BRAIN-GUIDE.md**: Brain iç işleyişi — planlama modları (AI vs structured), task atama, model seçimi, GO/NO-GO değerlendirme, debt escalation, memory yönetimi, decay. Blueprint ve brain.md referansları.

2. **docs/DASHBOARD-GUIDE.md**: Terminal TUI dashboard (deckent status --watch), Web dashboard (React), HTTP API (16 endpoint listesi), SSE real-time stream. Kurulum ve kullanım adımları. Blueprint referansları.

### Test
- Manuel doğrulama — içerik doğru, Blueprint referansları var

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut 1027 test 0 regresyon
- Her fix için test yazılmalı — hedef: 1080+ test (1027 + ~53 yeni)
- Coverage düşmemeli (%97.5+)
- MCP: 10 tool, 5 resource (değişiklik yok)
- CLI: 26 komut (değişiklik yok)
- HTTP API: 16 endpoint (değişiklik yok)
- Task queue fix sonrası 8+ görev dalga dalga spawn edilebilmeli
