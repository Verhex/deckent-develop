# Flaky-Test Stabilization — Tasarım Spec'i (3 küme)

> **Durum:** Tasarım onaylandı (Alperen, 2026-06-18). Branch: `feat/flaky-stabilization` (main `1af637fa` üstünde).
> **Bağlam:** Doc-tracking Faz 1+2 merge'lerinin ci-sim'lerinde gözlenen pre-existing flaky küme (doc-tracking'ten bağımsız, baseline worktree ile doğrulandı). 3 bağımsız kök-neden → decompose.

## 1. Amaç

`npm run test:ci-sim`'deki nondeterministik failure'ları kalıcı olarak gidermek — CI yeşil-kararlılığını yükseltmek. Üretim davranışı KORUNUR; değişiklikler test-katmanı + minimal test-only prod-yardımcı.

## 2. Kümeler ve kök-neden (file:line kanıtlı)

### Küme 1 — heartbeat-staleness (test-hermetiklik)
- **Testler:** `tests/core/observability-instrument-points.test.ts` (`scanHeartbeats` hb.stale metric), `tests/integration/lifecycle.test.ts` (Auditor scan — stale heartbeat).
- **Belirti:** Stale HB (`timestamp = now-5dk/200s`, `sequence`, no `.result`) + `scanHeartbeats` → alert beklenirken 0. İzolasyonda **da** fail → flaky değil, **deterministik pre-existing failure** (baseline'da da).
- **Kök (systematic-debug ile DOĞRULANDI):** `scanHeartbeats` (auditor.ts:505-510) staleness-yaşını **dosya MTIME**'ından hesaplar (Sprint 139 "Bug-1" clock-skew-proof fix), embedded `hb.timestamp`'ten DEĞİL; `isWorkerStale` de aynı mtime sinyalini kullanır (kod-yorumu 502-504). Testler `.hb`'yi **şimdi** yazıp embedded-timestamp'i eski set ediyor → dosya-mtime taze → "fresh" → stale-alert yok. Test, mtime-tabanlı tasarıma uymuyor (**bayat test**, cache/hermetiklik DEĞİL — ilk hipotez yanlıştı).
- **Fix:** Testlerde `.hb` yazımından sonra dosya **mtime'ını backdate et** (`utimesSync(hbPath, staleEpoch, staleEpoch)`) → prod'un kullandığı sinyalle gerçekten stale. **Üretim kodu doğru, dokunulmaz** (mtime-tabanlı clock-skew-proof tasarım kasıtlı). Empirik: observability + lifecycle testleri fix sonrası deterministik yeşil.

### Küme 2 — finalize-slowness (timeout)
- **Testler:** `tests/cli/finalize-refinalize.test.ts` (V2 recordOutcome, jobs-summary, --force counts, double-finalize ×4-6).
- **Belirti:** "Test timed out in 10000ms" — CI-load-altında. `spawnSync` zaten mock'lu (line 41 — gerçek subprocess YOK); yavaşlık ağır better-sqlite3 / fs I/O'dan.
- **Kök:** Testler **meşru ağır** (gerçek finalizeSprint DB-akışı), buggy değil; vitest default 10s parallel-load-altında yetersiz.
- **Fix:** Ağır finalize E2E testlerine per-test timeout `{ timeout: 30_000 }` (vitest 3. arg). Davranış/assert değişmez — yalnız bütçe.

### Küme 3 — docker-backend (timing-robustness)
- **Test:** `tests/e2e/docker-backend.test.ts` (`container is removed after natural exit via monitorContainer`, line 298, `it.skipIf(!dockerAvailable)`).
- **Belirti:** docker-READY iken koşar; "container removed" `expected false to be true` — 10s poll (test ZATEN poll/retry'lı) sonrası container hâlâ silinmemiş.
- **Kök (reprodüksiyon ile DOĞRULANDI):** test, spawn'lanan **claude worker container'ının hızlı doğal-çıkış** yaptığını varsayıyor; ama claude container auth/input olmadan **self-exit etmiyor** → `monitorContainer`'ın doğal-çıkış-temizliği hiç tetiklenmiyor → container linger. Poll uzatmak çözmez (container hiç çıkmıyor). Prod `monitorContainer` doğru.
- **Fix:** Doğal-çıkış-bağımlı bu e2e'yi **explicit opt-in** (`DECKENT_DOCKER_E2E=1`) arkasına al (`dockerE2eEnabled = dockerAvailable && env`). `test:ci-sim` (flag yok) → deterministik **skip**; kontrollü docker-e2e env'de → koşar. Sessiz-drop DEĞİL (belgeli + on-demand). Diğer 34 docker testi `dockerAvailable` ile koşmaya devam.

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
