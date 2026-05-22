# Changelog

> **This file has been consolidated.** The canonical changelog is at the project root: [CHANGELOG.md](../CHANGELOG.md).
## [1.0.0-beta.1-sprint187] - 2026-05-22

### Added

- api-surface.md Memory V2 atıf güncellemesi


_Tasks: 1 total, 1 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint186] - 2026-05-21

### Added

- Audit src/agents/adaptive-agent.ts
- Audit src/agents/agent-genealogy.ts
- Audit src/agents/agent-retirement.ts
- Audit src/agents/auditor.ts
- Audit src/agents/cross-sprint-analyzer.ts
- Audit src/agents/index.ts
- Audit src/agents/permission-guard.ts
- Audit src/agents/prompt-ab-test.ts
- Audit src/agents/prompt-analytics.ts
- Audit src/agents/prompt-evolution.ts


_Tasks: 69 total, 31 done, 0 tech debt, 38 no-go_

## [1.0.0-beta.1-sprint183] - 2026-05-21

### Added

- W1-1 — P0-1 Nervous PLAN-phase pasif (FSWatcher debounce + phase guard)
- W1-2 — P0-2 DEPENDENCY_BLOCKED event spam debounce (state-change emit)
- W2-1 — Sprint 182 W1-1 recovery: mock hygiene orphan-cleaner-ipc + archive-debt
- W2-2 — Sprint 182 W1-3 recovery: vitest CI=true parity smoke
- W2-4 — Sprint 182 W3-PQ-7 recovery: integration smoke regression tamamla
- W3-1 — Sprint 182 W4-1 recovery: validate:publish 6/6 GREEN recheck + Brain re-eval RC
- W3-2 — Beta launch hijyen: npm pack + lint:adr + lint:link final

### Fixed

- W1-3 — P0-3 Worker timeout root cause investigation + fix
- W2-3 — Sprint 182 W2-2 recovery: title-prefix Dependencies resolver tamamla


_Tasks: 13 total, 11 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint182] - 2026-05-21

### Added

- W1-2 — cli/run.test.ts SpawnBackendFactory mock chain
- W2-1 — `dependency_pipeline_enabled: true` ADR-045 wire verify
- W2-3 — Verify task pattern redesign
- W3-PQ-2 — F2 + F3 truncation kaldır (skill + ADR full content)
- W3-PQ-3 — F4 Agent prompt single source (PROMPT.md kanonik)
- W3-PQ-5 — F7 ADR relevance threshold (default 0.3)
- W3-PQ-6 — F8 Agent override semantic warning
- W4-2 — package.json final + lint:adr + lint:link
- W4-3 — ADR-048 Prompt Lifecycle Contract amendment
- W4-4 — Sprint 182 retro + Sprint 183 post-beta stub

### Fixed

- W3-PQ-1 — F1 `${IDEMPOTENCY_KEY}` injection fix
- W3-PQ-4 — F5 + F6 DIRECTIVES parser fix (Files + title/desc)


_Tasks: 24 total, 14 done, 0 tech debt, 10 no-go_

## [1.0.0-beta.1-sprint181] - 2026-05-21

### Added

- W1-2 — package.json root scripts gözden geçir + tsc:dashboard alias
- W2-1 — Sprint smoke + CI yeşil verify


_Tasks: 5 total, 3 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint180] - 2026-05-20

### Added

- W0 — Nervous config schema sync (Step F)
- W2-2 — Nervous IPC queue MCP→Executor (Step E)

### Changed

- W1-2 — Nervous bootstrap fabrika (Step A) (completed with tech debt)
- W2-1 — Nervous action handlers (Step C) (completed with tech debt)
- W3-1 — Sprint-controller nervous wire (Step D) (completed with tech debt)
- W3-3 — Nervous integration runtime test (completed with tech debt)
- W4-1 — Worker .result coverage zorunluluk ★ BETA MUST (completed with tech debt)
- W4-2 — Panic guard onay UI (Layer 3 synergy) (completed with tech debt)
- W5-2 — OSS GA docs review ★ BETA LAUNCH (completed with tech debt)
- W5-3 — auto_restore=true + nervous user guide kısa giriş (completed with tech debt)


_Tasks: 20 total, 12 done, 8 tech debt, 8 no-go_

## [1.0.0-beta.1-sprint179] - 2026-05-20

### Added

- W1-2 — Re-plan orphan task file cleanup
- W2-4 — Coverage hard-floor / aspirational split
- W4-10 — Outbound rate-limit (I5 tenant isolation) ★ BETA MUST
- W5-12 — Audit HMAC chain + verify CLI (I4 invariant) ★ BETA MUST

### Changed

- W0-1 — Dependency aggregate fix-aware (Bug A foundation) (completed with tech debt)
- W1-1 — Auto-debt empty-scope inheritance (completed with tech debt)
- W2-3 — DEP0190 shell:true win32-only conditional (completed with tech debt)
- W2-7 — CI-only test flakes (PID portability + mock hygiene) (completed with tech debt)
- W3-5 — Dashboard TS errors + root lint wire (completed with tech debt)
- W3-6 — doctor DECISIONS.md obsolete + 5-file cascade (completed with tech debt)
- W4-8 — Prompt guard (I1 + I2 invariants) ★ BETA MUST (completed with tech debt)
- W4-9 — Command guard (I3 default-deny remote) ★ BETA MUST (completed with tech debt)
- W5-11 — mTLS hook (AuthProvider interface) ★ BETA MUST (completed with tech debt)


_Tasks: 17 total, 17 done, 9 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint178] - 2026-05-20

### Added

- 178-001 — Node 24/26 test assertion sweep
- 178-002 — Doc updates (Node 24/26 yayılma)
- 178-003 — Tmux backend code removal
- 178-005 — TOPP B+C continuous-dispatch ★ MUST

### Fixed

- Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented
- 178-004 — CI flake fix (PID portability + mock hygiene)


_Tasks: 11 total, 9 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint177] - 2026-05-20

### Added

- 177-001 — Worker rollback: git-stash snapshot-on-spawn
- 177-004 — Config template-regen guard + restore docs
- 177-005 — nervous_system directives_protection baseline-update hook

### Changed

- 177-003 — Tmux backend deprecate path (completed with tech debt)

### Fixed

- 177-002 — deckent kill cascade fix


_Tasks: 7 total, 5 done, 1 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint175] - 2026-05-19

### Added

- W0.1 — Runtime deps (node-pty + ws)
- W0.2 — ADR-010 amendment ext + ADR-062
- W0.3 — TerminalConfig → DeckentConfig
- W0.4 — Shared terminal types
- W1.1 — AuthProvider (bypass-independent)
- W1.3 — TerminalAudit (tenant-scoped DB)
- W2.1 — WS gateway (auth-before-bridge + reattach)
- W2.3 — serve CLI surface
- W3.1 — xterm deps + terminal-api
- W3.2 — useTerminalSocket

### Changed

- W4.3 — Final verification (completed with tech debt)


_Tasks: 37 total, 21 done, 2 tech debt, 16 no-go_

## [1.0.0-beta.1-sprint174] - 2026-05-18

### Added

- Pitch deck — marketing-ai-pitch.md (15 slide)
- Canva template map — canva-kit/canva-bulk-template-map.md
- Canva bulk CSV — canva-kit/canva-bulk-sample.csv
- Aylık üretim rehberi — canva-kit/monthly-brand-report-howto.md
- Kit index + tutarlılık — canva-kit/README.md


_Tasks: 7 total, 5 done, 0 tech debt, 2 no-go_

## [1.0.0-beta.1-sprint173] - 2026-05-18

### Added

- Slide 1 — Cover
- Slide 2 — The Problem
- Slide 3 — What is Deckent (Synthesis)
- Slide 4 — Core Roles
- Slide 5 — Sprint Lifecycle
- Slide 6 — DIRECTIVES-Driven Planning
- Slide 7 — Task Routing
- Slide 8 — 15 Built-in Agents
- Slide 9 — 21 Built-in Skills
- Slide 10 — Multi-Provider & ModelRegistry

### Fixed

- Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp


_Tasks: 22 total, 22 done, 0 tech debt, 0 no-go_

## [1.0.0-beta.1-sprint172] - 2026-05-18

### Added

- A1 — dependency_pipeline_enabled provenance drift
- A2 — RBAC + verify-gate enforcement honesty
- A3 — ADR-010 amendment (7 runtime dep)
- A4 — README 5-drift badge gerçek değer
- B3 — kök → docs/ taşıma + redirect
- B4 — worker-guide 3→1 + ADR-046 dup merge + reference rename


_Tasks: 17 total, 6 done, 0 tech debt, 11 no-go_

