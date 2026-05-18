# Analysis: src/orchestra/debt-manager.ts
**Task ID:** 142-009 | **Model:** opus | **LoC:** 393 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
Teknik borc yonetim modulu. Sprint evaluation sonrasinda task sonuclarini isleyerek DONE/GO_WITH_TECH_DEBT/NO_GO kararlarini uygular. Borc ekleme, eskalasyon (sprint sayisina gore priority yukseltme), cozumleme ve arsileme islemlerini yapar. Brain tarafindan sprint-controller lifecycle icerisinde kullanilir. Memory V2 DB-first mimarisinde calisan, eski V1 .md fallback'i tamamen kaldirmis bir modul.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
- `handleEvaluation(projectRoot, task, evaluation, result): void` — JSDoc ✓ (detayli param aciklamasi)
- `handleCrossDependencies(projectRoot, sprint, evaluations): Task[]` — JSDoc ✓
- `escalateDebt(projectRoot): void` — JSDoc ✓
- `resolveDebt(projectRoot, debtId, resolvedInSprintId): boolean` — JSDoc ✓
- `archiveResolvedDebt(projectRoot): number` — JSDoc ✓
- `auditBrainBudget(projectRoot, budget?): BrainBudgetAudit` — JSDoc ✓
- `runDecay(projectRoot, sprintId, opts?): DecayResult` — JSDoc ✓
- `decay(projectRoot, currentSprintId): void` — JSDoc ✓ (backward compat alias)
- `DECAY_EXEMPT: Set<string>` — JSDoc ✓
- `BrainBudgetAudit` interface — JSDoc ✓ (field-level docs)
- `RunDecayOptions` interface — JSDoc EKSIK (no field-level docs)

## 3. Ic Bagimliliklar (import chain listesi, dongusel bagimllik riski var mi?)
- `../core/types.js` → TaskStatus, TaskEvaluation, Task, TaskResult, Sprint, DecayResult
- `../core/constants.js` → BRAIN_DIR, TASKS_DIR, MEMORY_DB_FILE, DEBT_HIGH_PRIORITY_SPRINTS, DEBT_CRITICAL_SPRINTS
- `../agents/worker.js` → updateTaskStatus, releaseAllLocks
- `../core/memory-store.js` → MemoryStore
- `../core/memory-types.js` → MemoryEntryV2, CreateEntryInput

**Dongusel bagimllik riski:** Dusuk. agents/worker.js import'u ADR-008'e gore sorgulanabilir (brain → worker import), ancak debt-manager brain tarafindan kullanildigindan kabul edilebilir.

## 4. Dis Bagimliliklar (node_modules, native modul — ADR-010 uyumu)
- `node:fs` (writeFileSync, existsSync, mkdirSync) — Node.js built-in ✓
- `node:path` (join) — Node.js built-in ✓
- ADR-010 uyumu: ✓ (sadece Node.js built-in'ler, harici dep yok)

## 5. Complexity (fonksiyon sayisi, max cyclomatic rough, en karmasik fonksiyon adi + satir no)
- Toplam fonksiyon: 10 (4 internal helper + 6 exported)
- En karmasik fonksiyon: `handleEvaluation` (satir 76-148) — cyclomatic ~5 (3 evaluation branch + DB check + null guard)
- `escalateDebt` (satir 210-232) — cyclomatic ~4 (filter + loop + dual threshold check)
- `handleCrossDependencies` (satir 159-203) — cyclomatic ~4 (nested loop + eval checks)
- Genel complexity: ORTA. Anlasilir ve iyi bolunmus.

## 6. Type Safety (any sayisi, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
- `as Record<string, unknown>` — satir 50, 217, 225, 248 (JSON.parse donusu, kabul edilebilir pattern)
- Explicit `any` yok ✓
- `@ts-ignore` / `@ts-expect-error` yok ✓
- Non-null `!` yok ✓
- `as unknown` yok ✓
- **Degerlendirme:** Iyi. JSON.parse'in `Record<string, unknown>` cast'i guvenli bir pattern.

## 7. ADR Compliance (ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-022 CLI/MCP parity, ADR-033 product vision, ADR-037 RBAC, ADR-039 self-modifying, Memory V2 DB-first)
- **ADR-006:** spawnSync kullaniMI yok ✓
- **ADR-008:** `../agents/worker.js` import'u var — bu modül brain tarafindan cagirilir, dolayisiyla teknik olarak brain→worker import zincirinin parcasi. UYUMLU.
- **ADR-010:** Sadece Node.js built-in. Harici dep yok ✓
- **ADR-033:** Product vision — telemetry yok, kullanici verisi tutmaz ✓
- **ADR-037 RBAC:** Brain role'u disinda cagrilma riski yok ✓
- **Memory V2 DB-first:** ✓ Tum operasyonlar DB-first. V1 .md fallback TAMAMEN KALDIRILMIS.

## 8. Test Coverage (src/X.ts → tests/X.test.ts eslesmesi var mi? mock kalitesi, edge case coverage, Memory V2 mock dogru mu?)
- `tests/orchestra/debt-manager.test.ts` MEVCUT ✓
- `tests/orchestra/debt-parse-fix.test.ts` — ek test
- MemoryStore mock pattern kullaniliyor olmali (ayri incelenecek)
- **Edge case:** archiveResolvedDebt DB-absent path, escalateDebt boş debt listesi, resolveDebt zaten resolved item
- **Degerlendirme:** Test dosyasi mevcut, mapping dogru.

## 9. TODO/FIXME/HACK inventory (her biri satir numarasiyla, severity P0-P3)
Hicbir TODO/FIXME/HACK bulunamadi. ✓ Temiz.

## 10. Dead Code (unused export, unreachable branch, @deprecated hala var mi?)
- `decay()` fonksiyonu (satir 391-393): `runDecay` icin backward-compat alias. Kullaniliyor mu kontrol edilmeli. Potansiyel dead code P3.
- `DECAY_EXEMPT` (satir 295): Hala export ediliyor ama V2'de DB decay modunda kullanilmiyor olabilir. Kontrol gerekli P3.
- `debtEntryToInput()` (satir 37-52): Internal helper, sadece escalateDebt ve resolveDebt tarafindan kullaniliyor ✓

## 11. Security (input validation, injection riski, secret exposure, OWASP, SQL injection for DB)
- **SQL injection:** MemoryStore API uzerinden yapilan sorgular parametrized (better-sqlite3). Dogrudan SQL yok ✓
- **Input validation:** `handleEvaluation` task/evaluation parametreleri tip-safe ✓
- **JSON.parse:** Metadata parsing try-catch icerisinde ✓ (satir 217)
- **Secret exposure:** Yok ✓
- **Potansiyel risk:** `result.notes` dogrudan debt content'ine yaziliyor (satir 105). XSS riski yoktur (CLI/MCP output) ancak cok uzun notes icin `.slice(0, 80)` truncation uygulanmis ✓

## 12. Memory V2 Uyumu (DB-first mi? Eski .md parse kaldi mi? readFileSync + DECISIONS/MEMORY/DEBT parse var mi?)
- **DB-first:** ✓ Tum fonksiyonlar getMemoryStore() ile DB'ye erisir
- **Eski .md parse:** KALDIRILMIS ✓ (parseDebtTable, generateDebtTable gibi V1 fonksiyonlari yok)
- **V1 fallback pattern:** Her fonksiyon `if (store) { ... } // No DB available` pattern'i kullanir. DB olmayan projelerde sessizce no-op olur. Bu tasarim karari kabul edilebilir.
- **readFileSync + DECISIONS parse:** YOK ✓

## 13. i18n (TR/EN hardcoded string, locale-aware mi? turkishNormalize kullanimi dogru mu?)
- Hicbir kullanici-gorunur string yok (tum mesajlar internal/debug)
- Debt title'lari Ingilizce hardcoded ("Tech debt from...", satir 104) — kullanici gorunur olabilir
- turkishNormalize kullanimi: Gerekli degil (FTS5 tarafinda yapilir)
- **Degerlendirme:** i18n uyumu gereksiz — internal modul.

## 14. Dokumantasyon Tutarliligi (JSDoc ↔ gercek davranis uyumu, .md referans dogrulugu, sayi tutarliligi)
- JSDoc'lar DOGRU. handleEvaluation'in evaluation order dokumantasyonu gercek kodu yansitir ✓
- `auditBrainBudget` — budget default 900 dokumante edilmis, DECKENT.md "900 lines max" ile tutarli ✓
- `RunDecayOptions` interface JSDoc eksik — P3

## 15. Performance (sync I/O sayisi, hot path mi?, gereksiz disk okuma/yazma)
- **Sync I/O:** writeFileSync (satir 143, 194), existsSync (satir 27), mkdirSync (satir 142, 193) — toplam 5 sync I/O cagri noktasi
- **Hot path:** Hayir. Sprint evaluation sirasinda bir kez cagrilir.
- **MemoryStore acma/kapama:** Her fonksiyon kendi store'unu acar ve kapar. Tekrarlanan open/close overhead'i olabilir ama sprint lifecycle'da az sayida cagri yapilir.
- **Gereksiz disk I/O:** mkdirSync TASKS_DIR icin her handleCrossDependencies iterasyonunda (satir 193) — loop disina cikarilabilir P3
- **Degerlendirme:** Kabul edilebilir performance. Hot path degil.

## 16. Oneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P3** — `mkdirSync` loop disina cikar (handleCrossDependencies satir 193, her iterasyonda gereksiz)
2. **P3** — `RunDecayOptions` interface icin field-level JSDoc ekle
3. **P3** — `decay()` alias fonksiyonunun hala kullanilip kullanilmadigini dogrula, kullanilmiyorsa kaldir
4. **P3** — `DECAY_EXEMPT` set'inin V2 mimarisinde kullanim durumunu dogrula
5. **P2** — `auditBrainBudget` ADR entry'lerini "permanent" saymasi dogru mu? ADR'ler de decay olabilir (eski ADR'ler deprecated/superseded olabilir). Iyi dusunulmus bir tasarim karari mi yoksa V1 artigi mi?

## Verdict: ANALYZED
