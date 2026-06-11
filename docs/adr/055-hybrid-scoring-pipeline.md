# ADR-055: Hybrid Scoring 5-Layer Pipeline — Schema / Gates / Quality / Outcome / Auditor

**Status:** proposed

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-12

**Sprint:** Sprint 156

---

## Status

proposed (Sprint 156 — EffectClass seed implementasyonu T-011'de tamamlandı; tam pipeline ayrı sprint'e bırakıldı)

---

## Context

Deckent'in değerlendirme sistemi Sprint 139'a kadar `result-evaluator.ts` içindeki tek bir `DEFAULT_RUBRIC` etrafında yapılandırılmıştı. Bu rubrik dört kriter içeriyordu: `correctness`, `test_coverage`, `scope_compliance`, `documentation`. Basit ve tahmin edilebilirdi, ancak birkaç sistemsel sorunun kaynağıydı:

**Sprint 153 ve Sprint 154 Bug B:** Audit raporları ve doküman yazma görevleri `test_coverage: null` döndürüyordu. Rubrik bu alanı zorunlu sayıyordu. Sonuç: geçerli çıktılar üretilmesine rağmen `NO_GO` kararı. ADR-053 (TaskType Taxonomy) bu hatayı rubriği görev tipine göre seçerek giderdi — ancak bu düzeltme değerlendirmenin **şeklini** değiştirdi, **derinliğini** değil.

**Tek katmanlı değerlendirmenin kör noktaları:**
1. **Schema geçersizliği önceden yakalanmıyor.** Bir `.result` dosyası eksik alan içeriyorsa değerlendirme skoru hesaplanmaya çalışır, ancak anlamsız bir skora ulaşır. Schema doğrulaması skorlamadan önce yapılmalıydı.
2. **Gate koşulları yoktu.** Bazı durumlar sayısal skor olmaksızın kesin `NO_GO` gerektiriyordu: scope ihlali, ADR compliance hatası, heartbeat zaman aşımı. Bu koşullar rubrik içinde `0` ağırlıklı kriterler olarak temsil ediliyordu — doğru yapı değildi.
3. **EffectClass (reversibility) skor üzerinde etkisi yoktu.** `critical-irreversible` görevler daha yüksek `correctness` eşiği veya zorunlu Auditor doğrulamasına tabi olmalıydı; ancak tek rubrik bunu ifade edemiyordu.
4. **Auditor ve Brain bağımsız değerlendirme yapıyordu.** Auditor kendi scan sonuçlarını `.dashboard` dosyasına yazıyordu; Brain ise yalnızca `.result` dosyasını okuyordu. İki perspektif birleştirilmiyordu.
5. **Outcome verisi geri besleme döngüsüne girmiyordu.** Görev tipine ve EffectClass'a göre geçmiş outcome verileri (başarı oranı, token kullanımı) değerlendirmeyi etkileyen bir sinyal olabilirdi.

Bu sorunların toplamı, değerlendirmenin yüzeysel kaldığını ve gerçek görev kalitesini her zaman doğru yansıtmadığını ortaya koydu. Daha derin, çok katmanlı bir değerlendirme altyapısına ihtiyaç vardı.

---

## Decision

**5-katmanlı Hybrid Scoring Pipeline** tasarlanır. Her katman girdiye bağımsız olarak çalışır ve kendi kararını `PipelineLayerResult` olarak üretir:

```
Layer 1: Schema Validation
  ↓ PASS / FAIL (hard gate)
Layer 2: Gate Conditions
  ↓ PASS / BLOCK (hard gate)
Layer 3: Quality Scoring
  ↓ numeric score [0–100]
Layer 4: Outcome Weighting
  ↓ weighted score [0–100]
Layer 5: Auditor Verification
  ↓ auditor signal (optional, async)
       ↓
  Final Decision: DONE / GO_WITH_TECH_DEBT / NO_GO
```

### Katman 1 — Schema Validation

Her `.result` dosyası önce JSON schema'ya karşı doğrulanır. Eksik zorunlu alanlar (`taskId`, `selfAssessment`, `filesChanged`, `tokenUsage`) pipeline'ı durdurur ve doğrudan `NO_GO` döndürür. Bu doğrulama zaten Sprint 155'te `validateResultSchema()` fonksiyonu ile hayata geçirilmiştir — ADR-055 bu davranışı resmen Layer 1 olarak sınıflandırır.

```typescript
interface Layer1Result {
  pass: boolean;
  missingFields: string[];
  invalidFields: { field: string; reason: string }[];
}
```

### Katman 2 — Gate Conditions

Sayısal skorla ifade edilemeyen ikili (binary) koşullar burada değerlendirilir. Bir gate başarısız olursa pipeline `NO_GO` döndürür; skora ulaşılmaz.

| Gate ID | Koşul | Kaynak |
|---------|-------|--------|
| `G-001` | Scope ihlali yok (`git diff --stat` scope dışı dosya içermemeli) | Auditor scan |
| `G-002` | ADR compliance: görev sonucu kabul edilmiş ADR'yi ihlal etmemeli | `adr-validator.mjs` |
| `G-003` | Heartbeat timeout aşılmamış | `.hb` dosya timestamp |
| `G-004` | Self-modifying task tespiti negatif | `self-modifying-detector.ts` |
| `G-005` | `critical-irreversible` EffectClass için Alperen onayı alınmış | Checkpoint mechanism |

```typescript
interface Layer2Result {
  pass: boolean;
  blockedByGates: string[];   // gate IDs that failed
  gateDetails: Record<string, string>;
}
```

### Katman 3 — Quality Scoring

ADR-053 tarafından belirlenen görev tipine uygun rubrik (CODE_RUBRIC, AUDIT_RUBRIC, DOC_WRITE_RUBRIC) uygulanır. Mevcut `result-evaluator.ts` mantığı bu katmana karşılık gelir.

```typescript
interface Layer3Result {
  score: number;          // 0–100
  passingScore: number;
  rubricId: 'code' | 'audit' | 'doc-write';
  criteriaBreakdown: Record<string, number>;
}
```

### Katman 4 — Outcome Weighting

EffectClass ve görev tipi bazlı geçmiş outcome verileri (başarı oranı, ortalama retry sayısı) ağırlık çarpanı olarak uygulanır. Bu katman Layer 3 skorunu yukarı veya aşağı çeker:

- `critical-irreversible` görevler: passingScore eşiği 70 → 85 yükseltilir.
- `pure` (audit) görevler: passingScore eşiği 70 → 65 düşürülebilir (no-retry semantics).
- Geçmiş 5 sprint ortalama başarı oranı < %50 olan agent: skor × 0.9 çarpanı.

```typescript
interface Layer4Result {
  adjustedScore: number;    // Layer 3 score × weight
  adjustedThreshold: number;
  effectClass: EffectClass;
  outcomeModifier: number;  // multiplier applied
}
```

### Katman 5 — Auditor Verification (Asenkron)

Auditor'ın bağımsız scan sonuçları (`.dashboard` dosyası) Layer 4 kararını onaylayabilir veya veto edebilir. Bu katman asenkron ve opsiyoneldir; Auditor sonucu zamanında gelmezse varsayılan olarak Layer 4 kararı korunur.

```typescript
interface Layer5Result {
  auditorSignal: 'confirm' | 'veto' | 'absent';
  auditorNotes?: string;
  finalDecision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
}
```

### Final Decision Matrisi

```
Layer1 FAIL              → NO_GO (schema invalid)
Layer2 BLOCK             → NO_GO (gate violated)
Layer4 adjustedScore ≥ adjustedThreshold:
  + Layer5 confirm/absent → DONE
  + Layer5 veto           → GO_WITH_TECH_DEBT
Layer4 adjustedScore < adjustedThreshold:
  + delta < 10            → GO_WITH_TECH_DEBT
  + delta ≥ 10            → NO_GO
```

### Uygulama Yolu

Sprint 156'da yalnızca **seed** tamamlandı:
- Layer 1: `validateResultSchema()` (`result-evaluator.ts`) — canlı
- Layer 3: ADR-053 TaskType rubric selection — canlı
- Layer 4 girdi: `EffectClass` (`rubric-registry.ts` T-011) — canlı

Tam pipeline entegrasyonu Sprint 157+ roadmap:
- `src/orchestra/scoring-pipeline.ts` — yeni modül
- `runScoringPipeline(task, result, auditorSnapshot): ScoringPipelineResult`
- `result-evaluator.ts` yeniden düzenleme: `evaluateResult()` → pipeline çağrısı

---

## Consequences

### Olumlu

- **Daha az yanlış NO_GO.** Schema ve gate katmanları sayısal skor hesaplanmadan önce açık ihlalleri yakalar; rubrik puanlamayı anlamsız vakaların üzerine uygulama riskini ortadan kaldırır.
- **EffectClass entegrasyonu.** `critical-irreversible` görevler artık yüksek eşikle ve zorunlu onay gapıyla değerlendirilir. ADR-037 RBAC ile uyumlu.
- **Auditor-Brain entegrasyonu.** İki bağımsız perspektif (Brain değerlendirmesi + Auditor scan) birleştirilerek daha güvenilir kararlar üretilir. ADR-035 doğrulama protokolü bu birleşimi zaten öngörüyordu.
- **Genişletilebilirlik.** Yeni gate koşulları (`G-006`, ...) pipeline'a eklenir; mevcut rubrik değişmez. Yeni katmanlar (Layer 6: ML scoring) ileride eklenebilir.
- **Gözlemlenebilirlik.** Her katman kendi `PipelineLayerResult`'ını üretir; sprint metriklerine her katmanda hangi kararın verildiği kaydedilebilir. "Layer 2'de bloklanan task sayısı" gibi metrikler NO_GO sebeplerini ayrıştırır.

### Olumsuz

- **Pipeline gecikmesi.** 5 katmanın ardışık çalışması değerlendirme süresini artırır. Layer 5 (async Auditor) bekleme süresi sprint toplam süresini uzatabilir. Timeout mekanizması zorunlu.
- **Karmaşıklık artışı.** `result-evaluator.ts`'in tek-fonksiyon yapısından pipeline mimarisine geçiş test yükümlülüğü doğurur. Her katmanın birim testi yazılmalıdır.
- **Gate G-005 (Alperen onayı) bloklama riski.** `critical-irreversible` görevlerde Alperen cevap vermezse sprint donar. Timeout + fallback (GO_WITH_TECH_DEBT + onay kuyruğu) tasarlanmalıdır.
- **Outcome verisi bootstrap sorunu.** Layer 4 geçmiş başarı oranlarına güvenir; ancak yeni bir agent veya görev tipi için bu veri yoktur. `outcomeModifier = 1.0` (nötr) başlangıç değeri ile bootstrap edilmelidir.

---

## Related ADRs

- **ADR-035** — Verification Protocol Standard: Layer 5 (Auditor Verification) bu ADR'nin `CODE_VERIFY_REQUEST` / `VERIFICATION_RESULT` kanallarını kullanır.
- **ADR-036** — ADR Governance: Layer 2 Gate G-002 (`adr-validator.mjs` entegrasyonu) bu ADR tarafından yönlendirilir.
- **ADR-037** — RBAC Protocol: Layer 2 Gate G-005 (Alperen onayı) `critical-irreversible` görevler için RBAC gate gerektirir.
- **ADR-041** — Agent Taxonomy: Layer 4 outcome weighting, agent başarı oranı verilerini `agent-pool.ts` kayıtlarından çeker.
- **ADR-053** — TaskType Taxonomy (proposed): Layer 1 ve Layer 3'e görev tipi bilgisi sağlar.

---

## Notes

Bu ADR Sprint 156 T-011 (EffectClass Annotation) çalışması sırasında ortaya çıkan mimari vizyonu belgeler. `rubric-registry.ts:197` içindeki `// ADR-055 placeholder` yorumu bu ADR'ye işaret eder. Tam uygulama Sprint 157+ roadmap kapsamındadır.

> **Note (verified vs code, Sprint 172 — `proposed` doğru statü):** Yalnız **seed** kod-doğrulandı:
> - **Layer 1** `validateResultSchema()` → `src/orchestra/result-evaluator.ts:509` mevcut (call `:992`) ✓
> - **Layer 3** ADR-053 TaskType rubric selection → `rubric-registry.ts` (ADR-053 notunda doğrulandı) ✓
> - **Layer 4 girdi** `EffectClass` → `src/orchestra/rubric-registry.ts:259` mevcut; placeholder yorumu `:220` (`EffectClass — Reversibility Tag (ADR-055 placeholder)`), `:255 @see ADR-055 (proposed, Sprint 156)` — kod kendisi `proposed` işaretler.
>
> **Çekirdek karar GERÇEKLEŞMEDİ (gövde gelecek-zamanlı kalmıştır):** `src/orchestra/scoring-pipeline.ts` **yoktur**; `runScoringPipeline` / `ScoringPipelineResult` / `PipelineLayerResult` sembolleri `src/` genelinde **hiç yoktur**. Layer 2 (Gate Conditions G-001..G-005), Layer 5 (Auditor Verification), Final Decision Matrix ve orkestrasyon katmanı uygulanmadı. "Sprint 157+ roadmap" hedefi **geçti ve gerçekleşmedi** (Sprint 172).
>
> **Statü gerekçesi (ADR-053 kontrastı):** ADR-053 terfi etti çünkü çekirdeği (3-tip taxonomy) shipped'di. ADR-055'in çekirdeği = 5-katman pipeline'ın **kendisi** ve o inşa edilmedi — yalnız çevresel seed'ler mevcut. Bu nedenle status doğru biçimde **`proposed` kalır** (terfi dürüst olmazdı). Satır drift'i: ADR `:197` → gerçek `:220`. Behavior unchanged; documentation alignment only.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review): Hedef-gerçekleşme haritası — organik birikme vs formal pipeline

**Classification: BOTH** (değerlendirme derinliği/güvenilirliği ürün-kanunu; şekil-kararı hâlâ açık).

**Statü `proposed` KALIR** — formal pipeline hâlâ yok (`scoring-pipeline.ts` mevcut değil, `runScoringPipeline`/`ScoringPipelineResult` 0-sembol, 2026-06-11 doğrulandı). Ancak ADR'nin **hedefleri** o tarihten bu yana pipeline-şekli OLMADAN, organik olarak büyük ölçüde gerçekleşti:

| ADR-055 katmanı | Organik gerçekleşme (kod-doğrulandı) |
|---|---|
| Layer 1 Schema | `validateResultSchema` canlı (zaten seed) ✓ |
| Layer 2 Gates | **honest-gate** (`result-evaluator.ts` ~16 ref) + `reconcileSpuriousNoGo` + disk-verify gate + `applyTechDebtDowngrade` — gate'ler evaluator'a organik birikti (formal G-001..G-005 registry'si değil) |
| Layer 3 Quality | tip-rubrik (ADR-053) + **WM-7 `criteria-deriver`** (TaskKind × TechStack iki-eksen) ✓ |
| Layer 4 EffectClass/Outcome | EffectClass → **otonom policy-gate G3** (WM-6, Sprint 241): riskli sınıflar park = G-005 ruhu ENFORCE (otonom motorda) |
| Layer 5 Bağımsız doğrulama | **XVER-1 cross-verify** (Sprint 276): farklı-provider adversarial verify, advisory-sinyal olarak evaluation'a akar (`src/core/cross-verify.ts` + `.result.crossVerify` field) |
| "Az yanlış NO_GO" hedefi | **ADR-070** Brain Evaluation Integrity — signal-based coverage exemption (`coverageOptional`), NaN-guard, verdict-persist |

**Açık mimari opsiyon (bu ADR'nin kalan değeri):** evaluator'daki organik gate-birikimi tam da bu ADR'nin öngördüğü yapısal soruna dönüşüyor (tek-modülde katman-karışımı). 5-katman pipeline-şekli, bu organik mekanizmaları **konsolide eden gelecek-refactor hedefi** olarak `proposed` kalır (MASTER-PLAN §A canonical work-model temeli + ADR-026 god-object-split deseniyle uyumlu). Karar o refactor gündeme geldiğinde verilir: pipeline-şekline taşı (bu ADR accept edilir) ya da organik mimariyi resmîleştir (bu ADR reject + yeni ADR). md+db senkron (Alperen ADR-review).
