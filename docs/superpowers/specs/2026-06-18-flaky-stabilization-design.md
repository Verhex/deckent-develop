# Flaky-Test Stabilization — Tasarım Spec'i (3 küme)

> **Durum:** Tasarım onaylandı (Alperen, 2026-06-18). Branch: `feat/flaky-stabilization` (main `1af637fa` üstünde).
> **Bağlam:** Doc-tracking Faz 1+2 merge'lerinin ci-sim'lerinde gözlenen pre-existing flaky küme (doc-tracking'ten bağımsız, baseline worktree ile doğrulandı). 3 bağımsız kök-neden → decompose.

## 1. Amaç

`npm run test:ci-sim`'deki nondeterministik failure'ları kalıcı olarak gidermek — CI yeşil-kararlılığını yükseltmek. Üretim davranışı KORUNUR; değişiklikler test-katmanı + minimal test-only prod-yardımcı.

## 2. Kümeler ve kök-neden (file:line kanıtlı)

### Küme 1 — heartbeat-staleness (test-hermetiklik)
- **Testler:** `tests/core/observability-instrument-points.test.ts` (`scanHeartbeats` hb.stale metric), `tests/integration/lifecycle.test.ts` (Auditor scan — stale heartbeat).
- **Belirti:** Stale HB (`timestamp = now-5dk`, `sequence:1`, no `.result`) + `scanHeartbeats(root, 30_000)` → 0 alert beklenirken 0; deterministik değil (kümede/parallel'de pollute).
- **Kök:** `src/monitor/auditor.ts` modül-seviye mutable cache'ler: `heartbeatCache` (line 50, `lastSequence` taşır → Signal C) + `livenessCache` (line 166 → Signal B). `clearLivenessCache()` var ama **`heartbeatCache` için reset export YOK**. Suite genelinde paylaşılan state → test-sıra/parallel bağımlı; `isWorkerStale`'in secondary-signal'leri (B liveness / C sequence) yanlış "alive" verince stale-alert bastırılıyor.
- **Fix:** test-only `__resetAuditorCaches()` export (heartbeatCache + livenessCache + varsa diğer modül-state'i temizler) + heartbeat-staleness testlerinde `beforeEach(__resetAuditorCaches)`. Gerekirse `isWorkerStale` çağrı-yolunda test-injectable liveness (deterministik). **Üretim davranışı değişmez** (reset yalnız test-çağrılı; prod scan-loop kendi cache-yönetimini sürdürür). Empirik: izolasyonda reprodüksiyon → tam-bastıran sinyali instrument → reset/inject ile deterministik yeşil (N-run).

### Küme 2 — finalize-slowness (timeout)
- **Testler:** `tests/cli/finalize-refinalize.test.ts` (V2 recordOutcome, jobs-summary, --force counts, double-finalize ×4-6).
- **Belirti:** "Test timed out in 10000ms" — CI-load-altında. `spawnSync` zaten mock'lu (line 41 — gerçek subprocess YOK); yavaşlık ağır better-sqlite3 / fs I/O'dan.
- **Kök:** Testler **meşru ağır** (gerçek finalizeSprint DB-akışı), buggy değil; vitest default 10s parallel-load-altında yetersiz.
- **Fix:** Ağır finalize E2E testlerine per-test timeout `{ timeout: 30_000 }` (vitest 3. arg). Davranış/assert değişmez — yalnız bütçe.

### Küme 3 — docker-backend (timing-robustness)
- **Test:** `tests/e2e/docker-backend.test.ts` (`container is removed after natural exit via monitorContainer`, line 298, `it.skipIf(!dockerAvailable)`).
- **Belirti:** docker-READY iken (daemon + `deckent-worker:latest` image var) koşar; "container removed" assertion `expected false to be true` — container henüz silinmemişken assert (timing-race).
- **Kök:** `monitorContainer` doğal-çıkıştan sonra container'ı async siler; test sabit-an assert ediyor.
- **Fix:** container-removal'ı **poll/retry-with-timeout** ile bekle (sabit assert yerine, ~5s bütçe, 100ms aralık), sonra assert. `skipIf(!dockerAvailable)` korunur (docker yoksa skip).

## 3. Mimari / dosya envanteri

| Dosya | Tür | Sorumluluk |
|---|---|---|
| `src/monitor/auditor.ts` | MODIFY | `__resetAuditorCaches()` test-only export (heartbeatCache + livenessCache reset) |
| `tests/core/observability-instrument-points.test.ts` | MODIFY | `beforeEach(__resetAuditorCaches)` + deterministik liveness |
| `tests/integration/lifecycle.test.ts` | MODIFY | aynı hermetik-reset |
| `tests/cli/finalize-refinalize.test.ts` | MODIFY | ağır testlere `{ timeout: 30_000 }` |
| `tests/e2e/docker-backend.test.ts` | MODIFY | container-removal poll/retry helper |

## 4. Doğrulama

- Her küme: ilgili test dosyası **izolasyonda + birlikte (cross-file)** deterministik yeşil (≥3 ardışık run — nondeterminizm gitti).
- `npx tsc --noEmit` temiz; mevcut auditor/finalize/docker testleri (geçenler) yeşil kalır (lossless).
- Final: `npm run test:ci-sim` — bu 3 küme artık fail etmez (kalan failure'lar varsa baseline-doğrula).

## 5. Kısıtlar (bağlayıcı)

- **Üretim davranışı değişmez** — `__resetAuditorCaches` test-only; `isWorkerStale`/`scanHeartbeats`/`finalizeSprint`/`monitorContainer` prod-mantığı korunur.
- **Hermetik:** tmpdir, async spawn, `spawnSync` yalnız test-setup.
- **Surgical:** yalnız listelenen dosyalar; mevcut geçen testler bozulmaz.
- **No new dep** (ADR-010).
- **Empirik:** her fix, gerçek failing test'i deterministik-yeşil yapmakla kanıtlanır (mock-only yetmez).

## 6. Çıktı

Ayrı branch `feat/flaky-stabilization` → TDD plan → uygula → doğrula → main'e merge (Faz deseni: overlap-check + ff). Bağımsız küme olduğundan tek spec/plan yeterli (decompose içinde 3 cerrahi fix).
