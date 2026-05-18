# Analysis: src/cli/commands/finalize.ts
**Task ID:** 142-018 | **Model:** opus | **LoC:** 185 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Sprint'i sonlandırır (finalize) — MEMORY.md, RETRO.md, PROJECT-IDENTITY.md günceller, config'i günceller, memory/debt decay çalıştırır. Task dosyalarını okur, result dosyalarını değerlendirir, review state'i entegre eder (rejected → NO_GO), ve `finalizeSprint()` orkestrasyon fonksiyonunu çağırır. Sprint lifecycle'ın RETRO → DECAY → CLEANUP fazlarını tetikler. Sprint'in normal akışı dışında, manuel finalize ihtiyacı için tasarlanmış (stuck sprint kurtarma).

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `detectIncompleteTasks(tasks: Task[]): Task[]` — JSDoc VAR ✓
- `detectMixedSprints(tasks: Task[]): string[]` — JSDoc VAR ✓
- `registerFinalize(program: Command): void` — JSDoc YOK ✗
- Private fonksiyonlar:
  - `buildSprintFromTasks(root, sprintFilter?)` — JSDoc VAR ✓
  - `isSprintAlreadyFinalized(root, sprintId)` — JSDoc VAR ✓

## 3. İç Bağımlılıklar
- `../../core/types.js` → Task, TaskResult, TaskEvaluation, SprintStatus, SprintPhase
- `../../core/constants.js` → TASKS_DIR, BRAIN_DIR
- `../../core/config.js` → loadConfig
- `../../core/utils.js` → readJsonSafe
- `../../orchestra/brain.js` → finalizeSprint — **ADR-008 notu: CLI → brain.js import**
- `../../orchestra/sprint-controller.js` → evaluateResult — **orchestra import**
- `../helpers/output.js` → print, printError
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/messages.js` → getMessage
- `../helpers/config-reader.js` → getLangFromConfig
- `./review.js` → loadReviewState — **cross-command import**

## 4. Dış Bağımlılıklar
- `commander` — ADR-010 ✓
- `node:fs` — native ✓
- `node:path` — native ✓
- **ADR-010 uyumu: TAM** ✓

## 5. Complexity
- 5 fonksiyon
- En karmaşık: `buildSprintFromTasks` (satır 23-89) — task + result + review state merge — cyclomatic ~7
- `registerFinalize` action (satır 112-184) — mixed sprint detection + completion guard + duplicate guard + finalize — cyclomatic ~8
- **Orta karmaşıklık** — iyi yapılandırılmış guard clause'lar

## 6. Type Safety
- `as Task` — readJsonSafe generic ile — ✓
- `as TaskResult` — readJsonSafe generic ile — ✓
- **any: 0** ✓
- **@ts-ignore: 0** ✓
- **non-null !: 0** ✓
- **as unknown: 0** ✓
- **Mükemmel type safety** ✓

## 7. ADR Compliance
- **ADR-022 CLI/MCP parity:** MCP'de **finalize tool YOK** — **KRİTİK GAP**. En yakın MCP tool: `deckent_review`. Ama finalize CLI komutu review'dan farklı — retro yazma, decay, config güncelleme yapıyor. **ADR-022 ihlali**.
- **ADR-008:** brain.js ve sprint-controller.js static import — CLI bağlamında gerekli ama ADR-008 ruhuna aykırı
- **ADR-010:** Sadece commander ✓
- **Memory V2 DB-first:** `finalizeSprint` orkestrasyon fonksiyonu DB-first mi? — dolaylı, brain.js üzerinden

## 8. Test Coverage
- `tests/cli/commands/review-finalize-overhaul.test.ts` — MEVCUT ✓ (review + finalize combined)
- `tests/cli/commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts` — MEVCUT ✓
- **Dedicated finalize.test.ts YOK** — **GAP: test dosyası review ile birleşik**

## 9. TODO/FIXME/HACK inventory
- **YOK** ✓

## 10. Dead Code
- `detectMixedSprints` — review.ts'de de aynı isimle export ediliyor. **Duplicate fonksiyon** — DRY ihlali.
- `detectIncompleteTasks` — sadece registerFinalize içinde kullanılıyor ama export edilmiş — test için olabilir.

## 11. Security
- `finalizeSprint` — brain.js orkestrasyon fonksiyonu, disk yazımları yapıyor
- `--force` flag'i güvenlik kontrollerini bypass ediyor (completion guard, duplicate protection)
- **P3: --force kullanımı loglansın** — audit trail

## 12. Memory V2 Uyumu
- `finalizeSprint` aracılığıyla dolaylı DB erişimi — brain.js Memory V2 DB-first kullanıyor olmalı
- `loadReviewState` dosya tabanlı — review state DB'de değil
- **Kısmi uyum** — finalize işlemi DB-first ama review state değil

## 13. i18n
- **İYİ i18n implementasyonu** ✓ — `getMessage()` helper kullanımı
- `getLangFromConfig(root)` ile dil okuma
- Message key'leri: 'finalize.no_tasks', 'finalize.complete'
- Bazı hardcoded EN string'ler: "Warning: Mixed sprint IDs", "Cannot finalize:", "Sprint X has already been finalized" — **P3: getMessage'a taşı**

## 14. Dokümantasyon Tutarlılığı
- JSDoc: buildSprintFromTasks, isSprintAlreadyFinalized, detectIncompleteTasks, detectMixedSprints — MEVCUT ✓
- `(F)`, `(G)`, `(H)` comment tag'leri — feature tracking
- DECKENT.md'de finalize komutu dokümante **DEĞİL** — **GAP: DECKENT.md MCP tool tablosunda finalize yok**

## 15. Performance
- `readdirSync` × 2 (task files, result files) — O(N) disk I/O
- `readJsonSafe` per file — N dosya okuma
- **Hot path değil** — kabul edilebilir

## 16. Öneriler
1. **P1:** ADR-022 — MCP'ye `deckent_finalize` tool ekle — kritik parity gap
2. **P2:** `detectMixedSprints` duplicate — review.ts ve finalize.ts'de aynı fonksiyon. Shared utils'e taşı.
3. **P2:** DECKENT.md'de finalize komutu dokümante edilmeli
4. **P3:** Hardcoded EN string'leri getMessage'a taşı
5. **P3:** Dedicated finalize.test.ts oluştur

## Verdict: ANALYZED
