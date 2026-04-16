# Analysis: src/orchestra/rule-evolver.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 278 | **Effort:** max

## 1. Amaci (detayli)
Gecmis routing sonuclarindan yeni activation/exclusion kurallari uretir. OutcomeTracker'daki agent/skill performans verisini analiz ederek intent-bazli basari/basarisizlik kaliplarini tespit eder. Confidence >= 0.85 olan kurallar otomatik uygulanir, >= 0.65 olanlar onerilir. Synergy matrix'ten skill-skill cift kurallarini da uretir. Brain tarafindan sprint retro asamasinda calistirilir ve uretilen kurallar .deckent/routing/evolved-rules.json'a yazilir.

## 2. Public API
- `RuleEvolver` class — constructor(tracker, projectRoot?). JSDoc YOK (class-level).
- `evolveRules(): EvolutionResult` — kural uretimi. JSDoc VAR.
- `saveRules(rules: EvolvedRule[]): void` — kurallari dosyaya kaydet. JSDoc VAR.
- `loadRules(): EvolvedRule[]` — kaydedilmis kurallari oku. JSDoc VAR.
- Tipler: EvolvedRule, EvolutionResult — EXPORTED

## 3. Ic Bagimliliklar
- `../core/routing-types.js` — ActivationRule, ExclusionRule
- `./outcome-tracker.js` — OutcomeTracker, EntityPerformance
- `../core/utils.js` — debugLog
- `fs`, `path` — Node built-in
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- Node built-in: fs, path
- ADR-010: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 7 (3 public + 4 private)
- En karmasik: `evolveEntityRules()` (sat 81-147, 66 satir, dual threshold + confidence)
- `evolveSynergyRules()` (sat 155-218, 63 satir)
- Max cyclomatic: ~7

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `as` cast: 4 — sat 111 `as ActivationRule`, sat 134 `as ExclusionRule`, sat 179, sat 203. Tumu literal object creation icin, guvenli.
- Non-null `!`: 0
- Genel: IYI type safety.

## 7. ADR Compliance
- ADR-006 spawnSync: UYUMLU
- ADR-008 brain import: UYUMLU (core/ + aynı orchestra/ imports)
- ADR-010 deps: UYUMLU
- Memory V2: Dosya bazli storage (.deckent/routing/) — ayri domain, tutarli

## 8. Test Coverage
- tests/orchestra/rule-evolver.test.ts — MEVCUT
- tests/orchestra/evolution-pipeline.test.ts — entegrasyon
- Mock kalitesi: OutcomeTracker mock ile iyi izolasyon
- Edge case: minimum sample, confidence thresholds, synergy/conflict

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- orchestra/index.ts'den export: `RuleEvolver` — AKTIF
- Tum metotlar kullaniliyor

## 11. Security
- JSON.parse corrupt dosya icin try/catch (sat 243-244) — iyi
- loadRules() donen array tipi kontrolsuz — `JSON.parse(...)` sonrasi EvolvedRule[] garanti yok
- Dosya yazma: JSON.stringify ile — injection riski YOK

## 12. Memory V2 Uyumu
- .deckent/routing/ dosya bazli — ayri domain, Memory V2 DB'ye tasinmasi gerekmiyor
- Routing learnings ↔ Memory V2 brain knowledge ayri endiseler

## 13. i18n
- Reasoning mesajlari Ingilizce — tutarli
- Hardcoded TR string: YOK

## 14. Dokumantasyon Tutarliligi
- Modul basindaki yorum (sat 2-3) dogru: confidence thresholds belirtilmis
- Constants dokumantasyonu (sat 33-36) acik ve dogru
- JSDoc ↔ gercek davranis: TUTARLI

## 15. Performance
- Sync I/O: readFileSync, writeFileSync, existsSync, mkdirSync — tumu retro zamani, non-hot path
- evolveSynergyRules() synergy matrix iteration O(n) — kucuk veri seti
- Hot path: HAYIR

## 16. Oneriler
- **P2:** loadRules() sonrasi minimal schema validation (type, entityId, confidence field kontrolu)
- **P3:** isAgentId() method — learnings.agentPerformance key kontrolu yerine explicit agent registry bakmali (eger skill ve agent ID'ler cakisirsa false pozitif)
- **P3:** confidence hesaplama formulü `0.5 + tasks * 0.04` — 12 task = 0.98 confidence — agressif olabilir, log scale dusunulebilir

## Verdict: ANALYZED
