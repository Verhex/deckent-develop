# Analysis: src/orchestra/brain-context.ts
**Task ID:** 141-002 | **LoC:** 267

## 1. Amaci (1-2 cumle)
BrainContext objesini proje stack'i, agent istatistikleri, skill istatistikleri ve sprint gecmisiyle zenginlestirir. AI planlayiciya daha iyi karar alma icin baglam saglar.

## 2. Public API (export listesi)
- `enrichContextWithStack(context, projectRoot): BrainContext`
- `formatStackContext(stack): string`
- `enrichContextWithAgentStats(context, agents): BrainContext`
- `formatAgentStats(agents): string`
- `enrichContextWithSkillStats(context, skills): BrainContext`
- `formatSkillStats(skills): string`
- `SprintHistoryData` interface
- `enrichContextWithHistory(context, projectRoot, sprintRange?): BrainContext`
- `formatHistoryContext(history): string`

## 3. Ic + Dis Bagimliliklar
- **Icsel:** `node:fs`, `node:path`
- **Dissal:**
  - `../core/types.js` (BrainContext)
  - `../core/skill-types.js` (ProjectStack, SkillDefinition)
  - `../core/agent-types.js` (AgentDefinition)
  - `../core/constants.js` (BRAIN_DIR, SPRINTS_DIR)
  - `../core/utils.js` (debugLog)
- Sprint gecmisi icin `.brain/sprints/*.md` dosyalarini okur — DIKKAT: bu eski V1 dosya okuma

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- 9 export edilen fonksiyon + 3 private helper
- `_loadSprintHistory()`: en karmasik — file listing + parsing + multi-field extraction
- Toplam cyclomatic rough: ~15

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any` kullanimi: yok
- `@ts-ignore`: yok
- Non-null assertion: yok
- `JSON.parse(raw) as ProjectStack` — tip assertion kullaniliyor
- Genel olarak iyi tip guvenligi

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- ADR-006: spawnSync yok — compliant
- ADR-008: sadece core/ import — compliant
- ADR-010: runtime dep yok — compliant
- ADR-040 IHLAL: `_loadSprintHistory()` `.brain/sprints/*.md` dosyalarini okur ve markdown parse eder — bu Memory V2 DB-first ilkesine aykiri. Sprint log'lar artik DB'de olmali.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/brain-context.test.ts` beklenir
- `formatStackContext`, `formatAgentStats`, `formatSkillStats` saf fonksiyonlar — kolay test edilir
- `_loadSprintHistory` file I/O gerektiriyor — mock gerektirir

## 8. TODO/FIXME/HACK inventory
- Yok (kod incelemesi)

## 9. Dead Code Candidates
- `formatStackContext()`: sadece `enrichContextWithStack()` tarafindan cagrilir — test icin public export mantikli
- `formatHistoryContext()`: test edilebilirlik icin export edilmis, kullanilir

## 10. Security Findings
- Sprint log dosyalarini parse ediyor — malformed markdown durumunda graceful failure var (try/catch)
- Input validation yok; ancak kullanici girdisi yoktur (dosyalar araclarin kendi yazdigidir)

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- **SORUN:** `_loadSprintHistory()` `.brain/sprints/*.md` dosyalarini okur, regex ile parse eder
- ADR-040 DB-first gerekliligi: sprint log'lar MemoryStore'da `type: 'memory'` veya `type: 'retro'` olarak saklanmali
- Bu fonksiyon Memory V2 migration sonrasinda `store.search({ type: ['memory', 'retro'], sprint_range: ... })` ile guncellenmeli
- Eksik: MemoryStore import ve DB'den okuma mantigi

## 12. Oneriler (Sprint 142+ input)
- `_loadSprintHistory()` → `store.getByType('memory')` ile guncellenmeli (ADR-040)
- `.brain/sprints/*.md` referansi kaldirilmali
- enrichContextWithHistory parametresine MemoryStore inject edilmeli

## 13. Verdict: PARTIAL (Memory V2 ADR-040 ihlali mevcut — .md dosya okumasi)
