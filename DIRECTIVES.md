# DIRECTIVES — Sprint 087: Stabilizasyon + Otonom Adaptasyon

## Goal: Tech debt temizligi (kalan catch bloklari, eksik entegrasyonlar) + Adaptive thresholds + Mid-sprint reroute guclendirme. Perfect beta icin saglam temel + sistem kendini ayarlamaya baslasin.

---

## Task 1: Kalan Sessiz Catch Bloklari — Son Dalga
- Model: sonnet
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts, src/orchestra/result-collector.ts
- Scope: src/orchestra/

### Description
Sprint 085-086'da 29/49 catch blogu debugLog'a donusturuldu. Kalan ~20 tanesini de tamamla.

A) sprint-controller.ts'deki kalan sessiz catch bloklarini bul:
- `grep -n "catch" src/orchestra/sprint-controller.ts` ile hepsini listele
- Henuz `debugLog` cagirilmayan catch bloklarini tespit et
- Her birini `catch (e) { debugLog('sprint-controller', 'fonksiyonAdi', e); }` formatina donustur

B) sprint-phases.ts'deki sessiz catch bloklarini da tara ve duzelt (varsa)

C) result-collector.ts'deki sessiz catch bloklarini da tara ve duzelt (varsa)

D) Hedef: `grep -c "catch {" src/orchestra/sprint-controller.ts` → 0 (hicbir bos catch kalmamali)

**Kanit:** `grep -c "debugLog" src/orchestra/sprint-controller.ts` → 40+ (onceki 29 + yeni ~15)

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 2: Tech Debt Kapatma — Eksik Entegrasyonlar
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/task-router.ts, src/orchestra/sprint-controller.ts, src/orchestra/planner.ts
- Scope: src/orchestra/

### Description
Sprint 085-086'dan kalan 3 tech debt'i kapat:

A) task-router.ts: routeTaskV2() cagrisina sprintId/taskId/projectRoot parametreleri gecir:
- `routeTask()` fonksiyonundaki routeTaskV2() cagrisini bul
- `options` parametresine `sprintId`, `taskId`, `projectRoot` ekle
- Boylece task-router uzerinden yapilan routing kararlari da decision trail'e yazilacak

B) planner.ts: planSprint() icinden getWorstCombinations() cagir ve callBrainPlanner()'a gecir:
- planSprint() veya callBrainPlanner() cagrilmadan once OutcomeTracker'dan `getWorstCombinations(5)` al
- `callBrainPlanner()` cagrisina `worstCombinations` parametresi olarak gecir
- Boylece AI planner gercekten gecmis basarisizliklari gorecek

C) Her iki degisikligin de mevcut testleri bozmadigini dogrula.

**Kanit:** `grep "worstCombinations\|getWorstCombinations" src/orchestra/planner.ts` → 3+, `grep "sprintId\|projectRoot" src/orchestra/task-router.ts` → 2+

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 3: Adaptive Thresholds — NO_GO Rate Bazli Otomatik Ayar
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/core/config-types.ts, src/core/config.ts
- Scope: src/orchestra/, src/core/

### Description
Sprint NO_GO orani yuksekse, routing parametrelerini otomatik ayarla.

A) config-types.ts'e yeni field'lar ekle:
- `DeckentConfig.adaptive_thresholds?: boolean` (varsayilan false)
- `DeckentConfig.agent_min_score?: number` (varsayilan 5)
- `ResolvedConfig.adaptive_thresholds: boolean` (varsayilan false)
- `ResolvedConfig.agent_min_score: number` (varsayilan 5)

B) config.ts'de defaults'a ekle:
- `adaptive_thresholds: false`
- `agent_min_score: 5`

C) sprint-controller.ts'de finalizeSprint() icinde adaptive logic ekle:
- `if (config.adaptive_thresholds)` kontrolu
- Son 3 sprintin NO_GO rate'ini hesapla (sprint log dosyalarindan)
- NO_GO rate > %30 → agent_min_score'u 1 dusur (min 2)
- NO_GO rate < %10 → agent_min_score'u 1 artir (max 8)
- Guncellenmis degeri config.json'a yaz
- RETRO.md'ye: `- Adaptive: agent_min_score X → Y (NO_GO rate: %Z)`

D) routing-engine.ts'de agentMinScore'u config'den oku (hardcoded 5 yerine)

**Kanit:** `grep "adaptive_thresholds\|agent_min_score" src/core/config-types.ts` → 4+

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 4: Mid-Sprint Reroute Guclendirme — Max 1 → 3
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/mid-sprint-adapter.ts, src/core/config-types.ts, src/core/config.ts
- Scope: src/orchestra/, src/core/

### Description
Mid-sprint reroute deneme sayisini 1'den 3'e cikar ve configurable yap.

A) config-types.ts'e yeni field ekle:
- `DeckentConfig.max_reroutes?: number` (varsayilan 3)
- `ResolvedConfig.max_reroutes: number` (varsayilan 3)

B) config.ts'de defaults'a ekle:
- `max_reroutes: 3`

C) mid-sprint-adapter.ts'de hardcoded max reroute limitini config'den oku:
- Mevcut `MAX_REROUTES = 1` (veya benzer sabit) → `config.max_reroutes ?? 3`
- Constructor'a config parametresi ekle veya mevcut yapiyi kullan
- Her reroute denemesinde farkli agent/skill exclude et (mevcut mantik zaten bunu yapiyor)
- 3. denemede tum alternatifler tukenirse generic fallback

D) GO_WITH_TECH_DEBT sonucunda da reroute secenek olarak ekle:
- Mevcut: sadece NO_GO → reroute
- Yeni: GO_WITH_TECH_DEBT && reroute_on_tech_debt config flag'i true ise → reroute dene
- `DeckentConfig.reroute_on_tech_debt?: boolean` (varsayilan false)

**Kanit:** `grep "max_reroutes\|MAX_REROUTE" src/orchestra/mid-sprint-adapter.ts` → config'den okunuyor

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- Hicbir bos catch blogu kalmamali (grep "catch {" → 0 veya minimal)
- Decision trail task-router uzerinden de aktif
- AI planner gecmis bilgisini prompt'ta goruyor
- adaptive_thresholds config'de gorunuyor
- max_reroutes config'de gorunuyor
- %100 GO hedefli
