# ADR-038: Dead Code Disposition — Sprint 139 Audit Results

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** accepted

**Date:** 2026-04-15

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

---
