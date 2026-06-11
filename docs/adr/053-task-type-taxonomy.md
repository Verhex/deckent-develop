# ADR-053: TaskType Taxonomy — Audit / Document-Write / Code-Development + Extensibility Roadmap

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-12

**Sprint:** Sprint 156

---

## Status

accepted (proposed Sprint 156 → accepted Sprint 172: çekirdek 3-tip taxonomy `rubric-registry.ts`'te shipped & kod-doğrulandı; Extensibility Roadmap + Tek-Kaynak reconciliation deferred/unrealized — aşağıdaki nota bkz.)

---

## Context

Deckent sprint lifecycle boyunca farklı türlerde görevler yürütülür: kaynak kodu yazan worker'lar, denetim raporu üreten worker'lar, yalnızca markdown belgeler oluşturan worker'lar. Sprint 154'e kadar tüm bu görevler tek bir `CODE_RUBRIC` ile değerlendiriliyordu. Bu tasarım Spring 153 ve 154'te ciddi bir sorun ortaya çıkardı: **Bug B** olarak kayıt altına alınan bu hata, `docs/audits/` altına yalnızca tek bir `.md` dosyası yazan audit task'larının `test_coverage: null` döndürmesi nedeniyle hatalı `NO_GO` kararı almasına neden oluyordu. Kod rubriği `test_coverage` için belirlenmiş bir eşik değeri beklediğinden, bu değer yokken görev başarısız sayılıyordu.

Bu sorun görevlerin ne yaptığına dair eksik bir modellemenin belirtisiydi. Deckent'in değerlendirme katmanı (Brain'in `result-evaluator.ts` bileşeni) görevi *tipine* göre değil yalnızca tek bir rubrik üzerinden yargılıyordu. Bu durum şu soruları gündeme getirdi:

1. Bir audit görevi neden kod kapsamı beklesin?
2. Bir doküman yazma görevi neden `correctness` skoru için test çalıştırsın?
3. Bir kod geliştirme görevi neden `audit_completeness` kriteriyle ölçülsün?

Ayrıca **task routing** (ADR-015), **agent selection** (ADR-041) ve **EffectClass** (Sprint 156 T-011) gibi bileşenler de görev tipinden faydalanabilirdi; ancak ortak bir tip tanımı yoktu. `task-router.ts`, `adr-selector.ts`, `task-analyzer.ts` ve yeni eklenen `rubric-registry.ts` her biri kendi `TaskType` tanımını yapıyordu. Bu tutarsızlık kodu anlamayı güçleştiriyor, yeni bileşenler eklendiğinde drift yaratıyordu.

Son olarak genişletilebilirlik eksikti. İleride `db-migration`, `package-publish`, `infrastructure-provision` gibi görev tipleri eklendiğinde bunları nereye yerleştirecek, hangi rubriği, hangi effect sınıfını atayacaktık? Açık bir taxonomi olmadan her ekleme ad-hoc olurdu.

---

## Decision

Deckent'te **üç temel TaskType** tanımlanır ve `rubric-registry.ts` içinde `src/orchestra/rubric-registry.ts` tek kaynak olarak tutulur:

```typescript
export type TaskType = 'audit' | 'document-write' | 'code-development';
```

### Tip Tanımları

**`audit`** — Tek bir denetim raporu dosyası üreten, kodda değişiklik yapmayan görevler.
- Tespit kuralı: `scope.filesWrite` tam olarak 1 girdi içermeli, bu girdi `docs/audits/` ile başlamalı ve `.md` ile bitmeli; `scope.directories` kaynak kodu dizini içermemeli.
- Örnek: T-152-016 ADR Compliance Scan, T-001 Workflow Verify.
- Rubrik: `AUDIT_RUBRIC` — `audit_completeness`, `finding_count`, `citation_density`, `migration_triage`.
- EffectClass: `pure` (sadece okuma + rapor yazma).

**`document-write`** — `docs/` altında (ancak `docs/audits/` dışında) bir veya birden fazla markdown belgesi üreten görevler.
- Tespit kuralı: Tüm `scope.filesWrite` girdileri `docs/` ile başlamalı ve `.md` ile bitmeli; hiçbiri `docs/audits/` ile başlamamalı; kaynak dizin içermemeli.
- Örnek: ADR draft yazma, ROADMAP güncelleme, sprint retrospective belgesi.
- Rubrik: `DOC_WRITE_RUBRIC` — `correctness`, `word_count`, `scope_compliance`, `documentation_quality`.
- EffectClass: `reversible` (git restore ile geri alınabilir).

**`code-development`** — Yukarıdaki kriterlere uymayan tüm görevler (varsayılan).
- Tespit kuralı: `audit` veya `document-write` kategorisine girmeyen her görev.
- Kapsam: kaynak kodu değişikliği, test yazma, refactoring, konfigürasyon değişikliği.
- Rubrik: `CODE_RUBRIC` — `correctness`, `test_coverage`, `scope_compliance`, `documentation`.
- EffectClass: `reversible` (çalışma ağacı değişiklikleri, git ile geri alınabilir).

### Tespit Önceliği

```
audit (ilk eşleşme kazanır)
  ↓ hayır
document-write
  ↓ hayır
code-development (varsayılan)
```

`audit`, `document-write`'tan önce değerlendirilir çünkü denetim raporları da `docs/` altında yaşar; ancak daha katı bir şekle sahiptir (tek dosya, `docs/audits/` prefix).

### Tek Kaynak Prensibi

`rubric-registry.ts` bu taxonominin **tek doğruluk kaynağı** olacak. `task-router.ts:45`, `adr-selector.ts:45` ve `task-analyzer.ts:4` içindeki çakışan `TaskType` tanımları `rubric-registry.ts`'ten re-export ile hizalanacak veya kendi spesifik alanlarını koruyan ama birbiriyle çakışmayan ayrı tipler olarak adlandırılacak. Bu çakışma ADR-008 (tek yönlü bağımlılık) ihlali riski taşımaktadır; yeniden yapılandırma ayrı bir sprint task olarak planlanmalıdır.

### Extensibility Roadmap

Mevcut üç tip temel bir taxonomiyi temsil eder. Aşağıdaki tipler **gelecek sprint'lerde** eklenebilir:

| Gelecek TaskType | EffectClass | Rubrik Odağı | Öncelik |
|---|---|---|---|
| `db-migration` | `idempotent` | migration atomicity, rollback plan | Sprint 162 |
| `package-publish` | `critical-irreversible` | publish gate, version bump, changelogs | Sprint 163 |
| `infrastructure-provision` | `compensable` | IaC diff, rollback script, approval gate | Sprint 165 |
| `security-patch` | `reversible` | CVE fix correctness, regression coverage | Sprint 162 |

Her yeni tip şu genişletme noktalarını güncellemelidir:
1. `TaskType` union (`rubric-registry.ts`)
2. `RUBRIC_REGISTRY` kaydı
3. `EFFECT_CLASS_REGISTRY` kaydı
4. `isXxxTask()` tespit fonksiyonu

Bu dört nokta `rubric-registry.ts` içinde bir arada tutulduğundan, değişim lokal kalır ve sürünüm (drift) riski düşer.

### ADR-053 ile İlgili Enforcement

Sprint 156 T-009 (`assertSpawnSafe`) ve T-010 (Runtime File Lock) güvenlik katmanları; task tipine duyarlı kararlar alabilmek için `detectTaskType()` fonksiyonunu çağırabilir. Örneğin, `critical-irreversible` tipinde bir task spawn edilmeden önce ADR-037 RBAC gereği Alperen onayı alınmalıdır.

---

## Consequences

### Olumlu

- **Yanlış NO_GO oranı düşer.** Audit ve doküman görevleri artık uygulanamaz kriterleri (coverage) taşımayan rubriklerle değerlendiriliyor. Sprint 154 Bug B'nin tekrarlanması engellendi.
- **Routing doğruluğu artar.** Agent seçimi (ADR-041), skill routing (ADR-015) ve ADR önerileri (`adr-selector.ts`) artık daha kesin bir tip üzerinden çalışabilir.
- **Genişletilebilirlik.** Yeni görev tipleri dört noktayı güncelleyerek eklenir; mevcut kodu bozmaz.
- **Güvenlik.** `RUBRIC_REGISTRY` ve `EFFECT_CLASS_REGISTRY` `Object.freeze()` ile korunur; runtime mutasyonu engellenir. Bu, bir worker'ın kendi tipini `critical-irreversible`'dan `reversible`'a düşürerek onay geçidini atlamasını önler.
- **Gözlemlenebilirlik.** `detectTaskType()` dönüş değeri sprint metriklerine ve audit loglarına eklenebilir; hangi görevlerin hangi tipte değerlendirildiği izlenebilir.

### Olumsuz

- **Sınır vakaları belirsiz.** `isAuditTask()` kuralları katıdır (tek dosya, `docs/audits/`). Hybrid bir görev (hem kaynak kodu hem de audit raporu) `code-development` olarak sınıflandırılır ve audit_completeness değerlendirilmez. Bu durum scope ayrımını zorunlu kılar — ama bu zaten ADR-034 Multi-Project Isolation ile uyumludur.
- **Mevcut `TaskType` çakışmaları.** `task-router.ts:45` (`'code' | 'test' | 'doc' | 'design' | 'unknown'`) ve `adr-selector.ts:45` kendi tip tanımlarını korur. Hizalama ayrı bir task gerektirir; şimdilik `rubric-registry.ts` yetki alanı yalnızca değerlendirme katmanı ile sınırlıdır.
- **Tespit, scope shape'e bağlı.** Başlık veya açıklama metninden değil `scope.filesWrite` ve `scope.directories` örüntülerinden tespit yapılır. Bu gaming-proof olmayı sağlar; ancak yanlış scope tanımlamaları (Brain planning hatası) yanlış tip tespitine yol açabilir. ADR-036 validation, scope'u DIRECTIVES'e karşı doğrulamalıdır.

---

## Related ADRs

- **ADR-015** — TaskRouter Module: mevcut `task-router.ts` içindeki `TaskType` bu ADR ile hizalanacak.
- **ADR-035** — Verification Protocol: `CODE_VERIFY_REQUEST` kanalının tetiklenmesi task tipine göre farklılaşabilir (audit task'lar için kod doğrulaması anlamsız).
- **ADR-037** — RBAC: `critical-irreversible` EffectClass → Alperen onay gating.
- **ADR-041** — Agent Taxonomy: Horizontal skill seçimi task tipine göre filtrelenebilir (doc görevleri için `testing-expert` önerme).
- **ADR-055** — Hybrid Scoring Pipeline (proposed): Bu ADR'nin TaskType'ları Hybrid Scoring'in Layer 1 (Schema) ve Layer 4 (Outcome) katmanlarına girdi sağlar.
- **Karpathy 4-Discipline Anchor** (`.claude/rules/karpathy-discipline.md`, Sprint 191 eklendi): Worker agent'ların her TaskType'ı *nasıl* yürüttüğünü belirleyen execution-time disiplin kuralları. TaskType sınıflandırması Brain tarafından (plan-time), 4-discipline uygulaması Worker tarafından (execute-time) yapılır — iki katman tamamlayıcıdır. Her TaskType için vurgu farklılıkları:
  - **`audit`**: Discipline 1 (Think-first: `scope.filesRead` listesindeki kaynak dosyalar rapor yazmadan önce tamamen okunmalı), Discipline 3 (Surgical: tek output dosyası constraint'i, izin verilmemiş dosyaya yazma → otomatik Auditor flag), Discipline 4 (Goal-Driven: her bulgu goCriteria'daki audit kriteri ile birebir eşlenmeli, izlenemeyen bulgu notta not edilmeli).
  - **`document-write`**: Discipline 1 (Think-first: içerik yapısı taslak olarak planlanmalı), Discipline 2 (Simplicity-First: talep edilmeyen bölüm veya ek dosya eklenmemeli — YAGNI), Discipline 4 (Goal-Driven: her başlık ve paragraf goCriteria doküman kalitesi kriteriyle eşlenmeli).
  - **`code-development`**: Tüm 4 discipline eşit ağırlıkla uygulanır; Discipline 3 (Surgical Changes) özellikle kritik — `scope.filesWrite` sınırı dışına çıkmak Auditor tarafından `git diff --stat` ile otomatik tespit edilir ve sprint NO_GO'ya yol açabilir.

---

## Notes

Bu ADR, `rubric-registry.ts` içinde `Sprint 154 Bug B fix` olarak hayata geçirilen uygulamanın geriye dönük belgelenmesidir. Uygulama önce yazıldı; ADR, tasarım kararlarını geç de olsa kayıt altına almaktadır. Sprint 156 dogfood pratiğine göre bu geç-ADR pattern'i kabul edilebilir — ancak ileride tercih edilen sıra şudur: ADR draft → Sprint task → Implementation.

> **Note (verified vs code → status promoted, Sprint 172):** Çekirdek taxonomy **shipped & kod-doğrulandı** (ADR-042 emsali): `src/orchestra/rubric-registry.ts:21` `TaskType = 'audit' | 'document-write' | 'code-development'`; `AUDIT_RUBRIC`/`DOC_WRITE_RUBRIC`/`RUBRIC_REGISTRY` `Object.freeze` (`:92-95`); `isAuditTask`/`detectTaskType` öncelik `audit → document-write → code-development` (`:166-169`) §Tespit Önceliği ile birebir. Bu nedenle status **proposed → accepted** (governance-onaylı). **Deferred/unrealized (gövde gelecek-zamanlı kalmıştır):**
> - **Extensibility Roadmap** tablosundaki hedef sprint'ler (db-migration/security-patch Sprint 162, package-publish Sprint 163, infrastructure-provision Sprint 165) **geçti ve gerçekleşmedi** — Sprint 172 itibarıyla hâlâ 3 temel tip; gelecek tipler yalnız `rubric-registry.ts:272-273`'te "reserved for future" yorumu olarak durur. Roadmap niyet-beyanıdır, taahhüt değil.
> - **Tek Kaynak Prensibi** uygulanmadı: `task-router.ts:45` (`'code'|'test'|'doc'|'design'|'unknown'`) ve `adr-selector.ts:45` çakışan `TaskType` tanımları Sprint 172'ye dek hâlâ bağımsızdır (ADR §Olumsuz bunu zaten kendi flag'ler — `rubric-registry.ts` yetkisi yalnız değerlendirme katmanıyla sınırlı kalır).
>
> Memory'deki taxonomy-vision (ADR-053/055/060 taslak seti) bağlamı korunur; yalnız ADR-053'ün **doğrulanmış çekirdeği** accepted'a alındı, geniş vizyon kapsamı değil. Behavior unchanged; documentation alignment only.

> **Amendment — Sprint 191 (Karpathy cross-reference):** Sprint 191 Worker Discipline Anchor projesi `.claude/rules/karpathy-discipline.md` dosyasını ve `worker-default.md` Karpathy 4-Discipline Anchor bölümünü ekledi. Bu ADR, execute-time disiplin kurallarının **plan-time** tamamlayıcısıdır: ADR-053 *hangi* rubrikle değerlendirileceğini belirler (Brain sorumluluğu, plan-time), Karpathy 4-discipline *nasıl* yürütüleceğini belirler (Worker sorumluluğu, execute-time). §Related ADRs'e Karpathy Anchor referansı eklendi. Behavior unchanged; no code change.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review): Deferred maddeler GERÇEKLEŞTİ

**Classification: BOTH** (değerlendirme adaleti kullanıcı-ürün kanunudur — kullanıcının doc/audit task'ları uygulanamaz kriterlerle false-NO_GO yememeli).

Sprint-172 Note'unun "deferred/unrealized" işaretlediği iki madde o zamandan gerçekleşti (kod-doğrulandı 2026-06-11):

1. **🟢 Tek Kaynak Prensibi UYGULANDI — WM-2 canonical work-model (Sprint 238-240).** `src/core/work-model.ts` artık taxonominin canonical SSOT'u; üç tüketici de bağlı: `rubric-registry.ts:12` (`taskKindToRubric`), `task-router.ts:15` (`taskKindToIntent`), `adr-selector.ts:12` (`taskKindToAdrDomain`). Çakışan bağımsız `TaskType` tanımları sorunu kapandı; çekirdek 3-tip + `Object.freeze` + tespit-önceliği `rubric-registry.ts:23/169`'da birebir korunur.

2. **🟢 EffectClass → otonom 3-gate ENFORCE — WM-6 (Sprint 241).** `src/orchestra/autonomous/policy-gate.ts` (G3 risk-gate) `EffectClass`'ı `rubric-registry`'den tüketir: pure/reversible → auto-run, riskli sınıflar → **park (insan onayı)**. ADR'nin "critical-irreversible → onay-gating" enforcement vizyonu otonom motorda canlıdır.

3. **🟢 İkinci eksen: TechStackKind — WM-7 (Sprint 254).** Taxonomy `TaskKind × TechStack` iki-eksenli değerlendirmeye genişledi: `work-model.ts` `TechStackKind` + `normalizeTechStack` + `COVERAGE_MEASURABLE_STACKS`; `criteria-deriver.ts` tip+stack-duyarlı GO/NO-GO türetir (doc→files-on-disk, audit→findings, code→tespit-edilen stack komutları — C++ projeye tsc-clean dayatılmaz; ADR-019 cross-ref).

**Hâlâ niyet-beyanı:** Extensibility-Roadmap'in gelecek tipleri (db-migration / package-publish / infrastructure-provision / security-patch) eklenmedi — 3 temel tip + iki-eksen güncel durumdur. md+db senkron (Alperen ADR-review).
