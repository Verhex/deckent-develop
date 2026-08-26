#!/usr/bin/env node
// lint-mock-factories — node:fs mock-gap ratchet (681-002, 2026-08-26).
//
// tests/** içindeki vi.mock('node:fs' | 'node:fs/promises', factory) çağrılarında
// factory'nin Vitest importOriginal parametresini çağırması gerekir. Parametresiz veya
// parametreyi çağırmayan factory, Node fs yüzeyi büyüdüğünde yeni export'ları sessizce
// saklayan "tam-factory"dir. Kuruluş borcu dosya-yolu ledger'ında yalnız azalabilir:
// yeni dosya FRESH, artık ihlal içermeyen kayıt STALE_BASELINE olarak kırmızı olur.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// 2026-08-26 kuruluş ölçümü: 276 dosya.
export const MOCK_FACTORY_BASELINE = new Set([
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/scoped-typecheck-authority.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/shared-context.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker-agent.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker-auth-check.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker-doc-skip.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker-feedback.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker-lifecycle.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker-shutdown.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker-verify-lang.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/agents/worker.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/config-editor.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/health.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/kill-all-endpoint.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/request-logging.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/security-headers.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/server-auth.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/server-body-schemas.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/server-edge.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/server-security.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/server.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/api/watcher.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/analyze-coverage.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/audit-command.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/agent.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/audit.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/ci-dashboard.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/cleanup.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/config-export.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/config-overhaul.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/config.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/doctor.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/explain-enhanced.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/explain.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/finalize.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/history-agents.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/history-overhaul.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/history.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/i18n-integration.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/init.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  // 2026-08-26 Faz-B: emekli output/onboard/job-runner/resources path'leri canonical hedefleriyle birleşti — 3 dupe düşümü (yalnız-azalma).
  "tests/cli/commands/onboard.test.ts",
  // 2026-08-26 Faz-B merge: output.test.ts canonical hedefi mock-temiz çıktı — girdi düşürüldü (yalnız-azalma ledger'ı).
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/resume.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/retro-rich.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/retro.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/review-finalize-overhaul.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/review.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/serve-acceptance-composition.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/skill-marketplace.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/skill.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/small-commands-improvements.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/status-agents.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/status-mode.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands/status.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/commands.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/config-global.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/dead-listener-migration.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/doctor-checks.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/doctor-memory-v2.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/doctor-providers.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/helpers/config-reader.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/helpers/wizard-provider.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/init-noninteractive.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/init-outcome-honesty.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/init-repair-failedsteps.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/kill-cascade.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/mode-command.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/mode-help.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/mode-run-alias.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/onboard-command.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/plan-yes-flag.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/review-active-settlement-reference.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/run-budget-contract.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/run-pre-dispatch-settlement.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/run-rename-alias.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/run.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/serve-first-run-banner.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/start-prompt-gate-flag.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/start-sandbox.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/status-comms.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/status-follow.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/test-run.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/watch-follow.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/cli/watch.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/agent-layer-precedence.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/agent-manifest-sync.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/agent-prompt-sync.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/analyzer-overhaul.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/analyzer.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/branch-coverage.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/config-cache.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/config.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/framework-detection.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/global-config.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/host-detector.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/identity-generator-step-order.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/identity-generator.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/identity-regen-default-skip.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/manifest-schema-lint.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/plugin-install.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/plugin.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/pool-activation-validation.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/routing/agent-pool-capabilities.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/skill-body-resolution.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/skill-catalog-readmodel.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/skill-pool.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/skill-profile-state.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/stack-detector.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/subscription.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/utils-deckent.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/core/utils-sprint-id.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/integration/npm-install-sim.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/audit-tool-actions.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/autonomous-start-honest.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/branch-coverage.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/job-runner.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/kill-force.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/nervous-tools-e2e.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/nervous-tools.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/resources.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/run-budget-authority.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/run-provider-free.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/run-tool-parity.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/start-autoapprove.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/start-cost-gate.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/start-estimate.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/start-lifecycle.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/start-snapshot-branch.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/status-failed-tasks.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/status-terminal-receipt.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/annotations.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/audit.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/autonomous.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/doctor.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/explain.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/help.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/history.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/index.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/init.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/misc-tools.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/run.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/start.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/status-agents.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/status-history.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/status-rich.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools/status.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools-debt-061-006.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools-enrichment-004.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools-enrichment.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/mcp/tools.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/adr-noise.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/alert-dedup.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/alert-emitter.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/apdd-pilot-rules.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/auditor-agent.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/auditor-baseline.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/auditor-edge.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/auditor-hb-reconciliation.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/auditor.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/monitor/gate-w1-boundary-alert.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/agent-routing-anomaly.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/agent-routing-positive.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/agent-routing.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/build-failure-recurrence.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/directives-protection-stress.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/directives-protection.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/scope-collision-live.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/scope-collision.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/detectors/token-spike.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/integration/observer-to-detector.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/nervous/integration/regression-sprint-146.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/ai-planner-honest-fallback.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/archive-directives-phase.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/archive-directives.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/auditor-stale-race.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/brain-budget-decay.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/brain-context.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/brain-coverage.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/brain-planning-precedence.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/brain-provider.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/brain-rebuild-gate.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/cascade-unblock-wire.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/changelog-update.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/cross-verify-docker-strict-launcher.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/debt-chain-walk.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/debt-ledger-coverage.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/debt-manager-fix-authority-wire.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/debt-manager.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/debt-resolution.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/debt364-followups.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/dependency-pipeline-integration.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/dependency-pipeline-wire.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/dependency-pipeline.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/doc-updaters/changelog-updater.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/doc-updaters/changelog.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/doc-updaters/doc-updater-consistency.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/doc-updaters/health-check.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/doc-updaters/metrics-updater.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/doc-updaters/readme-metrics.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/doc-updaters/sprint-log.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/docker-auth-precedence.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/docker-container-start-failed.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/docker-dist-guard.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/docker-final-only-containment.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/docker-multicli-buildarg.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/docker-provider-auth.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/docker-provider-cli.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/evaluate-result.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/f1014-auth-isolation.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/fix-agent-selection.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/fix-model-preserve.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/fix-retry-circuit-breaker.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/fix-task-enrichment.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/forced-skill-lineage-wire.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/fresh-eyes-rotation.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/git-self-mutation-guard.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/handoff-protocol.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/memory-decay.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/memory-limit-by-kind.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/mid-sprint-cost-abort.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/model-override-drop.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/monitor-adapter.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/multi-agent.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/pattern-reader.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/pattern-recorder.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/planner-notify.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/planner-override-precedence.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/planner-smoke-e2e.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/post-settlement-planner-wire.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/prompt-comment-refresh.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/result-watcher.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/rollback.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/shared-memory-wire.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/shared-memory.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/spawn-backend-docker-mounts.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/spawn-backend-docker.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/spawn-coordinator-oom.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/spawn-prevention.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/spawn-throw-lifecycle.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/sprint-phases-rollback.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/sprint2-debt.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/task-mode-agent-inject.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/timeout-watcher.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/tmux-edge.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/tmux-prompt-filename.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/tmux.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/wave-pipeline-activation.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/wm5-auth-guard.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/orchestra/worker-auth-isolation.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/claude-isAvailable.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/claude.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/codex-isAvailable.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/codex.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/cred-scrub-all-adapters.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/cross-provider-keys-scrub.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/cursor.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/deckbroker-wire.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/gemini-isAvailable.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/gemini.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/process-group-kill.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/sandbox.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/spawn-safe-crossplatform.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/subprocess-auth-noleak.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/providers/subprocess.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/scripts/pre-flight-health-check.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/security/api-auth.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/security/lock-atomicity.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/security/shell-injection.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/unit/heartbeat-daemon.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/unit/spawn-backend-docker.test.ts",
  // 2026-08-26 kuruluş ölçümü: mevcut tam-factory; yeni fs yüzeyleri eklenirken importOriginal'a taşınmalı.
  "tests/unit/sprint-utils.test.ts",
]);

function portablePath(value) {
  return String(value).replaceAll('\\', '/');
}

function testFiles(root) {
  const start = resolve(root, 'tests');
  try { if (!statSync(start).isDirectory()) return []; } catch { return []; }
  const files = [];
  const ignored = new Set(['node_modules', 'dist', 'out', 'coverage', '.vite']);
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = resolve(directory, entry.name);
      if (entry.isDirectory() && !ignored.has(entry.name)) visit(full);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(full);
    }
  };
  visit(start);
  return files;
}

function stringValue(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function isNodeFsMock(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const receiver = node.expression.expression;
  if (!ts.isIdentifier(receiver) || receiver.text !== 'vi' || node.expression.name.text !== 'mock') return false;
  const target = stringValue(node.arguments[0]);
  return target === 'node:fs' || target === 'node:fs/promises';
}

function factoryCallsImportOriginal(factory) {
  if (!ts.isArrowFunction(factory) && !ts.isFunctionExpression(factory)) return true;
  const parameter = factory.parameters[0]?.name;
  if (!parameter || !ts.isIdentifier(parameter)) return false;
  let called = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === parameter.text) called = true;
    ts.forEachChild(node, visit);
  };
  visit(factory.body);
  return called;
}

export function inspectMockFactorySource(content, filename) {
  const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
  const problems = [];
  const visit = (node) => {
    if (isNodeFsMock(node) && node.arguments[1] && !factoryCallsImportOriginal(node.arguments[1])) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      problems.push({
        code: 'FULL_NODE_FS_MOCK_FACTORY',
        file: portablePath(filename),
        line: position.line + 1,
        key: portablePath(filename),
        detail: 'node:fs factory importOriginal parametresini çağırmıyor',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

export function checkMockFactories(root = process.cwd(), baseline = MOCK_FACTORY_BASELINE) {
  const byFile = new Map();
  for (const filename of testFiles(root)) {
    const rel = portablePath(relative(root, filename));
    const problems = inspectMockFactorySource(readFileSync(filename, 'utf8'), rel);
    if (problems.length > 0) byFile.set(rel, problems[0]);
  }
  const fresh = [...byFile.values()].filter((problem) => !baseline.has(problem.key));
  const stale = [...baseline].filter((entry) => !byFile.has(entry));
  fresh.sort((a, b) => a.file.localeCompare(b.file));
  stale.sort((a, b) => a.localeCompare(b));
  return { ok: fresh.length === 0 && stale.length === 0, fresh, stale };
}

function main(argv) {
  const rootAt = argv.indexOf('--root');
  const root = resolve(rootAt >= 0 && argv[rootAt + 1] ? argv[rootAt + 1] : process.cwd());
  const result = checkMockFactories(root);
  if (result.ok) { process.stdout.write('mock factories: OK (only-shrink baseline)\n'); return 0; }
  for (const problem of result.fresh) process.stderr.write(`FULL_NODE_FS_MOCK_FACTORY ${problem.file}:${problem.line}: ${problem.detail}\n`);
  for (const entry of result.stale) process.stderr.write(`MOCK_FACTORY_STALE_BASELINE ${entry}: ihlal kalmadı — baseline'dan düşürün (yalnız-azalma ledger'ı)\n`);
  return 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
