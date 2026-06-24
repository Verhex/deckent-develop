# LIFECYCLE-ROBUSTNESS FIX PLAN — sprint-323'ün 3 P0-bug'ı (CC-elkodu, karpathy)

> ## ✅ 3 P0 DONE (2026-06-24): P0-A `888f8326` (cascade-skip) · P0-B `14e95e91` (sentinel-clobber-guard) · P0-C `a1fb52de` (orphan-finalize-kill). Her biri faithful RED→GREEN + tsc=0 + affected-suite; FINAL broad-suite 17097 pass/0-fail. KALAN: build + restart (Alperen) → küçük live-verify-sprint.

> **CC-hand-coded** (deckent-worker DEĞİL — kendi sprint-lifecycle-çekirdeği bozuk + P0 bug'lar tam orada;
> deckent-sprint koşmak hang/clobber riski). Her fix: D1 (read+plan) → D3 (surgical) → D4 (faithful-test).
> Kaynak: DECKENT-TRIAGE-PLAN.md sprint-323 P0-A/B/C. Doğrulama tsc+vitest (kaynak); build+restart EN SONDA.

## P0-A — NO_GO-dependency cascade-gap → EXECUTE-HANG (en kritik, hang-kökü)
**Bug:** dep-blocked-on-NO_GO task'lar (027/028/030 ← 002/007/008-NO_GO) ne dispatch oluyor ne EXECUTE-wait-loop'ta cascade-skip ediliyor → `waitForResults` (result-collector.ts:1080 `collected===total`) sonsuza bekliyor → EXECUTE bitmiyor → EVALUATE/FIX hiç çalışmıyor. `applyFailureCascade`/`decideCascadeAction` SPAWN-zamanında (sprint-spawner.ts:1206) wire'lı, EXECUTE-loop'ta değil.
**Fix yönü:** EXECUTE-wait-loop'ta, bir task'ın dependency'si NO_GO/fail olduğunda dependent'i **cascade-skip** et (skipped/blocked-result yaz) → `collected` effective-total'a ulaşır → EXECUTE doğal biter → EVALUATE→FIX. (applyFailureCascade'i waitForResults dispatch-tick'ine wire et VEYA dep-unsatisfiable'ı expected'tan düş.) **+ EK SAFETY: no-progress-watchdog** (N-dk yeni-result-yok → force-finalize) — ANY hang'i kapatır (B-COLLISION-HANG dahil), config'li.
**Files:** src/orchestra/result-collector.ts (+ dependency-scheduler.ts). **Faithful:** dep-NO_GO'lu dependent → EXECUTE-loop cascade-skip → sprint biter (pre-fix: sonsuz-bekler RED).

## P0-B — B-SENTINEL-CLOBBER on finalize-archive
**Bug:** `finalize --force` .result'ları arşive taşıyınca honest-gate "yok" sanıp `worker-crashed-no-result` NO_GO-sentinel'le gerçek-result'ları EZİYOR (`workerId:brain-honest-gate`). Faz-1 `isConfirmedStub` disk-evidence-fix'i finalize-archive-race'i kapsamadı.
**Fix yönü:** honest-gate `.result-absent`'ı "sprint zaten finalize-edilmiş/arşivlenmiş mi" diye ayırt etsin → finalize-sonrası clobber-ETME (VEYA finalize-path honest-gate-koşmasın / arşiv-state'i honest-gate'e bildir).
**Files:** src/orchestra/result-evaluator.ts veya sprint-phases.ts (honest-gate). **Faithful:** finalize-edilmiş-sprint + arşivlenmiş-result → honest-gate sentinel-YAZMAZ (pre-fix: clobber RED).

## P0-C — orphan-process on `finalize --force`
**Bug:** finalize --force orijinal hung start-process'i öldürmüyor → linger + 4h-timeout'ta re-clobber + lock-riski.
**Fix yönü:** finalize --force, aktif-sprint'in start-process-pid'ini (kayıt) tespit edip SIGTERM göndersin (VEYA en az "PID X hâlâ çalışıyor, kill et" uyarısı bassın + pid-yaz).
**Files:** src/cli/commands/finalize.ts. **Faithful:** finalize --force + kayıtlı-pid → SIGTERM/uyarı (pre-fix: pid yok-sayılır RED).

## Sıra & Verify
P0-A (hang-kökü) → P0-B (clobber) → P0-C (orphan). Her fix: tsc=0 + faithful (git-stash RED→GREEN) + affected-suite-vs-baseline (0-yeni-regresyon) + commit+push. **3'ü bitince: `npm run build` + MCP/bot restart (Alperen) → küçük live-verify-sprint (2-task, biri NO_GO-dep → no-hang + finalize teyit).**
