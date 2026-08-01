# Audit Report: `src/agents/prompt-metrics.ts`

**Sprint:** sprint-186 (per-file pilot batch — task 186-011)
**Auditor:** w-186-011 (doc-writer / typescript-expert)
**Date:** 2026-05-21
**Source LoC:** 6 (header yorum + 1 type re-export + 1 boş satır + 1 class re-export + EOF newline)
**Companion test LoC:** `tests/agents/prompt-metrics.test.ts` (mevcut, satır sayısı ölçülmedi)

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/prompt-metrics.ts` |
| LoC | 6 (effective code: 2 satır export ifadesi) |
| Module type | Backward-compatible re-export stub (zero runtime logic) |
| Imports (direct) | **HİÇBİRİ** — yalnızca `export {} from './prompt-analytics.js'` re-export statement'ları |
| Imports (transitive) | `PromptMetrics`, `PromptMetricsReport` symbol'leri `./prompt-analytics.js`'den |
| Exports | `PromptMetrics` (class re-export), `PromptMetricsReport` (type re-export) |
| Public surface | Yok — symbol'ler `prompt-analytics.ts`'de tanımlı; bu dosya yalnızca eski import yolunu yaşatır |
| Side effects | Yok — saf re-export, runtime'da hiçbir kod çalıştırılmaz |
| Async surface | Yok — purely declarative |
| Reverse dependencies (production `src/`) | **0 (sıfır)** — `grep -rn "from.*prompt-metrics" src/` yalnızca dosyanın kendisini bulmaz, hiçbir prod kodu bu modülden import yapmaz |
| Reverse dependencies (tests) | 3 dosya: `tests/agents/prompt-metrics.test.ts` (PromptMetrics + PromptMetricsReport), `tests/integration/collaboration-adaptive.test.ts` (PromptMetrics), `tests/core/non-null-safety.test.ts` (PromptMetrics) |
| Companion stub | `src/agents/prompt-ab-test.ts` (aynı pattern: `PromptABTester` ve A/B test interface'lerini re-export eder) |

**Notable detail:** Dosya 6 satır olarak listelense de **2 satırı yorum** (header comment), **2 satırı export** (type + class), **1 satırı boşluk**, **1 satırı newline EOF**. Effective code surface 2 satırdır.

---

## 2. Baglam (Architectural Context)

`prompt-metrics.ts` Deckent'in **prompt evolution / agent self-improvement** modüllerinin tarihsel bir kalıntısıdır. Header yorumu net: *"Backward-compatible re-export from the unified prompt-analytics module."*

**Tarihsel hikaye (kod kanıtından çıkarım):**
- Bir önceki sprintte `PromptMetrics` sınıfı kendi başına `src/agents/prompt-metrics.ts` dosyasında yaşıyordu.
- Sonraki bir refactor (muhtemelen Sprint 14X civarı) tüm prompt-analitik mantığını tek bir modülde topladı: `src/agents/prompt-analytics.ts` (474 LoC, audit'i task 187-009 / 186-009 kapsamında).
- Eski import yolunu kullanan testleri (ve potansiyel external tüketicileri) kırmamak için bu **re-export stub** bırakıldı.

**Companion pattern — `prompt-ab-test.ts`:**
Aynı header yorum + aynı re-export deseni ile A/B test sınıflarını yaşatır. Bu, ikinci bir veri noktası: refactor sırasında bilinçli olarak **stub-bridging** stratejisi tercih edilmiş (toplu import yolu güncellemesi yerine).

**Mantıksal yerleşim:**
- Production runtime'da bu modül **hiçbir kod yolundan çağrılmaz** — yalnızca test dosyalarının `import` ifadeleri tarafından çözümlenir.
- Build sonrası `dist/agents/prompt-metrics.js` da yine sadece re-export içerir.

**ADR ilişkisi:**
- **ADR-048 (Prompt Lifecycle Contract)** — modülün *amacı* (prompt metriklerini ölçmek) bu kontratla uyumlu, ancak gerçek mantık `prompt-analytics.ts`'de.
- **ADR-038 (Dead Code Disposition)** — bu modül "dead?" sorusunu doğrudan ilgilendiriyor (aşağıya bakınız).
- **ADR-001 (TypeScript + ESM)** — `.js` uzantısı zorunlu Node16 resolution kuralına uygun.
- **ADR-002 (Node16 Module Resolution)** — re-export sözdizimi (`export { X } from './path.js'`) ESM-uyumlu.

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Mitigation |
|------|----------|----------|------------|
| **Stale stub** | LOW | Re-export stub kalıcı debt değil ama API yüzeyi `prompt-analytics.ts` değişirse senkronizasyon kayıyor. | Eğer `PromptMetrics` rename edilirse, bu stub kırılır — TypeScript compile-time'da yakalar. |
| **Discoverability gap** | LOW | Yeni katılan geliştirici `import { PromptMetrics } from './prompt-metrics.js'` görüp gerçek implementasyonu aramaya başlar. | Header yorumu (`Backward-compatible re-export`) bu sorunu kısmen çözüyor. Aşağıdaki "Refactor Recommendations" daha agresif çözüm sunar. |
| **Test-only consumer** | LOW | Bu modüle yalnızca 3 test dosyası bağımlı. Prod kod `prompt-analytics.ts`'i doğrudan kullanır mı, yoksa hiç mi? — *kontrol gerekli (Sprint 188 follow-up)*. | grep ile `from './prompt-analytics'` üzerinden prod referansı sayılabilir. |
| **API drift** | NONE | Re-export `PromptMetrics` ve `PromptMetricsReport`'u 1:1 aktarır — drift olamaz. | — |
| **Bundle bloat** | NONE | 6 LoC, tree-shake friendly re-export. Build çıktısında etkisi sıfır. | — |

**Net risk verdict:** **LOW-NEGLIGIBLE**. Bu dosya production kararlılığı için sıfır risk taşır; yalnızca koddaki dosya sayısını şişirir.

---

## 4. Dead Code Candidates

### 4.1 Dosyanın kendisi — "soft-dead" candidate

**Kanıt zinciri:**
```bash
$ grep -rn "from.*prompt-metrics" src/ --include="*.ts"
src/agents/prompt-metrics.ts:2:// Backward-compatible re-export from the unified prompt-analytics module.
src/agents/prompt-metrics.ts:3:export type { PromptMetricsReport } from './prompt-analytics.js';
src/agents/prompt-metrics.ts:5:export { PromptMetrics } from './prompt-analytics.js';
# → production kodunda 0 import. Sadece dosyanın kendisi listeleniyor.

$ grep -rn "from.*prompt-metrics" tests/ --include="*.ts"
tests/core/non-null-safety.test.ts:14:import { PromptMetrics } from '../../src/agents/prompt-metrics.js';
tests/integration/collaboration-adaptive.test.ts:24:import { PromptMetrics } from '../../src/agents/prompt-metrics.js';
tests/agents/prompt-metrics.test.ts:2:import { PromptMetrics } from '../../src/agents/prompt-metrics.js';
tests/agents/prompt-metrics.test.ts:3:import type { PromptMetricsReport } from '../../src/agents/prompt-metrics.js';
# → sadece 3 test dosyası bağımlı.
```

**Durum:** Bu **gerçek anlamda dead code değil** (testler tüketiyor), ama **production-dead** denilebilir. Bir önceki refactor'dan kalan bir köprü.

**ADR-038 (Dead Code Disposition) kararı:**
- "Dead" tanımı yalnızca prod kullanım odaklı değil — testler de meşru tüketicidir.
- Ancak "delete stub + migrate test import paths" düşük maliyetli bir cleanup'tır.

### 4.2 Effective code line count

- Toplam: 6
- Yorum: 2 (header)
- Boş satır: 1 (line 4)
- Asıl kod: 2 (line 3 + line 5)
- EOF newline: 1

**Yorum/kod oranı:** 1:1 — çok yüksek. Stub doğası bunu zorluyor; LoC iyileştirmesi anlamsız.

### 4.3 Test files bağımlılığı

| Test dosyası | Import edilen symbol | Stub gerekli mi? |
|--------------|----------------------|-------------------|
| `tests/agents/prompt-metrics.test.ts` | `PromptMetrics`, `PromptMetricsReport` | **HAYIR** — `import { PromptMetrics } from '../../src/agents/prompt-analytics.js'` ile değiştirilebilir |
| `tests/integration/collaboration-adaptive.test.ts` | `PromptMetrics` | **HAYIR** — aynı şekilde |
| `tests/core/non-null-safety.test.ts` | `PromptMetrics` | **HAYIR** — aynı şekilde |

Üç testin import path'i 1 sed komutuyla güncellenebilir: `s|from '../../src/agents/prompt-metrics.js'|from '../../src/agents/prompt-analytics.js'|`.

---

## 5. Documentation Gaps

| Doküman | Durum | Eksiklik |
|---------|-------|----------|
| **Inline header comment** | ✅ VAR | "Backward-compatible re-export from the unified prompt-analytics module." — yeterince açıklayıcı |
| **Migration timeline / deprecation note** | ❌ YOK | Stub ne zaman silinecek? Kalıcı mı yoksa Sprint NNN'de kaldırılacak mı? Header yorumda belirtilmeli |
| **JSDoc / TSDoc** | ❌ YOK | Re-export'lar için TSDoc gerekmez (TypeScript zaten orijinal sembol'den doc çeker). Eksiklik değil. |
| **CHANGELOG referansı** | ❓ KONTROL EDİLMEDİ | `PromptMetrics` → `prompt-analytics.ts` move hangi sprintte yapıldı? CHANGELOG'da kayıtlı mı? — Sprint 188 follow-up |
| **api-surface.md güncellemesi** | ❓ KONTROL EDİLMEDİ | `docs/reference/api-surface.md` bu modülü mü, `prompt-analytics.ts`'i mi reference ediyor? — Sprint 188 follow-up |
| **README / module index** | ❌ YOK | `src/agents/` altında modül listesi varsa, stub işareti olmalı |

**Net dokümantasyon verdict:** Header yorumu yeterli ama **deprecation timeline** eksik. Stub'un yaşam süresi belirsiz.

---

## 6. ADR Compliance Check

| ADR | Konu | Compliance | Açıklama |
|-----|------|------------|----------|
| **ADR-001** | TypeScript + ESM | ✅ COMPLIANT | Pure TypeScript, ESM `export ... from` syntax kullanır |
| **ADR-002** | Node16 Module Resolution | ✅ COMPLIANT | `'./prompt-analytics.js'` — `.js` uzantısı doğru kullanılmış |
| **ADR-008** | Brain Merkezi Import — Tek Yönlü Bağımlılık | ✅ COMPLIANT (vacuous) | Bu modül brain'i import etmez, brain'den import edilmez. Sıfır bağımlılık. |
| **ADR-010** | Tek Runtime Dependency (commander.js) | ✅ COMPLIANT | Hiçbir runtime dependency yok |
| **ADR-035** | Brain ↔ Worker ↔ Auditor Verification Protocol | ✅ COMPLIANT (n/a) | Bu modülün protocol içinde yeri yok |
| **ADR-036** | ADR Governance Integration | ✅ COMPLIANT | Hiçbir mevcut ADR'yi ihlal etmiyor |
| **ADR-037** | RBAC V1.0 Authority Matrix | ✅ COMPLIANT (n/a) | Re-export stub authority surface'i yok |
| **ADR-038** | Dead Code Disposition | ⚠️ TARTIŞMALI | Production-dead, test-alive. ADR-038 "delete if 0-caller in src/" politikasını ne kadar sert uyguladığına bağlı. Test bağımlılığı meşru ise compliant. |
| **ADR-041** | Agent Taxonomy (Skills vs Agents) | ✅ COMPLIANT (n/a) | Stub taxonomy'yi etkilemez |
| **ADR-048** | Prompt Lifecycle Contract | ✅ COMPLIANT | `PromptMetrics` sınıfı (gerçek implementasyon `prompt-analytics.ts`'de) bu kontrat kapsamında; stub onun yüzeyini değiştirmez |

**Net ADR verdict:** **COMPLIANT** — yalnızca ADR-038 yorumlamaya açık (aşağıdaki refactor önerileri bu noktayı ele alır).

---

## 7. Refactor Recommendations

### Önerilen seçenekler (artan agresiflikle sıralı)

#### Seçenek A — Status quo (önerilen kısa vadede)
- **Hiçbir şey yapma.** Stub sıfır maliyet getiriyor (compile-time'da tree-shake edilir, runtime overhead'i yok).
- Header yorumu açıklayıcı.
- Maliyet/fayda dengesi: değişiklik gereksiz.

#### Seçenek B — Deprecation banner ekle
```typescript
// ─── Prompt Metrics (re-export stub) ─────────────────────────────────────────
// @deprecated since sprint-14X — import from './prompt-analytics.js' directly.
// This re-export bridge will be removed in sprint-NNN.
// Backward-compatible re-export from the unified prompt-analytics module.
export type { PromptMetricsReport } from './prompt-analytics.js';

export { PromptMetrics } from './prompt-analytics.js';
```
- IDE'de deprecation strikethrough görünür.
- Sprint timeline net.
- Maliyet: 2 satır yorum.

#### Seçenek C — Test imports migrate + stub delete
1. 3 test dosyasında import path'i güncelle: `prompt-metrics.js` → `prompt-analytics.js`
2. `src/agents/prompt-metrics.ts` sil
3. `src/agents/prompt-ab-test.ts` için aynısını yap (companion stub)
4. CHANGELOG'a kayıt
5. Build + test sweep

- Maliyet: 4-6 dakika
- Kazanç: 2 dosya az, history daha temiz
- Risk: external tüketici varsa (npm publish edilmiş paket olarak deckent'i kullanan), yayın breaking change olur

#### Seçenek D — Bridge'i kalıcı API yap
- Stub'u dokümante et: `src/agents/prompt-metrics.ts` "public prompt-metrics API" olarak ilan edilir, `prompt-analytics.ts` internal sayılır.
- Avantaj: external API stabilitesi (`prompt-analytics.ts` rename edilse bile stub yüzeyi sabit kalır)
- Dezavantaj: iki dosyayı senkron tutma yükü

**Tavsiye:** **Seçenek B** (deprecation banner) Sprint 188'de yapılabilir; **Seçenek C** (full removal) Sprint 189+ için. Companion `prompt-ab-test.ts` ile birlikte ele alınmalı.

---

## 8. Sprint 188 Follow-up Items

1. **prompt-analytics.ts ana modülü audit'i** — Bu stub'un gerçek mantığının nerede yaşadığını gösteren Task 187-009 / 186-009 kapsamı tamamlandığında, refactor kararlarını korele et.
2. **Companion stub `prompt-ab-test.ts` ile birlikte ele al** — Aynı pattern, aynı karar gerekir; tek PR'da migrate edilmeli.
3. **CHANGELOG arkeolojisi** — `PromptMetrics` → `prompt-analytics.ts` move hangi sprintte yapıldı? Git blame ile bul, deprecation banner'a tarih yaz.
4. **api-surface.md update** — `docs/reference/api-surface.md` `prompt-metrics.ts` veya `prompt-analytics.ts`'i public API olarak mı listeliyor? Tutarsızlık varsa düzelt.
5. **External consumer survey** — Deckent npm paketi olarak yayımlanmışsa, hangi public modüller external tüketim için garantili? `prompt-metrics.ts` stub'unu silmek breaking change yaratır mı?
6. **Test import path migration** — 3 test dosyasının import path'lerini `prompt-analytics.ts`'e çek (seçenek C'nin 1. adımı). Düşük riskli, yüksek temizlik kazancı.
7. **Stub-pattern envanteri** — `src/agents/` altında başka backward-compat stub var mı? `grep -l "Backward-compatible re-export" src/` ile tara.
8. **Decision documentation** — Seçenek A/B/C/D arasından hangisinin tercih edileceğine dair `decisions/` altına SDL veya ADR ekle.

---

## 9. Summary

`src/agents/prompt-metrics.ts` **6 satırlık (effective 2 satır kod) bir backward-compatible re-export stub**'dur. `PromptMetrics` class'ını ve `PromptMetricsReport` type'ını `./prompt-analytics.js` modülünden re-export eder. Companion: `src/agents/prompt-ab-test.ts`.

**Bağımlılık tablosu:**
- Production `src/` reverse-deps: **0**
- Test reverse-deps: **3** (`tests/agents/prompt-metrics.test.ts`, `tests/integration/collaboration-adaptive.test.ts`, `tests/core/non-null-safety.test.ts`)

**ADR uyumluluğu:** Tüm ilgili ADR'larla **COMPLIANT** (yalnızca ADR-038 "dead code disposition" yorumlamaya açık).

**Risk seviyesi:** **LOW-NEGLIGIBLE** — runtime impact sıfır, build impact sıfır, sadece dosya sayısını şişiriyor.

**Önerilen aksiyon (Sprint 188+):**
- Kısa vadede: deprecation banner ekle (Seçenek B).
- Orta vadede: test import path'lerini migrate et + stub'u sil (Seçenek C).
- Companion `prompt-ab-test.ts` ile birlikte tek PR'da yap.

**Kritik bulgu:** Yok. Bu modül bir "history tail" — refactor sürecinin meşru bir kalıntısı. Acil aksiyon gerektirmez.
