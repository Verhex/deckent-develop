# Audit: `src/agents/prompt-ab-test.ts`

**Sprint:** sprint-186 (per-file-pilot-50)
**Task:** 186-008
**Auditor agent:** doc-writer
**Date:** 2026-05-21
**Audited path:** `src/agents/prompt-ab-test.ts`
**Companion module:** `src/agents/prompt-analytics.ts`

---

## 1. Inventory

| Alan | Değer |
|------|-------|
| LoC (toplam) | 10 satır (1 boş satır dahil), 2 satır yorum |
| Effective LoC | 7 (2 export ifadesi + üst-bilgi yorumu) |
| Exports — type | `ExperimentResult`, `Experiment`, `ExperimentAnalysis` (re-export, type-only) |
| Exports — runtime | `PromptABTester` (re-export, class) |
| Imports | `./prompt-analytics.js` (tek dependency, ESM `.js` uzantısı — ADR-002 uyumlu) |
| Reverse deps (production code) | **0 dosya** — `src/` altında bu modülü tüketen başka kaynak yok (sadece kendisi ve `prompt-analytics.ts` `PromptABTester` ismini barındırıyor) |
| Reverse deps (test code) | `tests/agents/prompt-ab-test.test.ts` (sadece bu modül üzerinden `import { PromptABTester }` ve `Experiment`/`ExperimentAnalysis` type'larını çekiyor) |
| Public API yüzeyi | 1 class + 3 interface (hepsi `prompt-analytics.ts`'ten geliyor) |
| İlk commit | `f7342ec7` — Sprint 031 (Brain Decision Engine + Multi-Agent Collaboration + Prompt Evolution) |
| Son anlamlı değişiklik | `f95d1178` — Sprint 036 (brain.ts split + architectural cleanup) — büyük olasılıkla bu sprintte içerik `prompt-analytics.ts`'e taşındı ve dosya re-export stub'ına dönüştü |

---

## 2. Bağlam (Architectural Context)

Dosyanın tamamı (10 satır), `prompt-analytics.ts` birleşik modülünden 1 class + 3 type re-export eden saf bir **backward-compatibility shim**'dir. Üst yorum bunu açıkça beyan ediyor:

```text
// ─── Prompt A/B Testing (re-export stub) ─────────────────────────────────────
// Backward-compatible re-export from the unified prompt-analytics module.
```

`prompt-analytics.ts:1-3` bu birleşmeyi doğruluyor: *"Unified module combining prompt metrics collection and A/B testing. Merges prompt-metrics.ts and prompt-ab-test.ts into a single cohesive module."* — yani A/B test mantığı (`PromptABTester` class, deneyim CRUD + istatistik) artık `prompt-analytics.ts:68-285` aralığında yaşıyor. `prompt-ab-test.ts` yalnızca eski import path'ini koruyor.

**Mimari rolü (prompt-analytics içinde):** `PromptABTester` agent başına `variantA`/`variantB` prompt deneyimleri üretir, sprint sonuçlarıyla (`recordResult(experimentId, variant, sprintId, evaluation, coverage)`) sample toplar, `MIN_SAMPLES_FOR_WINNER=4` eşiğinde kazanan varyantı belirler. Yapay zekâ destekli **agent prompt evolution** pipeline'ının (Sprint 031 `Prompt Evolution`) A/B karşılaştırma katmanıdır — başka bir deyişle bu sınıf, `src/agents/prompt-evolution.ts` ve `src/agents/prompt-version.ts` ile birlikte aynı *prompt evolution* halkasının parçasıdır.

**ADR ilişkisi:**
- **ADR-048 (Prompt Lifecycle Contract):** ADR-048 §Decision *tmpfile lifecycle*'ı (`.tasks/.prompt-*.txt` write → persist → archive) konuşur, prompt **içerik** versiyonlamasını/A-B karşılaştırmasını değil. Amendment §4172 (Sprint 182) `prompt content lifecycle` (compose → render → inject → consume) katmanını ekler. `PromptABTester` content lifecycle'ın hangi varyantın "consume" edileceğine karar veren analitik halkasıdır; dolayısıyla **dolaylı ilgili**dir ama re-export stub'ın kendisi ADR-048'in herhangi bir invariantını ihlal etmez (dosya I/O yok, sadece re-export).
- **ADR-002 (Node16 Module Resolution):** `.js` uzantısı export ifadelerinde mevcut → uyumlu.
- **ADR-041 (Agent Taxonomy):** "Horizontal Skills vs Vertical Agents" — bu modül agent değil, agent prompt evolution infrastructure'ı, dolayısıyla `src/agents/` altında olması ADR-041 sınıflandırmasıyla *zayıf* uyumludur (aslında `src/orchestra/` veya `src/core/prompt-*` altında daha doğal dururdu — bkz. §7).

---

## 3. Debt Risk

| Risk | Şiddet | Açıklama |
|------|--------|----------|
| **Re-export stub vs. ölü kod** | LOW | Production reverse-dep yok; sadece test dosyası import ediyor. Test'i `prompt-analytics.ts`'e yönlendirmek mümkün, ancak public API kontratı niyetiyle saklanmış olabilir. |
| **API duplication / drift** | LOW–MED | `prompt-analytics.ts` zaten aynı isimleri export ediyor; iki path mevcut (`./prompt-ab-test.js` ve `./prompt-analytics.js`) — gelecekte kafa karışıklığı yaratabilir. |
| **Type-only `export type` vs runtime `export`** | LOW | Doğru ayrım yapılmış (`export type { Experiment* }` + `export { PromptABTester }`) — `verbatimModuleSyntax` veya ESM type erasure güvenli. |
| **Test izolasyonu** | LOW | Test dosyası `prompt-ab-test.js` üzerinden import ediyor → stub silinirse test path güncellenmeli. |
| **Sprint 187 follow-up cascade riski** | LOW | Bu stub, prompt evolution chain'in **görünür yüzü** — silinmesi planlanmadan agent-evolution promotion pipeline kırılmaz; ancak değişiklik tek satır risk taşır. |
| **Dead-code adayı işareti** | MED | `prompt-metrics.ts` (6 LoC, task 186-011 audit alanında) ile aynı paterndedir — Sprint 141 ve önceki audit'lerde "stub" olarak listelenmiş (`docs/audits/sprint-167/T1-code-inventory.md`, `archive/sprints/sprint-141/.../prompt-ab-test.md`). |

---

## 4. Dead Code Candidates

Dosyanın **kendisi** dead-code adayıdır (re-export stub). Gerekçe ve kanıt:

```bash
# Production tüketici taraması (kendisi + birleşik modül hariç):
$ grep -r "prompt-ab-test\|PromptABTester" src/ --include="*.ts" -l
src/agents/prompt-ab-test.ts
src/agents/prompt-analytics.ts
# → src/ altında 0 ek tüketici. Production runtime path'i yok.

# Test tarafı:
$ grep -r "prompt-ab-test" tests/ --include="*.ts" -l
tests/agents/prompt-ab-test.test.ts
# → 1 test dosyası, stub üzerinden import ediyor.

# Workspace genelinde (md/audit/archive dahil):
$ grep -r "prompt-ab-test\|PromptABTester" . -l | wc -l
# → 35 dosya, ancak çoğu audit/archive/decision (referans materyal).
```

**Karar matrisi:**

- **Silmek:** Test dosyasını `prompt-analytics.js`'e remap et → tek satır değişiklik. Risk: dış kullanıcılar `deckent` paketinden bu yolu import ediyorsa breaking. Ancak npm `exports` field'ında `src/agents/prompt-ab-test.js` listelenmiyorsa external sızıntı yok.
- **Tutmak:** Sprint 036 cleanup'ında niyetli backward-compat kararı verilmiş olabilir (yorum bunu doğruluyor); 10 satırlık maintenance maliyeti sıfıra yakın.
- **Önerilen:** §7'de "tut + JSDoc `@deprecated` ekle" yaklaşımı.

`prompt-metrics.ts` (6 LoC, task 186-011) ile birlikte değerlendirilmeli — ikisi de aynı sprintte birleşmiş stub'lardır.

---

## 5. Documentation Gaps

| Gap | Öneri |
|-----|-------|
| `@deprecated` JSDoc yok | Re-export'lara `@deprecated Use 'prompt-analytics.js' directly. This stub exists for backward compatibility.` ekle |
| `prompt-analytics.ts` içinde "merged from prompt-ab-test.ts" yorumu var ama **karşı yönde referans yok**: `prompt-ab-test.ts` yorumunda hangi sprintte taşındığı belirtilmemiş | Yoruma "Merged in Sprint 036 (see ADR/commit f95d1178)" iz bırakılabilir |
| README/architecture docs'ta "prompt evolution" diagramı yok | `docs/reference/` altında `prompt-*.ts` ailesinin (analytics, evolution, version, rollback, metrics, ab-test) görsel haritası eksik; mevcut audit (`docs/audits/sprint-149/doc-review-report.md`) bu boşluğu daha önce işaretlemiş |
| API surface kontratı yok | `docs/reference/api-surface.md` `.tasks/` ve `.result` formatlarını kapsıyor, prompt-evolution API kontratını içermiyor — opsiyonel iyileştirme |

---

## 6. ADR Compliance Check

| ADR | Durum | Gerekçe |
|-----|-------|---------|
| **ADR-001 (TypeScript + ESM)** | ✅ Compliant | `.ts` kaynağı, `export type` + runtime export ayrımı doğru |
| **ADR-002 (Node16 Module Resolution)** | ✅ Compliant | `from './prompt-analytics.js'` — `.js` uzantısı mevcut |
| **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık)** | ✅ Compliant | Modül brain'i import etmiyor; agent katmanında yalnızca aynı katmandaki `prompt-analytics`'e bağımlı |
| **ADR-010 (Tek Runtime Dependency — commander.js)** | ✅ Compliant | Hiç runtime dependency eklenmiyor |
| **ADR-038 (Dead Code Disposition)** | ⚠️ ADVISORY | Stub'ın retain/remove kararı ADR-038'in audit-output disposition matrisine girer; mevcut durumda **retain** uygun (test consumer + 0 maintenance cost), ancak §7 önerisi formal olarak işaretlenmeli |
| **ADR-041 (Agent Taxonomy)** | ⚠️ ADVISORY | "Horizontal skills" vs "vertical agents" sınıflandırmasında bu modül *neither* — `src/orchestra/agent-evolution/` daha doğru lokasyon olabilir; ancak Sprint 031'den beri `src/agents/` altında ve refactor maliyeti taşıma değerinden büyük |
| **ADR-048 (Prompt Lifecycle Contract)** | ✅ N/A — Dolaylı ilgili | ADR-048 *tmpfile* lifecycle'ını (`.tasks/.prompt-*.txt`) yönetir; bu modül in-memory `Experiment` JSON'larını `.deckent/experiments/` altında tutar (`prompt-analytics.ts:51` `EXPERIMENTS_DIR`). İki lifecycle disjoint. Sprint 182 Amendment §4172 *content lifecycle* (compose → render → inject → consume) katmanına eklenmiş olup `PromptABTester` content seçimi için kanıt sağlar — ihlal yok |
| **ADR-046 (Brain Self-Update Hook Architecture)** | ✅ N/A | Modül brain-self-update zincirinde değil |

---

## 7. Refactor Recommendations

### Önerilen (LOW effort, Sprint 188 candidate):

1. **`@deprecated` JSDoc ekle (tek dosya, 5 satır değişiklik):**
   ```typescript
   /**
    * @deprecated Re-export stub. Import directly from './prompt-analytics.js'.
    * Retained for backward compatibility since Sprint 036 module consolidation.
    */
   export { PromptABTester } from './prompt-analytics.js';
   ```
   Aynısı `export type` blokları için. TS `--strict` flag'i `@deprecated` kullanımına uyarı çıkarır, IDE'ler strikethrough gösterir → migration teşviki.

2. **Test path remap (LOW risk):** `tests/agents/prompt-ab-test.test.ts`'i `prompt-analytics`'e yönlendir; test file ismi history için tutulabilir. Ancak test dosyasını **yeniden adlandırmak** (`prompt-ab-test.test.ts` → `prompt-analytics-ab.test.ts`) prompt-evolution alt-sistem ailesi içinde tutarlılığı arttırır (zaten `prompt-metrics.test.ts` var ve aynı stub'a karşılık geliyor).

### Önerilmeyen (yüksek risk / düşük getiri):

3. **Stub'ı sil:** Public API sızıntısı varsa breaking change; getiriyi haklı çıkaramaz (10 satır, sıfır maintenance).
4. **Modülü `src/orchestra/agent-evolution/`'a taşı:** ADR-041 sınıflandırması açısından temiz olur, ancak 35+ referans dosyasını (audit/archive/test) günceller — Sprint 188 öncelikleriyle orantısız.

### Birleştirilebilir (cluster önerisi):

5. **`prompt-metrics.ts` (6 LoC) + `prompt-ab-test.ts` (10 LoC) birleşik audit-disposition kararı:** İkisi de aynı sprintte `prompt-analytics.ts`'e taşınmış stub. Sprint 188'de tek bir "agent-evolution stub disposition" task'i altında değerlendirilmeli (her ikisine de aynı `@deprecated` notu, aynı test rename stratejisi).

---

## 8. Sprint 188 Follow-up Items

| Önceliği | Madde | Effort | Owner adayı |
|----------|-------|--------|-------------|
| LOW | `@deprecated` JSDoc ekle (prompt-ab-test.ts + prompt-metrics.ts birlikte) | XS (≤30 dk) | doc-writer veya refactorer |
| LOW | `tests/agents/prompt-ab-test.test.ts` import path'ini `prompt-analytics.js`'e yönlendir | XS | refactorer |
| LOW | `prompt-analytics.ts`'e *Reverse-link to stubs* yorumu ekle (merge geçmişi) | XS | doc-writer |
| MED | `docs/reference/`'a `prompt-evolution-architecture.md` ekle (ailesinin haritası: analytics + evolution + version + rollback + metrics + ab-test) | S | architect / doc-writer |
| LOW (opsiyonel) | npm `package.json` `exports` field'ında bu yolun listelenip listelenmediğini kontrol et (external API sızıntısı taraması) | XS | ci-guardian |
| INFO | Sprint 187 per-file-pilot kapsamında `prompt-metrics.ts` audit'i (task 186-011) ile bu raporu çapraz referansla | — | brain (orchestration) |

---

## 9. Summary

`src/agents/prompt-ab-test.ts` — 10 satırlık saf **re-export stub**. Sprint 036'da `prompt-analytics.ts` birleşik modülüne taşınmış A/B testing class'ı (`PromptABTester`) ve 3 type için backward-compatibility shim'i. Production reverse-dep **sıfır**; sadece bir test dosyası (`tests/agents/prompt-ab-test.test.ts`) bu path üzerinden import ediyor.

- **Korunma durumu:** Sağlıklı. `@deprecated` JSDoc eksikliği dışında yapısal problem yok.
- **ADR uyumu:** ADR-001/002/008/010 tam uyumlu. ADR-038 (dead-code disposition) ve ADR-041 (agent taxonomy) advisory; ADR-048 dolaylı ilgili ama ihlal yok.
- **Dead-code kararı:** **Retain + deprecate.** Maintenance maliyeti sıfıra yakın, breaking-change riskini ortadan kaldırır, IDE uyarısı doğal migration yolu sağlar.
- **Sprint 188 öncelik:** LOW — `prompt-metrics.ts` (6 LoC, task 186-011) ile cluster halinde tek "agent-evolution stub disposition" task'i altında ele alınmalı.
- **Cold-start cascade test gözlemi (sprint-186):** Bu task daha önce başlatılan worker (`docker-186-008`) tarafından `partial-result` aşamasında bırakılmış (`OOM-killed or force-stopped`). Yeni worker (sprint-187 retry, `w-186-008`) audit'i tamamladı — kontrol denemesinin cold-start cascade pattern'ini doğruladığı not edilmeli (Brain auto-recovery + retry path başarılı).
