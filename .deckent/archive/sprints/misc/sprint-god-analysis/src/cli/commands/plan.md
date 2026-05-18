# Analysis: src/cli/commands/plan.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 113 | **Effort:** max

## 1. Amaci
`deckent plan` CLI komutunu register eder. Sprint planlama: DIRECTIVES.md'yi okur, task JSON dosyalarini olusturur. 3 mod: AI (provider gerekli), structured (deterministik, provider gereksiz), dry-run (disk yazimi yok). Draft task mekanizmasi: plan onay bekler, onaylaninca PENDING'e gecer. Sprint yasam dongusunun 2. adimi.

## 2. Public API
- `registerPlan(program: Command): void` — JSDoc YOK. Tek export.

## 3. Ic Bagimliliklar
- `../../core/config.js` → loadConfig
- `../../core/provider.js` → bootstrapProviders
- `../../core/types.js` → SprintSizeRecommendation, BrainPlanningMode
- `../../orchestra/brain.js` → readContext, planSprint, confirmDraftTasks, cleanupDraftTasks
- `../helpers/output.js` → print, printError, formatTable
- `../helpers/prompt.js` → promptConfirm
- `../helpers/process.js` → resolveProjectRoot
- `../helpers/messages.js` → getMessage
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- `commander` (ADR-010)
- Hicbir node:fs, node:child_process import'u yok — temiz modul

## 5. Complexity
- 1 fonksiyon + 1 action closure
- Max cyclomatic: ~6 (structured/dryRun/confirm branches)
- En karmasik: satir 21-111 — 3 ana akis (dry-run return, draft confirm, reject)
- **Iyi refactor edilmis** — 113 satir, okunakli, tek sorumluluk

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 0
- `typeof config.activeModeConfig.max_workers === 'number'` — runtime type check — guvenli
- Genel: MUKEMMEL — en temiz CLI dosyasi

## 7. ADR Compliance
- ADR-006: N/A — spawnSync kullanmiyor
- ADR-008: brain.js re-export layer uzerinden — UYUMLU
- ADR-010: UYUMLU
- ADR-022 CLI/MCP parity: UYUMLU — `deckent_plan` MCP tool mevcut
- Memory V2: readContext brain.js uzerinden DB'yi kullaniyor — DOLAYSIZ UYUMLU

## 8. Test Coverage
- `tests/cli/commands/plan.test.ts` — MEVCUT
- Kapsam: Temel plan akisi, structured mode, dry-run test edilmis olmasi beklenir.

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- YOK — minimal modul

## 11. Security
- Provider bootstrap hatasi sessizce yakalanip structured mode'a geciliyor — bilgi kaybi riski var ama CLI log gosteriyor ("[warn] Provider bootstrap failed")
- Draft task'lar kullanici onayi gerektirir — GUVENLI

## 12. Memory V2 Uyumu
- DOLAYSIZ UYUMLU — plan.ts DB'ye dogrudan erismiyor, brain.js delegasyonu

## 13. i18n
- `getMessage()` KULLANIYOR — plan.sprint_planned, plan.reasoning, plan.planning_mode, plan.note_sprint_size, plan.approved, plan.rejected — IYI
- **GAP:** "[warn] Provider bootstrap failed" (satir 46) — hardcoded EN
- **GAP:** "[dry-run] No task files written to disk" (satir 94) — hardcoded EN
- **GAP:** "Approve this plan?" (satir 99) — hardcoded EN

## 14. Dokumantasyon Tutarliligi
- JSDoc: YOK — ama modul basit, isim yeterince aciklayici
- CLI help: "Plan a sprint without executing it" — dogru
- Option help: --no-confirm, --structured, --dry-run — dogru
- `cleanupDraftTasks(root)` cagrisi idempotency icin (satir 59) — yorum yok ama acik

## 15. Performance
- Sync I/O: 0 — HIC sync I/O yok! Tamamen async
- bootstrapProviders async — dogru
- planSprint async — dogru
- confirmDraftTasks async — dogru
- **EN TEMIZ PERFORMANS PROFILI** — 10 dosya arasinda en az sync I/O

## 16. Oneriler
- **P2:** i18n: "[warn]", "[dry-run]", "Approve this plan?" mesajlari getMessage() ile
- **P3:** JSDoc: registerPlan fonksiyonu icin kisa dokumantasyon
- **P3:** Provider bootstrap failure logging daha detayli olabilir (hata mesaji dahil)

## Verdict: ANALYZED
