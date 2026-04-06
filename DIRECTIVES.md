# DIRECTIVES — Sprint 093: Agent/Skill Stats Gerçek Çalışma + Sprint Bildirim

## Goal: Agent/skill stats'ın gerçekten çalışmasını sağla — manifest dosyalarına sync, RETRO'da skill tablosu, avgQualityScore persist, Agent Done sayacı düzeltme. Sprint bitişinde otomatik output mekanizması ekle.

---

## Task 1: V2 Stats → Agent.json / Manifest.json Sync
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/core/agent-pool.ts, src/core/skill-pool.ts
- Scope: src/orchestra/, src/core/

### Description
V2 modunda stats sadece learnings.json'a yazılıyor, agent.json ve manifest.json HİÇ güncellenmiyor. Dashboard ve CLI bu dosyaları okuduğu için kullanıcı hep 0 görüyor.

A) `src/orchestra/sprint-controller.ts` V2 bloğunda (satır ~1365-1398), `tracker.recordOutcome()` döngüsünden SONRA:
- AgentPoolManager ve SkillPoolManager oluştur
- tracker'dan güncel learnings'i oku (agentPerformance, skillPerformance)
- Her agent için: `poolManager.updateAgentStats()` ile agent.json'daki stats'ı güncelle
  - totalUses = learnings.agentPerformance[agentId].totalTasks
  - successRate = learnings.agentPerformance[agentId].successRate
  - avgCoverage = hesapla (outcome'lardan)
  - lastUsedInSprint = sprint.id
- Her skill için: `skillPoolManager.updateSkillStats()` çağır veya doğrudan manifest.json'a yaz
  - totalUses = learnings.skillPerformance[skillId].totalTasks
  - successRate = learnings.skillPerformance[skillId].successRate
  - lastUsedInSprint = sprint.id

B) Alternatif: `syncStatsToManifests(projectRoot, tracker)` yeni bir fonksiyon yaz ve finalizeSprint'ten çağır. Bu fonksiyon learnings.json'daki tüm agent/skill performans verilerini ilgili manifest dosyalarına yazar.

C) MCP agent_list tool'u (src/mcp/tools/agent-list.ts) ve CLI'ın okuduğu stats artık güncel olacak.

**Kanıt:** Sprint sonrasında `cat .deckent/agents/refactorer/agent.json | grep totalUses` → 0'dan büyük değer
**Kanıt:** `cat .deckent/skills/typescript-expert/manifest.json | grep totalUses` → 0'dan büyük değer

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/sprint-controller.test.ts` → 0 fail.

---

## Task 2: RETRO.md Skill Performance Tablosu Düzeltme
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
RETRO.md'de Skill Performance tablosu görünmüyor. skillMap oluşturma kodu var (satır 1291-1298) ama tablo yazılmıyor.

A) Sorunu teşhis et:
- `writeRetrospective()` fonksiyonunda skillMap parametresi alınıyor mu kontrol et
- `buildSkillPerformance()` fonksiyonu çağrılıyor mu?
- skillMap boş mu geliyor? (task.assignedSkills dolu mu?)
- formatSkillPerformanceTable() çıktısı RETRO.md'ye yazılıyor mu?

B) Düzelt:
- buildSkillPerformance() fonksiyonundaki guard'ı kontrol et — `if (!skillMap || skillMap.size === 0) return []` satırı yüzünden erken dönüyor olabilir
- writeRetrospective'te skill performance bloğunun gerçekten markdown'a yazıldığından emin ol
- Sprint.tasks'teki assignedSkills field'ı dolu olmalı — planSprint'te atanıyor mu kontrol et

C) Düzeltme sonrasında RETRO.md'de şu tablo görünmeli:
```
## Skill Performance
| Skill | Tasks | Done | Debt | NoGo | Avg Coverage |
|-------|-------|------|------|------|-------------|
| typescript-expert | 5 | 3 | 2 | 0 | 90% |
```

**Kanıt:** Sprint çalıştırıldıktan sonra `grep "Skill Performance" .brain/RETRO.md` → eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/sprint-reporter*.test.ts` → 0 fail.

---

## Task 3: avgQualityScore Persist Düzeltme + Agent Done Sayacı
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/outcome-tracker.ts, src/orchestra/sprint-reporter.ts
- Scope: src/orchestra/

### Description
İki sorunu düzelt:

A) avgQualityScore learnings.json'a persist edilmiyor:
- outcome-tracker.ts'de updateEntityPerformance() fonksiyonunda avgQualityScore hesaplanıyor (satır 375)
- saveLearnings() JSON.stringify ile tüm objeyi yazıyor — ama veri dosyada yok
- Sorun: loadLearnings() backfill'inde avgQualityScore ekleniyor (satır 438-443) ama ilk recordOutcome'dan ÖNCE çağrılan loadLearnings'de mevcut entity'ler backfill edilmiyor olabilir
- Düzelt: loadLearnings() her entity yüklendiğinde avgQualityScore field'ı yoksa 0 olarak ekle
- recordOutcome sonrası saveLearnings çağrısının avgQualityScore'u kaybetmediğinden emin ol

B) RETRO.md Agent Performance tablosunda Done sütunu hep 0:
- sprint-reporter.ts buildAgentPerformance() fonksiyonunda "Done" sayacı nasıl hesaplanıyor?
- DONE ve GO_WITH_TECH_DEBT ayrımı doğru yapılıyor mu?
- evaluation === 'DONE' ise done++, evaluation === 'GO_WITH_TECH_DEBT' ise debt++ olmalı
- Kontrol et ve düzelt

**Kanıt:** Sprint sonrasında learnings.json'da avgQualityScore > 0 olan entity var
**Kanıt:** RETRO.md'de Agent Performance tablosunda Done > 0

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/outcome-tracker.test.ts tests/orchestra/sprint-reporter*.test.ts` → 0 fail.

---

## Task 4: Sprint Bitişinde Otomatik Output (Job Completion Notification)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/mcp/tools/start.ts, src/cli/commands/start.ts
- Scope: src/orchestra/, src/mcp/, src/cli/

### Description
Sprint bittiğinde kullanıcıya otomatik bildirim göndermeli. Şu an sprint arka planda çalışıyor, bitmesini anlamak için kullanıcı manuel status sorgulaması yapıyor.

A) `src/orchestra/sprint-controller.ts` finalizeSprint() sonunda:
- Job dosyasına (.deckent/jobs/{jobId}.json) sprint sonuç özeti yaz:
  - status: COMPLETE
  - summary: "Sprint sprint-NNN: N/M done, X tech debt, Y no-go, Zdk süre"
  - GO/NO_GO/TECH_DEBT sayıları
  - evaluation sonuçları
  - completedAt timestamp

B) `src/mcp/tools/start.ts`'de:
- Sprint job başlatıldıktan sonra, job dosyasını periyodik olarak poll et (veya completion callback)
- Sprint tamamlandığında MCP response'a completion summary ekle
- Alternatif: MCP tool zaten "background job" olarak çalışıyor — job completion'da notifications/resource update tetikle

C) `src/cli/commands/start.ts`'de:
- Sprint tamamlandığında terminal'e otomatik output yaz
- Eğer --watch modundaysa zaten gösteriyor — değilse tamamlanma mesajı göster

D) Minimum bildirim formatı:
```
✅ Sprint sprint-092 tamamlandı (9dk 37sn)
   5/5 task: 5 GO_WITH_TECH_DEBT, 0 NO_GO
   Agent: refactorer(4), test-writer(1)
```

**Kanıt:** Sprint bittiğinde .deckent/jobs/ dosyasında summary field'ı dolu

**Test:** `tsc --noEmit` temiz.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Agent.json stats > 0 (gerçek veri, learnings.json ile tutarlı)
- Skill manifest.json stats > 0 (gerçek veri)
- RETRO.md'de Skill Performance tablosu görünür
- RETRO.md'de Agent Done sayacı doğru
- avgQualityScore learnings.json'da persist edilir
- Sprint bitişinde otomatik output/bildirim var
- %100 GO hedefli — test geçmesi yetmez, gerçek sonuç lazım
