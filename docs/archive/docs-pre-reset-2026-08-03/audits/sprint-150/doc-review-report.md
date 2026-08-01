# Documentation Review Report — Sprint 150

> Generated: 2026-04-21T10:55:08.287Z
> Root: /workspace
> Stale sprint cutoff: sprint-140 (current - 10)

## Summary

| Metric | Value |
|--------|-------|
| Total .md files scanned | 1180 |
| KEEP | 468 |
| REVISE | 128 |
| DELETE | 578 |
| MOVE | 6 |
| Broken internal links | 89 |
| Duplicate files | 12 |
| Files with stale sprint refs | 119 |

## KEEP

Files that appear current and well-maintained.

| File | Size | Last Modified | Lines | Sprint Refs |
|------|------|---------------|-------|-------------|
| `.brain/ERRORS.md` | 79.3KB | 2026-04-21 | 601 | s-149, s-150 |
| `.brain/exports/cli-mcp-parity-gap.md` | 7.3KB | 2026-04-17 | 144 | s-144, s-141, s-138 |
| `.brain/exports/debt.md` | 10.8KB | 2026-04-21 | 107 | s-138, s-145, s-144 |
| `.brain/exports/decisions.md` | 110.3KB | 2026-04-21 | 1915 | s-132, s-44, s-45 |
| `.brain/exports/memory.md` | 13.5KB | 2026-04-21 | 129 | s-149, s-148, s-146 |
| `.brain/exports/sprint-144-cli-mcp-audit.md` | 8.3KB | 2026-04-17 | 161 | s-144, s-145, s-139 |
| `.brain/exports/sprint-145-adaptive-timeout-spec.md` | 18.7KB | 2026-04-17 | 334 | s-145, s-144, s-134 |
| `.brain/exports/sprint-145-unified-observability-spec.md` | 32.4KB | 2026-04-17 | 752 | s-145, s-144, s-138 |
| `.brain/exports/summary.md` | 5.0KB | 2026-04-21 | 76 | s-44, s-45, s-46 |
| `.brain/MEMORY.md` | 12.7KB | 2026-04-21 | 100 | s-132, s-133, s-131 |
| `.brain/PATTERNS.md` | 177B | 2026-04-21 | 9 | s-69, s-149 |
| `.brain/PROJECT-IDENTITY.md` | 7.6KB | 2026-04-21 | 120 | s-72, s-75, s-76 |
| `.brain/RETRO.md` | 5.0KB | 2026-04-21 | 111 | s-149 |
| `.brain/sprints/sprint-139.md` | 5.9KB | 2026-04-15 | 72 | s-139, s-135, s-136 |
| `.brain/sprints/sprint-141.md` | 2.4KB | 2026-04-16 | 36 | s-141 |
| `.brain/sprints/sprint-142.md` | 6.8KB | 2026-04-16 | 68 | s-142 |
| `.brain/sprints/sprint-143.md` | 2.5KB | 2026-04-17 | 40 | s-143 |
| `.brain/sprints/sprint-144.md` | 3.4KB | 2026-04-17 | 47 | s-144, s-139, s-143 |
| `.brain/sprints/sprint-145.md` | 3.8KB | 2026-04-20 | 47 | s-145, s-144 |
| `.brain/sprints/sprint-146.md` | 2.2KB | 2026-04-20 | 37 | s-146, s-145 |
| `.brain/sprints/sprint-147.md` | 2.7KB | 2026-04-20 | 42 | s-147 |
| `.brain/sprints/sprint-148.md` | 3.7KB | 2026-04-20 | 48 | s-148, s-146 |
| `.brain/sprints/sprint-149.md` | 3.4KB | 2026-04-20 | 47 | s-149, s-146, s-148 |
| `.claude/rules/auditor.md` | 6.4KB | 2026-04-21 | 115 | s-149, s-144, s-44 |
| `.claude/rules/brain.md` | 7.8KB | 2026-04-21 | 129 | s-149, s-144, s-44 |
| `.claude/rules/worker-default.md` | 7.2KB | 2026-04-21 | 121 | s-149, s-144, s-44 |
| `.contracts/api-surface.md` | 5.5KB | 2026-04-16 | 159 | — |
| `.deckent/agents/accessibility-auditor/PROMPT.md` | 8.2KB | 2026-04-06 | 203 | — |
| `.deckent/agents/api-builder/PROMPT.md` | 5.0KB | 2026-03-21 | 167 | — |
| `.deckent/agents/architect/PROMPT.md` | 5.5KB | 2026-04-06 | 140 | — |
| `.deckent/agents/architecture-planner/PROMPT.md` | 1.2KB | 2026-04-06 | 24 | — |
| `.deckent/agents/bug-fixer/PROMPT.md` | 5.0KB | 2026-03-21 | 136 | — |
| `.deckent/agents/ci-guardian/PROMPT.md` | 4.3KB | 2026-03-26 | 132 | — |
| `.deckent/agents/code-reviewer/PROMPT.md` | 4.0KB | 2026-03-21 | 132 | — |
| `.deckent/agents/data-engineer/PROMPT.md` | 7.1KB | 2026-04-06 | 176 | — |
| `.deckent/agents/devops-engineer/PROMPT.md` | 6.2KB | 2026-04-06 | 166 | — |
| `.deckent/agents/doc-writer/PROMPT.md` | 3.8KB | 2026-03-21 | 131 | — |
| `.deckent/agents/frontend-designer/PROMPT.md` | 5.8KB | 2026-04-06 | 129 | — |
| `.deckent/agents/migration-specialist/PROMPT.md` | 6.2KB | 2026-04-06 | 176 | — |
| `.deckent/agents/performance-analyzer/PROMPT.md` | 6.3KB | 2026-03-21 | 175 | — |
| `.deckent/agents/refactorer/PROMPT.md` | 4.5KB | 2026-03-21 | 128 | — |
| `.deckent/agents/security-auditor/PROMPT.md` | 5.0KB | 2026-03-21 | 91 | — |
| `.deckent/plugins/code-reviewer/SKILL.md` | 3.3KB | 2026-03-20 | 105 | — |
| `.deckent/plugins/doc-writer/SKILL.md` | 2.6KB | 2026-03-19 | 97 | — |
| `.deckent/plugins/test-runner/SKILL.md` | 1.8KB | 2026-03-19 | 71 | — |
| `.deckent/skills/accessibility-expert/SKILL.md` | 3.7KB | 2026-04-06 | 56 | — |
| `.deckent/skills/anthropic-sdk/SKILL.md` | 3.4KB | 2026-04-06 | 50 | — |
| `.deckent/skills/api-builder/SKILL.md` | 3.2KB | 2026-03-21 | 67 | — |
| `.deckent/skills/ci-testing/SKILL.md` | 5.1KB | 2026-03-26 | 169 | — |
| `.deckent/skills/code-simplifier/SKILL.md` | 3.4KB | 2026-04-06 | 52 | — |
| `.deckent/skills/database-migration/SKILL.md` | 3.2KB | 2026-03-21 | 47 | — |
| `.deckent/skills/devops-engineer/SKILL.md` | 4.3KB | 2026-03-21 | 66 | — |
| `.deckent/skills/docker-expert/SKILL.md` | 3.9KB | 2026-04-06 | 51 | — |
| `.deckent/skills/documentation-writer/SKILL.md` | 3.3KB | 2026-03-21 | 61 | — |
| `.deckent/skills/frontend-design/SKILL.md` | 3.5KB | 2026-04-06 | 50 | — |
| `.deckent/skills/git-expert/SKILL.md` | 3.4KB | 2026-04-06 | 51 | — |
| `.deckent/skills/graphql-expert/SKILL.md` | 4.0KB | 2026-04-06 | 59 | — |
| `.deckent/skills/migration-expert/SKILL.md` | 3.7KB | 2026-04-06 | 53 | — |
| `.deckent/skills/monorepo-expert/SKILL.md` | 3.6KB | 2026-04-06 | 55 | — |
| `.deckent/skills/performance-optimizer/SKILL.md` | 4.0KB | 2026-03-21 | 61 | — |
| `.deckent/skills/python-expert/SKILL.md` | 3.2KB | 2026-03-21 | 52 | — |
| `.deckent/skills/react-specialist/SKILL.md` | 3.2KB | 2026-03-21 | 51 | — |
| `.deckent/skills/security-specialist/SKILL.md` | 3.7KB | 2026-03-21 | 54 | — |
| `.deckent/skills/system-architect/SKILL.md` | 2.0KB | 2026-04-06 | 63 | — |
| `.deckent/skills/testing-expert/SKILL.md` | 3.3KB | 2026-03-21 | 58 | — |
| `.deckent/skills/typescript-expert/SKILL.md` | 2.8KB | 2026-03-21 | 45 | — |
| `.deckent/sprint-138-layer3-scorecard.md` | 27.3KB | 2026-04-14 | 277 | s-138, s-137, s-136 |
| `.deckent/sprint-139-layer3-scorecard.md` | 20.2KB | 2026-04-15 | 290 | s-139, s-138, s-140 |
| `.deckent/sprint-139-session-starter.md` | 11.1KB | 2026-04-14 | 180 | s-139, s-138, s-137 |
| `.deckent/sprint-140-emergency-assessment.md` | 18.4KB | 2026-04-15 | 406 | s-140, s-141, s-138 |
| `.deckent/sprint-god-analysis/brain/brain-state.md` | 18.7KB | 2026-04-16 | 454 | s-142, s-141, s-132 |
| `.deckent/sprint-god-analysis/docs/superpowers-audits.md` | 22.0KB | 2026-04-16 | 422 | s-133, s-132, s-134 |
| `.deckent/sprint-god-analysis/FINAL-REPORT-TR.md` | 128.1KB | 2026-04-16 | 2615 | s-142, s-141, s-102 |
| `.deckent/sprint-god-analysis/FINAL-REPORT.md` | 147.7KB | 2026-04-20 | 3044 | s-142, s-141, s-102 |
| `.deckent/sprint-god-analysis/meta/architecture-graph.md` | 32.2KB | 2026-04-16 | 732 | s-142, s-143 |
| `.deckent/sprint-god-analysis/meta/dead-code-type-safety.md` | 24.3KB | 2026-04-16 | 432 | s-66, s-142, s-143 |
| `.deckent/sprint-god-analysis/meta/error-handling-todo.md` | 20.9KB | 2026-04-16 | 376 | s-142, s-139, s-34 |
| `.deckent/sprint-god-analysis/meta/i18n-parity-coverage.md` | 25.2KB | 2026-04-16 | 590 | s-142 |
| `.deckent/sprint-god-analysis/meta/memory-v2-god-verification.md` | 28.5KB | 2026-04-16 | 706 | s-141, s-138, s-132 |
| `.deckent/sprint-god-analysis/meta/root-config.md` | 21.0KB | 2026-04-16 | 473 | s-140, s-142 |
| `.deckent/sprint-god-analysis/meta/root-md-cross-validation.md` | 26.5KB | 2026-04-16 | 657 | s-141, s-140, s-102 |
| `.deckent/sprint-god-analysis/meta/rules-contracts-config.md` | 25.1KB | 2026-04-16 | 472 | s-138, s-140, s-142 |
| `.deckent/sprint-god-analysis/meta/security-performance.md` | 25.4KB | 2026-04-16 | 517 | s-139, s-140, s-142 |
| `.deckent/sprint-god-analysis/src/agents/worker.ts.md` | 7.7KB | 2026-04-16 | 121 | — |
| `.deckent/sprint-god-analysis/src/api/api-summary.md` | 3.3KB | 2026-04-16 | 94 | s-142 |
| `.deckent/sprint-god-analysis/src/api/rate-limiter.ts.md` | 3.7KB | 2026-04-16 | 85 | — |
| `.deckent/sprint-god-analysis/src/api/server.ts.md` | 5.8KB | 2026-04-16 | 108 | s-133, s-50, s-142 |
| `.deckent/sprint-god-analysis/src/api/watcher.ts.md` | 2.5KB | 2026-04-16 | 77 | — |
| `.deckent/sprint-god-analysis/src/cli/auto-setup.md` | 3.7KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/agent.ts.md` | 7.6KB | 2026-04-16 | 116 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/analyze.md` | 3.1KB | 2026-04-16 | 85 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/archive-debt.md` | 4.6KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/attach.ts.md` | 3.7KB | 2026-04-16 | 88 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/checkpoint.md` | 4.8KB | 2026-04-16 | 98 | s-142 |
| `.deckent/sprint-god-analysis/src/cli/commands/cleanup.md` | 5.2KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/config.md` | 6.0KB | 2026-04-16 | 101 | s-142 |
| `.deckent/sprint-god-analysis/src/cli/commands/dashboard.ts.md` | 5.6KB | 2026-04-16 | 100 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/docs.ts.md` | 4.9KB | 2026-04-16 | 95 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/doctor.md` | 7.6KB | 2026-04-16 | 132 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/explain.md` | 4.8KB | 2026-04-16 | 102 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/finalize.md` | 5.3KB | 2026-04-16 | 101 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/heartbeat.md` | 3.3KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/history.md` | 5.2KB | 2026-04-16 | 99 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/init.md` | 7.4KB | 2026-04-16 | 114 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/kill.md` | 5.0KB | 2026-04-16 | 101 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/memory.md` | 3.9KB | 2026-04-16 | 87 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/onboard.md` | 4.4KB | 2026-04-16 | 104 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/output.md` | 3.9KB | 2026-04-16 | 91 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/plan.md` | 3.6KB | 2026-04-16 | 87 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/plugin.ts.md` | 4.7KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/quick-start.md` | 3.7KB | 2026-04-16 | 91 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/recall.md` | 4.1KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/remember.md` | 3.0KB | 2026-04-16 | 83 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/resume.md` | 3.7KB | 2026-04-16 | 93 | s-138, s-140, s-142 |
| `.deckent/sprint-god-analysis/src/cli/commands/retro.md` | 6.1KB | 2026-04-16 | 107 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/review.md` | 5.5KB | 2026-04-16 | 97 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/run.md` | 5.9KB | 2026-04-16 | 102 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/serve.ts.md` | 4.5KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/set-directives.md` | 3.4KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/skill-marketplace.md` | 4.5KB | 2026-04-16 | 97 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/skill.ts.md` | 7.6KB | 2026-04-16 | 119 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/spawn.ts.md` | 5.7KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/start.md` | 6.1KB | 2026-04-16 | 108 | s-141 |
| `.deckent/sprint-god-analysis/src/cli/commands/status.md` | 5.4KB | 2026-04-16 | 102 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/sync.md` | 6.6KB | 2026-04-16 | 112 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/test-run.md` | 5.0KB | 2026-04-16 | 103 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/upgrade.md` | 4.5KB | 2026-04-16 | 103 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/watch.ts.md` | 5.5KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/cli/commands/web.ts.md` | 4.0KB | 2026-04-16 | 88 | — |
| `.deckent/sprint-god-analysis/src/cli/entry.md` | 4.1KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/agent-performance.md` | 5.0KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/agent-templates.md` | 4.0KB | 2026-04-16 | 79 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/change-categorizer.md` | 3.5KB | 2026-04-16 | 75 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/codex-config.md` | 4.0KB | 2026-04-16 | 80 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/config-reader.md` | 3.2KB | 2026-04-16 | 73 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/cursor-config.md` | 3.5KB | 2026-04-16 | 76 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/error-handler.md` | 4.1KB | 2026-04-16 | 78 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/eta-calculator.md` | 3.3KB | 2026-04-16 | 75 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/gemini-config.md` | 3.4KB | 2026-04-16 | 77 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/hints.md` | 3.5KB | 2026-04-16 | 77 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/messages.ts.md` | 5.8KB | 2026-04-16 | 106 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/output-mode.md` | 3.7KB | 2026-04-16 | 90 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/output.ts.md` | 8.4KB | 2026-04-16 | 136 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/progress-persistence.ts.md` | 4.2KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/progress.ts.md` | 3.4KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/prompt.ts.md` | 3.5KB | 2026-04-16 | 84 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/queue-display.md` | 2.8KB | 2026-04-16 | 79 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/recommendations.md` | 3.4KB | 2026-04-16 | 82 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/review-actions.md` | 4.6KB | 2026-04-16 | 99 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/review-summary.md` | 3.3KB | 2026-04-16 | 85 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/selective-retry.md` | 4.1KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/splash.ts.md` | 3.1KB | 2026-04-16 | 82 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/sprint-comparison.md` | 3.2KB | 2026-04-16 | 79 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/sprint-summary-rich.md` | 5.2KB | 2026-04-16 | 102 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/sprint-summary.md` | 4.4KB | 2026-04-16 | 97 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/terminal-utils.ts.md` | 3.4KB | 2026-04-16 | 87 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/theme.ts.md` | 3.6KB | 2026-04-16 | 88 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/wizard.ts.md` | 7.7KB | 2026-04-16 | 116 | — |
| `.deckent/sprint-god-analysis/src/cli/helpers/worker-status.ts.md` | 4.8KB | 2026-04-16 | 105 | — |
| `.deckent/sprint-god-analysis/src/cli/index.md` | 4.4KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/cli/version-info.md` | 3.4KB | 2026-04-16 | 90 | — |
| `.deckent/sprint-god-analysis/src/core/activation-engine.md` | 5.8KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/core/agent-cache.md` | 4.6KB | 2026-04-16 | 99 | — |
| `.deckent/sprint-god-analysis/src/core/agent-pool.md` | 7.5KB | 2026-04-16 | 125 | — |
| `.deckent/sprint-god-analysis/src/core/agent-selector.md` | 5.2KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/core/agent-types.ts.md` | 4.8KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/core/analyzer.md` | 7.0KB | 2026-04-16 | 113 | — |
| `.deckent/sprint-god-analysis/src/core/ci-learning.md` | 6.3KB | 2026-04-16 | 102 | — |
| `.deckent/sprint-god-analysis/src/core/condition-evaluator.md` | 5.1KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/src/core/config-migration.md` | 7.9KB | 2026-04-16 | 128 | — |
| `.deckent/sprint-god-analysis/src/core/config-types.md` | 7.5KB | 2026-04-16 | 123 | — |
| `.deckent/sprint-god-analysis/src/core/config.md` | 9.0KB | 2026-04-16 | 140 | s-63, s-64, s-140 |
| `.deckent/sprint-god-analysis/src/core/constants.md` | 6.5KB | 2026-04-16 | 118 | s-140 |
| `.deckent/sprint-god-analysis/src/core/credential-encryption.ts.md` | 5.4KB | 2026-04-16 | 116 | — |
| `.deckent/sprint-god-analysis/src/core/credentials.ts.md` | 5.4KB | 2026-04-16 | 115 | — |
| `.deckent/sprint-god-analysis/src/core/decision-config.ts.md` | 6.5KB | 2026-04-16 | 108 | — |
| `.deckent/sprint-god-analysis/src/core/decision-types.ts.md` | 5.5KB | 2026-04-16 | 104 | — |
| `.deckent/sprint-god-analysis/src/core/deck-file.ts.md` | 5.9KB | 2026-04-16 | 116 | — |
| `.deckent/sprint-god-analysis/src/core/environment.ts.md` | 2.8KB | 2026-04-16 | 81 | — |
| `.deckent/sprint-god-analysis/src/core/errors.ts.md` | 4.3KB | 2026-04-16 | 96 | — |
| `.deckent/sprint-god-analysis/src/core/global-config.ts.md` | 4.6KB | 2026-04-16 | 103 | — |
| `.deckent/sprint-god-analysis/src/core/index.ts.md` | 6.0KB | 2026-04-16 | 118 | — |
| `.deckent/sprint-god-analysis/src/core/intent-classifier.md` | 6.3KB | 2026-04-16 | 106 | — |
| `.deckent/sprint-god-analysis/src/core/lazy-loader.ts.md` | 3.8KB | 2026-04-16 | 89 | — |
| `.deckent/sprint-god-analysis/src/core/manifest-migrator.md` | 3.8KB | 2026-04-16 | 86 | s-142 |
| `.deckent/sprint-god-analysis/src/core/marketplace/dependency-resolver.md` | 4.8KB | 2026-04-16 | 95 | — |
| `.deckent/sprint-god-analysis/src/core/marketplace/marketplace-auth.md` | 4.5KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/core/marketplace/rating-system.md` | 4.2KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/src/core/marketplace/registry-client.md` | 5.3KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/core/marketplace/skill-sandbox.md` | 6.8KB | 2026-04-16 | 120 | — |
| `.deckent/sprint-god-analysis/src/core/memory-export.md` | 5.3KB | 2026-04-16 | 97 | — |
| `.deckent/sprint-god-analysis/src/core/memory-import.md` | 6.2KB | 2026-04-16 | 106 | — |
| `.deckent/sprint-god-analysis/src/core/memory-normalize.md` | 6.1KB | 2026-04-16 | 96 | s-142 |
| `.deckent/sprint-god-analysis/src/core/memory-query.md` | 8.3KB | 2026-04-16 | 109 | s-142 |
| `.deckent/sprint-god-analysis/src/core/memory-store.md` | 10.1KB | 2026-04-16 | 135 | s-142 |
| `.deckent/sprint-god-analysis/src/core/memory-types.md` | 6.6KB | 2026-04-16 | 101 | — |
| `.deckent/sprint-god-analysis/src/core/mode-presets.ts.md` | 2.9KB | 2026-04-16 | 75 | — |
| `.deckent/sprint-god-analysis/src/core/model-equivalence.ts.md` | 4.8KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/core/model-registry.ts.md` | 4.9KB | 2026-04-16 | 107 | — |
| `.deckent/sprint-god-analysis/src/core/monitoring-types.ts.md` | 5.3KB | 2026-04-16 | 100 | — |
| `.deckent/sprint-god-analysis/src/core/multi-ide.md` | 4.3KB | 2026-04-16 | 83 | s-142 |
| `.deckent/sprint-god-analysis/src/core/notification-config.ts.md` | 3.7KB | 2026-04-16 | 78 | — |
| `.deckent/sprint-god-analysis/src/core/notification-providers/discord.ts.md` | 3.4KB | 2026-04-16 | 83 | — |
| `.deckent/sprint-god-analysis/src/core/notification-providers/slack.ts.md` | 3.0KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/core/notification-providers/webhook.md` | 4.9KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/core/notification-providers/webhook.ts.md` | 3.9KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/core/notifications.ts.md` | 4.1KB | 2026-04-16 | 81 | — |
| `.deckent/sprint-god-analysis/src/core/output-formatter.md` | 4.5KB | 2026-04-16 | 89 | — |
| `.deckent/sprint-god-analysis/src/core/plugin-hooks.md` | 7.8KB | 2026-04-16 | 122 | s-142 |
| `.deckent/sprint-god-analysis/src/core/plugin-loader.md` | 4.3KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/core/plugin.md` | 6.2KB | 2026-04-16 | 107 | — |
| `.deckent/sprint-god-analysis/src/core/provider.ts.md` | 7.7KB | 2026-04-16 | 112 | — |
| `.deckent/sprint-god-analysis/src/core/routing-engine.ts.md` | 7.1KB | 2026-04-16 | 126 | — |
| `.deckent/sprint-god-analysis/src/core/routing-types.ts.md` | 5.6KB | 2026-04-16 | 114 | — |
| `.deckent/sprint-god-analysis/src/core/skill-cache.md` | 4.6KB | 2026-04-16 | 97 | — |
| `.deckent/sprint-god-analysis/src/core/skill-pool.md` | 5.3KB | 2026-04-16 | 112 | — |
| `.deckent/sprint-god-analysis/src/core/skill-registry.md` | 4.3KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/core/skill-selector.md` | 3.9KB | 2026-04-16 | 87 | — |
| `.deckent/sprint-god-analysis/src/core/skill-types.ts.md` | 4.4KB | 2026-04-16 | 95 | — |
| `.deckent/sprint-god-analysis/src/core/sprint-types.ts.md` | 5.9KB | 2026-04-16 | 100 | — |
| `.deckent/sprint-god-analysis/src/core/stack-detector.md` | 5.7KB | 2026-04-16 | 91 | — |
| `.deckent/sprint-god-analysis/src/core/subscription.md` | 4.5KB | 2026-04-16 | 85 | — |
| `.deckent/sprint-god-analysis/src/core/system-profile.md` | 3.5KB | 2026-04-16 | 84 | — |
| `.deckent/sprint-god-analysis/src/core/task-types.ts.md` | 6.6KB | 2026-04-16 | 117 | s-140 |
| `.deckent/sprint-god-analysis/src/core/telemetry.md` | 4.1KB | 2026-04-16 | 90 | — |
| `.deckent/sprint-god-analysis/src/core/token-counter.md` | 5.1KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/core/types.ts.md` | 3.8KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/core/utils.ts.md` | 8.1KB | 2026-04-16 | 145 | — |
| `.deckent/sprint-god-analysis/src/dashboard/ActivityFeed.tsx.md` | 5.2KB | 2026-04-16 | 99 | — |
| `.deckent/sprint-god-analysis/src/dashboard/AgentDetail.tsx.md` | 4.8KB | 2026-04-16 | 95 | — |
| `.deckent/sprint-god-analysis/src/dashboard/App.tsx.md` | 4.2KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/dashboard/batch-report.md` | 28.6KB | 2026-04-16 | 787 | — |
| `.deckent/sprint-god-analysis/src/dashboard/DebtTable.tsx.md` | 4.2KB | 2026-04-16 | 82 | — |
| `.deckent/sprint-god-analysis/src/dashboard/EmptyState.tsx.md` | 3.2KB | 2026-04-16 | 78 | — |
| `.deckent/sprint-god-analysis/src/dashboard/Layout.tsx.md` | 5.2KB | 2026-04-16 | 100 | — |
| `.deckent/sprint-god-analysis/src/dashboard/main.tsx.md` | 2.6KB | 2026-04-16 | 70 | — |
| `.deckent/sprint-god-analysis/src/dashboard/NewSprintModal.tsx.md` | 5.2KB | 2026-04-16 | 100 | — |
| `.deckent/sprint-god-analysis/src/dashboard/SimpleMarkdown.tsx.md` | 4.7KB | 2026-04-16 | 90 | — |
| `.deckent/sprint-god-analysis/src/dashboard/Skeleton.tsx.md` | 4.1KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/mcp/helpers/enrich.md` | 4.3KB | 2026-04-16 | 85 | — |
| `.deckent/sprint-god-analysis/src/mcp/helpers/format.md` | 3.5KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/mcp/helpers/index.md` | 1.8KB | 2026-04-16 | 64 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/agents.md` | 2.2KB | 2026-04-16 | 70 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/config.md` | 2.1KB | 2026-04-16 | 67 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/dashboard.md` | 2.3KB | 2026-04-16 | 69 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/debt.md` | 3.0KB | 2026-04-16 | 78 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/directives.md` | 1.8KB | 2026-04-16 | 67 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/index.md` | 1.9KB | 2026-04-16 | 64 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/memory.md` | 3.2KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/retro.md` | 2.4KB | 2026-04-16 | 74 | — |
| `.deckent/sprint-god-analysis/src/mcp/resources/tasks.md` | 2.3KB | 2026-04-16 | 71 | — |
| `.deckent/sprint-god-analysis/src/mcp/server.md` | 4.2KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/agent-list.ts.md` | 2.4KB | 2026-04-16 | 73 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/analyze.ts.md` | 2.5KB | 2026-04-16 | 70 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/checkpoint.ts.md` | 3.0KB | 2026-04-16 | 74 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/config.md` | 3.5KB | 2026-04-16 | 81 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/directives.ts.md` | 2.6KB | 2026-04-16 | 71 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/docs.ts.md` | 3.2KB | 2026-04-16 | 75 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/doctor.md` | 3.6KB | 2026-04-16 | 77 | s-141 |
| `.deckent/sprint-god-analysis/src/mcp/tools/explain.ts.md` | 3.5KB | 2026-04-16 | 76 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/help.ts.md` | 4.0KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/history.ts.md` | 3.2KB | 2026-04-16 | 73 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/index.ts.md` | 3.1KB | 2026-04-16 | 95 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/init.md` | 6.2KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/job-runner.ts.md` | 3.1KB | 2026-04-16 | 76 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/kill.md` | 4.0KB | 2026-04-16 | 79 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/memory-query.md` | 4.7KB | 2026-04-16 | 94 | s-140 |
| `.deckent/sprint-god-analysis/src/mcp/tools/memory-query.ts.md` | 3.3KB | 2026-04-16 | 80 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/plan.md` | 3.5KB | 2026-04-16 | 79 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/retro.ts.md` | 3.5KB | 2026-04-16 | 76 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/review.ts.md` | 3.6KB | 2026-04-16 | 88 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/run.md` | 4.1KB | 2026-04-16 | 84 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/skill-list.ts.md` | 2.3KB | 2026-04-16 | 72 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/start.md` | 4.9KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/status.md` | 5.6KB | 2026-04-16 | 99 | — |
| `.deckent/sprint-god-analysis/src/mcp/tools/sync.ts.md` | 2.3KB | 2026-04-16 | 70 | — |
| `.deckent/sprint-god-analysis/src/monitor/dashboard-manager.ts.md` | 3.8KB | 2026-04-16 | 90 | — |
| `.deckent/sprint-god-analysis/src/monitor/monitor-summary.md` | 3.3KB | 2026-04-16 | 93 | s-138, s-142 |
| `.deckent/sprint-god-analysis/src/monitor/sprint-state.ts.md` | 2.7KB | 2026-04-16 | 81 | — |
| `.deckent/sprint-god-analysis/src/orchestra/authority-enforcer.ts.md` | 5.8KB | 2026-04-16 | 109 | s-139, s-140, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/batch-stats.md` | 4.8KB | 2026-04-16 | 95 | — |
| `.deckent/sprint-god-analysis/src/orchestra/brain-context.md` | 6.1KB | 2026-04-16 | 105 | — |
| `.deckent/sprint-god-analysis/src/orchestra/brain.ts.md` | 7.9KB | 2026-04-16 | 116 | s-36, s-136, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/ci-reporter.md` | 5.2KB | 2026-04-16 | 104 | — |
| `.deckent/sprint-god-analysis/src/orchestra/combination-scorer.md` | 1.9KB | 2026-04-16 | 57 | s-139, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/connector.ts.md` | 5.4KB | 2026-04-16 | 111 | — |
| `.deckent/sprint-god-analysis/src/orchestra/coverage-validator.md` | 4.8KB | 2026-04-16 | 90 | — |
| `.deckent/sprint-god-analysis/src/orchestra/debt-manager.md` | 8.1KB | 2026-04-16 | 111 | s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/decision-engine.md` | 5.6KB | 2026-04-16 | 89 | s-66, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/decision-logger.md` | 5.7KB | 2026-04-16 | 93 | s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/decision-replay.md` | 4.2KB | 2026-04-16 | 82 | s-66, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/decision-steps/agent-step.md` | 4.1KB | 2026-04-16 | 78 | s-66, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/decision-steps/scope-step.md` | 4.4KB | 2026-04-16 | 80 | s-66, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/changelog.md` | 5.2KB | 2026-04-16 | 103 | — |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/health-check.md` | 4.1KB | 2026-04-16 | 99 | — |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/index.md` | 3.3KB | 2026-04-16 | 82 | — |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/metrics-updater.md` | 4.5KB | 2026-04-16 | 101 | — |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/readme-metrics.md` | 3.7KB | 2026-04-16 | 96 | — |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/registry.md` | 3.4KB | 2026-04-16 | 88 | — |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/sprint-log.md` | 3.7KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/orchestra/doc-updaters/types.md` | 3.5KB | 2026-04-16 | 87 | — |
| `.deckent/sprint-god-analysis/src/orchestra/ecosystem-intelligence.md` | 5.9KB | 2026-04-16 | 93 | s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/handoff-protocol.md` | 5.4KB | 2026-04-16 | 91 | s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/heartbeat-daemon.ts.md` | 6.1KB | 2026-04-16 | 131 | — |
| `.deckent/sprint-god-analysis/src/orchestra/index.md` | 4.5KB | 2026-04-16 | 94 | — |
| `.deckent/sprint-god-analysis/src/orchestra/learning-decay.md` | 2.0KB | 2026-04-16 | 56 | s-139, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/learning-migration.md` | 2.1KB | 2026-04-16 | 56 | s-139, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/content-generators.md` | 8.0KB | 2026-04-16 | 119 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/doc-cache.md` | 4.7KB | 2026-04-16 | 101 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/docs-config.md` | 4.6KB | 2026-04-16 | 97 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/index.md` | 3.3KB | 2026-04-16 | 82 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/managed-doc-runner.md` | 6.9KB | 2026-04-16 | 110 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/plugin-loader.md` | 5.9KB | 2026-04-16 | 106 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/section-updater.md` | 5.5KB | 2026-04-16 | 101 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/template-renderer.md` | 6.8KB | 2026-04-16 | 116 | — |
| `.deckent/sprint-god-analysis/src/orchestra/managed-docs/types.md` | 4.4KB | 2026-04-16 | 91 | — |
| `.deckent/sprint-god-analysis/src/orchestra/mid-sprint-adapter.ts.md` | 5.0KB | 2026-04-16 | 107 | — |
| `.deckent/sprint-god-analysis/src/orchestra/model-selector.md` | 4.2KB | 2026-04-16 | 90 | — |
| `.deckent/sprint-god-analysis/src/orchestra/multi-agent.md` | 3.3KB | 2026-04-16 | 88 | — |
| `.deckent/sprint-god-analysis/src/orchestra/outcome-tracker.md` | 5.1KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/orchestra/parallel-pipeline.ts.md` | 4.1KB | 2026-04-16 | 91 | — |
| `.deckent/sprint-god-analysis/src/orchestra/pattern-reader.md` | 3.6KB | 2026-04-16 | 84 | — |
| `.deckent/sprint-god-analysis/src/orchestra/pattern-recorder.md` | 3.1KB | 2026-04-16 | 81 | — |
| `.deckent/sprint-god-analysis/src/orchestra/planner.md` | 5.9KB | 2026-04-16 | 100 | — |
| `.deckent/sprint-god-analysis/src/orchestra/promotion-pipeline.md` | 4.3KB | 2026-04-16 | 89 | — |
| `.deckent/sprint-god-analysis/src/orchestra/prompt-token-optimizer.md` | 3.2KB | 2026-04-16 | 80 | — |
| `.deckent/sprint-god-analysis/src/orchestra/quality-assessor.md` | 4.9KB | 2026-04-16 | 98 | — |
| `.deckent/sprint-god-analysis/src/orchestra/result-merger.md` | 3.9KB | 2026-04-16 | 89 | — |
| `.deckent/sprint-god-analysis/src/orchestra/result-watcher.md` | 3.7KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/orchestra/rollback.md` | 4.9KB | 2026-04-16 | 100 | — |
| `.deckent/sprint-god-analysis/src/orchestra/rule-evolver.md` | 3.6KB | 2026-04-16 | 86 | — |
| `.deckent/sprint-god-analysis/src/orchestra/self-modifying-detector.ts.md` | 5.1KB | 2026-04-16 | 106 | — |
| `.deckent/sprint-god-analysis/src/orchestra/shared-memory.md` | 3.6KB | 2026-04-16 | 88 | — |
| `.deckent/sprint-god-analysis/src/orchestra/spawn-backend-mock.md` | 3.5KB | 2026-04-16 | 90 | s-140 |
| `.deckent/sprint-god-analysis/src/orchestra/spawn-backend.md` | 4.9KB | 2026-04-16 | 93 | — |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-checkpoint.md` | 5.2KB | 2026-04-16 | 98 | s-138, s-139, s-140 |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-controller.ts.md` | 9.1KB | 2026-04-16 | 118 | s-136, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-docs-helpers.md` | 8.4KB | 2026-04-16 | 131 | — |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-docs-updater.md` | 9.4KB | 2026-04-16 | 132 | — |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-finalizer.ts.md` | 11.2KB | 2026-04-16 | 141 | s-139, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-lifecycle.ts.md` | 9.4KB | 2026-04-16 | 134 | s-136, s-142, s-139 |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-phases.ts.md` | 9.4KB | 2026-04-16 | 131 | s-72, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-planner.ts.md` | 8.8KB | 2026-04-16 | 127 | s-136, s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-retro-writer.md` | 8.2KB | 2026-04-16 | 121 | — |
| `.deckent/sprint-god-analysis/src/orchestra/task-analyzer.md` | 3.1KB | 2026-04-16 | 82 | — |
| `.deckent/sprint-god-analysis/src/orchestra/task-builder.md` | 7.3KB | 2026-04-16 | 128 | — |
| `.deckent/sprint-god-analysis/src/orchestra/task-retry.md` | 3.0KB | 2026-04-16 | 86 | s-142 |
| `.deckent/sprint-god-analysis/src/orchestra/task-router.md` | 4.3KB | 2026-04-16 | 89 | — |
| `.deckent/sprint-god-analysis/src/orchestra/temp-skill-generator.md` | 4.2KB | 2026-04-16 | 85 | — |
| `.deckent/sprint-god-analysis/src/orchestra/tmux.md` | 6.3KB | 2026-04-16 | 112 | — |
| `.deckent/sprint-god-analysis/src/providers/codex.ts.md` | 4.8KB | 2026-04-16 | 101 | — |
| `.deckent/sprint-god-analysis/src/providers/gemini.ts.md` | 5.1KB | 2026-04-16 | 102 | — |
| `.deckent/sprint-god-analysis/src/providers/providers-summary.md` | 3.6KB | 2026-04-16 | 86 | s-139, s-142, s-48 |
| `.deckent/sprint-god-analysis/src/providers/sandbox.ts.md` | 4.7KB | 2026-04-16 | 92 | — |
| `.deckent/sprint-god-analysis/tests/cli.md` | 26.4KB | 2026-04-16 | 623 | s-143, s-144 |
| `.deckent/sprint-god-analysis/tests/core.md` | 33.3KB | 2026-04-16 | 632 | s-63, s-64, s-142 |
| `.deckent/sprint-god-analysis/tests/integration-e2e-dashboard.md` | 41.8KB | 2026-04-16 | 803 | s-44, s-123, s-142 |
| `.deckent/sprint-god-analysis/tests/mcp-api-monitor.md` | 31.7KB | 2026-04-16 | 962 | s-139, s-50, s-134 |
| `.deckent/sprint-god-analysis/tests/orchestra.md` | 54.3KB | 2026-04-16 | 1480 | s-138, s-142, s-139 |
| `.deckent/sprint-god-analysis/tests/remaining.md` | 27.3KB | 2026-04-16 | 532 | s-139, s-142 |
| `.deckent/workspace/BOOT.md` | 438B | 2026-04-09 | 9 | — |
| `.deckent/workspace/IDENTITY.md` | 4.0KB | 2026-04-20 | 32 | s-144, s-134, s-135 |
| `.deckent/workspace/TOOLS.md` | 147B | 2026-03-18 | 8 | — |
| `.deckent/workspace/WORKER-GUIDE.md` | 3.1KB | 2026-04-15 | 107 | — |
| `.gemini/rules/auditor.md` | 5.0KB | 2026-04-21 | 79 | s-149, s-144, s-44 |
| `.gemini/rules/brain.md` | 5.7KB | 2026-04-21 | 86 | s-149, s-144, s-44 |
| `.gemini/rules/worker-default.md` | 5.5KB | 2026-04-21 | 82 | s-149, s-144, s-44 |
| `.github/ISSUE_TEMPLATE/bug_report.md` | 624B | 2026-03-18 | 38 | — |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 353B | 2026-03-18 | 24 | — |
| `.github/ISSUE_TEMPLATE/security.md` | 2.6KB | 2026-03-20 | 84 | — |
| `.github/pull_request_template.md` | 414B | 2026-03-22 | 26 | — |
| `AGENTS.md` | 7.2KB | 2026-04-21 | 160 | s-148, s-149 |
| `BETA-TRACKER.md` | 85.9KB | 2026-04-21 | 1535 | s-148, s-149, s-150 |
| `CHANGELOG.md` | 4.1KB | 2026-04-20 | 82 | s-148, s-146, s-147 |
| `CLAUDE.md` | 5.3KB | 2026-04-16 | 112 | s-141, s-134 |
| `CODE_OF_CONDUCT.md` | 2.1KB | 2026-03-18 | 53 | — |
| `COMPETITIVE-ANALYSIS.md` | 5.5KB | 2026-03-26 | 133 | — |
| `CONTRIBUTING.md` | 28.6KB | 2026-04-10 | 927 | — |
| `deckent-hub/CONTRIBUTING.md` | 11.4KB | 2026-04-20 | 313 | — |
| `deckent-hub/README.md` | 4.4KB | 2026-04-20 | 116 | — |
| `deckent-hub/SKILL_TEMPLATE.md` | 5.7KB | 2026-04-20 | 183 | — |
| `deckent-hub/skills/calendar-google/SKILL.md` | 3.8KB | 2026-04-20 | 110 | — |
| `deckent-hub/skills/currency-converter/SKILL.md` | 3.4KB | 2026-04-20 | 98 | — |
| `deckent-hub/skills/discord-moderator/SKILL.md` | 4.1KB | 2026-04-20 | 121 | — |
| `deckent-hub/skills/email-imap/SKILL.md` | 4.3KB | 2026-04-20 | 144 | s-149 |
| `deckent-hub/skills/file-organizer/SKILL.md` | 3.8KB | 2026-04-20 | 102 | — |
| `deckent-hub/skills/github-issues/SKILL.md` | 3.3KB | 2026-04-20 | 94 | — |
| `deckent-hub/skills/notion-sync/SKILL.md` | 2.9KB | 2026-04-20 | 83 | — |
| `deckent-hub/skills/reddit-fetcher/SKILL.md` | 4.4KB | 2026-04-20 | 130 | — |
| `deckent-hub/skills/rss-reader/SKILL.md` | 3.0KB | 2026-04-20 | 87 | — |
| `deckent-hub/skills/screenshot-vision/SKILL.md` | 3.0KB | 2026-04-20 | 79 | — |
| `deckent-hub/skills/slack-notifier/SKILL.md` | 3.6KB | 2026-04-20 | 107 | — |
| `deckent-hub/skills/spotify-control/SKILL.md` | 2.8KB | 2026-04-20 | 81 | — |
| `deckent-hub/skills/spotify-playlist/SKILL.md` | 3.1KB | 2026-04-20 | 96 | s-149 |
| `deckent-hub/skills/telegram-bot/SKILL.md` | 3.1KB | 2026-04-20 | 107 | — |
| `deckent-hub/skills/todoist/SKILL.md` | 3.0KB | 2026-04-20 | 101 | s-149 |
| `deckent-hub/skills/translator/SKILL.md` | 3.1KB | 2026-04-20 | 94 | — |
| `deckent-hub/skills/twitter-post/SKILL.md` | 2.3KB | 2026-04-20 | 68 | — |
| `deckent-hub/skills/weather-forecast/SKILL.md` | 2.5KB | 2026-04-20 | 63 | — |
| `deckent-hub/skills/web-scraper/SKILL.md` | 3.2KB | 2026-04-20 | 97 | — |
| `deckent-hub/skills/youtube-downloader/SKILL.md` | 3.9KB | 2026-04-20 | 111 | — |
| `DIRECTIVES.md` | 113.4KB | 2026-04-21 | 2502 | s-150, s-151, s-149 |
| `docs/analysis/competitive-analysis.md` | 17.5KB | 2026-04-10 | 286 | s-134, s-141, s-151 |
| `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` | 250.3KB | 2026-04-20 | 2677 | s-132, s-133, s-134 |
| `docs/audits/sprint-138/mcp-cli-parity-report.md` | 11.8KB | 2026-04-14 | 249 | s-138, s-85, s-139 |
| `docs/audits/sprint-139/dead-code-decisions.md` | 12.6KB | 2026-04-15 | 271 | s-139, s-140, s-142 |
| `docs/audits/sprint-139/dead-code-report.md` | 4.2KB | 2026-04-21 | 110 | s-139, s-132, s-140 |
| `docs/audits/sprint-139/plan-file-diagnostic.md` | 4.9KB | 2026-04-15 | 132 | s-139, s-138, s-140 |
| `docs/audits/sprint-139/token-usage-report.md` | 4.3KB | 2026-04-15 | 111 | s-139, s-138, s-140 |
| `docs/audits/sprint-143/load-test-report.md` | 1.9KB | 2026-04-17 | 61 | — |
| `docs/audits/sprint-144/load-test-report.md` | 2.0KB | 2026-04-17 | 64 | — |
| `docs/audits/sprint-145/load-test-report.md` | 2.1KB | 2026-04-20 | 66 | — |
| `docs/audits/sprint-146/load-test-report.md` | 2.2KB | 2026-04-20 | 68 | — |
| `docs/audits/sprint-147/load-test-report.md` | 2.3KB | 2026-04-20 | 70 | — |
| `docs/audits/sprint-148/i18n-validation.md` | 3.8KB | 2026-04-20 | 88 | s-148 |
| `docs/audits/sprint-148/install-matrix.md` | 1.8KB | 2026-04-20 | 54 | s-148, s-150 |
| `docs/audits/sprint-148/linux-validation.md` | 1.5KB | 2026-04-20 | 44 | s-148, s-139 |
| `docs/audits/sprint-148/load-test-report.md` | 2.4KB | 2026-04-20 | 72 | — |
| `docs/audits/sprint-148/macos-validation.md` | 1.7KB | 2026-04-20 | 51 | s-148 |
| `docs/audits/sprint-148/npm-publish-dry.md` | 3.2KB | 2026-04-20 | 126 | s-148, s-149, s-147 |
| `docs/audits/sprint-148/provider-parity.md` | 3.1KB | 2026-04-20 | 83 | — |
| `docs/audits/sprint-148/test-writer-removal-justification.md` | 4.2KB | 2026-04-20 | 104 | s-148, s-145, s-146 |
| `docs/audits/sprint-148/wsl2-validation.md` | 3.4KB | 2026-04-20 | 71 | s-148, s-139, s-150 |
| `docs/audits/sprint-149/doc-review-report.md` | 119.1KB | 2026-04-20 | 1317 | s-149, s-139, s-144 |
| `docs/audits/sprint-149/i18n-parity-report.md` | 22.8KB | 2026-04-20 | 622 | s-150, s-145, s-70 |
| `docs/audits/sprint-149/load-test-report.md` | 2.4KB | 2026-04-20 | 73 | — |
| `docs/audits/sprint-149/npm-publish-dry-final.md` | 2.3KB | 2026-04-20 | 80 | s-149, s-150, s-140 |
| `docs/audits/sprint-150/i18n-parity-report.md` | 23.1KB | 2026-04-21 | 630 | s-150, s-145, s-70 |
| `docs/CHANGELOG.md` | 94.7KB | 2026-04-21 | 2345 | s-149, s-148, s-146 |
| `docs/development/agent-guide.md` | 6.7KB | 2026-03-26 | 160 | — |
| `docs/development/plugin-guide.md` | 19.6KB | 2026-03-26 | 732 | — |
| `docs/directives/sprint-143.md` | 16.1KB | 2026-04-17 | 358 | s-143, s-139, s-144 |
| `docs/directives/sprint-144.md` | 14.6KB | 2026-04-17 | 313 | s-144, s-143, s-139 |
| `docs/directives/sprint-145.md` | 12.6KB | 2026-04-17 | 268 | s-145, s-146, s-143 |
| `docs/governance/INDEX.md` | 2.3KB | 2026-04-20 | 60 | s-132, s-142 |
| `docs/guide/docker-backend.md` | 9.7KB | 2026-04-09 | 376 | — |
| `docs/index.md` | 1.5KB | 2026-03-26 | 39 | — |
| `docs/reference/marketplace.md` | 6.7KB | 2026-04-10 | 204 | — |
| `docs/reference/migration-guide.md` | 13.4KB | 2026-04-06 | 501 | — |
| `docs/reference/skills.md` | 7.6KB | 2026-03-26 | 215 | — |
| `docs/release/public-repo-manifest.md` | 5.3KB | 2026-04-20 | 123 | s-149, s-150 |
| `docs/release/release-checklist.md` | 3.2KB | 2026-03-25 | 179 | — |
| `docs/ROADMAP-GOD-LEVEL.md` | 16.7KB | 2026-04-20 | 325 | s-149, s-200, s-148 |
| `docs/SPRINT-LOG.md` | 122.6KB | 2026-04-21 | 3981 | s-89, s-23, s-25 |
| `docs/sprint-log/Sprint-146.md` | 6.3KB | 2026-04-20 | 148 | s-146, s-145, s-147 |
| `docs/sprint-log/Sprint-148.md` | 9.1KB | 2026-04-20 | 236 | s-148, s-147, s-146 |
| `docs/superpowers/plans/2026-04-14-sprint-139-deckent-god-sprint-plan.md` | 42.2KB | 2026-04-14 | 1218 | s-139, s-138, s-137 |
| `docs/superpowers/plans/2026-04-16-memory-v2-db-first-plan.md` | 88.1KB | 2026-04-16 | 2633 | s-100, s-139, s-138 |
| `docs/superpowers/plans/2026-04-17-sprint-143-implementation-plan.md` | 61.1KB | 2026-04-17 | 1695 | s-143, s-139, s-138 |
| `docs/superpowers/plans/2026-04-17-sprint-144-implementation-plan.md` | 37.1KB | 2026-04-17 | 1045 | s-144, s-143, s-135 |
| `docs/superpowers/plans/2026-04-17-sprint-145-implementation-plan.md` | 37.8KB | 2026-04-17 | 1149 | s-145, s-144, s-146 |
| `docs/superpowers/specs/2026-04-13-config-backup-rotation-design.md` | 6.5KB | 2026-04-13 | 140 | — |
| `docs/superpowers/specs/2026-04-14-sprint-137-recovery-design.md` | 35.3KB | 2026-04-14 | 699 | s-137, s-136, s-135 |
| `docs/superpowers/specs/2026-04-14-sprint-138-architectural-pivot-design.md` | 55.4KB | 2026-04-14 | 1291 | s-138, s-137, s-134 |
| `docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md` | 115.8KB | 2026-04-14 | 3125 | s-139, s-138, s-134 |
| `docs/superpowers/specs/2026-04-16-memory-v2-db-first-design.md` | 29.1KB | 2026-04-16 | 691 | s-140, s-139 |
| `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md` | 51.7KB | 2026-04-17 | 832 | s-143, s-142, s-145 |
| `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md` | 25.9KB | 2026-04-20 | 584 | s-145, s-147, s-150 |
| `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` | 31.4KB | 2026-04-20 | 434 | s-148, s-147, s-150 |
| `docs/worker-guide.md` | 4.0KB | 2026-04-15 | 126 | s-139, s-140 |
| `examples/quickstart/DIRECTIVES.md` | 1.0KB | 2026-03-20 | 44 | — |
| `examples/quickstart/README.md` | 1.8KB | 2026-03-25 | 78 | — |
| `SECURITY.md` | 2.7KB | 2026-03-22 | 60 | — |
| `src/connectors/whatsapp-README.md` | 4.2KB | 2026-04-21 | 130 | s-150, s-153, s-152 |
| `src/core/rule-templates/auditor.template.md` | 1.2KB | 2026-04-17 | 32 | — |
| `src/core/rule-templates/brain.template.md` | 1.9KB | 2026-04-17 | 39 | — |
| `src/core/rule-templates/worker-default.template.md` | 1.7KB | 2026-04-17 | 35 | — |
| `tests/PLATFORM.md` | 2.0KB | 2026-03-22 | 75 | — |

## REVISE

Files that need attention — stale sprint references, broken links, or outdated content.

| File | Size | Last Modified | Reasons |
|------|------|---------------|---------|
| `.brain/DEBT.md` | 544B | 2026-04-14 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.brain/sprints/sprint-136.md` | 1.7KB | 2026-04-13 | stale sprint refs (max sprint-136, cutoff sprint-140) |
| `.brain/sprints/sprint-137.md` | 1.0KB | 2026-04-14 | stale sprint refs (max sprint-137, cutoff sprint-140) |
| `.brain/sprints/sprint-138.md` | 1.5KB | 2026-04-14 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-134-layer3-scorecard.md` | 11.2KB | 2026-04-10 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `.deckent/sprint-135-layer3-scorecard.md` | 13.9KB | 2026-04-12 | stale sprint refs (max sprint-136, cutoff sprint-140) |
| `.deckent/sprint-136-layer3-scorecard.md` | 18.7KB | 2026-04-13 | stale sprint refs (max sprint-137, cutoff sprint-140) |
| `.deckent/sprint-137-layer3-scorecard.md` | 21.1KB | 2026-04-14 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-137-verifier-log.md` | 494B | 2026-04-14 | stale sprint refs (max sprint-137, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/docs/remaining.md` | 32.8KB | 2026-04-16 | 2 broken link(s): ARCHITECTURE.md, API.md |
| `.deckent/sprint-god-analysis/src/agents/all-agents-analysis.md` | 60.9KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/api/auth.ts.md` | 3.8KB | 2026-04-16 | stale sprint refs (max sprint-133, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/core/file-lock.ts.md` | 6.2KB | 2026-04-16 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/core/notification-dispatcher.ts.md` | 4.2KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/core/notify-adapters/cli-adapter.md` | 4.3KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/core/notify-adapters/mcp-adapter.md` | 3.9KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/core/observability.md` | 5.3KB | 2026-04-16 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/core/output-collector.md` | 5.5KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/core/provider-capabilities.ts.md` | 4.4KB | 2026-04-16 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/extensions/index.ts.md` | 3.9KB | 2026-04-16 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/extensions/vscode-extension.ts.md` | 3.8KB | 2026-04-16 | stale sprint refs (max sprint-49, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/mcp/tools/cleanup.md` | 3.6KB | 2026-04-16 | stale sprint refs (max sprint-1, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/monitor/auditor.ts.md` | 6.2KB | 2026-04-16 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/monitor/index.ts.md` | 2.6KB | 2026-04-16 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/baseline-tracker.md` | 5.6KB | 2026-04-16 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/conflict-resolver.ts.md` | 5.0KB | 2026-04-16 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/dependency-scheduler.ts.md` | 6.6KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/event-stream.ts.md` | 5.9KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/ipc-registry.ts.md` | 6.6KB | 2026-04-16 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/result-collector.md` | 7.4KB | 2026-04-16 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/result-evaluator.md` | 9.0KB | 2026-04-16 | stale sprint refs (max sprint-138, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/spawn-backend-docker.md` | 6.7KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-estimator.md` | 5.0KB | 2026-04-16 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-metrics.md` | 7.2KB | 2026-04-16 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-pid-manager.md` | 5.0KB | 2026-04-16 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-reporter.md` | 4.6KB | 2026-04-16 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-spawner.md` | 8.8KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/orchestra/sprint-utils.md` | 8.5KB | 2026-04-16 | stale sprint refs (max sprint-75, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/providers/claude.ts.md` | 4.6KB | 2026-04-16 | stale sprint refs (max sprint-48, cutoff sprint-140) |
| `.deckent/sprint-god-analysis/src/providers/subprocess.ts.md` | 4.6KB | 2026-04-16 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `DECKENT.md` | 18.3KB | 2026-04-16 | stale sprint refs (max sprint-1, cutoff sprint-140) |
| `docs/analysis/cli-deep-analysis.md` | 85.0KB | 2026-04-06 | stale sprint refs (max sprint-89, cutoff sprint-140) |
| `docs/analysis/cli-mcp-master-audit.md` | 29.9KB | 2026-04-06 | stale sprint refs (max sprint-89, cutoff sprint-140) |
| `docs/analysis/full-audit.md` | 60.3KB | 2026-04-06 | stale sprint refs (max sprint-89, cutoff sprint-140) |
| `docs/analysis/sprint-metrics.md` | 7.5KB | 2026-03-26 | stale sprint refs (max sprint-54, cutoff sprint-140) |
| `docs/architecture/agent-skill-architecture.md` | 26.6KB | 2026-04-06 | stale sprint refs (max sprint-31, cutoff sprint-140) |
| `docs/architecture/agents.md` | 6.7KB | 2026-03-26 | stale sprint refs (max sprint-62, cutoff sprint-140) |
| `docs/architecture/architecture.md` | 66.8KB | 2026-04-07 | stale sprint refs (max sprint-100, cutoff sprint-140); 10 broken link(s): ../DECKENT-MASTER-BLUEPRINT.md, ../DECKENT-MASTER-BLUEPRINT.md, SECURITY.md |
| `docs/architecture/authority-matrix.md` | 24.1KB | 2026-04-15 | 6 broken link(s): ../../.brain/DECISIONS.md, .brain/DECISIONS.md, .brain/DECISIONS.md |
| `docs/architecture/memory-system.md` | 9.6KB | 2026-03-26 | stale sprint refs (max sprint-65, cutoff sprint-140) |
| `docs/architecture/sprint-lifecycle.md` | 26.5KB | 2026-04-06 | stale sprint refs (max sprint-42, cutoff sprint-140) |
| `docs/audits/mock-safety-audit.md` | 30.7KB | 2026-04-10 | stale sprint refs (max sprint-133, cutoff sprint-140) |
| `docs/audits/sprint-132/W1-security-multi-tenancy.md` | 25.3KB | 2026-04-10 | stale sprint refs (max sprint-134, cutoff sprint-140); 1 broken link(s): '...' |
| `docs/audits/sprint-132/W2-performance-scalability.md` | 20.7KB | 2026-04-10 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `docs/audits/sprint-132/W3-reliability.md` | 18.0KB | 2026-04-10 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `docs/audits/sprint-132/W4-customization.md` | 24.1KB | 2026-04-10 | stale sprint refs (max sprint-133, cutoff sprint-140) |
| `docs/audits/sprint-132/W5-architecture-consistency.md` | 18.7KB | 2026-04-10 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `docs/audits/sprint-132/W6-competitive-positioning.md` | 28.4KB | 2026-04-10 | stale sprint refs (max sprint-137, cutoff sprint-140) |
| `docs/audits/sprint-134/load-test-report.md` | 4.3KB | 2026-04-10 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `docs/audits/sprint-139/cascade-block-live-evidence.md` | 3.9KB | 2026-04-15 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `docs/audits/sprint-139/translator-role-elimination.md` | 9.0KB | 2026-04-15 | stale sprint refs (max sprint-139, cutoff sprint-140) |
| `docs/design/multi-project-isolation.md` | 17.3KB | 2026-04-10 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `docs/development/brain-guide.md` | 7.6KB | 2026-04-06 | stale sprint refs (max sprint-19, cutoff sprint-140); 4 broken link(s): ARCHITECTURE.md, ../DECKENT-MASTER-BLUEPRINT.md, ../.claude/rules/brain.md |
| `docs/development/dashboard-guide.md` | 7.4KB | 2026-04-06 | stale sprint refs (max sprint-19, cutoff sprint-140); 4 broken link(s): ARCHITECTURE.md, API.md, ../DECKENT-MASTER-BLUEPRINT.md |
| `docs/development/troubleshooting.md` | 13.7KB | 2026-03-26 | stale sprint refs (max sprint-65, cutoff sprint-140) |
| `docs/development/worker-guide.md` | 21.0KB | 2026-03-26 | stale sprint refs (max sprint-18, cutoff sprint-140) |
| `docs/directives/INDEX.md` | 2.2KB | 2026-03-26 | stale sprint refs (max sprint-65, cutoff sprint-140) |
| `docs/directives/sprint-027.md` | 19.8KB | 2026-03-20 | stale sprint refs (max sprint-27, cutoff sprint-140) |
| `docs/directives/sprint-028.md` | 16.9KB | 2026-03-20 | stale sprint refs (max sprint-29, cutoff sprint-140) |
| `docs/directives/sprint-029.md` | 17.7KB | 2026-03-21 | stale sprint refs (max sprint-29, cutoff sprint-140) |
| `docs/directives/sprint-030.md` | 18.0KB | 2026-03-21 | stale sprint refs (max sprint-30, cutoff sprint-140) |
| `docs/directives/sprint-031.md` | 24.4KB | 2026-03-21 | stale sprint refs (max sprint-31, cutoff sprint-140) |
| `docs/directives/sprint-032.md` | 23.1KB | 2026-03-21 | stale sprint refs (max sprint-32, cutoff sprint-140) |
| `docs/directives/sprint-033.md` | 25.2KB | 2026-03-21 | stale sprint refs (max sprint-33, cutoff sprint-140) |
| `docs/directives/sprint-034.md` | 17.7KB | 2026-03-20 | stale sprint refs (max sprint-100, cutoff sprint-140) |
| `docs/directives/sprint-035.md` | 9.6KB | 2026-03-22 | stale sprint refs (max sprint-35, cutoff sprint-140) |
| `docs/directives/sprint-036.md` | 8.4KB | 2026-03-22 | stale sprint refs (max sprint-36, cutoff sprint-140) |
| `docs/directives/sprint-037.md` | 14.6KB | 2026-03-22 | stale sprint refs (max sprint-37, cutoff sprint-140) |
| `docs/directives/sprint-038.md` | 18.7KB | 2026-03-22 | stale sprint refs (max sprint-38, cutoff sprint-140) |
| `docs/directives/sprint-039.md` | 11.0KB | 2026-03-22 | stale sprint refs (max sprint-39, cutoff sprint-140) |
| `docs/directives/sprint-040.md` | 15.8KB | 2026-03-23 | stale sprint refs (max sprint-40, cutoff sprint-140) |
| `docs/directives/sprint-041.md` | 7.5KB | 2026-03-23 | stale sprint refs (max sprint-41, cutoff sprint-140) |
| `docs/directives/sprint-042.md` | 7.5KB | 2026-03-23 | stale sprint refs (max sprint-42, cutoff sprint-140) |
| `docs/directives/sprint-051.md` | 2.8KB | 2026-03-25 | stale sprint refs (max sprint-51, cutoff sprint-140) |
| `docs/directives/sprint-052.md` | 5.4KB | 2026-03-25 | stale sprint refs (max sprint-52, cutoff sprint-140) |
| `docs/directives/sprint-053.md` | 1.8KB | 2026-03-25 | stale sprint refs (max sprint-53, cutoff sprint-140) |
| `docs/directives/sprint-055.md` | 27.4KB | 2026-03-25 | stale sprint refs (max sprint-55, cutoff sprint-140) |
| `docs/directives/sprint-056.md` | 25.7KB | 2026-03-25 | stale sprint refs (max sprint-56, cutoff sprint-140) |
| `docs/directives/sprint-059.md` | 13.4KB | 2026-03-25 | stale sprint refs (max sprint-59, cutoff sprint-140) |
| `docs/directives/sprint-061.md` | 8.1KB | 2026-03-26 | stale sprint refs (max sprint-61, cutoff sprint-140) |
| `docs/directives/sprint-062.md` | 11.5KB | 2026-03-26 | stale sprint refs (max sprint-62, cutoff sprint-140) |
| `docs/directives/sprint-063.md` | 11.9KB | 2026-03-26 | stale sprint refs (max sprint-63, cutoff sprint-140) |
| `docs/directives/sprint-100.md` | 20.3KB | 2026-03-25 | stale sprint refs (max sprint-100, cutoff sprint-140) |
| `docs/directives/sprint-101.md` | 6.3KB | 2026-03-25 | stale sprint refs (max sprint-101, cutoff sprint-140) |
| `docs/directives/sprint-102.md` | 4.5KB | 2026-03-25 | stale sprint refs (max sprint-102, cutoff sprint-140) |
| `docs/guide/concepts.md` | 7.1KB | 2026-03-26 | stale sprint refs (max sprint-1, cutoff sprint-140); 5 broken link(s): /reference/config, /guide/getting-started, /guide/first-sprint |
| `docs/guide/deckent-nedir.md` | 43.6KB | 2026-04-06 | stale sprint refs (max sprint-99, cutoff sprint-140) |
| `docs/guide/faq.md` | 18.7KB | 2026-04-06 | stale sprint refs (max sprint-65, cutoff sprint-140); 5 broken link(s): ./QUICKSTART.md, ./ARCHITECTURE.md, ./MCP-GUIDE.md |
| `docs/guide/first-sprint.md` | 5.9KB | 2026-04-06 | stale sprint refs (max sprint-1, cutoff sprint-140); 5 broken link(s): /guide/getting-started, /guide/multi-provider, /guide/concepts |
| `docs/guide/getting-started.md` | 4.6KB | 2026-04-06 | stale sprint refs (max sprint-1, cutoff sprint-140); 7 broken link(s): /guide/multi-provider, /reference/config, /guide/concepts |
| `docs/guide/quickstart.md` | 8.2KB | 2026-04-06 | stale sprint refs (max sprint-1, cutoff sprint-140); 10 broken link(s): MULTI-PROVIDER-GUIDE.md, CONFIG-REFERENCE.md, API.md |
| `docs/reference/api-examples.md` | 22.5KB | 2026-04-06 | stale sprint refs (max sprint-25, cutoff sprint-140) |
| `docs/reference/api.md` | 53.7KB | 2026-04-09 | stale sprint refs (max sprint-38, cutoff sprint-140) |
| `docs/reference/cli.md` | 17.0KB | 2026-04-21 | stale sprint refs (max sprint-42, cutoff sprint-140) |
| `docs/reference/config-reference.md` | 15.6KB | 2026-04-06 | 6 broken link(s): MULTI-PROVIDER-GUIDE.md, ARCHITECTURE.md, BRAIN-GUIDE.md |
| `docs/reference/glossary.md` | 19.4KB | 2026-04-06 | stale sprint refs (max sprint-38, cutoff sprint-140); 1 broken link(s): ../DECKENT-MASTER-BLUEPRINT.md |
| `docs/reference/health-check.md` | 6.9KB | 2026-04-09 | stale sprint refs (max sprint-70, cutoff sprint-140) |
| `docs/reference/mcp-guide.md` | 19.4KB | 2026-04-06 | stale sprint refs (max sprint-18, cutoff sprint-140) |
| `docs/reference/multi-provider.md` | 6.4KB | 2026-03-26 | 3 broken link(s): CONFIG-REFERENCE.md, ARCHITECTURE.md, TROUBLESHOOTING.md |
| `docs/reference/performance.md` | 19.2KB | 2026-04-06 | stale sprint refs (max sprint-99, cutoff sprint-140); 6 broken link(s): CONFIG-REFERENCE.md, ARCHITECTURE.md, SPRINT-LIFECYCLE.md |
| `docs/reference/security.md` | 13.4KB | 2026-04-01 | 2 broken link(s): ../DECKENT-MASTER-BLUEPRINT.md, ../DECKENT-MASTER-BLUEPRINT.md |
| `docs/release/release-notes.md` | 9.4KB | 2026-04-06 | stale sprint refs (max sprint-65, cutoff sprint-140) |
| `docs/release/roadmap.md` | 4.4KB | 2026-04-07 | stale sprint refs (max sprint-100, cutoff sprint-140); 1 broken link(s): ../DECKENT-MASTER-BLUEPRINT.md |
| `docs/superpowers/plans/2026-04-11-sprint-134-plan.md` | 57.5KB | 2026-04-10 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `docs/superpowers/plans/2026-04-11-sprint-135-plan.md` | 60.9KB | 2026-04-10 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `docs/superpowers/plans/2026-04-13-config-backup-rotation.md` | 22.3KB | 2026-04-13 | stale sprint refs (max sprint-136, cutoff sprint-140); 1 broken link(s): docs/smoke/... |
| `docs/superpowers/plans/2026-04-13-sprint-136-plan.md` | 42.7KB | 2026-04-13 | stale sprint refs (max sprint-137, cutoff sprint-140) |
| `docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md` | 34.7KB | 2026-04-14 | 2 broken link(s): project_sprint137_completed.md, project_sprint138_preflight.md |
| `docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md` | 43.1KB | 2026-04-14 | 2 broken link(s): project_sprint138_completed.md, project_sprint139_preflight.md |
| `docs/superpowers/specs/2026-04-10-sprint-133-design.md` | 11.8KB | 2026-04-10 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `docs/superpowers/specs/2026-04-10-sprint-135-design.md` | 32.3KB | 2026-04-10 | stale sprint refs (max sprint-136, cutoff sprint-140) |
| `docs/superpowers/specs/2026-04-11-sprint-134-design.md` | 20.5KB | 2026-04-10 | stale sprint refs (max sprint-135, cutoff sprint-140) |
| `docs/superpowers/specs/2026-04-11-sprint-134-draft-directives.md` | 16.1KB | 2026-04-10 | stale sprint refs (max sprint-137, cutoff sprint-140) |
| `docs/superpowers/specs/2026-04-13-sprint-136-design.md` | 34.1KB | 2026-04-13 | stale sprint refs (max sprint-137, cutoff sprint-140) |
| `docs/vision/roadmap.md` | 12.6KB | 2026-04-15 | stale sprint refs (max sprint-134, cutoff sprint-140) |
| `README-TR.md` | 26.0KB | 2026-04-21 | 3 broken link(s): docs/assets/demo.gif, docs/assets/nervous-tui.png, docs/assets/dashboard.png |
| `README.md` | 23.8KB | 2026-04-21 | 3 broken link(s): docs/assets/demo.gif, docs/assets/nervous-tui.png, docs/assets/dashboard.png |
| `VISION.md` | 8.3KB | 2026-04-10 | stale sprint refs (max sprint-133, cutoff sprint-140) |

## DELETE

Files recommended for removal — empty, duplicate, or archived noise.

| File | Size | Reason |
|------|------|--------|
| `.brain/archive/DEBT-ARCHIVE.md` | 34.4KB | in archive directory |
| `.brain/archive/decisions-root-pre-sprint143/DECISIONS.md` | 94.1KB | duplicate of .brain/archive/pre-v2/DECISIONS.md |
| `.brain/archive/directives-sprint-132.md` | 41.6KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-135.md` | 25.0KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-136.md` | 30.7KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-137.md` | 12.3KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-138.md` | 25.2KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-143.md` | 16.1KB | duplicate of docs/directives/sprint-143.md |
| `.brain/archive/DIRECTIVES-sprint-144.md` | 463B | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-145.md` | 463B | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-146.md` | 21.2KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-147.md` | 62.1KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-148.md` | 48.8KB | in archive directory |
| `.brain/archive/DIRECTIVES-sprint-149.md` | 54.3KB | in archive directory |
| `.brain/archive/errors-sprint-129.md` | 25.4KB | in archive directory |
| `.brain/archive/pre-v2/DEBT.md` | 544B | duplicate of .brain/DEBT.md |
| `.brain/archive/pre-v2/DECISIONS.md` | 94.1KB | in archive directory |
| `.brain/archive/pre-v2/MEMORY.md` | 4.3KB | in archive directory |
| `.brain/archive/pre-v2/PATTERNS.md` | 177B | in archive directory |
| `.brain/archive/pre-v2/PROJECT-IDENTITY.md` | 7.6KB | in archive directory |
| `.brain/archive/pre-v2/RETRO.md` | 5.4KB | duplicate of .brain/archive/retro-sprint-141.md |
| `.brain/archive/retro-sprint-058.md` | 1.3KB | in archive directory |
| `.brain/archive/retro-sprint-059.md` | 576B | in archive directory |
| `.brain/archive/retro-sprint-060.md` | 1.5KB | in archive directory |
| `.brain/archive/retro-sprint-061.md` | 1.0KB | in archive directory |
| `.brain/archive/retro-sprint-062.md` | 1.0KB | in archive directory |
| `.brain/archive/retro-sprint-063.md` | 845B | in archive directory |
| `.brain/archive/retro-sprint-064.md` | 3.5KB | in archive directory |
| `.brain/archive/retro-sprint-066.md` | 1.3KB | in archive directory |
| `.brain/archive/retro-sprint-067.md` | 855B | in archive directory |
| `.brain/archive/retro-sprint-068.md` | 1.2KB | in archive directory |
| `.brain/archive/retro-sprint-069.md` | 1.3KB | in archive directory |
| `.brain/archive/retro-sprint-070.md` | 1.9KB | in archive directory |
| `.brain/archive/retro-sprint-071.md` | 1.6KB | in archive directory |
| `.brain/archive/retro-sprint-072.md` | 1.0KB | in archive directory |
| `.brain/archive/retro-sprint-073.md` | 1.6KB | in archive directory |
| `.brain/archive/retro-sprint-074.md` | 1.6KB | in archive directory |
| `.brain/archive/retro-sprint-075.md` | 1.6KB | in archive directory |
| `.brain/archive/retro-sprint-076.md` | 1.0KB | in archive directory |
| `.brain/archive/retro-sprint-077.md` | 1.2KB | in archive directory |
| `.brain/archive/retro-sprint-078.md` | 1.1KB | in archive directory |
| `.brain/archive/retro-sprint-079.md` | 1.3KB | in archive directory |
| `.brain/archive/retro-sprint-080.md` | 1.1KB | in archive directory |
| `.brain/archive/retro-sprint-081.md` | 1.8KB | in archive directory |
| `.brain/archive/retro-sprint-082.md` | 1.1KB | in archive directory |
| `.brain/archive/retro-sprint-083.md` | 1.4KB | in archive directory |
| `.brain/archive/retro-sprint-085.md` | 1.5KB | duplicate of .brain/archive/retro-sprint-086.md |
| `.brain/archive/retro-sprint-086.md` | 1.5KB | in archive directory |
| `.brain/archive/retro-sprint-087.md` | 1.1KB | in archive directory |
| `.brain/archive/retro-sprint-088.md` | 559B | in archive directory |
| `.brain/archive/retro-sprint-089.md` | 1.3KB | in archive directory |
| `.brain/archive/retro-sprint-090.md` | 1.5KB | in archive directory |
| `.brain/archive/retro-sprint-091.md` | 1.2KB | in archive directory |
| `.brain/archive/retro-sprint-092.md` | 1.9KB | in archive directory |
| `.brain/archive/retro-sprint-093.md` | 1.8KB | in archive directory |
| `.brain/archive/retro-sprint-094.md` | 1.3KB | in archive directory |
| `.brain/archive/retro-sprint-095.md` | 1.4KB | in archive directory |
| `.brain/archive/retro-sprint-096.md` | 940B | in archive directory |
| `.brain/archive/retro-sprint-097.md` | 3.0KB | in archive directory |
| `.brain/archive/retro-sprint-098.md` | 3.2KB | in archive directory |
| `.brain/archive/retro-sprint-099.md` | 2.0KB | in archive directory |
| `.brain/archive/retro-sprint-100.md` | 2.0KB | in archive directory |
| `.brain/archive/retro-sprint-101.md` | 824B | in archive directory |
| `.brain/archive/retro-sprint-102.md` | 3.0KB | in archive directory |
| `.brain/archive/retro-sprint-103.md` | 2.6KB | in archive directory |
| `.brain/archive/retro-sprint-104.md` | 2.9KB | in archive directory |
| `.brain/archive/retro-sprint-105.md` | 1.7KB | in archive directory |
| `.brain/archive/retro-sprint-106.md` | 996B | in archive directory |
| `.brain/archive/retro-sprint-107.md` | 1.2KB | in archive directory |
| `.brain/archive/retro-sprint-108.md` | 1.2KB | in archive directory |
| `.brain/archive/retro-sprint-110.md` | 1.2KB | in archive directory |
| `.brain/archive/retro-sprint-111.md` | 1.2KB | duplicate of .brain/archive/retro-sprint-110.md |
| `.brain/archive/retro-sprint-113.md` | 885B | in archive directory |
| `.brain/archive/retro-sprint-115.md` | 1.2KB | duplicate of .brain/archive/retro-sprint-110.md |
| `.brain/archive/retro-sprint-116.md` | 1.2KB | in archive directory |
| `.brain/archive/retro-sprint-117.md` | 1.2KB | duplicate of .brain/archive/retro-sprint-110.md |
| `.brain/archive/retro-sprint-118.md` | 862B | in archive directory |
| `.brain/archive/retro-sprint-119.md` | 1.2KB | duplicate of .brain/archive/retro-sprint-110.md |
| `.brain/archive/retro-sprint-120.md` | 868B | in archive directory |
| `.brain/archive/retro-sprint-121.md` | 864B | in archive directory |
| `.brain/archive/retro-sprint-122.md` | 941B | in archive directory |
| `.brain/archive/retro-sprint-123.md` | 936B | in archive directory |
| `.brain/archive/retro-sprint-124.md` | 1.5KB | in archive directory |
| `.brain/archive/retro-sprint-125.md` | 1.7KB | in archive directory |
| `.brain/archive/retro-sprint-126.md` | 2.6KB | in archive directory |
| `.brain/archive/retro-sprint-127.md` | 2.6KB | in archive directory |
| `.brain/archive/retro-sprint-128.md` | 1.3KB | in archive directory |
| `.brain/archive/retro-sprint-129.md` | 1.8KB | in archive directory |
| `.brain/archive/retro-sprint-132.md` | 987B | in archive directory |
| `.brain/archive/retro-sprint-133.md` | 1.4KB | in archive directory |
| `.brain/archive/retro-sprint-135.md` | 2.4KB | in archive directory |
| `.brain/archive/retro-sprint-136.md` | 4.0KB | in archive directory |
| `.brain/archive/retro-sprint-137.md` | 4.9KB | in archive directory |
| `.brain/archive/retro-sprint-138.md` | 2.4KB | in archive directory |
| `.brain/archive/retro-sprint-139.md` | 3.1KB | in archive directory |
| `.brain/archive/retro-sprint-141.md` | 5.4KB | in archive directory |
| `.brain/archive/retro-sprint-142.md` | 5.7KB | in archive directory |
| `.brain/archive/retro-sprint-143.md` | 10.2KB | in archive directory |
| `.brain/archive/retro-sprint-144.md` | 4.6KB | in archive directory |
| `.brain/archive/retro-sprint-145.md` | 6.0KB | in archive directory |
| `.brain/archive/retro-sprint-146.md` | 7.5KB | in archive directory |
| `.brain/archive/retro-sprint-147.md` | 4.9KB | in archive directory |
| `.brain/archive/retro-sprint-148.md` | 4.1KB | in archive directory |
| `.brain/archive/retro-sprint-149.md` | 5.5KB | in archive directory |
| `.brain/archive/sprint-001.md` | 284B | in archive directory |
| `.brain/archive/sprint-002.md` | 352B | in archive directory |
| `.brain/archive/sprint-003.md` | 394B | in archive directory |
| `.brain/archive/sprint-004.md` | 304B | in archive directory |
| `.brain/archive/sprint-005.md` | 352B | in archive directory |
| `.brain/archive/sprint-006.md` | 250B | in archive directory |
| `.brain/archive/sprint-007.md` | 269B | in archive directory |
| `.brain/archive/sprint-008.md` | 316B | in archive directory |
| `.brain/archive/sprint-009.md` | 352B | in archive directory |
| `.brain/archive/sprint-010.md` | 399B | in archive directory |
| `.brain/archive/sprint-011.md` | 331B | in archive directory |
| `.brain/archive/sprint-012.md` | 371B | in archive directory |
| `.brain/archive/sprint-013.md` | 400B | in archive directory |
| `.brain/archive/sprint-014.md` | 336B | in archive directory |
| `.brain/archive/sprint-015.md` | 455B | in archive directory |
| `.brain/archive/sprint-016.md` | 440B | in archive directory |
| `.brain/archive/sprint-017.md` | 397B | in archive directory |
| `.brain/archive/sprint-018.md` | 553B | in archive directory |
| `.brain/archive/sprint-019.md` | 512B | in archive directory |
| `.brain/archive/sprint-020.md` | 743B | in archive directory |
| `.brain/archive/sprint-021.md` | 404B | in archive directory |
| `.brain/archive/sprint-022.md` | 615B | in archive directory |
| `.brain/archive/sprint-023.md` | 870B | in archive directory |
| `.brain/archive/sprint-024.md` | 862B | in archive directory |
| `.brain/archive/sprint-025.md` | 2.2KB | in archive directory |
| `.brain/archive/sprint-026.md` | 413B | in archive directory |
| `.brain/archive/sprint-027.md` | 1.0KB | in archive directory |
| `.brain/archive/sprint-028.md` | 463B | in archive directory |
| `.brain/archive/sprint-029.md` | 441B | in archive directory |
| `.brain/archive/sprint-030.md` | 439B | in archive directory |
| `.brain/archive/sprint-031.md` | 437B | in archive directory |
| `.brain/archive/sprint-032.md` | 309B | in archive directory |
| `.brain/archive/sprint-033.md` | 1.0KB | in archive directory |
| `.brain/archive/sprint-037.md` | 1.1KB | in archive directory |
| `.brain/archive/sprint-039.md` | 1.1KB | in archive directory |
| `.brain/archive/sprint-040.md` | 981B | in archive directory |
| `.brain/archive/sprint-041.md` | 700B | in archive directory |
| `.brain/archive/sprint-042.md` | 577B | in archive directory |
| `.brain/archive/sprint-046.md` | 847B | in archive directory |
| `.brain/archive/sprint-047.md` | 698B | in archive directory |
| `.brain/archive/sprint-048.md` | 673B | in archive directory |
| `.brain/archive/sprint-049.md` | 613B | in archive directory |
| `.brain/archive/sprint-050.md` | 459B | in archive directory |
| `.brain/archive/sprint-051.md` | 622B | in archive directory |
| `.brain/archive/sprint-052.md` | 242B | in archive directory |
| `.brain/archive/sprint-053.md` | 730B | in archive directory |
| `.brain/archive/sprint-054.md` | 506B | in archive directory |
| `.brain/archive/sprint-055.md` | 1.0KB | in archive directory |
| `.brain/archive/sprint-056.md` | 1.8KB | in archive directory |
| `.brain/archive/sprint-057.md` | 1.2KB | in archive directory |
| `.brain/archive/sprint-058.md` | 445B | in archive directory |
| `.brain/archive/sprint-059.md` | 1.2KB | in archive directory |
| `.brain/archive/sprint-060.md` | 751B | in archive directory |
| `.brain/archive/sprint-061.md` | 858B | in archive directory |
| `.brain/archive/sprint-062.md` | 826B | in archive directory |
| `.brain/archive/sprint-063.md` | 1.5KB | in archive directory |
| `.brain/archive/sprint-064.md` | 2.4KB | in archive directory |
| `.brain/archive/sprint-065.md` | 1.4KB | in archive directory |
| `.brain/archive/sprint-066.md` | 1.3KB | in archive directory |
| `.brain/archive/sprint-067.md` | 1.2KB | in archive directory |
| `.brain/archive/sprint-068.md` | 1.0KB | in archive directory |
| `.brain/archive/sprint-069.md` | 1.1KB | in archive directory |
| `.brain/archive/sprint-070.md` | 997B | in archive directory |
| `.brain/archive/sprint-071.md` | 873B | in archive directory |
| `.brain/archive/sprint-072.md` | 1.2KB | in archive directory |
| `.brain/archive/sprint-073.md` | 1.0KB | in archive directory |
| `.brain/archive/sprint-074.md` | 1.0KB | in archive directory |
| `.brain/archive/sprint-075.md` | 671B | in archive directory |
| `.brain/archive/sprint-076.md` | 795B | in archive directory |
| `.brain/archive/sprint-077.md` | 788B | in archive directory |
| `.brain/archive/sprint-078.md` | 865B | in archive directory |
| `.brain/archive/sprint-079.md` | 850B | in archive directory |
| `.brain/archive/sprint-080.md` | 1.1KB | in archive directory |
| `.brain/archive/sprint-081.md` | 809B | in archive directory |
| `.brain/archive/sprint-082.md` | 789B | in archive directory |
| `.brain/archive/sprint-083.md` | 701B | in archive directory |
| `.brain/archive/sprint-085.md` | 788B | in archive directory |
| `.brain/archive/sprint-086.md` | 772B | in archive directory |
| `.brain/archive/sprint-087.md` | 763B | in archive directory |
| `.brain/archive/sprint-088.md` | 823B | in archive directory |
| `.brain/archive/sprint-089.md` | 795B | in archive directory |
| `.brain/archive/sprint-090.md` | 692B | in archive directory |
| `.brain/archive/sprint-091.md` | 1.1KB | in archive directory |
| `.brain/archive/sprint-092.md` | 982B | in archive directory |
| `.brain/archive/sprint-093.md` | 809B | in archive directory |
| `.brain/archive/sprint-094.md` | 853B | in archive directory |
| `.brain/archive/sprint-095.md` | 435B | in archive directory |
| `.brain/archive/sprint-096.md` | 1.6KB | in archive directory |
| `.brain/archive/sprint-097.md` | 1.8KB | in archive directory |
| `.brain/archive/sprint-098.md` | 974B | in archive directory |
| `.brain/archive/sprint-099.md` | 971B | in archive directory |
| `.brain/archive/sprint-100.md` | 953B | in archive directory |
| `.brain/archive/sprint-101.md` | 1.5KB | in archive directory |
| `.brain/archive/sprint-102.md` | 1.0KB | in archive directory |
| `.brain/archive/sprint-103.md` | 1.3KB | in archive directory |
| `.brain/archive/sprint-104.md` | 770B | in archive directory |
| `.brain/archive/sprint-105.md` | 816B | in archive directory |
| `.brain/archive/sprint-106.md` | 645B | in archive directory |
| `.brain/archive/sprint-107.md` | 518B | in archive directory |
| `.brain/archive/sprint-108.md` | 527B | in archive directory |
| `.brain/archive/sprint-110.md` | 416B | in archive directory |
| `.brain/archive/sprint-111.md` | 413B | in archive directory |
| `.brain/archive/sprint-113.md` | 427B | in archive directory |
| `.brain/archive/sprint-115.md` | 524B | in archive directory |
| `.brain/archive/sprint-116.md` | 421B | in archive directory |
| `.brain/archive/sprint-117.md` | 419B | in archive directory |
| `.brain/archive/sprint-118.md` | 419B | in archive directory |
| `.brain/archive/sprint-119.md` | 418B | in archive directory |
| `.brain/archive/sprint-120.md` | 420B | in archive directory |
| `.brain/archive/sprint-121.md` | 432B | in archive directory |
| `.brain/archive/sprint-122.md` | 435B | in archive directory |
| `.brain/archive/sprint-123.md` | 740B | in archive directory |
| `.brain/archive/sprint-124.md` | 864B | in archive directory |
| `.brain/archive/sprint-125.md` | 948B | in archive directory |
| `.brain/archive/sprint-126.md` | 972B | in archive directory |
| `.brain/archive/sprint-127.md` | 691B | in archive directory |
| `.brain/archive/sprint-128.md` | 1.3KB | in archive directory |
| `.brain/archive/sprint-129.md` | 802B | in archive directory |
| `.brain/archive/sprint-132.md` | 1.3KB | in archive directory |
| `.brain/archive/sprint-133.md` | 1.9KB | in archive directory |
| `.brain/archive/sprint-135.md` | 2.0KB | in archive directory |
| `.codex/rules/auditor.md` | 5.0KB | duplicate of .gemini/rules/auditor.md |
| `.codex/rules/brain.md` | 5.7KB | duplicate of .gemini/rules/brain.md |
| `.codex/rules/worker-default.md` | 5.5KB | duplicate of .gemini/rules/worker-default.md |
| `.deckent/agents/archive/test-writer-removed-sprint-148/PROMPT.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/brain/brain-state.md` | 19.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/docs/architecture.md` | 7.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/docs/audits.md` | 4.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/docs/development.md` | 7.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/docs/guide.md` | 7.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/docs/reference.md` | 9.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/docs/superpowers.md` | 5.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/docs/vision-and-meta.md` | 6.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/FINAL-REPORT.md` | 85.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/meta/adr-parity-i18n.md` | 30.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/meta/architecture-graph.md` | 23.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/meta/coverage-perf-errors-todo.md` | 24.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/meta/dead-code-type-security.md` | 32.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/meta/memory-v2-integrity.md` | 21.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/meta/root-files.md` | 13.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/adaptive-agent.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/agent-genealogy.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/agent-retirement.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/cross-sprint-analyzer.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/index.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/permission-guard.md` | 2.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/prompt-ab-test.md` | 694B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/prompt-analytics.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/prompt-evolution.md` | 794B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/prompt-metrics.md` | 281B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/prompt-rollback.md` | 765B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/prompt-version.md` | 954B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/shared-context.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/specialization-drift.md` | 833B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/worker-ipc.md` | 2.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/agents/worker.md` | 6.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/auto-setup.md` | 745B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/agent.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/analyze.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/archive-debt.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/attach.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/checkpoint.md` | 723B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/cleanup.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/config.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/cost.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/dashboard.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/docs.md` | 1022B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/doctor.md` | 5.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/explain.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/finalize.md` | 906B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/heartbeat.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/history.md` | 785B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/init.md` | 2.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/kill.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/memory.md` | 3.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/onboard.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/output.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/plan.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/plugin.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/quick-start.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/recall.md` | 2.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/remember.md` | 2.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/resume.md` | 667B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/retro-extra.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/retro.md` | 2.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/review.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/run.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/serve.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/set-directives.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/skill-marketplace.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/skill.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/spawn.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/start.md` | 2.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/status.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/sync.md` | 1022B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/test-run.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/upgrade.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/watch.md` | 876B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/commands/web.md` | 1018B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/entry.md` | 732B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/agent-performance.md` | 541B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/agent-templates.md` | 537B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/change-categorizer.md` | 543B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/codex-config.md` | 531B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/config-reader.md` | 533B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/cursor-config.md` | 533B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/error-handler.md` | 533B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/eta-calculator.md` | 535B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/gemini-config.md` | 533B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/hints.md` | 517B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/messages.md` | 523B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/output.md` | 872B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/process.md` | 428B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/progress-persistence.md` | 547B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/progress.md` | 523B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/prompt.md` | 519B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/queue-display.md` | 533B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/recommendations.md` | 537B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/review-actions.md` | 535B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/review-summary.md` | 535B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/selective-retry.md` | 537B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/splash.md` | 519B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/sprint-comparison.md` | 541B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/sprint-summary-rich.md` | 545B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/sprint-summary.md` | 535B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/terminal-utils.md` | 535B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/theme.md` | 517B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/wizard.md` | 519B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/helpers/worker-status.md` | 533B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/index.md` | 811B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/cli/version-info.md` | 503B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/activation-engine.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/agent-cache.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/agent-pool.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/agent-selector.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/agent-types.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/analyzer.md` | 1.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/anthropic-http-client.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/cascade-detector.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/ci-learning.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/condition-evaluator.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/config-migration.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/config-types.md` | 2.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/config.md` | 3.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/constants.md` | 2.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/cost-calculator.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/cost-config-loader.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/credential-encryption.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/credentials.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/decision-config.md` | 1.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/decision-types.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/deck-file.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/environment.md` | 1011B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/errors.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/file-lock.md` | 1.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/global-config.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/index.md` | 1.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/intent-classifier.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/lazy-loader.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/manifest-migrator.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/marketplace/dependency-resolver.md` | 4.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/marketplace/marketplace-auth.md` | 3.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/marketplace/rating-system.md` | 4.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/marketplace/registry-client.md` | 4.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/marketplace/skill-sandbox.md` | 4.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/memory-export.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/memory-import.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/memory-normalize.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/memory-query.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/memory-store.md` | 2.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/memory-types.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/mode-presets.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/model-equivalence.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/model-registry.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/monitoring-types.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/multi-ide.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notification-config.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notification-dispatcher.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notification-providers/discord.md` | 3.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notification-providers/slack.md` | 2.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notification-providers/webhook.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notifications.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notify-adapters/cli-adapter.md` | 3.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/notify-adapters/mcp-adapter.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/observability.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/output-collector.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/output-formatter.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/plugin-hooks.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/plugin-loader.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/plugin.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/pricing-updater.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/provider-capabilities.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/provider.md` | 2.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/routing-engine.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/routing-types.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/skill-cache.md` | 1004B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/skill-pool.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/skill-registry.md` | 1.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/skill-selector.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/skill-types.md` | 1.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/sprint-types.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/stack-detector.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/subscription.md` | 2.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/system-profile.md` | 926B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/task-types.md` | 1.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/telemetry.md` | 1.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/token-counter.md` | 2.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/types.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/core/utils.md` | 2.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/dashboard/dashboard-batch.md` | 33.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/helpers/enrich.md` | 5.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/helpers/format.md` | 6.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/helpers/index.md` | 4.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/agents.md` | 4.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/config.md` | 4.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/dashboard.md` | 4.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/debt.md` | 5.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/directives.md` | 4.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/index.md` | 4.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/memory.md` | 5.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/retro.md` | 5.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/resources/tasks.md` | 5.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/server.md` | 3.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/agent-list.md` | 3.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/analyze.md` | 2.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/checkpoint.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/cleanup.md` | 3.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/config.md` | 3.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/directives.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/docs.md` | 3.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/doctor.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/explain.md` | 3.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/help.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/history.md` | 3.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/index.md` | 3.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/init.md` | 4.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/job-runner.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/kill.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/memory-query.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/plan.md` | 3.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/retro.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/review.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/run.md` | 3.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/skill-list.md` | 2.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/start.md` | 4.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/status.md` | 4.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/mcp/tools/sync.md` | 2.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/monitor/auditor.md` | 5.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/monitor/dashboard-manager.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/monitor/index.md` | 507B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/monitor/sprint-state.md` | 816B | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/authority-enforcer.ts.md` | 3.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/baseline-tracker.ts.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/batch-stats.ts.md` | 2.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/brain-context.ts.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/brain.ts.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/ci-reporter.ts.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/conflict-resolver.ts.md` | 3.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/connector.ts.md` | 2.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/coverage-validator.ts.md` | 2.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/debt-manager.ts.md` | 3.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/decision-engine.ts.md` | 2.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/decision-logger.ts.md` | 2.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/decision-replay.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/decision-steps/agent-step.ts.md` | 2.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/decision-steps/scope-step.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/dependency-scheduler.ts.md` | 3.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/changelog.ts.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/health-check.ts.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/index.ts.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/metrics-updater.ts.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/readme-metrics.ts.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/registry.ts.md` | 1.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/sprint-log.ts.md` | 1.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/doc-updaters/types.ts.md` | 1.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/ecosystem-intelligence.ts.md` | 2.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/event-stream.ts.md` | 3.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/handoff-protocol.ts.md` | 2.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/heartbeat-daemon.ts.md` | 2.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/index.ts.md` | 2.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/ipc-registry.ts.md` | 3.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/content-generators.ts.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/doc-cache.ts.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/docs-config.ts.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/index.ts.md` | 1.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/managed-doc-runner.ts.md` | 2.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/plugin-loader.ts.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/section-updater.ts.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/template-renderer.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/managed-docs/types.ts.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/mid-sprint-adapter.ts.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/model-selector.ts.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/multi-agent.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/outcome-tracker.ts.md` | 2.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/parallel-pipeline.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/pattern-reader.ts.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/pattern-recorder.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/planner.ts.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/promotion-pipeline.ts.md` | 4.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/prompt-token-optimizer.ts.md` | 2.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/quality-assessor.ts.md` | 2.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/result-collector.ts.md` | 4.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/result-evaluator.ts.md` | 4.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/result-merger.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/result-watcher.ts.md` | 2.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/rollback.ts.md` | 3.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/rule-evolver.ts.md` | 2.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/self-modifying-detector.ts.md` | 2.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/shared-memory.ts.md` | 2.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/spawn-backend-docker.ts.md` | 3.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/spawn-backend-mock.ts.md` | 2.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/spawn-backend.ts.md` | 2.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-checkpoint.ts.md` | 3.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-controller.ts.md` | 3.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-docs-helpers.ts.md` | 2.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-docs-updater.ts.md` | 4.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-estimator.ts.md` | 2.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-finalizer.ts.md` | 4.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-lifecycle.ts.md` | 3.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-metrics.ts.md` | 2.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-phases.ts.md` | 2.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-pid-manager.ts.md` | 2.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-planner.ts.md` | 3.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-reporter.ts.md` | 1.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-retro-writer.ts.md` | 3.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-spawner.ts.md` | 2.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/sprint-utils.ts.md` | 2.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/task-analyzer.ts.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/task-builder.ts.md` | 4.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/task-retry.ts.md` | 1.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/task-router.ts.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/temp-skill-generator.ts.md` | 1.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/orchestra/tmux.ts.md` | 2.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/providers/claude.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/providers/codex.md` | 2.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/providers/gemini.md` | 2.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/providers/sandbox.md` | 1.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/src/providers/subprocess.md` | 2.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/agents.md` | 8.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/analytics.md` | 6.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/api.md` | 7.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/audits.md` | 6.7KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/blueprint.md` | 6.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/brain.md` | 7.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/cli.md` | 13.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/config.md` | 5.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/core.md` | 15.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/dashboard.md` | 8.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/docker.md` | 6.1KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/docs.md` | 10.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/e2e.md` | 7.9KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/extensions.md` | 4.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/github.md` | 6.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/helpers.md` | 6.0KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/integration.md` | 11.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/load.md` | 7.8KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/mcp.md` | 11.6KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/monitor.md` | 7.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/orchestra.md` | 19.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/providers.md` | 7.4KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/scripts.md` | 8.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/security.md` | 8.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/skills.md` | 6.3KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/smoke.md` | 6.2KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/unit.md` | 9.5KB | in archive directory |
| `.deckent/sprint-141-analysis-archive/tests/workflows.md` | 7.3KB | in archive directory |
| `docs/archive/full-audit-pre036.md` | 60.1KB | in archive directory |
| `docs/archive/landing-page-content.md` | 5.5KB | in archive directory |
| `docs/archive/observations/MEGA-SPRINT-OBSERVATION.md` | 8.7KB | in archive directory |
| `docs/archive/observations/SPRINT-18-OBSERVATION.md` | 7.0KB | in archive directory |
| `docs/archive/observations/SPRINT-19-OBSERVATION.md` | 7.4KB | in archive directory |
| `docs/archive/observations/SPRINT-20-OBSERVATION.md` | 7.3KB | in archive directory |
| `docs/archive/observations/SPRINT-21-OBSERVATION.md` | 4.9KB | in archive directory |
| `docs/archive/observations/SPRINT-25-OBSERVATION.md` | 9.1KB | in archive directory |

## MOVE

Files in wrong location — should be moved to appropriate directory.

| File | Size | Last Modified | Reason | Suggested Location |
|------|------|---------------|--------|-------------------|
| `BETA-TRACKER-TR.md` | 94.7KB | 2026-04-20 | root-level doc file — should be in docs/ | `docs/BETA-TRACKER-TR.md` |
| `DECKENT-ANA-PLAN-TR.md` | 107.8KB | 2026-04-20 | root-level doc file — should be in docs/ | `docs/DECKENT-ANA-PLAN-TR.md` |
| `DECKENT-MASTER-BLUEPRINT.md` | 150.1KB | 2026-04-20 | root-level doc file — should be in docs/ | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `DECKENT-TEST-REPORT.md` | 59.6KB | 2026-03-26 | root-level doc file — should be in docs/ | `docs/DECKENT-TEST-REPORT.md` |
| `NEXT-SESSION-PROMPT.md` | 105.5KB | 2026-04-21 | root-level doc file — should be in docs/ | `docs/NEXT-SESSION-PROMPT.md` |
| `VISION-TR.md` | 8.4KB | 2026-04-10 | root-level doc file — should be in docs/ | `docs/VISION-TR.md` |

## Broken Internal Links Detail

| File | Broken Link | Resolved Path |
|------|-------------|---------------|
| `README.md` | `docs/assets/demo.gif` | `docs/assets/demo.gif` |
| `README.md` | `docs/assets/nervous-tui.png` | `docs/assets/nervous-tui.png` |
| `README.md` | `docs/assets/dashboard.png` | `docs/assets/dashboard.png` |
| `.deckent/sprint-god-analysis/docs/remaining.md` | `ARCHITECTURE.md` | `.deckent/sprint-god-analysis/docs/ARCHITECTURE.md` |
| `.deckent/sprint-god-analysis/docs/remaining.md` | `API.md` | `.deckent/sprint-god-analysis/docs/API.md` |
| `docs/release/roadmap.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/architecture/architecture.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/architecture/architecture.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/architecture/architecture.md` | `SECURITY.md` | `docs/architecture/SECURITY.md` |
| `docs/architecture/architecture.md` | `MEMORY-SYSTEM.md` | `docs/architecture/MEMORY-SYSTEM.md` |
| `docs/architecture/architecture.md` | `BRAIN-GUIDE.md` | `docs/architecture/BRAIN-GUIDE.md` |
| `docs/architecture/architecture.md` | `WORKER-GUIDE.md` | `docs/architecture/WORKER-GUIDE.md` |
| `docs/architecture/architecture.md` | `DASHBOARD-GUIDE.md` | `docs/architecture/DASHBOARD-GUIDE.md` |
| `docs/architecture/architecture.md` | `MCP-GUIDE.md` | `docs/architecture/MCP-GUIDE.md` |
| `docs/architecture/architecture.md` | `CONFIG-REFERENCE.md` | `docs/architecture/CONFIG-REFERENCE.md` |
| `docs/architecture/architecture.md` | `SPRINT-LIFECYCLE.md` | `docs/architecture/SPRINT-LIFECYCLE.md` |
| `docs/architecture/authority-matrix.md` | `../../.brain/DECISIONS.md` | `.brain/DECISIONS.md` |
| `docs/architecture/authority-matrix.md` | `.brain/DECISIONS.md` | `docs/architecture/.brain/DECISIONS.md` |
| `docs/architecture/authority-matrix.md` | `.brain/DECISIONS.md` | `docs/architecture/.brain/DECISIONS.md` |
| `docs/architecture/authority-matrix.md` | `.brain/DECISIONS.md` | `docs/architecture/.brain/DECISIONS.md` |
| `docs/architecture/authority-matrix.md` | `.brain/DECISIONS.md` | `docs/architecture/.brain/DECISIONS.md` |
| `docs/architecture/authority-matrix.md` | `.brain/DECISIONS.md` | `docs/architecture/.brain/DECISIONS.md` |
| `docs/guide/faq.md` | `./QUICKSTART.md` | `docs/guide/QUICKSTART.md` |
| `docs/guide/faq.md` | `./ARCHITECTURE.md` | `docs/guide/ARCHITECTURE.md` |
| `docs/guide/faq.md` | `./MCP-GUIDE.md` | `docs/guide/MCP-GUIDE.md` |
| `docs/guide/faq.md` | `./PLUGIN-GUIDE.md` | `docs/guide/PLUGIN-GUIDE.md` |
| `docs/guide/faq.md` | `./TROUBLESHOOTING.md` | `docs/guide/TROUBLESHOOTING.md` |
| `docs/guide/getting-started.md` | `/guide/multi-provider` | `guide/multi-provider` |
| `docs/guide/getting-started.md` | `/reference/config` | `reference/config` |
| `docs/guide/getting-started.md` | `/guide/concepts` | `guide/concepts` |
| `docs/guide/getting-started.md` | `/guide/first-sprint` | `guide/first-sprint` |
| `docs/guide/getting-started.md` | `/reference/cli` | `reference/cli` |
| `docs/guide/getting-started.md` | `/reference/config` | `reference/config` |
| `docs/guide/getting-started.md` | `/guide/architecture` | `guide/architecture` |
| `docs/guide/first-sprint.md` | `/guide/getting-started` | `guide/getting-started` |
| `docs/guide/first-sprint.md` | `/guide/multi-provider` | `guide/multi-provider` |
| `docs/guide/first-sprint.md` | `/guide/concepts` | `guide/concepts` |
| `docs/guide/first-sprint.md` | `/reference/config` | `reference/config` |
| `docs/guide/first-sprint.md` | `/guide/troubleshooting` | `guide/troubleshooting` |
| `docs/guide/quickstart.md` | `MULTI-PROVIDER-GUIDE.md` | `docs/guide/MULTI-PROVIDER-GUIDE.md` |
| `docs/guide/quickstart.md` | `CONFIG-REFERENCE.md` | `docs/guide/CONFIG-REFERENCE.md` |
| `docs/guide/quickstart.md` | `API.md` | `docs/guide/API.md` |
| `docs/guide/quickstart.md` | `MCP-GUIDE.md` | `docs/guide/MCP-GUIDE.md` |
| `docs/guide/quickstart.md` | `ARCHITECTURE.md` | `docs/guide/ARCHITECTURE.md` |
| `docs/guide/quickstart.md` | `SPRINT-LIFECYCLE.md` | `docs/guide/SPRINT-LIFECYCLE.md` |
| `docs/guide/quickstart.md` | `TROUBLESHOOTING.md` | `docs/guide/TROUBLESHOOTING.md` |
| `docs/guide/quickstart.md` | `MULTI-PROVIDER-GUIDE.md` | `docs/guide/MULTI-PROVIDER-GUIDE.md` |
| `docs/guide/quickstart.md` | `PLUGIN-GUIDE.md` | `docs/guide/PLUGIN-GUIDE.md` |
| `docs/guide/quickstart.md` | `GLOSSARY.md` | `docs/guide/GLOSSARY.md` |
| `docs/guide/concepts.md` | `/reference/config` | `reference/config` |
| `docs/guide/concepts.md` | `/guide/getting-started` | `guide/getting-started` |
| `docs/guide/concepts.md` | `/guide/first-sprint` | `guide/first-sprint` |
| `docs/guide/concepts.md` | `/reference/config` | `reference/config` |
| `docs/guide/concepts.md` | `/guide/architecture` | `guide/architecture` |
| `docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md` | `project_sprint137_completed.md` | `docs/superpowers/plans/project_sprint137_completed.md` |
| `docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md` | `project_sprint138_preflight.md` | `docs/superpowers/plans/project_sprint138_preflight.md` |
| `docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md` | `project_sprint138_completed.md` | `docs/superpowers/plans/project_sprint138_completed.md` |
| `docs/superpowers/plans/2026-04-14-sprint-138-architectural-pivot-plan.md` | `project_sprint139_preflight.md` | `docs/superpowers/plans/project_sprint139_preflight.md` |
| `docs/superpowers/plans/2026-04-13-config-backup-rotation.md` | `docs/smoke/...` | `docs/superpowers/plans/docs/smoke/...` |
| `docs/development/dashboard-guide.md` | `ARCHITECTURE.md` | `docs/development/ARCHITECTURE.md` |
| `docs/development/dashboard-guide.md` | `API.md` | `docs/development/API.md` |
| `docs/development/dashboard-guide.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/development/dashboard-guide.md` | `TROUBLESHOOTING.md` | `docs/development/TROUBLESHOOTING.md` |
| `docs/development/brain-guide.md` | `ARCHITECTURE.md` | `docs/development/ARCHITECTURE.md` |
| `docs/development/brain-guide.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/development/brain-guide.md` | `../.claude/rules/brain.md` | `docs/.claude/rules/brain.md` |
| `docs/development/brain-guide.md` | `CONFIG-REFERENCE.md` | `docs/development/CONFIG-REFERENCE.md` |
| `docs/reference/security.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/reference/security.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/reference/config-reference.md` | `MULTI-PROVIDER-GUIDE.md` | `docs/reference/MULTI-PROVIDER-GUIDE.md` |
| `docs/reference/config-reference.md` | `ARCHITECTURE.md` | `docs/reference/ARCHITECTURE.md` |
| `docs/reference/config-reference.md` | `BRAIN-GUIDE.md` | `docs/reference/BRAIN-GUIDE.md` |
| `docs/reference/config-reference.md` | `MULTI-PROVIDER-GUIDE.md` | `docs/reference/MULTI-PROVIDER-GUIDE.md` |
| `docs/reference/config-reference.md` | `SPRINT-LIFECYCLE.md` | `docs/reference/SPRINT-LIFECYCLE.md` |
| `docs/reference/config-reference.md` | `TROUBLESHOOTING.md` | `docs/reference/TROUBLESHOOTING.md` |
| `docs/reference/multi-provider.md` | `CONFIG-REFERENCE.md` | `docs/reference/CONFIG-REFERENCE.md` |
| `docs/reference/multi-provider.md` | `ARCHITECTURE.md` | `docs/reference/ARCHITECTURE.md` |
| `docs/reference/multi-provider.md` | `TROUBLESHOOTING.md` | `docs/reference/TROUBLESHOOTING.md` |
| `docs/reference/performance.md` | `CONFIG-REFERENCE.md` | `docs/reference/CONFIG-REFERENCE.md` |
| `docs/reference/performance.md` | `ARCHITECTURE.md` | `docs/reference/ARCHITECTURE.md` |
| `docs/reference/performance.md` | `SPRINT-LIFECYCLE.md` | `docs/reference/SPRINT-LIFECYCLE.md` |
| `docs/reference/performance.md` | `TROUBLESHOOTING.md` | `docs/reference/TROUBLESHOOTING.md` |
| `docs/reference/performance.md` | `MEMORY-SYSTEM.md` | `docs/reference/MEMORY-SYSTEM.md` |
| `docs/reference/performance.md` | `BRAIN-GUIDE.md` | `docs/reference/BRAIN-GUIDE.md` |
| `docs/reference/glossary.md` | `../DECKENT-MASTER-BLUEPRINT.md` | `docs/DECKENT-MASTER-BLUEPRINT.md` |
| `docs/audits/sprint-132/W1-security-multi-tenancy.md` | `'...'` | `docs/audits/sprint-132/'...'` |
| `README-TR.md` | `docs/assets/demo.gif` | `docs/assets/demo.gif` |
| `README-TR.md` | `docs/assets/nervous-tui.png` | `docs/assets/nervous-tui.png` |
| `README-TR.md` | `docs/assets/dashboard.png` | `docs/assets/dashboard.png` |

---

_Report generated by `scripts/doc-review.mjs` on 2026-04-21T10:55:08.294Z_