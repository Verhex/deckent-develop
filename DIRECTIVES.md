# DIRECTIVES — Sprint 14 (Auditor Canlı Entegrasyon + .deckent Yapı Tamamlama)

## Hedef: Auditor sprint sırasında gerçek scan cycle çalıştırır. .deckent/ yapısı Blueprint'e tam uyumlu olur.

---

## Görev 1: Auditor Gerçek Scan Loop Entegrasyonu
- Dosya: src/orchestra/brain.ts, src/monitor/auditor.ts, src/orchestra/tmux.ts
- Kapsam: src/orchestra/, src/monitor/

### Problem
startAuditor() tmux'ta `claude -p 'auditor'` çalıştırıyor — bu anlamsız. Auditor'ın gerçek scan cycle'ı (`runScanCycle` + `startScanLoop`) Brain process'i içinden çalışmalı, ayrı tmux penceresinde değil.

### Çözüm: Brain İçinde Auditor Loop
- `runSprint` fonksiyonunda Phase 2 (SPAWN) ile Phase 3 (EXECUTE) arasında auditor scan loop başlat:
  ```
  Phase 2: SPAWN
    spawnWorkers(...)
  
  Phase 2.5: AUDITOR START
    const scanInterval = startScanLoop(projectRoot, sprint.id)
  
  Phase 3: EXECUTE
    results = await waitForResults(...)
  
  Phase 3.5: AUDITOR STOP
    clearInterval(scanInterval)
  ```
- `startScanLoop` her 30 saniyede `runScanCycle` çağırır → heartbeat'leri okur → stale detection → boundary violations → dashboard günceller
- Sprint bittiğinde `clearInterval` ile durdur

### runScanCycle → Dashboard Entegrasyonu
- Her scan cycle'da mevcut dashboard state'i oku, alerts'i merge et, üzerine yaz
- Scan sonuçlarını dashboard'a yansıt:
  ```typescript
  const scanResult = runScanCycle(projectRoot, sprintId);
  // Mevcut dashboard'u oku
  const currentDash = readDashboardJson(projectRoot);
  // Alerts'i merge et (yeni scan alerts + mevcut alerts)
  const mergedAlerts = [...(currentDash?.alerts ?? []), ...scanResult.alerts];
  // Dashboard güncelle
  updateDashboard(projectRoot, { ...currentDash, alerts: mergedAlerts, updatedAt: now() });
  ```

### startAuditor tmux kaldır
- `spawnWorkers` içindeki `startAuditor()` çağrısını kaldır
- tmux'ta ayrı auditor penceresi artık gerekmiyor — Brain kendi process'inde çalıştırıyor
- `startAuditor` fonksiyonu tmux.ts'de kalsın (gelecekte bağımsız auditor modu için) ama spawnWorkers'dan çağrılmasın

### Auditor Dashboard Write Fonksiyonu
- Yeni fonksiyon: `writeScanToDashboard(projectRoot: string, sprint: Sprint, scanResult: ScanResult): void`
- Mevcut agent bilgilerini koru, sadece alerts ve violations güncelle
- Agent status'ları heartbeat'lerden oku ve dashboard'a yansıt

### Test
- runSprint sırasında scanLoop başlıyor ve duruyor (interval mock)
- Scan cycle stale heartbeat algılıyor → alert oluşuyor → dashboard'a yazılıyor
- Scan cycle boundary violation algılıyor → pattern kaydediliyor
- startAuditor artık spawnWorkers'dan çağrılmıyor
- Sprint sonrası interval temizleniyor (clearInterval)
- 8+ yeni test

---

## Görev 2: Worker Heartbeat Yazma — Prompt Talimatı
- Dosya: src/orchestra/brain.ts (buildWorkerPrompt)
- Kapsam: src/orchestra/brain.ts

### Problem
Worker prompt'unda heartbeat yazma talimatı yok. Worker'lar .result dosyası yazıyor ama .hb dosyası yazmıyor. Auditor scan heartbeat okumaya çalışıyor ama dosya yok → boş sonuç.

### Çözüm
buildWorkerPrompt'a heartbeat talimatı ekle:
```
8. Create a heartbeat file at .tasks/task-{task.id}.hb BEFORE starting work (JSON format):
{
  "workerId": "w-{task.id}",
  "taskId": "{task.id}",
  "status": "EXECUTING",
  "currentAction": "Starting task",
  "timestamp": "{ISO timestamp}",
  "filesChangedCount": 0,
  "sequence": 0
}
Update this file periodically as you work:
- Change status to CODING, TESTING, DOCUMENTING as appropriate
- Update currentAction with what you're doing
- Increment sequence on each update
- Update filesChangedCount as you modify files
```

### Test
- buildWorkerPrompt çıktısında ".hb" ve "heartbeat" geçiyor
- Heartbeat JSON format talimatı prompt'ta var
- 3+ yeni test

---

## Görev 3: .deckent/ Yapı Tamamlama
- Dosya: src/cli/commands/init.ts, src/mcp/tools/init.ts, .deckent/workspace/
- Kapsam: src/cli/, src/mcp/, .deckent/

### Problem
`deckent init` çalıştığında .deckent/ altında sadece config.json ve workspace/IDENTITY.md oluşuyor. Blueprint'teki tam yapı eksik.

### Init'te Oluşturulacak Dosyalar

#### .deckent/workspace/TOOLS.md
```markdown
# Environment Tools
Build: {package.json scripts.build veya "tsc"}
Test: {package.json scripts.test veya "npx vitest run"}
Lint: {package.json scripts.lint veya "tsc --noEmit"}
Dev: {package.json scripts.dev veya "tsc --watch"}
```
Init sırasında package.json varsa scripts'ten oku, yoksa default'ları yaz.

#### .deckent/workspace/BOOT.md
```markdown
# Agent Boot Sequence
1. Read AGENTS.md (follows @imports)
2. Read assigned task from .tasks/
3. Check .locks/ before file operations
4. Write heartbeat to .tasks/task-{id}.hb
5. Execute task within assigned scope
6. Run tests
7. Write result to .tasks/task-{id}.result
```

#### .deckent/plugins/ dizini
Boş dizin oluştur — gelecek plugin sistemi için.

#### .deckent/i18n/en.json + tr.json
Temel mesaj şablonları:
```json
{
  "cli.welcome": "Welcome to Deckent!",
  "sprint.starting": "Sprint {n} starting...",
  "sprint.complete": "Sprint {n} complete!",
  "brain.planning": "Brain is planning...",
  "worker.spawned": "Worker {id} spawned (model: {model})"
}
```

### src/cli/commands/init.ts güncelle
- TOOLS.md: package.json oku → scripts'ten build/test/lint çıkar → yaz
- BOOT.md: sabit şablon yaz
- plugins/ dizini oluştur
- i18n/ dizini + en.json + tr.json yaz
- Mevcut dosyalar varsa üzerine yazma (writeIfNotExists pattern koru)

### src/mcp/tools/init.ts güncelle
- Aynı dosyaları oluştur (CLI ile tutarlı)

### Deckent'in kendi .deckent/ yapısını güncelle
- .deckent/workspace/TOOLS.md oluştur (deckent'in kendi araçları)
- .deckent/workspace/BOOT.md oluştur
- .deckent/plugins/ dizini oluştur
- .deckent/i18n/ dizini + en.json + tr.json oluştur

### Test
- init sonrası tüm dosyaların varlığını doğrula
- TOOLS.md package.json'dan scripts okuyor
- i18n dosyaları valid JSON
- Mevcut dosya varsa üzerine yazmıyor
- 6+ yeni test

---

## Görev 4: Dashboard SSE + Auditor Canlı Gösterge
- Dosya: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/components/Layout.tsx
- Kapsam: src/dashboard/

### Problem
Auditor artık dashboard'a canlı yazıyor ama frontend bunu tam göstermiyor.

### Çözüm
- DashboardPage: Alert listesini scan cycle'dan gelen canlı alertlerle güncelle (zaten SSE var)
- Agent status kartlarına "Last heartbeat: Xs ago" göstergesi ekle
- Auditor scan durumunu layout sidebar'a ekle: "Auditor: Active (last scan: 3s ago)" veya "Auditor: Inactive"
- Yeni: Violations badge — boundary violation sayısı
- Layout sidebar'da SSE fallback: SSE yoksa "Auditor: Unknown" göster

### Test
- Dashboard component render testleri (mevcut test pattern'i ile)
- Alert rendering doğru badge renkleri
- 4+ yeni test

---

## Kalite Kuralları
- tsc --noEmit MUST pass
- npx vitest run MUST pass — hedef: 940+ test (917 + ~23 yeni)
- Coverage düşmemeli
- Circular dependency yok
- Brain→auditor tek yönlü import korunsun
- Auditor scan loop resilient: hata olsa bile loop devam etmeli (mevcut try/catch korunsun)
- .deckent/ yapısı Blueprint Bölüm 4 ile uyumlu olmalı
