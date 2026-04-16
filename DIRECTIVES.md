# DIRECTIVES — God Analysis Sprint: Tanri Seviyesinde Gozlem

## Goal

Deckent her bir karakteriyle analiz edilir. Opus only, max effort, sifirdan. Hicbir dosya, hicbir satir, hicbir karakter okunmamis kalmaz. Sprint 141 raporlari gormezden gelinir — tamamen yeni analiz. Her dosyanin icindeki dokuman, kod, tum bilgi dogrulanir, tutarlilik kontrol edilir, calisiyor mu calismiyor mu analiz edilir, baglamliysa test dosyalari incelenir. KOD YAZILMAZ, TEST CALISTIRILMAZ, COMMIT YAPILMAZ.

---

## Kurallar (MUTLAK)

1. **READ-ONLY:** Worker'lar hicbir kaynak dosya degistirmez. Sadece `.deckent/sprint-god-analysis/` altina rapor yazar
2. **OPUS ONLY:** Tum task'lar opus modeli, high effort. Gucsu model YASAK
3. **Test calistirma YASAK:** Worker verify loop devre disi
4. **Commit YASAK:** Sprint sonunda Alperen elle commit eder
5. **16-SECTION TEMPLATE ZORUNLU:** Her rapor dosyasi asagidaki template'i kullanir
6. **TUTARLILIK DOGRULAMA:** .md dosyalari cross-validate, DB export roundtrip, i18n gap tespiti
7. **Sink dizin:** `.deckent/sprint-god-analysis/<kategori>/<dosya>.md`
8. **TEK final rapor:** `.deckent/sprint-god-analysis/FINAL-REPORT.md`
9. **HICBIR DOSYA ATLANMAZ:** Her TypeScript, her test, her markdown, her config, Dockerfile, .gitignore — hepsi

---

## Worker Rapor Template (16 Section — ZORUNLU)

```
# Analysis: <dosya-yolu>
**Task ID:** | **Model:** opus | **LoC:** <sayi> | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
## 3. Ic Bagimliliklar (import chain listesi, dongusel bagimllik riski var mi?)
## 4. Dis Bagimliliklar (node_modules, native modul — ADR-010 uyumu)
## 5. Complexity (fonksiyon sayisi, max cyclomatic rough, en karmasik fonksiyon adi + satir no)
## 6. Type Safety (any sayisi, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
## 7. ADR Compliance (ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-022 CLI/MCP parity, ADR-033 product vision, ADR-037 RBAC, ADR-039 self-modifying, Memory V2 DB-first)
## 8. Test Coverage (src/X.ts → tests/X.test.ts eslesmesi var mi? mock kalitesi, edge case coverage, Memory V2 mock dogru mu?)
## 9. TODO/FIXME/HACK inventory (her biri satir numarasiyla, severity P0-P3)
## 10. Dead Code (unused export, unreachable branch, @deprecated hala var mi?)
## 11. Security (input validation, injection riski, secret exposure, OWASP, SQL injection for DB)
## 12. Memory V2 Uyumu (DB-first mi? Eski .md parse kaldi mi? readFileSync + DECISIONS/MEMORY/DEBT parse var mi?)
## 13. i18n (TR/EN hardcoded string, locale-aware mi? turkishNormalize kullanimi dogru mu?)
## 14. Dokumantasyon Tutarliligi (JSDoc ↔ gercek davranis uyumu, .md referans dogrulugu, sayi tutarliligi)
## 15. Performance (sync I/O sayisi, hot path mi?, gereksiz disk okuma/yazma)
## 16. Oneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
## Verdict: ANALYZED | PARTIAL | UNREADABLE
```

---

## Task 1: src/core/ batch 1 — Memory V2 modulleri
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/memory-store.ts, src/core/memory-query.ts, src/core/memory-normalize.ts, src/core/memory-export.ts, src/core/memory-import.ts, src/core/memory-types.ts, src/core/config.ts, src/core/config-types.ts, src/core/config-migration.ts, src/core/constants.ts
- Scope: src/core/

### Description
Read-only deep analysis. 10 dosya, 16-section template. Memory V2 modulleri + config. Ozellikle: DB schema dogrulugu, FTS5 trigger'lar, turkishNormalize edge case, config-types memory V2 section, constants MEMORY_DB_FILE/MEMORY_EXPORTS_DIR. Write per-file reports to `.deckent/sprint-god-analysis/src/core/`.

**Kanit:** 10 rapor dosyasi, her biri ≥40 satir, 16 section dolu.

---

## Task 2: src/core/ batch 2 — Types + Routing
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/types.ts, src/core/task-types.ts, src/core/sprint-types.ts, src/core/routing-types.ts, src/core/routing-engine.ts, src/core/agent-types.ts, src/core/skill-types.ts, src/core/monitoring-types.ts, src/core/decision-types.ts, src/core/decision-config.ts
- Scope: src/core/

### Description
Read-only deep analysis. 10 dosya. Type safety, barrel re-export dogrulugu, MemoryEntryV2 ↔ DB schema uyumu. Write per-file reports to `.deckent/sprint-god-analysis/src/core/`.

**Kanit:** 10 rapor dosyasi, her biri ≥40 satir.

---

## Task 3: src/core/ batch 3 — Agent + Skill pools
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/agent-pool.ts, src/core/agent-cache.ts, src/core/agent-selector.ts, src/core/skill-pool.ts, src/core/skill-registry.ts, src/core/skill-cache.ts, src/core/skill-selector.ts, src/core/intent-classifier.ts, src/core/activation-engine.ts, src/core/condition-evaluator.ts
- Scope: src/core/

### Description
Read-only deep analysis. 10 dosya. Agent/skill routing zinciri, V2 routing engine uyumu, LRU eviction dogrulugu. Write per-file reports to `.deckent/sprint-god-analysis/src/core/`.

**Kanit:** 10 rapor dosyasi, her biri ≥40 satir.

---

## Task 4: src/core/ batch 4 — Provider + Model + Notification
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/provider.ts, src/core/provider-capabilities.ts, src/core/model-registry.ts, src/core/model-equivalence.ts, src/core/mode-presets.ts, src/core/notification-dispatcher.ts, src/core/notification-config.ts, src/core/notifications.ts, src/core/notification-providers/discord.ts, src/core/notification-providers/slack.ts
- Scope: src/core/

### Description
Read-only deep analysis. 10 dosya. Multi-provider model registry, notification dispatcher pattern, webhook/discord/slack adapter dogrulugu. Write per-file reports to `.deckent/sprint-god-analysis/src/core/`.

**Kanit:** 10 rapor dosyasi, her biri ≥40 satir.

---

## Task 5: src/core/ batch 5 — Utils + Security + Remaining
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/utils.ts, src/core/errors.ts, src/core/file-lock.ts, src/core/credential-encryption.ts, src/core/credentials.ts, src/core/deck-file.ts, src/core/environment.ts, src/core/global-config.ts, src/core/index.ts, src/core/lazy-loader.ts
- Scope: src/core/

### Description
Read-only deep analysis. 10 dosya. utils.ts deprecated fonksiyon kontrolu (parseDebtTable/generateDebtTable hala var mi?), countBrainLines silindi mi?, barrel export dogrulugu, credential encryption AES-256-GCM. Write per-file reports to `.deckent/sprint-god-analysis/src/core/`.

**Kanit:** 10 rapor dosyasi, her biri ≥40 satir.

---

## Task 6: src/core/ batch 6 — Remaining core files
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/manifest-migrator.ts, src/core/multi-ide.ts, src/core/observability.ts, src/core/output-collector.ts, src/core/output-formatter.ts, src/core/plugin.ts, src/core/plugin-hooks.ts, src/core/plugin-loader.ts, src/core/stack-detector.ts, src/core/subscription.ts
- Scope: src/core/

### Description
Read-only deep analysis. 10 dosya. Plugin sandbox guvenlik, stack detector dogrulugu, subscription cost tracking. Write per-file reports to `.deckent/sprint-god-analysis/src/core/`.

**Kanit:** 10 rapor dosyasi, her biri ≥40 satir.

---

## Task 7: src/core/ batch 7 — Final core files
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/core/system-profile.ts, src/core/telemetry.ts, src/core/token-counter.ts, src/core/ci-learning.ts, src/core/analyzer.ts, src/core/marketplace/dependency-resolver.ts, src/core/marketplace/marketplace-auth.ts, src/core/marketplace/rating-system.ts, src/core/marketplace/registry-client.ts, src/core/marketplace/skill-sandbox.ts
- Scope: src/core/

### Description
Read-only deep analysis. 10 dosya (son 8 core + marketplace alt dizin). Telemetry ADR-033 uyumu (product not service — telemetry kapali mi?), token counter cost guard entegrasyonu, marketplace guvenlik. Ayrica notify-adapters/ kalanlari: src/core/notify-adapters/cli-adapter.ts, src/core/notify-adapters/mcp-adapter.ts, src/core/notification-providers/webhook.ts. Write per-file reports to `.deckent/sprint-god-analysis/src/core/`.

**Kanit:** Kalan tum core dosyalar icin rapor, her biri ≥40 satir.

---

## Task 8: src/orchestra/ batch 1 — Brain + Sprint lifecycle
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/orchestra/brain.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-planner.ts, src/orchestra/sprint-lifecycle.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 6 dosya — sprint yasam dongusunun kalbi. brain.ts re-export layer dogrulugu, sprint-controller orchestration, sprint-finalizer Memory V2 dual-write, sprint-planner readContext DB-first. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 6 rapor, her biri ≥50 satir.

---

## Task 9: src/orchestra/ batch 2 — Debt + Result + Retro
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/debt-manager.ts, src/orchestra/sprint-retro-writer.ts, src/orchestra/sprint-reporter.ts, src/orchestra/result-evaluator.ts, src/orchestra/result-collector.ts, src/orchestra/result-merger.ts, src/orchestra/result-watcher.ts, src/orchestra/quality-assessor.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 8 dosya. debt-manager V1 fallback tamamen kaldirildi mi?, sprint-retro-writer dual-write pattern, result-evaluator GO/NO_GO logic. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 8 rapor, her biri ≥40 satir.

---

## Task 10: src/orchestra/ batch 3 — Task + Routing + Spawn
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/task-builder.ts, src/orchestra/task-router.ts, src/orchestra/task-analyzer.ts, src/orchestra/task-retry.ts, src/orchestra/planner.ts, src/orchestra/spawn-backend.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/spawn-backend-mock.ts, src/orchestra/tmux.ts, src/orchestra/sprint-spawner.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 10 dosya. task-builder queryRelevantADRs (loadADRContent silindi mi?), spawn backend parity, Docker atomicWrite + SIGTERM. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 11: src/orchestra/ batch 4 — Event stream + Pattern + Decision
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/event-stream.ts, src/orchestra/authority-enforcer.ts, src/orchestra/self-modifying-detector.ts, src/orchestra/dependency-scheduler.ts, src/orchestra/parallel-pipeline.ts, src/orchestra/conflict-resolver.ts, src/orchestra/heartbeat-daemon.ts, src/orchestra/connector.ts, src/orchestra/ipc-registry.ts, src/orchestra/mid-sprint-adapter.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 10 dosya. ADR-035 event stream, ADR-037 authority matrix, ADR-039 self-modifying, Kahn's algorithm topological sort. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 12: src/orchestra/ batch 5 — Managed docs + Pattern + Remaining
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/managed-docs/content-generators.ts, src/orchestra/managed-docs/doc-cache.ts, src/orchestra/managed-docs/docs-config.ts, src/orchestra/managed-docs/index.ts, src/orchestra/managed-docs/managed-doc-runner.ts, src/orchestra/managed-docs/plugin-loader.ts, src/orchestra/managed-docs/section-updater.ts, src/orchestra/managed-docs/template-renderer.ts, src/orchestra/managed-docs/types.ts
- Scope: src/orchestra/managed-docs/

### Description
Read-only deep analysis. 9 dosya. ADR-029/030/031/032 uyumu, i18n content generator TR/EN, doc cache SHA-1, template renderer. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/managed-docs/`.

**Kanit:** 9 rapor, her biri ≥40 satir.

---

## Task 13: src/orchestra/ batch 6 — Doc updaters + Sprint utils + Remaining
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/doc-updaters/changelog.ts, src/orchestra/doc-updaters/health-check.ts, src/orchestra/doc-updaters/index.ts, src/orchestra/doc-updaters/metrics-updater.ts, src/orchestra/doc-updaters/readme-metrics.ts, src/orchestra/doc-updaters/registry.ts, src/orchestra/doc-updaters/sprint-log.ts, src/orchestra/doc-updaters/types.ts, src/orchestra/sprint-utils.ts, src/orchestra/sprint-docs-helpers.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 10 dosya. Doc updater registry pattern, sprint-docs-helpers Memory V2 uyumu. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 14: src/orchestra/ batch 7 — Remaining orchestra files
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/sprint-docs-updater.ts, src/orchestra/sprint-estimator.ts, src/orchestra/sprint-metrics.ts, src/orchestra/sprint-pid-manager.ts, src/orchestra/sprint-checkpoint.ts, src/orchestra/ci-reporter.ts, src/orchestra/coverage-validator.ts, src/orchestra/baseline-tracker.ts, src/orchestra/batch-stats.ts, src/orchestra/brain-context.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 10 dosya. sprint-docs-updater autoResolveDebt DB-first mi?, batch-stats ADR-038 dead code mu?, brain-context ADR-038 deferred. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 15: src/orchestra/ batch 8 — Final orchestra remaining
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/combination-scorer.ts, src/orchestra/decision-engine.ts, src/orchestra/decision-logger.ts, src/orchestra/decision-replay.ts, src/orchestra/decision-steps/agent-step.ts, src/orchestra/decision-steps/scope-step.ts, src/orchestra/ecosystem-intelligence.ts, src/orchestra/handoff-protocol.ts, src/orchestra/learning-decay.ts, src/orchestra/learning-migration.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 10 dosya. ADR-028 deprecated V1 decision engine, ADR-038 dead code candidates (learning-decay, learning-migration, batch-stats, combination-scorer, handoff-protocol, brain-context). Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 16: src/orchestra/ batch 9 — Final remaining orchestra
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/orchestra/model-selector.ts, src/orchestra/multi-agent.ts, src/orchestra/outcome-tracker.ts, src/orchestra/pattern-reader.ts, src/orchestra/pattern-recorder.ts, src/orchestra/prompt-token-optimizer.ts, src/orchestra/rollback.ts, src/orchestra/rule-evolver.ts, src/orchestra/shared-memory.ts, src/orchestra/temp-skill-generator.ts, src/orchestra/promotion-pipeline.ts, src/orchestra/index.ts
- Scope: src/orchestra/

### Description
Read-only deep analysis. 12 dosya (kalan tum orchestra). Pattern reader/recorder, outcome tracker synergy matrix, rollback mechanism, promotion pipeline. Write per-file reports to `.deckent/sprint-god-analysis/src/orchestra/`.

**Kanit:** 12 rapor, her biri ≥40 satir.

---

## Task 17: src/cli/ batch 1 — Memory V2 + Critical commands
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/recall.ts, src/cli/commands/remember.ts, src/cli/commands/memory.ts, src/cli/commands/cleanup.ts, src/cli/commands/doctor.ts, src/cli/commands/archive-debt.ts, src/cli/commands/init.ts, src/cli/commands/start.ts, src/cli/commands/plan.ts, src/cli/commands/status.ts
- Scope: src/cli/commands/

### Description
Read-only deep analysis. 10 dosya. Memory V2 CLI komutlari (recall, remember, memory rebuild/export/stats), cleanup getMemoryEntryCount, doctor brain budget DB-first, init template @ referanslari. Write per-file reports to `.deckent/sprint-god-analysis/src/cli/commands/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 18: src/cli/ batch 2 — Remaining commands
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/config.ts, src/cli/commands/review.ts, src/cli/commands/retro.ts, src/cli/commands/run.ts, src/cli/commands/kill.ts, src/cli/commands/sync.ts, src/cli/commands/explain.ts, src/cli/commands/finalize.ts, src/cli/commands/history.ts, src/cli/commands/checkpoint.ts
- Scope: src/cli/commands/

### Description
Read-only deep analysis. 10 dosya. ADR-022 CLI/MCP parity, her komut icin MCP karsılıgı var mi? Write per-file reports to `.deckent/sprint-god-analysis/src/cli/commands/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 19: src/cli/ batch 3 — More commands
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/agent.ts, src/cli/commands/skill.ts, src/cli/commands/plugin.ts, src/cli/commands/spawn.ts, src/cli/commands/attach.ts, src/cli/commands/watch.ts, src/cli/commands/web.ts, src/cli/commands/serve.ts, src/cli/commands/dashboard.ts, src/cli/commands/docs.ts
- Scope: src/cli/commands/

### Description
Read-only deep analysis. 10 dosya. Write per-file reports to `.deckent/sprint-god-analysis/src/cli/commands/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 20: src/cli/ batch 4 — Final commands + helpers
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/commands/onboard.ts, src/cli/commands/upgrade.ts, src/cli/commands/quick-start.ts, src/cli/commands/resume.ts, src/cli/commands/set-directives.ts, src/cli/commands/skill-marketplace.ts, src/cli/commands/test-run.ts, src/cli/commands/heartbeat.ts, src/cli/commands/output.ts, src/cli/commands/analyze.ts
- Scope: src/cli/commands/

### Description
Read-only deep analysis. 10 dosya. Write per-file reports to `.deckent/sprint-god-analysis/src/cli/commands/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 21: src/cli/ batch 5 — Helpers + Entry
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/output.ts, src/cli/helpers/progress.ts, src/cli/helpers/progress-persistence.ts, src/cli/helpers/prompt.ts, src/cli/helpers/splash.ts, src/cli/helpers/terminal-utils.ts, src/cli/helpers/theme.ts, src/cli/helpers/wizard.ts, src/cli/helpers/worker-status.ts, src/cli/helpers/messages.ts
- Scope: src/cli/helpers/

### Description
Read-only deep analysis. 10 dosya. output.ts getMemoryEntryCount dogru mu?, splash.ts Kraken ASCII, messages.ts i18n. Write per-file reports to `.deckent/sprint-god-analysis/src/cli/helpers/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 22: src/cli/ batch 6 — Remaining helpers + root
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/agent-performance.ts, src/cli/helpers/agent-templates.ts, src/cli/helpers/change-categorizer.ts, src/cli/helpers/codex-config.ts, src/cli/helpers/config-reader.ts, src/cli/helpers/cursor-config.ts, src/cli/helpers/error-handler.ts, src/cli/helpers/eta-calculator.ts, src/cli/helpers/gemini-config.ts, src/cli/helpers/hints.ts
- Scope: src/cli/helpers/

### Description
Read-only deep analysis. 10 dosya. Multi-IDE config generators (codex, cursor, gemini), error-handler pattern. Write per-file reports to `.deckent/sprint-god-analysis/src/cli/helpers/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 23: src/cli/ batch 7 — Final helpers
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/cli/helpers/output-mode.ts, src/cli/helpers/queue-display.ts, src/cli/helpers/recommendations.ts, src/cli/helpers/review-actions.ts, src/cli/helpers/review-summary.ts, src/cli/helpers/selective-retry.ts, src/cli/helpers/sprint-comparison.ts, src/cli/helpers/sprint-summary.ts, src/cli/helpers/sprint-summary-rich.ts, src/cli/entry.ts, src/cli/index.ts, src/cli/auto-setup.ts, src/cli/version-info.ts
- Scope: src/cli/

### Description
Read-only deep analysis. 13 dosya (kalan tum CLI). entry.ts SIGINT handler, index.ts 40+ komut register, auto-setup.ts. Write per-file reports to `.deckent/sprint-god-analysis/src/cli/`.

**Kanit:** 13 rapor, her biri ≥30 satir.

---

## Task 24: src/mcp/ batch 1 — Tools
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/memory-query.ts, src/mcp/tools/init.ts, src/mcp/tools/start.ts, src/mcp/tools/status.ts, src/mcp/tools/plan.ts, src/mcp/tools/config.ts, src/mcp/tools/cleanup.ts, src/mcp/tools/doctor.ts, src/mcp/tools/run.ts, src/mcp/tools/kill.ts
- Scope: src/mcp/tools/

### Description
Read-only deep analysis. 10 dosya. memory-query.ts (yeni MCP tool — 0 test!), init.ts @ referans template'lari, ADR-022 CLI/MCP parity. Write per-file reports to `.deckent/sprint-god-analysis/src/mcp/tools/`.

**Kanit:** 10 rapor, her biri ≥40 satir.

---

## Task 25: src/mcp/ batch 2 — Tools remaining + Resources + Server
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/tools/review.ts, src/mcp/tools/retro.ts, src/mcp/tools/history.ts, src/mcp/tools/analyze.ts, src/mcp/tools/sync.ts, src/mcp/tools/checkpoint.ts, src/mcp/tools/docs.ts, src/mcp/tools/explain.ts, src/mcp/tools/help.ts, src/mcp/tools/agent-list.ts, src/mcp/tools/skill-list.ts, src/mcp/tools/directives.ts, src/mcp/tools/job-runner.ts, src/mcp/tools/index.ts
- Scope: src/mcp/tools/

### Description
Read-only deep analysis. 14 dosya. tools/index.ts 22 tool register edilmis mi?, help.ts tool sayisi dogru mu? Write per-file reports to `.deckent/sprint-god-analysis/src/mcp/tools/`.

**Kanit:** 14 rapor, her biri ≥30 satir.

---

## Task 26: src/mcp/ batch 3 — Resources + Helpers + Server
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/mcp/resources/memory.ts, src/mcp/resources/debt.ts, src/mcp/resources/retro.ts, src/mcp/resources/dashboard.ts, src/mcp/resources/directives.ts, src/mcp/resources/config.ts, src/mcp/resources/tasks.ts, src/mcp/resources/agents.ts, src/mcp/resources/index.ts, src/mcp/helpers/enrich.ts, src/mcp/helpers/format.ts, src/mcp/helpers/index.ts, src/mcp/server.ts
- Scope: src/mcp/

### Description
Read-only deep analysis. 13 dosya. Resources DB-first (memory, debt, retro — V1 fallback kaldirildi mi?), server.ts 22 tool + 8 resource kayitli mi? Write per-file reports to `.deckent/sprint-god-analysis/src/mcp/`.

**Kanit:** 13 rapor, her biri ≥30 satir.

---

## Task 27: src/agents/ + src/providers/ + src/api/ + src/monitor/ + src/extensions/
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer, security-specialist
- Agent: code-reviewer
- Files: src/agents/*.ts (16), src/providers/*.ts (5), src/api/*.ts (4), src/monitor/*.ts (4), src/extensions/vscode/extension.ts, src/index.ts
- Scope: src/agents/, src/providers/, src/api/, src/monitor/, src/extensions/

### Description
Read-only deep analysis. 30 dosya. worker.ts ADR'ler prompt'tan gelir (dosya okumaz — dogru mu?), auditor.ts checkADRCompliance DB-first, api/auth.ts bearer token guvenlik, api/rate-limiter.ts DDoS koruması, api/server.ts HTTP endpoint'ler. **src/api/ Sprint 141'de TAMAMEN ATLANDI — bu sefer dedicated analiz.** Write per-file reports to `.deckent/sprint-god-analysis/src/<module>/`.

**Kanit:** 30 rapor, her biri ≥30 satir. src/api/ 4 dosya MUTLAKA dahil.

---

## Task 28: src/dashboard/ batch 1 — Components
- Model: opus
- Effort: high
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Files: src/dashboard/src/App.tsx, src/dashboard/src/main.tsx, src/dashboard/src/components/ActivityFeed.tsx, src/dashboard/src/components/AgentDetail.tsx, src/dashboard/src/components/DebtTable.tsx, src/dashboard/src/components/EmptyState.tsx, src/dashboard/src/components/Layout.tsx, src/dashboard/src/components/NewSprintModal.tsx, src/dashboard/src/components/SimpleMarkdown.tsx, src/dashboard/src/components/Skeleton.tsx
- Scope: src/dashboard/src/

### Description
Read-only deep analysis. 10 dosya. React component mimarisi, i18n uyumu, type safety, accessibility. Write per-file reports to `.deckent/sprint-god-analysis/src/dashboard/`.

**Kanit:** 10 rapor, her biri ≥30 satir.

---

## Task 29: src/dashboard/ batch 2 — Components + Pages + Hooks + i18n + lib
- Model: opus
- Effort: high
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Files: src/dashboard/src/components/SprintChart.tsx, src/dashboard/src/components/SprintPhaseTimeline.tsx, src/dashboard/src/components/SprintSummary.tsx, src/dashboard/src/components/TaskCard.tsx, src/dashboard/src/components/ThemeProvider.tsx, src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/components/ui/*.tsx (14 dosya), src/dashboard/src/pages/*.tsx (6), src/dashboard/src/hooks/*.ts (2), src/dashboard/src/i18n/*.ts (3), src/dashboard/src/lib/*.ts (2), src/dashboard/src/types/index.ts
- Scope: src/dashboard/src/

### Description
Read-only deep analysis. 34 dosya (kalan tum dashboard). UI primitives (badge, button, card, dialog, etc.), pages (Dashboard, Config, History, Memory, Settings, Status), hooks (useApi, useSSE), i18n (en.ts, tr.ts, LanguageProvider). Write per-file reports to `.deckent/sprint-god-analysis/src/dashboard/`.

**Kanit:** 34 rapor (veya batch rapor icinde her dosya listelenmis), her biri ≥20 satir.

---

## Task 30: tests/ batch 1 — core/ (119 dosya)
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/core/**/*.test.ts
- Scope: tests/core/

### Description
Read-only deep analysis. 119 test dosyasi. Her test dosyasi icin: test sayisi (describe/it), mock pattern (vi.mock, MemoryStore mock dogru mu?), coverage eslesmesi (tests/core/X.test.ts → src/core/X.ts), orphan tespiti, Memory V2 mock uyumu (eski countBrainLines mock kaldi mi?). Write batch report to `.deckent/sprint-god-analysis/tests/core.md`.

**Kanit:** 1 batch rapor ≥300 satir, 119 dosya listelenmis.

---

## Task 31: tests/ batch 2 — orchestra/ (118 dosya)
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/orchestra/**/*.test.ts
- Scope: tests/orchestra/

### Description
Read-only deep analysis. 118 test dosyasi. Ayni sablonla analiz. Write batch report to `.deckent/sprint-god-analysis/tests/orchestra.md`.

**Kanit:** 1 batch rapor ≥300 satir.

---

## Task 32: tests/ batch 3 — cli/ (126 dosya)
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/cli/**/*.test.ts
- Scope: tests/cli/

### Description
Read-only deep analysis. 126 test dosyasi. Write batch report to `.deckent/sprint-god-analysis/tests/cli.md`.

**Kanit:** 1 batch rapor ≥300 satir.

---

## Task 33: tests/ batch 4 — mcp/ + api/ + monitor/ (47 dosya)
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/mcp/**/*.test.ts, tests/api/**/*.test.ts, tests/monitor/**/*.test.ts
- Scope: tests/mcp/, tests/api/, tests/monitor/

### Description
Read-only deep analysis. 47 test dosyasi. Write batch report to `.deckent/sprint-god-analysis/tests/mcp-api-monitor.md`.

**Kanit:** 1 batch rapor ≥200 satir.

---

## Task 34: tests/ batch 5 — integration/ + e2e/ + dashboard/ (52 dosya)
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/integration/**/*.test.ts, tests/e2e/**/*.test.ts, tests/dashboard/**/*.test.ts
- Scope: tests/integration/, tests/e2e/, tests/dashboard/

### Description
Read-only deep analysis. 52 test dosyasi. E2E test coverage, integration test Memory V2 uyumu, dashboard test completeness. Write batch report to `.deckent/sprint-god-analysis/tests/integration-e2e-dashboard.md`.

**Kanit:** 1 batch rapor ≥200 satir.

---

## Task 35: tests/ batch 6 — agents/ + providers/ + remaining (100 dosya)
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: tests/agents/**/*.test.ts, tests/providers/**/*.test.ts, tests/scripts/**/*.test.ts, tests/security/**/*.test.ts, tests/docs/**/*.test.ts, tests/analytics/**/*.test.ts, tests/blueprint/**/*.test.ts, tests/brain/**/*.test.ts, tests/config/**/*.test.ts, tests/docker/**/*.test.ts, tests/extensions/**/*.test.ts, tests/github/**/*.test.ts, tests/helpers/**/*.test.ts, tests/load/**/*.test.ts, tests/skills/**/*.test.ts, tests/smoke/**/*.test.ts, tests/unit/**/*.test.ts, tests/workflows/**/*.test.ts, tests/audits/**/*.test.ts
- Scope: tests/

### Description
Read-only deep analysis. ~100 test dosyasi (kalan tum test kategorileri). Write batch report to `.deckent/sprint-god-analysis/tests/remaining.md`.

**Kanit:** 1 batch rapor ≥200 satir.

---

## Task 36: docs/ batch 1 — superpowers/ + audits/
- Model: opus
- Effort: high
- Skills: documentation-writer, system-architect
- Agent: doc-writer
- Files: docs/superpowers/**/*.md, docs/audits/**/*.md
- Scope: docs/superpowers/, docs/audits/

### Description
Read-only deep analysis. ~32 markdown. Spec/plan dosyalari guncel mi? Memory V2 spec var mi? Sprint audit raporlari tutarli mi? Write batch report to `.deckent/sprint-god-analysis/docs/superpowers-audits.md`.

**Kanit:** 1 batch rapor ≥150 satir.

---

## Task 37: docs/ batch 2 — Remaining docs
- Model: opus
- Effort: high
- Skills: documentation-writer, system-architect
- Agent: doc-writer
- Files: docs/architecture/**/*.md, docs/development/**/*.md, docs/guide/**/*.md, docs/reference/**/*.md, docs/release/**/*.md, docs/vision/**/*.md, docs/design/**/*.md, docs/analysis/**/*.md, docs/directives/**/*.md, docs/archive/**/*.md
- Scope: docs/

### Description
Read-only deep analysis. ~228 markdown. Mimari dokumanlarin guncellik kontrolu, Memory V2 ile uyum, eskimis bilgiler (memory-system.md pre-V2 icerigi?). Write batch report to `.deckent/sprint-god-analysis/docs/remaining.md`.

**Kanit:** 1 batch rapor ≥150 satir.

---

## Task 38: .brain/ state + Memory V2 DB canli dogrulama
- Model: opus
- Effort: high
- Skills: system-architect, typescript-expert
- Agent: architect
- Files: .brain/memory.db, .brain/exports/*, .brain/DECISIONS.md, .brain/MEMORY.md, .brain/RETRO.md, .brain/DEBT.md, .brain/PATTERNS.md, .brain/PROJECT-IDENTITY.md, .brain/ERRORS.md, .brain/sprints/*, .brain/archive/pre-v2/*
- Scope: .brain/

### Description
Read-only deep analysis + DB CANLI SORGULAMA:
1. memory.db entry sayilari (type bazli), FTS5 calisma testi (3 ornek sorgu), schema version
2. exports/ ↔ DB roundtrip dogrulama (summary.md entry sayisi = DB count mu?)
3. archive/pre-v2/ backup tamam mi? SHA-256 hash migration-manifest.json ile uyumlu mu?
4. DECISIONS.md hala 96K mi yoksa archive'a tasindi mi? @ referanslar summary.md'ye mi?
5. MEMORY.md, RETRO.md, DEBT.md, PATTERNS.md — DB ile tutarli mi?
6. ERRORS.md — boyut, son entry tarihi
7. sprints/ — sprint log dosyalari DB'de de var mi?

Write report to `.deckent/sprint-god-analysis/brain/brain-state.md`.

**Kanit:** 1 rapor ≥200 satir, 7 bolum.

---

## Task 39: Root .md cross-validation — TUTARLILIK DOGRULAMA
- Model: opus
- Effort: high
- Skills: documentation-writer, system-architect
- Agent: architect
- Files: CLAUDE.md, DECKENT.md, AGENTS.md, DECKENT-MASTER-BLUEPRINT.md, README.md, BETA-TRACKER.md, DIRECTIVES.md, .deckent/workspace/IDENTITY.md, .deckent/workspace/BOOT.md
- Scope: .

### Description
KRITIK CROSS-VALIDATION TASK:
1. CLAUDE.md ↔ DECKENT.md ↔ IDENTITY.md sayilar eslesiyor mu? (MCP tool sayisi, CLI komut sayisi, agent sayisi, skill sayisi, sprint numarasi)
2. @ referanslar gecerli dosyalari mi gosteriyor? (@.brain/exports/summary.md mevcut mu?)
3. DECKENT.md MCP tool tablosu 22 tool listeli mi? memory_query var mi?
4. IDENTITY.md features listesinde Memory V2 var mi?
5. DECKENT-MASTER-BLUEPRINT.md guncel mi yoksa eskimis mi?
6. README.md kurulum talimatlari dogru mu? better-sqlite3 dependency belirtilmis mi?
7. .claude/rules/brain.md, auditor.md, worker-default.md — DB-first kurallari yazili mi?

Write report to `.deckent/sprint-god-analysis/meta/root-md-cross-validation.md`.

**Kanit:** 1 rapor ≥200 satir, her .md dosyasi icin tutarlilik kontrol sonucu.

---

## Task 40: Root config — Dockerfile + .gitignore + package.json + tsconfig
- Model: opus
- Effort: high
- Skills: devops-engineer, typescript-expert
- Agent: devops-engineer
- Files: Dockerfile, .gitignore, package.json, package-lock.json, tsconfig.json, vitest.config.ts, .npmrc, .editorconfig, .prettierrc, .eslintrc
- Scope: .

### Description
Read-only deep analysis. DEDICATED rapor (Sprint 141'de batch icerisinde kaybolmustu):
1. **Dockerfile**: Container guvenlik (non-root user?), multi-stage build, image size, secrets in layers, base image guncelligi
2. **.gitignore**: memory.db dahil mi? .brain/exports/ gitignored DEGIL mi? node_modules, dist, .env pattern'lari tam mi?
3. **package.json**: dependencies (commander, better-sqlite3, @modelcontextprotocol/sdk, zod — ADR-010 uyumu), engines node >=18, scripts tam mi?, version 0.4.0-beta.1 dogru mu?
4. **tsconfig.json**: strict: true, Node16 module resolution, noUnusedLocals, noUncheckedIndexedAccess
5. **vitest.config.ts**: test ortami ayarlari
6. Diger config dosyalari (.npmrc, .editorconfig, .prettierrc varsa)

Write report to `.deckent/sprint-god-analysis/meta/root-config.md`.

**Kanit:** 1 rapor ≥150 satir, her config dosyasi icin dedicated bolum.

---

## Task 41: .claude/rules/ + .contracts/ + .deckent/config
- Model: opus
- Effort: high
- Skills: system-architect
- Agent: architect
- Files: .claude/rules/brain.md, .claude/rules/auditor.md, .claude/rules/worker-default.md, .contracts/api-surface.md, .deckent/config.json, .deckent/docs.json, .deckent/project-stack.json, scripts/*.mjs (12 dosya)
- Scope: .claude/, .contracts/, .deckent/, scripts/

### Description
Read-only deep analysis:
1. brain.md — DB-first kurallari yazili mi? Eski "read DECISIONS.md" talimatı kaldi mi?
2. auditor.md — DB-first ADR compliance yazili mi?
3. worker-default.md — "ADRs injected from DB" yazili mi?
4. api-surface.md — Memory V2 DB schema dokumante edilmis mi?
5. config.json — memory V2 config section var mi?
6. scripts/ — migrate-brain-v2.mjs mevcut mu? adr-validator.mjs guncel mi?

Write report to `.deckent/sprint-god-analysis/meta/rules-contracts-config.md`.

**Kanit:** 1 rapor ≥150 satir.

---

## Task 42: META — Architecture Graph + Circular Dependency + ADR-008
- Model: opus
- Effort: high
- Skills: system-architect, typescript-expert
- Agent: architect
- Files: src/**/*.ts
- Scope: src/

### Description
Cross-cutting: Full import chain analysis. Her src/ modulu icin: kim kimi import ediyor, dongusel bagimllik var mi? ADR-008 ihlali (brain disinda tmux/auditor/worker import eden var mi?). Memory V2 modullerin import zinciri dogru mu? DOT graph cikartilabilir. Write to `.deckent/sprint-god-analysis/meta/architecture-graph.md`.

**Kanit:** ≥200 satir, modul graf + ihlal listesi.

---

## Task 43: META — Dead Code + Type Safety
- Model: opus
- Effort: high
- Skills: typescript-expert, code-simplifier
- Agent: refactorer
- Files: src/**/*.ts
- Scope: src/

### Description
Cross-cutting:
1. Dead code: unused export envanteri, unreferenced fonksiyonlar, ADR-038 candidates, @deprecated hala kalan fonksiyonlar (parseDebtTable, generateDebtTable — src/core/utils.ts'de mi?)
2. Type safety: `any` sayimi (satir numaralari), `@ts-ignore`, `@ts-expect-error`, `as unknown`, non-null `!`, unsafe cast. Her bulgu dosya:satir formatinda.

Write to `.deckent/sprint-god-analysis/meta/dead-code-type-safety.md`.

**Kanit:** ≥200 satir, 2 bolum.

---

## Task 44: META — Security + Performance
- Model: opus
- Effort: high
- Skills: security-specialist, performance-optimizer
- Agent: security-auditor
- Files: src/**/*.ts, package.json
- Scope: src/

### Description
Cross-cutting:
1. Security: OWASP top 10, secret detection, SQL injection (better-sqlite3 parametrized mi?), input validation (HTTP API, MCP tools, CLI args), auth bypass, credential exposure
2. Performance: sync I/O sayimi (readFileSync, writeFileSync, existsSync, spawnSync — her biri dosya:satir), hot path tespiti, gereksiz disk I/O

Write to `.deckent/sprint-god-analysis/meta/security-performance.md`.

**Kanit:** ≥200 satir, 2 bolum.

---

## Task 45: META — i18n + CLI/MCP Parity + Test Coverage Map
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: code-reviewer
- Files: src/**/*.ts, tests/**/*.test.ts
- Scope: src/, tests/

### Description
Cross-cutting 3 analiz:
1. i18n: Dashboard TR/EN parity (en.ts vs tr.ts key eslesmesi), CLI help mesajlari dil, MCP tool description'lar, turkishNormalize kullanimi, hardcoded TR/EN string'ler
2. CLI/MCP parity (ADR-022): 40+ CLI komut ↔ 22 MCP tool eslesmesi tablosu, CLI-only vs MCP-only
3. Test coverage: src/X.ts → tests/X.test.ts eslesmesi, orphan src (test yok) listesi, orphan test (src yok) listesi, Memory V2 test gap (recall.ts, remember.ts, memory.ts 0 test!)

Write to `.deckent/sprint-god-analysis/meta/i18n-parity-coverage.md`.

**Kanit:** ≥250 satir, 3 bolum.

---

## Task 46: META — Memory V2 Integrity Deep Verification
- Model: opus
- Effort: high
- Skills: system-architect, typescript-expert
- Agent: architect
- Files: src/core/memory-*.ts, .brain/memory.db, .brain/exports/, .brain/archive/pre-v2/
- Scope: src/core/, .brain/

### Description
Memory V2 GOD-LEVEL dogrulama:
1. DB schema: 5 tablo + FTS5 + 3 trigger + 9 indeks — HEPSI mevcut mu?
2. 55 entry dogru mu? ADR count = archive/pre-v2/DECISIONS.md ADR sayisi?
3. FTS5 canli test: "docker heartbeat", "spawnSync security", "brain import" — sonuclar dogru mu?
4. turkishNormalize: "ISIK", "guvenlik", "Istanbul" — dual-layer calisiyor mu?
5. Export roundtrip: DB → export → reimport → count eslesmesi
6. @ referans surekliligi: CLAUDE.md, DECKENT.md, AGENTS.md → summary.md
7. Eski .md parse kodu: src/ icinde readFileSync + parseDebtTable + countBrainLines SIFIR mi?
8. brain.md/auditor.md/worker-default.md DB-first kurallari YAZILI mi?
9. archive/pre-v2/migration-manifest.json mevcut ve hash'ler dogru mu?
10. config.json memory section dogru mu?

Write to `.deckent/sprint-god-analysis/meta/memory-v2-god-verification.md`.

**Kanit:** ≥300 satir, 10 bolum.

---

## Task 47: META — Error Handling + TODO/FIXME Inventory
- Model: opus
- Effort: high
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: src/**/*.ts, tests/**/*.ts
- Scope: src/, tests/

### Description
Cross-cutting 2 analiz:
1. Error handling: try/catch uniformity, BrainError vs DeckentError dual hierarchy, silent swallow anti-pattern (bare catch {}), error propagation (console vs throw vs NO_GO)
2. TODO/FIXME/HACK/XXX/NOTE inventory: tum src/ + tests/ + docs/ — her biri dosya:satir formatinda, severity (urgent/planned/archived)

Write to `.deckent/sprint-god-analysis/meta/error-handling-todo.md`.

**Kanit:** ≥200 satir, 2 bolum.

---

## Task 48: FINAL — God Analysis Aggregation Report
- Model: opus
- Effort: high
- Priority: CRITICAL
- Dependencies: Task 1-47 tamamlanmis olmali
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Files: .deckent/sprint-god-analysis/FINAL-REPORT.md (YENI)
- Scope: .deckent/sprint-god-analysis/

### Description

TUM 47 task raporunu oku, analiz et, tek kapsamli GOD-LEVEL FINAL-REPORT.md uret.

**Rapor Yapisi (20+ section, ≥3000 satir):**
1. Executive Summary (health score /100, top 15 findings, dimension scores)
2. src/ Module-by-Module Ozeti (her modul top 5 finding)
3. Test Coverage Gap Heatmap (orphan src + orphan test tam listesi)
4. Documentation Coverage + Tutarlilik Gap
5. ADR Compliance Report (40+ ADR × ihlal sayisi)
6. Dead Code Inventory (tam liste, severity)
7. Security Findings (OWASP breakdown, SQL injection, credential)
8. Performance Hot Paths (sync I/O tam sayim, hot path listesi)
9. Type Safety Issues (any/@ts-ignore/non-null tam sayim)
10. Circular Dependency Report (DOT graph, ADR-008)
11. i18n Coverage Gap (TR/EN parity, dashboard, CLI, MCP)
12. CLI/MCP Parity Gap (ADR-022, tam eslestirme tablosu)
13. Memory V2 Integrity Summary (10-bolum dogrulama sonucu)
14. Config Schema Consistency
15. Error Handling Anti-Patterns (bare catch sayim, hierarchy)
16. TODO/FIXME/HACK Inventory Ozeti
17. Failed Analysis Flags (NO_GO worker raporlari — fix sonuclari dahil)
18. Sprint 142+ Debt Candidates (prioritized P0/P1/P2/P3)
19. Alperen Decision Points (strategic calls + risk trade-offs)
20. Sprint Meta-Metrics (task throughput, token harcamasi, coverage %)
21. Sprint 141 vs God Analysis Karsilastirma
22. References (worker rapor dosya listesi + linked ADR'ler)

**Kanit:** FINAL-REPORT.md ≥3000 satir, 22 section basligi mevcut, her section'da ≥1 somut bulgu.

---

## Hedef Metrikleri

| Metrik | Hedef |
|--------|-------|
| Task sayisi | **48** |
| Model | **OPUS ONLY** |
| Effort | **HIGH (max)** |
| Dosya coverage | **%100 — tek karakter bile atlanmaz** |
| NO_GO tolerance | **0 (fix edilir, rapora dahil)** |
| FINAL-REPORT | ≥3000 satir, 22 section |
| Worker raporlari | ~400+ per-file + batch |
| Tutarlilik dogrulama | .md cross-validation, DB roundtrip, i18n gap |
| Canli izleme | Wave bazli checkpoint (CC raporlar) |
| Sure hard cap | **12 saat** |
| Commit count | **0** |
