# Analysis: src/orchestra/outcome-tracker.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 501 | **Effort:** max

## 1. Amaci (detayli)
Routing sonuclarini (agent/skill → GO/NO_GO) izler ve cross-sprint ogrenme bonuslari uretir. Sprint icinde hangi agent+skill kombinasyonlarinin basarili/basarisiz oldugunu kaydeder, synergy matrix olusturur (hangi ciftler iyi/kotu calisir), ve sonraki sprint planlama icin "en kotu kombinasyonlar" listesi sunar. Veri .deckent/routing/ altinda JSON dosyalarinda saklanir. Brain tarafindan sprint evaluate sonrasi, planner tarafindan sonraki plan icin kullanilir.

## 2. Public API
- `OutcomeTracker` class — constructor(projectRoot, config?). JSDoc SINIRLI (method-level var).
- `recordOutcome(outcome: RoutingOutcome): void` — sonuc kaydet. JSDoc VAR.
- `calculateBonuses(taskDNA: TaskDNA): LearningBonus[]` — routing bonuslari hesapla. JSDoc VAR.
- `calculateSprintRecencyBonuses(): Map<string, number>` — son 3 sprint recency bonusu. JSDoc VAR, detayli.
- `getSynergyMatrix(): SynergyEntry[]` — synergy matrisi kopyala. JSDoc VAR.
- `getLearnings(): Readonly<LearningsData>` — tum ogrenme verisi. JSDoc VAR.
- `getWorstCombinations(limit?: number): string` — en kotu kombinasyonlar string. JSDoc VAR, detayli.
- `saveEvolvedRules(rules: unknown[]): void` — evolved rules kaydet. JSDoc VAR.
- Tipler: RoutingOutcome, EntityPerformance, SynergyEntry, SkillSprintRecord, LearningsData — EXPORTED

## 3. Ic Bagimliliklar
- `../core/routing-types.js` — TaskDNA, LearningBonus, IntentType, LEARNING_BONUS_CAP
- `../core/utils.js` — debugLog
- `../core/decision-config.js` — LearningConfig
- `fs`, `path` — Node built-in
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- `fs` ve `path` — Node built-in
- node_modules: YOK
- ADR-010 uyumu: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 14 (8 public + 6 private)
- En karmasik: `recordOutcome()` (sat 92-145, ~50 satir, agent+skill+synergy guncelleme)
- `updateEntityPerformance()` (sat 350-390) — incremental average hesaplama
- Max cyclomatic: ~6

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 3 — sat 369 (perf), 386-389 (intentPerf), 401-405 (history, record). Tumu guvenli: hemen onceki satirda yoksa olustur pattern'i.
- Unsafe cast: 2 — sat 438 `as Partial<LearningsData>`, sat 493 `JSON.parse(...)` sonrasi implicit any.
  - Sat 493: `outcomes = JSON.parse(readFileSync(...))` — RoutingOutcome[] tipi garanti degil. Guvenlik riski DUSUK ama schema validation yok.

## 7. ADR Compliance
- ADR-006 spawnSync: UYUMLU (spawnSync kullanmiyor)
- ADR-008 brain import: UYUMLU (core/ imports only)
- ADR-010 deps: UYUMLU
- ADR-033 product vision: UYUMLU (lokal dosya storage)
- Memory V2 DB-first: KISMI UYUM — OutcomeTracker kendi JSON dosya sistemi kullanir (.deckent/routing/), Memory V2 DB'ye yazmiyor. Bu intentional: routing learnings ayri domain.

## 8. Test Coverage
- tests/orchestra/outcome-tracker.test.ts — MEVCUT
- tests/orchestra/evolution-pipeline.test.ts — tracker entegrasyonu
- Mock kalitesi: IYI
- Edge case: bos learnings, minimum sample threshold, recency bonuslari

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- `evolvedRules?: unknown[]` field (sat 57) — saveEvolvedRules ile kullaniliyor ama `unknown[]` tip unsafe
- Tum fonksiyonlar aktif kullanilir: index.ts'den export, sprint-controller, task-router icinden referans

## 11. Security
- **DUSUK RISK:** JSON.parse sonrasi schema validation yok (sat 438, 493). Corrupt dosya → runtime hata. try/catch ile korunuyor.
- Input validation: outcome parametreleri tip-checked ama icerik validation yok
- Secret exposure: YOK
- SQL injection: N/A

## 12. Memory V2 Uyumu
- Bu modul Memory V2 DB kullanmiyor — INTENTIONAL. Routing learnings ayri domain (.deckent/routing/).
- Eski .md parse: YOK
- DOGRU mimari ayrim.

## 13. i18n
- `getWorstCombinations()` ciktisi Turkce: "basari" (sat 306) — TR string hardcoded
- Diger mesajlar Ingilizce — tutarsiz ama kabul edilebilir (planner prompt icin Turkce isteniyor)

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: TUTARLI
- Recency bonus dokumani (sat 186-194) ↔ kod: TUTARLI (threshold'lar eslesir)
- LearningsData version:1 — hic v2 migration yok, backward compat backfill ile saglaniyor (sat 443-450)

## 15. Performance
- Sync I/O: 7 (readFileSync x3, writeFileSync x2, existsSync x4, mkdirSync x2) — tumu non-hot path
- Hot path: HAYIR — sprint evaluate sonrasi tek sefer calisir
- `getWorstCombinations()` icinde dosya okuma dongusu (son 5 sprint) — kucuk veri seti, kabul edilebilir
- Gereksiz I/O: `saveLearnings()` her `recordOutcome()` sonrasi cagrilir → N task icin N dosya yazma. Batch save dusunulebilir.

## 16. Oneriler
- **P2:** `saveSprintOutcome` + `saveLearnings` batch yazma optimizasyonu (her outcome icin 2 dosya yazma yerine sprint sonunda bir kez)
- **P2:** JSON.parse sonrasi minimal schema validation (version, totalOutcomes field kontrolu)
- **P3:** `evolvedRules?: unknown[]` → typed array olarak degistirilmeli (EvolvedRule[] veya null)
- **P3:** getWorstCombinations Turkce "basari" → i18n locale-aware yapilabilir

## Verdict: ANALYZED
