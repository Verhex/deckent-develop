# ADR-038: Dead Code Disposition — Sprint 139 Audit Results

**Status:** accepted

**Date:** 2026-04-15

**Sprint:** 139

---

**Context:**

Sprint 139 Dead Code Audit (Task 139-037 `scripts/dead-code-audit.mjs`) 11 modülü analiz etti ve 4 kategoride sınıflandırdı: Dead (6 modül, ~1042 LoC), Dormant/ADR-protected (4 modül, ~495 LoC), Active (1 modül — false positive). Audit, Sprint 132'deki güvenlik denetiminden gelen şüphelileri ve ADR-028 koruması altındaki V1 decision engine ekosistemini kapsadı.

Sorun: 1042 satır dead code bakım maliyeti yaratıyor (tsc derleme süresi, IDE noise, yeni katkıda bulunanlar için kafa karışıklığı). Ancak bazı dead modüller gelecek roadmap öğeleriyle (distributed execution Sprint 145+, ML-driven routing) doğrudan ilişkili — acele silme değerli mimari bilgiyi kaybettirir.

**Decision:**

Sprint 139 dead code audit sonuçları için 4 kademeli disposition kararı:

### Kademe 1: Remove (Sprint 140 Adım 4)

Aşağıdaki modüller **tamamen silinecek** (kaynak + test dosyaları):

| Modül | LoC | Gerekçe |
|-------|-----|---------|
| `src/orchestra/learning-decay.ts` | 151 | Deprecated learning sistemiyle bağlı, V2 routing farklı decay mekanizması kullanıyor. Pattern basit — gerekirse 30 dakikada yeniden yazılır. |
| `src/orchestra/learning-migration.ts` | 229 | Hardcoded keyword-to-taskType mapping, eski veri formatı migrasyonu. Yeni learning sistemi kurulursa sıfırdan tasarlanmalı. |
| `src/orchestra/batch-stats.ts` | 141 | Queue + delayed batch write pattern'ı jenerik. Gerekirse `node:stream` veya basit buffer ile yeniden implement edilir. Mevcut implementation 0 consumer. |

**Toplam:** 3 modül, ~521 LoC silme, 3 test dosyası silme.

**Rollback planı:** `git revert` ile tek commit geri alınır. Silme öncesi son commit hash'i `docs/audits/sprint-139/dead-code-decisions.md`'de kayıt altına alınır.

### Kademe 2: Defer (Sprint 145+ Değerlendirme)

Aşağıdaki modüller **silinmeyecek** — gelecek roadmap öğeleriyle doğrudan ilişkili:

| Modül | LoC | Gelecek Bağlantı | Yeniden Değerlendirme |
|-------|-----|-------------------|----------------------|
| `src/orchestra/combination-scorer.ts` | 101 | ML-driven routing scoring, outcome-tracker entegrasyonu | Sprint 145 (routing evolution) |
| `src/orchestra/handoff-protocol.ts` | 152 | Distributed execution, multi-task artifact exchange | Sprint 145 (distributed sprint) |
| `src/orchestra/brain-context.ts` | 268 | Context-aware planner enrichment, planner.ts entegrasyonu | Sprint 142 (planner evolution) |

**Toplam:** 3 modül, ~521 LoC korunacak. Test dosyaları da korunur.

Bu modüller `@deprecated` JSDoc tag'i ile işaretlenecek ve dosya başına `// DEFERRED: ADR-038, reassess Sprint 145` yorumu eklenecek. Sprint 145'te yeniden değerlendirilecek — ya revive edilecek (dogfood + test), ya da silinecek.

**Rollback planı:** `@deprecated` tag kaldırılır, modül aktif routing'e bağlanır.

### Kademe 3: Deprecate + Warning (ADR-028 Amendment — Sprint 142+)

ADR-028 koruması altındaki 4 dormant modül statüsü değişmiyor:

| Modül | LoC | ADR-028 Statüsü |
|-------|-----|------------------|
| `src/orchestra/decision-engine.ts` | 170 | Korunuyor — V1 referans |
| `src/orchestra/decision-replay.ts` | 150 | Korunuyor — audit tool |
| `src/orchestra/decision-steps/agent-step.ts` | 83 | Korunuyor — V1 step |
| `src/orchestra/decision-steps/scope-step.ts` | 92 | Korunuyor — V1 step |

**Toplam:** 4 modül, ~495 LoC — ADR-028 amendment gerektirir, Sprint 142+ değerlendirilecek.

Bu ADR, ADR-028'in removal'ını TALEP ETMİYOR — yalnızca Sprint 142'de reassessment öneriyor. V2 routing engine 10+ sprint boyunca stabil çalıştığında, V1 referans değerinin devam edip etmediği yeniden değerlendirilmeli.

### Kademe 4: False Positive Düzeltme

`src/orchestra/parallel-pipeline.ts` dead code olarak **yanlış raporlanmıştır**. Modül 4 src/ dosyası tarafından aktif olarak import edilmektedir (`sprint-spawner.ts`, `sprint-controller.ts`, `conflict-resolver.ts`). Rapordaki "0 import" yalnızca `PipelineTask` type export'u için geçerlidir — modülün kendisi kritik altyapıdır. Dead code raporundan çıkarılmalıdır.

**Consequences (+):**

- 521 LoC dead code güvenle silinecek (Sprint 140 Adım 4) — derleme süresi ve IDE noise azalır
- 521 LoC yüksek değerli kod korunacak — gelecek roadmap öğeleri için yatırım kaybı önlenir
- Her karar formal gerekçe, risk değerlendirmesi ve rollback planı ile belgelenmiştir
- False positive (parallel-pipeline) düzeltilerek audit doğruluğu artırılmıştır
- ADR-028 dormant modülleri Sprint 142'de reassessment'a takvimlenmiştir

**Consequences (-):**

- Deferred modüller (521 LoC) bakım yükü devam eder — `@deprecated` tag + periodic reassessment gerektirir
- Sprint 145 reassessment'ta modüllerin hâlâ relevant olup olmadığı belirsiz — roadmap değişebilir
- ADR-028 dormant modüller artık 15+ sprint boyunca untouched — reference value tartışmalı

**Alternatives Considered:**

- **Tümünü sil:** 1042 LoC + 495 LoC = ~1537 LoC silme. Reddedildi: combination-scorer ve handoff-protocol'ün yeniden yazım maliyeti yüksek, mimari bilgi kaybı.
- **Hiçbirini silme:** Tüm dead code korunsun. Reddedildi: learning-decay/migration/batch-stats gerçekten değersiz, bakım maliyeti artıyor.
- **Tümünü deprecate:** `@deprecated` işaretle, silme erteleme. Reddedildi: learning-decay/migration/batch-stats için deprecation gereksiz — doğrudan silme daha temiz.
- **Monorepo archive:** Dead kodu `packages/archive/` dizinine taşı. Reddedildi: ADR-010 minimal dependency, monorepo yapısı yok.

**References:**

- Sprint 139 Task 139-037: `scripts/dead-code-audit.mjs` — audit tool
- Sprint 139 Task 139-037: `docs/audits/sprint-139/dead-code-report.md` — audit raporu
- ADR-028: Decision-Engine V1 → V2 Routing Migration — dormant modül koruması
- ADR-033: Product Vision — bakım maliyeti minimizasyonu
- `docs/audits/sprint-139/dead-code-decisions.md` — detaylı decision matrix

> **Note (actual disposition as of Sprint 172 — verified vs `src/orchestra/`):** The plan was only partially realized and partly diverged:
> - **Kademe 1 (Remove):** `learning-decay.ts` ✓ removed, `learning-migration.ts` ✓ removed, but **`batch-stats.ts` still exists** (was not deleted).
> - **Kademe 2 (Defer):** `handoff-protocol.ts` and `brain-context.ts` are still present as planned, but **`combination-scorer.ts` was removed** (diverged from "defer / reassess Sprint 145").
> - **Kademe 3 (ADR-028 V1):** `decision-engine.ts`, `decision-replay.ts`, `decision-steps/agent-step.ts`, `decision-steps/scope-step.ts` all still present — accurate ✓.
> - **Kademe 4 (false positive):** `parallel-pipeline.ts` confirmed present and actively imported — accurate ✓.
>
> Behavior unchanged; documentation alignment only (records the real outcome vs the original plan).

---

## Sprint 230 Disposition Re-verification (2026-06-05)

### `src/orchestra/multi-agent.ts` — NEW ENTRY (absent from original ADR-038)

**Re-verification result:** 0-caller in production `src/` code confirmed.

```
grep -rl "from.*multi-agent" src/   # → empty (no production import)
grep -rl "multi-agent" src/ --include="*.ts" | grep -v "multi-agent.ts"
# → src/mcp/server.ts (doc comment only), src/cli/helpers/cursor-config.ts (doc comment only)
```

**Test callers (blocking deletion):**
- `tests/orchestra/multi-agent.test.ts` — imports `definePipeline`, `runPipeline`, `PipelineStep`, `PipelineExecutor`
- `tests/core/error-handling-unification.test.ts` — dynamically imports `definePipeline`

**Disposition decision: DEFER — test cleanup required before deletion.**
`multi-agent.ts` is a 0-caller orphan in production code. However, deleting the source file
without also removing its test callers would break the test suite. Removing those test files
was outside the Sprint 230 task scope. The module is retained; a future sprint must: (1)
confirm no wiring value, (2) remove `tests/orchestra/multi-agent.test.ts` and the
`multi-agent` sections in `tests/core/error-handling-unification.test.ts`, then (3) delete
`src/orchestra/multi-agent.ts`.

**Rollback:** N/A — no deletion performed.

---

### `src/orchestra/decision-replay.ts` — RE-VERIFIED (Kademe 3 status unchanged)

**Re-verification result:** 0-caller in production `src/` code confirmed.

```
grep -rl "from.*decision-replay" src/   # → empty (no production import)
```

**Test callers (maintaining Kademe 3 protection):**
- `tests/orchestra/decision-replay.test.ts` — imports `replayDecision`, `diffDecisions`
- `tests/core/non-null-safety.test.ts` — imports `diffDecisions`

**Disposition decision: KEEP — ADR-028 protection unchanged.**
`decision-replay.ts` remains in Kademe 3 (ADR-028 V1 reference / audit tool). Production
0-caller status confirmed as of Sprint 230. Test callers also prevent safe deletion without
broader scope. ADR-028 amendment required before disposal; scheduled for reassessment
Sprint 142+ (original plan), now overdue — escalate in next architecture review.

**Rollback:** N/A — no changes to source file.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full disk re-verification)

**Classification: dogfood-only** (deckent'in kendi modül-disposition kararları).

Tüm disposition iddiaları bugünkü diske + production-caller'lara karşı yeniden doğrulandı:

1. **🟢 `handoff-protocol.ts` REVIVED — DORMANT → LIVE (Sprint 278 COMM-1).** Kademe-2 defer'ının öngördüğü "ya revive (dogfood+test) ya sil" yolunun **revive** çıkışı gerçekleşti: artık `task-builder.ts` + `sprint-controller.ts` tarafından production-import ediliyor (worker_comms handoff enjeksiyonu). Kademe-2'den çıkar — ACTIVE.
2. **`batch-stats.ts` silinmesi HÂLÂ yapılmadı** (Kademe-1 planı, Sprint 140 hedefliydi) — dosya duruyor, 0-caller. ~141 LoC.
3. **Gecikmiş reassessment'lar:** `brain-context.ts` (hâlâ 0-production-caller; reassess S142 planı → 139 sprint gecikmiş), `decision-replay.ts` (S230 teyitli 0-caller), `multi-agent.ts` (S278 "disposition" task'ı durumu teyit etti ama dispose etmedi — hâlâ 0-caller, deprecation-marker yok). **Karar:** bunlar + batch-stats silmesi, **ertelenmiş dormant-audit sweep'ine katlanır** ([[project_product_repo_migration_push]] — Alperen: "dormant taramasını işler bitince yeniden yapacağız"); ayrı acil iş açılmaz.
4. **Yan-bulgu (manifest-mislabel ailesi, ADR-028-W ile aynı):** features.md dead-features `parallel-pipeline-manager`'ı "superseded" listeler ama `parallel-pipeline.ts` mevcut + production-import'lu (Kademe-4 false-positive düzeltmesi hâlâ geçerli).

md+db senkron (Alperen ADR-review).
