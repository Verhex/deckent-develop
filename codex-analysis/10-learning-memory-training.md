# 10 — Learning, Memory, Training and Promotion

## Mevcut closed-loop parçaları

Sprint finalizer:

- Task evaluation/outcome'u legacy V2 learnings veya V3 cells'e kaydeder.
- Prompt version usage stats günceller.
- Agent/skill stats sidecar'ını günceller.
- Rule evolution çalıştırır.
- Promotion/demotion evaluate ve execute eder.

Bu gerçek production wiring'dir; sistem “hiç öğrenmiyor” denemez.

## Closure sorunları

### Fail-soft pipeline

Learning ve promotion blokları geniş `try/catch` ile non-fatal yürür. Sprint complete olabilirken outcome/cell/stats/promotion side effect'leri kaybolabilir. Completion settlement, learning lineage completeness'i ifade etmez.

### Training trace

EVALUATE/FIX aşamalarında trace producer wired'dır; output collector write hatasını yutar ve trace default/config koşulludur. `src/training/pipeline.ts::runPipeline` için production ingress bulunmamıştır; test callers dışında trace→validate→corpus→promotion workflow'u yoktur. Sonuç: trace capture PARTIAL, training pipeline UNWIRED.

### Promotion policy

Task count/success rate kalıcı mutation için yeterli görülür; declared `minSprints` kullanılmaz. Cross-provider evaluator, canary, rollback ve approval authority yoktur. Outcome pollution, correlated retries veya stale stats permanent agent identity'yi etkileyebilir.

### Memory authority ayrımı

Dogfood core memory repo-local `.deckent/docs/core-memory` authority'si, Brain project knowledge `.brain/memory.db`, ürün kullanıcı belleği ise ayrı bir product concern olmalıdır. Current memory DB tenant modelinin enterprise gap'leri UserMemory'ye taşınmamalıdır.

## Hedef loop

```text
Operation evidence
 → outcome attribution
 → quality/evaluator receipt
 → tenant-safe learning cell
 → policy-qualified candidate
 → independent verification
 → owner/authority approval
 → canary rollout
 → measured promotion or rollback
```

Her ok durable lineage/ref taşır. Eksik trace veya evaluator promotion'ı `HOLD` eder; sprint completion'ı değil.

## Verdict

- Outcome learning: **PARTIAL/REAL**
- Routing cells: **PARTIAL/REAL**
- Training corpus pipeline: **UNWIRED**
- Promotion governance: **NO-GO/HOLD**
- Product UserMemory: **NOT-STARTED/PARTIAL contracts**
