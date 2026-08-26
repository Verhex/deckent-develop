<!-- DECKENT:WORKSPACE id="worker-guide" schema="1" authority="managed" provenance="workspace-artifact-registry" -->
# Worker Guide

## Worker Contract
<!-- DECKENT:CONTRACT id="worker-guide" schema="1" sha256="2de8b00e407fa801484f7f61cc8ecd32943e05ec54fd1eafc2fb8c7976a39639" -->
Bu contract worker runtime schemaları ve prompt policy üzerinden üretilir. Supporting contexttir; compiled ve digest-bound task prompt attempt authority olarak kalır.

### Result ingress ve canonical result

Worker `.tasks/task-{id}.result` ingress claimlerini yazar: `taskId`, `workerId`, `filesChanged` (string array), `linesAdded`, `linesRemoved`, `testsPassed` (boolean), `coverage` (0–100), `selfAssessment` ve `notes` (tek string). Token usage tahmini yapma. Provider/model, token/cost, disk diff, test ve TypeScript kanıtı canonical schema `1.0` sonucunda host tarafından yazılır.

Canonical schema-required alanlar (runtime’da türetilir): `cost, filesChanged, model, provider, selfAssessment, taskId, tests, tokenUsage, totalLinesAdded, totalLinesRemoved, tsc, workerId`.

### Heartbeat

İşe başlamadan `.tasks/task-{id}.hb` oluştur. `sequence` değerini artır; taze UTC ISO timestamp kullan; `currentAction` kısa olsun. Heartbeat içeriği activity contexttir—tek başına process-liveness veya terminal authority değildir.

### Objective Definition of Done

- DONE — Her Definition-of-Done maddesi kanıtla doğrulandı.
- GO_WITH_TECH_DEBT — Core maddeler doğrulandı; her minor açık madde exact olarak adlandırıldı.
- NO_GO — En az bir critical madde doğrulanmadı; exact blocker adlandırıldı.

Percentage threshold yoktur. Verdicti her kriterin kanıtı belirler.

### Verification ve honest-result gate

`.verify-ran` marker verifier-authored kanıttır; elle oluşturma veya varmış gibi claim etme. DONE öncesi baseline, end state ve gerçek kriter kanıtını karşılaştır. Bir dependency settle olmadıysa busy-wait yapma veya `processQueue` üzerinden başarı varsayma; exact NO_GO/HOLD koşulunu bildir.

### Scope, ADR-037 authority ve yasak anti-patternler

`scope.filesWrite` exact write allow-listtir; `.tasks/` altındaki protocol artefaktları tek lifecycle istisnasıdır. Worker içinden dependency mutation veya project-wide build çalıştırma. Gerekli capability veya authority unavailable ise completion uydurmak yerine concrete NO_GO/HOLD nedeni yaz.

| Anti-pattern | Durum | Neden |
|---|---|---|
| Gerekçesiz `it.skip(...)` | yasak | başarısız kanıtı gizler |
| `stub()` veya hardcoded boş implementation | yasak | false GO üretir |
| `scope.filesWrite` dışına yazma | yasak | ADR-037 authority ihlalidir |
| verifier kanıtı olmadan DONE claim etme | yasak | honest-result gate ihlalidir |

### Engine-aligned lifecycle

Write the task heartbeat exactly once at startup. It is activity context, not a refresh-based process-liveness lease.

Publish progress with a provider-neutral, monotonically increasing proposal sequence token. A greater token proves progress; wall-clock freshness alone does not.

The worker result is ingress, not canonical settlement. Publish the bounded, attempt-bound execution-landing proposal; the execution-landing coordinator validates and republishes it before the host finalizer settles the canonical result.
<!-- DECKENT:CONTRACT:END id="worker-guide" -->
