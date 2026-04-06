# DIRECTIVES — Sprint 091: Agent/Skill Stats & Otonom Evrim Pipeline

## Goal: Agent ve skill performans izleme mekanizmasının 8 kopuk noktasını kapat. Tiebreaker düzelt, promotion/demotion execute et, evolved rules inject et, skill stats güncelle, RETRO'da skill tablosu göster, hard-coded sabitleri config'den oku, quality score routing'e entegre et, integration test yaz.

---

## Task 1: Agent Tiebreaker — learnings.json'dan Oku
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/routing-engine.ts
- Scope: src/core/

### Description
V2 modunda agent tiebreaker agent.json'daki stats.successRate'i okuyor ama bu değer V2'de hep 0 çünkü stats learnings.json'a yazılıyor.

A) `src/core/routing-engine.ts` satır 193-198'deki sort callback'inde:
- `pool.get(a.id)?.stats.successRate` yerine `getLearningBonus(a.id, learningData)` kullan
- `getLearningBonus()` fonksiyonu zaten bu dosyada tanımlı (satır ~463)
- learningData parametresi zaten selectBestAgent fonksiyonuna geçiyor

B) Aynı pattern'i skill tiebreaker'da da kontrol et — varsa düzelt

**Kanıt:** `grep "getLearningBonus" src/core/routing-engine.ts` → tiebreaker bloğunda kullanılıyor

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/core/routing-engine.test.ts` → 0 fail.

---

## Task 2: Promotion/Demotion Execute Et
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
finalizeSprint() satır ~1333-1345'te promotion/demotion evaluate ediliyor ama pipeline.promote() ve pipeline.demote() asla çağrılmıyor. Sadece debugLog.

A) Promote döngüsünde (action === 'promote') debugLog'dan sonra:
- `pipeline.promote(p.entityId, p.entityType)` çağır
- try/catch ile sarmala, hata durumunda debugLog

B) Demote döngüsünde (action === 'demote') debugLog'dan sonra:
- `pipeline.demote(d.entityId, d.entityType)` çağır
- try/catch ile sarmala

C) Her iki fonksiyon da promotion-pipeline.ts'de hazır ve çalışıyor

**Kanıt:** `grep "pipeline.promote\|pipeline.demote" src/orchestra/sprint-controller.ts` → 2+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/sprint-controller.test.ts` → 0 fail.

---

## Task 3: Evolved Rules Activation'a Inject Et
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
Evolved rules learnings.json'a yazılıyor ama sonraki sprintlerde agent/skill activation config'lerine enjekte edilmiyor.

A) planSprint() fonksiyonunda V2 routing bloğunda (satır ~607 civarı), routeTaskV2 çağrılmadan ÖNCE:
- OutcomeTracker'dan learnings'i oku
- evolvedRules array'inden status === 'auto-applied' olanları filtrele
- Her kural için:
  - entityType === 'agent' → pool'daki ilgili agent'ın activation.rules veya activation.exclude dizisine ekle
  - entityType === 'skill' → skills map'teki ilgili skill'e ekle
- Sadece IN-MEMORY değişiklik — diske yazmaz (her sprint başında temiz başlar)
- Duplicate kontrolü: rule.name ile aynı isimli kural zaten varsa ekleme

B) debugLog ile kaç kural inject edildiğini logla

**Kanıt:** `grep "evolvedRules\|evolved.rules\|auto-applied" src/orchestra/sprint-controller.ts` → 2+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/sprint-controller.test.ts` → 0 fail.

---

## Task 4: updateSkillStats V1 + SkillMap RETRO İçin
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts
- Scope: src/orchestra/

### Description
İki kopuk noktayı düzelt:

A) V1 akışında (satır ~1271-1284) updateAgentStats() çağrılıyor ama updateSkillStats() asla çağrılmıyor:
- V1 döngüsünde her task'ın assignedSkills'i için SkillPoolManager.updateSkillStats() çağır
- SkillPoolManager import'u zaten mevcut (V2 bloğunda kullanılıyor)

B) writeRetrospective() çağrısında (satır ~1229) skillMap=undefined geçiliyor:
- sprint.tasks'ten skillMap oluştur: Map<taskId, string[]> — her task'ın assignedSkills'ini ekle
- writeRetrospective'e skillMap parametresi olarak geç
- Bu sayede RETRO.md'de Skill Performance tablosu görünecek

**Kanıt:** `grep "updateSkillStats\|skillMap" src/orchestra/sprint-controller.ts` → 2+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/sprint-controller.test.ts` → 0 fail.

---

## Task 5: Hard-Coded Sabitleri Config'den Oku
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/decision-config.ts, src/orchestra/outcome-tracker.ts
- Scope: src/core/, src/orchestra/

### Description
OutcomeTracker'daki sabitler hard-coded. LearningConfig interface'i var ama OutcomeTracker tarafından okunmuyor.

A) `src/core/decision-config.ts`'de LearningConfig interface'ine ekle:
- `minSamplesForBonus?: number` (default 3)
- `recentSprintWindow?: number` (default 3)
- `sprintRecencySuccessBonus?: number` (default 3)
- `sprintRecencyFailurePenalty?: number` (default -2)
- createDefaultLearningConfig() fonksiyonuna da default'ları ekle

B) `src/orchestra/outcome-tracker.ts`'de:
- Module-level const'ları (MIN_SAMPLES_FOR_BONUS, RECENT_SPRINT_WINDOW, vb.) instance değişkenlere çevir
- Constructor'a opsiyonel `config?: Partial<LearningConfig>` parametresi ekle
- `this.MIN_SAMPLES_FOR_BONUS = config?.minSamplesForBonus ?? 3` şeklinde ata
- Dosyadaki tüm bare referansları `this.` prefix ile güncelle

**Kanıt:** `grep "minSamplesForBonus\|recentSprintWindow" src/core/decision-config.ts src/orchestra/outcome-tracker.ts` → 4+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/outcome-tracker.test.ts` → 0 fail.

---

## Task 6: Quality Score Routing Bonus'a Entegre Et
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/outcome-tracker.ts
- Scope: src/orchestra/

### Description
recordOutcome() qualityScore'u kaydediyor ama calculateBonuses() bu veriyi hiç kullanmıyor.

A) EntityPerformance interface'ine ekle:
- `avgQualityScore: number` (0-100)

B) updateEntityPerformance() metoduna qualityScore parametresi ekle:
- Incremental ortalama ile avgQualityScore hesapla

C) recordOutcome() içinde updateEntityPerformance çağrılarına outcome.qualityScore geç

D) computeBonus() fonksiyonunda quality-based bonus mantığı:
- avgQualityScore >= 80 ve minSamples geçildiyse → +1 bonus
- avgQualityScore < 40 ve minSamples geçildiyse → -1 penalty

E) loadLearnings() backfill'inde avgQualityScore: 0 default ekle

**Kanıt:** `grep "avgQualityScore" src/orchestra/outcome-tracker.ts` → 3+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/outcome-tracker.test.ts` → 0 fail.

---

## Task 7: Integration Test — Tam Evolution Pipeline
- Model: opus
- Effort: high
- Agent: test-writer
- Skills: typescript-expert, testing-expert
- Files: tests/orchestra/evolution-pipeline.test.ts
- Scope: tests/

### Description
Tüm pipeline'ı uçtan uca test eden integration test dosyası yaz.

A) Test senaryoları:
1. recordOutcome → calculateBonuses → pozitif bonus dönmeli (5+ başarılı outcome)
2. evolveRules → auto-applied status'lu kural üretmeli (yeterli veri ile)
3. evaluatePromotions → promote action dönmeli (8+ task, %85+ success)
4. buildSkillPerformance → skillMap ile çalışmalı, boş olmayan satırlar dönmeli
5. quality score → yüksek qualityScore ile ek bonus dönmeli
6. configurable constants → custom LearningConfig ile farklı window değerleri çalışmalı

B) fs mock kullan — .deckent/routing/ dizinini mock'la
C) Her test bağımsız çalışmalı (beforeEach ile temizle)

**Kanıt:** `ls tests/orchestra/evolution-pipeline.test.ts` → dosya var

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/evolution-pipeline.test.ts` → 0 fail.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail (pre-existing hariç)
- Tüm 8 kopuk nokta kapatılmalı
- Config-driven: hard-coded sabit kalmamalı
- learnings.json tek kaynak (V2 modunda)
- In-memory injection — manifest dosyaları kirletilmemeli
- %100 GO hedefli — yarım iş yok
