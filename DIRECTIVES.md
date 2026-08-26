# FULL-SUITE TRUTH REPAIR (generated -- deterministic)

## Goal

Listedeki kirmizi test dosyalarini BUGUNKU landed src kontratina hizala. Kirmizilar
bayat pin / eski kontrat sinifidir; urun regresyonu kanitlanirsa dosyaya dokunmadan
NO_GO + exact kanit yazilir.

## Execution contract

- Otorite: main'deki src davranisi. Assertion ZAYIFLATILMAZ, test silinmez/skip'lenmez.
- Yalnizca kendi Files listendeki test dosyalarina yaz; Reads listendeki src
  dosyalarini kontrati ogrenmek icin OKU (yazma).
- Testler hermetik kalir; VITEST_MAX_FORKS=2 disina cikma.
- Her dosya icin kosum kaniti .result notes'ta; urun-bug kanitinda NO_GO + src dosya:satir.


## Task 1: Align failing api/cli suites (cluster 1) to landed contracts
- Files: tests/api/config-editor.test.ts, tests/api/server-security.test.ts, tests/api/server.test.ts, tests/cli/commands.test.ts, tests/cli/commands/config-export.test.ts, tests/cli/commands/config-overhaul.test.ts, tests/cli/commands/config.test.ts, tests/cli/commands/finalize.test.ts, tests/cli/commands/init.test.ts, tests/cli/commands/review-finalize-overhaul.test.ts, tests/cli/commands/status.test.ts, tests/cli/config-global.test.ts
- Reads: src/agents/worker.ts, src/api/server.ts, src/api/sprint-job-runner.ts, src/api/watcher.ts, src/cli/auto-setup.ts, src/cli/commands/attach.ts, src/cli/commands/cleanup.ts, src/cli/commands/config.ts, src/cli/commands/doctor.ts, src/cli/commands/finalize.ts, src/cli/commands/history.ts, src/cli/commands/init.ts, src/cli/commands/kill.ts, src/cli/commands/onboard.ts, src/cli/commands/plan.ts, src/cli/commands/plugin.ts, src/cli/commands/retro.ts, src/cli/commands/review.ts, src/cli/commands/spawn.ts, src/cli/commands/start.ts, src/cli/commands/status.ts, src/cli/commands/upgrade.ts, src/cli/helpers/agent-templates.ts, src/cli/helpers/codex-config.ts, src/cli/helpers/config-reader.ts, src/cli/helpers/cursor-config.ts, src/cli/helpers/gemini-config.ts, src/cli/helpers/messages.ts, src/cli/helpers/output.ts, src/cli/helpers/process.ts, src/cli/helpers/prompt.ts, src/cli/helpers/shutdown-hooks.ts, src/cli/helpers/splash.ts, src/cli/helpers/wizard.ts, src/core/analyzer.ts, src/core/config-migration.ts, src/core/config.ts, src/core/constants.ts, src/core/cost-config-loader.ts, src/core/deck-file.ts, src/core/environment.ts, src/core/file-lock.ts, src/core/memory-store.ts, src/core/plugin.ts, src/core/provider.ts, src/core/rule-generator.ts, src/core/run-flow-store.ts, src/core/run-status-authority.ts, src/core/run-status-read-model.ts, src/core/stack-detector.ts, src/core/subscription.ts, src/core/system-profile.ts, src/core/task-result-schema.ts, src/core/task-settlement-authority.ts, src/core/types.ts, src/core/utils.ts, src/monitor/sprint-state.ts, src/orchestra/brain.ts, src/orchestra/run-flow-death-sweep.ts, src/orchestra/run-flow-plan-service.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-docs-updater.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-recovery-operation.ts, src/orchestra/task-artifact-projection.ts, src/orchestra/tmux.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/api/config-editor.test.ts tests/api/server-security.test.ts tests/api/server.test.ts tests/cli/commands.test.ts tests/cli/commands/config-export.test.ts tests/cli/commands/config-overhaul.test.ts tests/cli/commands/config.test.ts tests/cli/commands/finalize.test.ts tests/cli/commands/init.test.ts tests/cli/commands/review-finalize-overhaul.test.ts tests/cli/commands/status.test.ts tests/cli/config-global.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## Task 2: Align failing cli/core/governance/mcp suites (cluster 2) to landed contracts
- Files: tests/cli/finalize-orphan-normal.test.ts, tests/cli/finalize-refinalize.test.ts, tests/cli/init-noninteractive.test.ts, tests/cli/init-outcome-honesty.test.ts, tests/cli/init-repair-failedsteps.test.ts, tests/cli/mode-command.test.ts, tests/cli/mode-run-alias.test.ts, tests/core/global-config.test.ts, tests/core/sprint-work-attribution.test.ts, tests/governance/closure-ledger.test.ts, tests/governance/orphan-deliverables.test.ts, tests/mcp/branch-coverage.test.ts
- Reads: src/agents/worker.ts, src/cli/auto-setup.ts, src/cli/commands/doctor.ts, src/cli/commands/finalize.ts, src/cli/commands/init-wizard.ts, src/cli/commands/init.ts, src/cli/commands/kill.ts, src/cli/commands/mode.ts, src/cli/helpers/agent-templates.ts, src/cli/helpers/codex-config.ts, src/cli/helpers/cursor-config.ts, src/cli/helpers/gemini-config.ts, src/cli/helpers/messages.ts, src/cli/helpers/output.ts, src/cli/helpers/process.ts, src/cli/helpers/prompt.ts, src/cli/helpers/splash.ts, src/cli/helpers/wizard.ts, src/core/agent-types.ts, src/core/analyzer.ts, src/core/config.ts, src/core/constants.ts, src/core/deck-file.ts, src/core/environment.ts, src/core/global-config.ts, src/core/identity-generator.ts, src/core/memory-store.ts, src/core/notify.ts, src/core/provider.ts, src/core/rule-generator.ts, src/core/run-status-authority.ts, src/core/run-status-read-model.ts, src/core/sprint-work-attribution.ts, src/core/stack-detector.ts, src/core/subscription.ts, src/core/system-profile.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/mcp/helpers/format.ts, src/mcp/resources/debt.ts, src/mcp/tools/directives.ts, src/mcp/tools/init.ts, src/mcp/tools/job-runner.ts, src/mcp/tools/retro.ts, src/mcp/tools/start.ts, src/mcp/tools/status.ts, src/monitor/auditor.ts, src/orchestra/brain.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-recovery-operation.ts, src/orchestra/sprint-reporter.ts, src/orchestra/task-restoration.ts, src/orchestra/tmux.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/finalize-orphan-normal.test.ts tests/cli/finalize-refinalize.test.ts tests/cli/init-noninteractive.test.ts tests/cli/init-outcome-honesty.test.ts tests/cli/init-repair-failedsteps.test.ts tests/cli/mode-command.test.ts tests/cli/mode-run-alias.test.ts tests/core/global-config.test.ts tests/core/sprint-work-attribution.test.ts tests/governance/closure-ledger.test.ts tests/governance/orphan-deliverables.test.ts tests/mcp/branch-coverage.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## Task 3: Align failing mcp/orchestra suites (cluster 3) to landed contracts
- Files: tests/mcp/nervous-tools-e2e.test.ts, tests/mcp/nervous-tools.test.ts, tests/mcp/tools-enrichment.test.ts, tests/mcp/tools.test.ts, tests/orchestra/attribution-limit-death.test.ts, tests/orchestra/attribution-unmeasurable-rca.test.ts, tests/orchestra/avgcoverage-repair.test.ts, tests/orchestra/brain-rollback.test.ts, tests/orchestra/brain.test.ts, tests/orchestra/budget-landing-checkpoint-quote-safety.test.ts, tests/orchestra/canonical-wiring-closure.integration.test.ts, tests/orchestra/decay-config-wire.test.ts
- Reads: src/agents/worker-ipc.ts, src/agents/worker.ts, src/cli/commands/status.ts, src/cli/helpers/sprint-summary-rich.ts, src/core/agent-pool.ts, src/core/agent-types.ts, src/core/analyzer.ts, src/core/config.ts, src/core/constants.ts, src/core/debt-store.ts, src/core/execution-landing-proposal.ts, src/core/final-only-usage-containment.ts, src/core/identity-generator.ts, src/core/live-execution-budget.ts, src/core/memory-export.ts, src/core/memory-store.ts, src/core/notify.ts, src/core/observability-rotation.ts, src/core/observability.ts, src/core/plugin-hooks.ts, src/core/prompt-delivery-receipt.ts, src/core/provider-concurrency-runtime-reader.ts, src/core/provider-execution-observation-store.ts, src/core/provider.ts, src/core/run-status-authority.ts, src/core/run-status-read-model.ts, src/core/skill-pool.ts, src/core/skill-types.ts, src/core/sprint-archive.ts, src/core/sprint-file-retention.ts, src/core/stack-detector.ts, src/core/subscription.ts, src/core/system-profile.ts, src/core/task-result-schema.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/mcp/helpers/format.ts, src/mcp/tools/analyze.ts, src/mcp/tools/directives.ts, src/mcp/tools/doctor.ts, src/mcp/tools/history.ts, src/mcp/tools/init.ts, src/mcp/tools/job-runner.ts, src/mcp/tools/nervous.ts, src/mcp/tools/plan.ts, src/mcp/tools/retro.ts, src/mcp/tools/start.ts, src/mcp/tools/status.ts, src/mcp/tools/sync.ts, src/monitor/auditor.ts, src/nervous/action-registry.ts, src/nervous/authority-matrix.ts, src/nervous/history.ts, src/orchestra/baseline-tracker.ts, src/orchestra/brain.ts, src/orchestra/coverage-validator.ts, src/orchestra/debt-manager.ts, src/orchestra/disk-verify.ts, src/orchestra/event-stream.ts, src/orchestra/fix-failure-classification.ts, src/orchestra/planner.ts, src/orchestra/result-collector.ts, src/orchestra/result-evaluator.ts, src/orchestra/result-watcher.ts, src/orchestra/rollback.ts, src/orchestra/run-flow-plan-service.ts, src/orchestra/runtime-budget-monitor.ts, src/orchestra/scheduler-driver.ts, src/orchestra/scheduler-reducer.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts, src/orchestra/sprint-docs-updater.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-pid-manager.ts, src/orchestra/sprint-reporter.ts, src/orchestra/sprint-utils.ts, src/orchestra/task-restoration.ts, src/orchestra/tmux.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/mcp/nervous-tools-e2e.test.ts tests/mcp/nervous-tools.test.ts tests/mcp/tools-enrichment.test.ts tests/mcp/tools.test.ts tests/orchestra/attribution-limit-death.test.ts tests/orchestra/attribution-unmeasurable-rca.test.ts tests/orchestra/avgcoverage-repair.test.ts tests/orchestra/brain-rollback.test.ts tests/orchestra/brain.test.ts tests/orchestra/budget-landing-checkpoint-quote-safety.test.ts tests/orchestra/canonical-wiring-closure.integration.test.ts tests/orchestra/decay-config-wire.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## Task 4: Align failing orchestra suites (cluster 4) to landed contracts
- Files: tests/orchestra/docker-auth-precedence.test.ts, tests/orchestra/docker-backend-owned-settlement.test.ts, tests/orchestra/docker-container-start-failed.test.ts, tests/orchestra/docker-dist-guard.test.ts, tests/orchestra/docker-final-only-containment.test.ts, tests/orchestra/docker-multicli-buildarg.test.ts, tests/orchestra/docker-provider-execution-observation.test.ts, tests/orchestra/finalize-sprint.test.ts, tests/orchestra/fix-phase-map.test.ts, tests/orchestra/idempotency-key-inject.test.ts, tests/orchestra/memory-limit-by-kind.test.ts, tests/orchestra/moat3-fixphase.test.ts
- Reads: src/agents/prompt-version.ts, src/agents/worker-ipc.ts, src/agents/worker.ts, src/cli/helpers/splash.ts, src/core/active-workers.ts, src/core/agent-pool.ts, src/core/config.ts, src/core/execution-landing-context.ts, src/core/file-lock.ts, src/core/memory-store.ts, src/core/plugin-hooks.ts, src/core/provider-execution-observation.ts, src/core/provider.ts, src/core/skill-pool.ts, src/core/stack-detector.ts, src/core/system-profile.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/core/worker-heartbeat-authority-store.ts, src/monitor/auditor.ts, src/orchestra/coverage-validator.ts, src/orchestra/debt-manager.ts, src/orchestra/event-stream.ts, src/orchestra/execution-landing-coordinator.ts, src/orchestra/model-selector.ts, src/orchestra/planner.ts, src/orchestra/prompt-god-template.ts, src/orchestra/result-evaluator.ts, src/orchestra/result-watcher.ts, src/orchestra/rollback.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-phases.ts, src/orchestra/sprint-reporter.ts, src/orchestra/task-builder.ts, src/orchestra/tmux.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/docker-auth-precedence.test.ts tests/orchestra/docker-backend-owned-settlement.test.ts tests/orchestra/docker-container-start-failed.test.ts tests/orchestra/docker-dist-guard.test.ts tests/orchestra/docker-final-only-containment.test.ts tests/orchestra/docker-multicli-buildarg.test.ts tests/orchestra/docker-provider-execution-observation.test.ts tests/orchestra/finalize-sprint.test.ts tests/orchestra/fix-phase-map.test.ts tests/orchestra/idempotency-key-inject.test.ts tests/orchestra/memory-limit-by-kind.test.ts tests/orchestra/moat3-fixphase.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## Task 5: Align failing orchestra suites (cluster 5) to landed contracts
- Files: tests/orchestra/runsprint-debt-integration.test.ts, tests/orchestra/rvdc-deadbranch.test.ts, tests/orchestra/scheduler-effective-dependencies.test.ts, tests/orchestra/scheduler-shadow-retention-finalize.test.ts, tests/orchestra/spawn-backend-docker-mounts.test.ts, tests/orchestra/spawn-git-async.test.ts, tests/orchestra/sprint-controller.test.ts, tests/orchestra/sprint-finalizer-runflow.test.ts, tests/orchestra/sprint-finalizer-task-projection.test.ts, tests/orchestra/sprint-finalizer-terminal-wire.test.ts, tests/orchestra/sprint-finalizer.test.ts, tests/orchestra/sprint-reporter-lineage-summary.test.ts
- Reads: src/agents/worker-ipc.ts, src/agents/worker.ts, src/cli/helpers/splash.ts, src/cli/helpers/sprint-summary-rich.ts, src/core/active-workers.ts, src/core/agent-pool.ts, src/core/agent-types.ts, src/core/config.ts, src/core/constants.ts, src/core/event-stream.ts, src/core/file-lock.ts, src/core/identity-generator.ts, src/core/memory-store.ts, src/core/notify.ts, src/core/observability.ts, src/core/plugin-hooks.ts, src/core/pre-dispatch-settlement.ts, src/core/provider.ts, src/core/skill-pool.ts, src/core/sprint-types.ts, src/core/stack-detector.ts, src/core/system-profile.ts, src/core/task-result-settlement.ts, src/core/task-types.ts, src/core/types.ts, src/core/utils.ts, src/monitor/auditor.ts, src/orchestra/baseline-tracker.ts, src/orchestra/brain.ts, src/orchestra/coverage-validator.ts, src/orchestra/debt-manager.ts, src/orchestra/event-bus.ts, src/orchestra/event-stream.ts, src/orchestra/execution-landing-coordinator.ts, src/orchestra/model-selector.ts, src/orchestra/planner.ts, src/orchestra/result-collector.ts, src/orchestra/result-evaluator.ts, src/orchestra/result-watcher.ts, src/orchestra/rollback.ts, src/orchestra/runtime-budget-monitor.ts, src/orchestra/scheduler-state.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-reporter.ts, src/orchestra/sprint-spawner.ts, src/orchestra/sprint-utils.ts, src/orchestra/task-builder.ts, src/orchestra/task-restoration.ts, src/orchestra/task-router.ts, src/orchestra/temp-skill-generator.ts, src/orchestra/tmux.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/runsprint-debt-integration.test.ts tests/orchestra/rvdc-deadbranch.test.ts tests/orchestra/scheduler-effective-dependencies.test.ts tests/orchestra/scheduler-shadow-retention-finalize.test.ts tests/orchestra/spawn-backend-docker-mounts.test.ts tests/orchestra/spawn-git-async.test.ts tests/orchestra/sprint-controller.test.ts tests/orchestra/sprint-finalizer-runflow.test.ts tests/orchestra/sprint-finalizer-task-projection.test.ts tests/orchestra/sprint-finalizer-terminal-wire.test.ts tests/orchestra/sprint-finalizer.test.ts tests/orchestra/sprint-reporter-lineage-summary.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## Task 6: Align failing orchestra/scripts suites (cluster 6) to landed contracts
- Files: tests/orchestra/sprint-terminal-controller-wire.test.ts, tests/orchestra/sprint-terminal-receipt-order.test.ts, tests/orchestra/terminal-publication-zero-task.test.ts, tests/orchestra/timeout-placeholder-scope-diff.test.ts, tests/orchestra/wrapper-hb-allowlist.test.ts, tests/scripts/audit-operation-ingress.test.ts
- Reads: src/core/active-workers.ts, src/core/constants.ts, src/core/file-lock.ts, src/core/run-status-read-model.ts, src/core/types.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-phases.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/sprint-terminal-controller-wire.test.ts tests/orchestra/sprint-terminal-receipt-order.test.ts tests/orchestra/terminal-publication-zero-task.test.ts tests/orchestra/timeout-placeholder-scope-diff.test.ts tests/orchestra/wrapper-hb-allowlist.test.ts tests/scripts/audit-operation-ingress.test.ts
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.


## EK SÖZLEŞME-NOTU (bugünün landed-kontrat değişimleri — hizalamada otorite)
Kırmızıların büyük kısmı bugünün 6 kernel-dalga landing'inin legacy-suite yankısıdır:
(1) config-yazımları artık src/core/config-write-authority.ts üzerinden — tmp+0600+fsync+
rename + `<hedef>.lock/owner.json` kilit-yazımı; 'config.json' içeren writeFileSync
assert'leri `.lock`-dışlamalı ve tmp-adı-toleranslı olmalı; fs mock-factory'lerine
openSync/fsyncSync/closeSync/renameSync/rmSync/statSync/unlinkSync eklemek gerekebilir
(emsal: tests/mcp/tools/init.test.ts başındaki mock bloğu). (2) sprint-finalizer artık
terminal-öncesi tsc-settlement-gate koşar — testler enjekte `runTscFn` seam'ini kullanmalı
(gerçek npx tsc çağrısı beklenmez); finalize/force yolu coordinator-retirement kanıtı ister.
(3) sprint-controller settlement-anında redundant FIX/XFIX torunlarını superseded işaretler;
scheduler-dependency beklentileri buna göre. (4) DockerSpawnBackend.spawn SYNC fire-and-forget,
async-kuyruk `backend.lastSpawnCompletion`'da (await/rejects deseni). Ürün-bug şüphesinde
dosyaya dokunmadan NO_GO + exact src kanıtı.
