# ADR-029: Managed-Docs Universalization — Sprint Lifecycle Template-Based Document Generation

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 131

---

**Context:**
Önceki sprintlerde `sprint-reporter.ts` içindeki `updateProjectDocs()` fonksiyonu yalnızca hard-coded dokümanlara (CLAUDE.md, IDENTITY.md, README.md gibi) güncelleme yapabiliyordu. Kullanıcı kendi dokümanlarını (ARCHITECTURE.md, ONBOARDING.md, KPI dashboards) sprint döngüsüne dahil etmek istediğinde doğrudan `sprint-reporter.ts` kodunu değiştirmek zorunda kalıyordu. Bu durum:
- Kullanıcı konfigürasyonunu kaynak koduyla karıştırıyordu (separation of concerns ihlali)
- Her sprint sonrasında kullanıcı dokümanları stale kalıyordu
- Multi-language (TR/EN) proje dokümanları için tutarsız içerik üretiliyordu
- Plugin sistemi yok — yeni bölüm türü eklemek kaynak kodu değişikliği gerektiriyordu

Deckent'in hedef vizyonu "sprint lifecycle'ı herhangi bir proje türüne uygulayabilme" iken, doküman sistemi TypeScript mono-repo'ya hard-coded kalmıştı.

**Decision:**
`src/orchestra/managed-docs/` modül paketi oluşturuldu. Sprint finalizasyonunda `updateProjectDocs()` built-in updater'lardan sonra `runManagedDocUpdates()` çağırır. Sistem şu bileşenlerden oluşur:

1. **`.deckent/docs.json` konfigürasyon şeması** — `ManagedDocEntry` arayüzü: `path`, `autoSections`, `protectedSections`, `skills`, `maxLines`, `templates` alanları. Kullanıcı hangi dosyanın hangi bölümlerinin otomatik güncelleneceğini bildirir.
2. **`SectionGenerator` arayüzü** — `{ id, patterns, patternsByLang, generate(ctx) }`. Her generator bir bölüm başlığı deseni eşleştirir ve `DocUpdateContext`'ten markdown içeriği üretir.
3. **`content-generators.ts`** — 8 built-in generator: sprint-metrics, active-debt, sprint-history, agent-performance, changelog, test-coverage, module-map, dependencies. Generator registry runtime-extensible.
4. **`section-updater.ts`** — Mevcut dosyayı parse eder, sadece `autoSections` bölümlerini değiştirir, `protectedSections` ve kullanıcı içeriğini korur.
5. **`managed-doc-runner.ts`** — Orchestration: config okuma → user generator yükleme → cache kontrol → içerik üretimi → bölüm güncelleme → cache yazma.

Yeni doküman eklemek sıfır kaynak kodu değişikliği gerektirir — sadece `.deckent/docs.json` düzenlemesi yeterlidir.

**Consequences (+):**
- Kullanıcı herhangi bir markdown dokümanı sprint döngüsüne dahil edebilir
- `protectedSections` ile el ile yazılan bölümler hiç dokunulmaz
- `autoSections` match case-insensitive ve kısmi eşleşme destekler (TR/EN başlıkları)
- `templates` alanıyla built-in generator olmayan bölümler için `{{placeholder}}` syntax ile custom içerik tanımlanabilir
- `maxLines` ile uzun otomatik bölümler kırpılır

**Consequences (-):**
- `.deckent/docs.json` yoksa sistem hiçbir şey yapmaz — opt-in
- Büyük projelerde onlarca doküman için sprint bitişinde ek I/O yükü
- `section-updater.ts` markdown heading parse'ı stdlib yokluğundan regex-based — edge case'ler mümkün

**Alternatives Considered:**
- Hard-coded `sprint-reporter.ts` güncellemeleri — ölçeklenmez, kullanıcı özelleştirme yok, her yeni bölüm tipi kaynak kodu değişikliği gerektirir
- Harici template engine (Handlebars, Mustache) — runtime dependency, format vendor lock-in, ADR-010 minimal-dependency politikasıyla çelişir
- Ayrı CLI komutu (`deckent docs run`) — sprint döngüsüne entegre değil, kullanıcıların her seferinde manuel çağırması gerekir, tutarsız state riski
- Git-based template merge (patch stratejisi) — conflict resolution kompleks, merge çakışmaları kullanıcı deneyimini bozar

**Migration Impact:**
Mevcut projeler `.deckent/docs.json` oluşturmadan bu sistemi kullanmaz — backward-compat sağlanmıştır. İlk kez etkinleştirmek için `deckent docs add <path>` komutu veya dosyayı manuel oluşturmak yeterlidir.

**References:**
- Sprint 131 — feat: Managed Docs Universalization (commit hash omitted: pre-migration private-repo SHA, not resolvable in the public repo history)
- Kaynak: `src/orchestra/managed-docs/managed-doc-runner.ts`, `types.ts`, `docs-config.ts`
- Entegrasyon noktası: `src/orchestra/sprint-reporter.ts` → `updateProjectDocs()` → `runManagedDocUpdates()`

> **Note (verified):** Managed-docs system confirmed in code — `src/orchestra/managed-docs/` (incl. `docs-config.ts`) exists and `.deckent/docs.json` is present. Behavior unchanged; documentation alignment + repo-migration cleanup only (dead old-repo commit SHA removed).

---

**🔴 Amendment — 2026-06-11 (ADR-review): i18n LOCALE-LEAK root cause + fix (recurring K/O bug).**

**Symptom:** every sprint's RETRO render writes **Turkish** section headers/content into **English** managed docs (`CLAUDE.md`, `AGENTS.md`, `VISION.md`, `beta-tracker.md`, `blueprint.md`) — e.g. `Metric|Value`→`Metrik|Değer`, `Total Tasks`→`Toplam Task`. Manually reverted every sprint (Sprint 279/280).

**Root cause (code-confirmed):** `src/orchestra/managed-docs/content-generators.ts:67` → `return ctx.config?.language === 'tr' ? TR : EN;` — generators pick content language from the **project-default locale** (`ctx.config.language`, =`tr` for deckent-dev), **NOT the target language of the doc being written**. `ManagedDocEntry` has `patternsByLang` (for matching section titles in multiple languages) but **no `lang` field** for the doc's target language. In `.deckent/docs.json`, `vision-en` (VISION.md) and `vision-tr` (VISION-TR.md) are separate entries but both have `lang=None` → both render TR → the EN one leaks.

**Fix (two parts):**
1. **Per-doc locale (this ADR — ADR-029-W):** add a `lang` field to `ManagedDocEntry`; generators use `entry.lang ?? ctx.config.language` so each doc renders in ITS target language. Set `vision-en.lang='en'`, `vision-tr.lang='tr'`, `beta-tracker.lang='en'`, `blueprint.lang='en'`, etc. → EN docs render EN, TR docs render TR.
2. **Pure-adapter exclusion (ADR-013-W):** `CLAUDE.md`/`AGENTS.md` are adapters, not managed docs — remove from `docs.json` entirely (ADR-013 option A). 

Together these end the recurring leak at the root. Tracked: MASTER-PLAN "ADR-Analizi Türetilen İşler → ADR-029-W" (+ ADR-013-W). md+db senkron.

---
