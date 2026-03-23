# DIRECTIVES — Sprint 042 (Stabilization — Beta Ready)

## Goal: Close ALL open tech debt, fix remaining test failures, validate npm publish pipeline, ensure Deckent is production-ready for beta. Zero open debt, zero test failures on Linux/WSL, clean npm pack, validated install flow. This is the LAST sprint before beta tester evaluation. Sprint sonunda deckent finalize çalıştır.

---

## Task 1: Close All Open Tech Debt
- Model: opus
- Effort: high
- Files: .brain/DEBT.md, various source files
- Scope: src/, tests/, .brain/

### Description
Read .brain/DEBT.md. For EVERY open debt item (resolved=false): either fix it or mark as resolved with justification. After fixes, run `deckent archive-debt` to move resolved items to archive. Target: ZERO open debt items in DEBT.md. If any debt is intentionally deferred, document WHY in DECISIONS.md as an ADR. 10+ tests for each fix.

### Tests
- DEBT.md has zero open items after sprint
- All fixes pass tsc and vitest
- archive-debt moves resolved items
- Deferred items documented in DECISIONS.md
- 10+ tests

---

## Task 2: Test Suite Stabilization
- Model: opus
- Effort: high
- Files: tests/**/*.test.ts
- Scope: tests/

### Description
Run `npx vitest run` and fix ALL failing tests. Current baseline: ~36 known failures (platform-related). For each:
1. If genuine bug → fix the source code
2. If platform-specific (Windows) → add `skipIf(process.platform === 'win32')` with clear comment
3. If flaky (timing) → use `vi.useFakeTimers()` or increase timeout
4. If stale expectation → update test to match current code
Target: 0 fail on Linux/WSL. Document any skipped tests in tests/PLATFORM.md. 20+ test fixes.

### Tests
- npx vitest run shows 0 fail on Linux/WSL
- All platform skips documented in PLATFORM.md
- No flaky tests (run 3 times, same result)
- 20+ fixes

---

## Task 3: npm Publish Validation
- Model: opus
- Effort: high
- Files: package.json, .npmignore, scripts/validate-publish.ts, README.md
- Scope: ./, scripts/

### Description
Full npm publish dry-run validation:
1. `npm pack --dry-run` → verify file list, no sensitive files leaked (.brain/, .deckent/, tests/, .env)
2. Pack size < 500KB
3. `npm install -g ./deckent-*.tgz` in temp dir → verify deckent CLI works
4. `deckent --version` shows correct version
5. `deckent --help` shows all commands
6. `deckent init` in empty dir creates correct structure
7. `deckent doctor` reports system health
8. package.json: verify repository, bugs, homepage URLs
9. README.md: verify badges, feature list, quick start current
10. Version: 0.2.0-beta.1
Create/update `scripts/validate-publish.ts` that automates steps 1-7. Run as `npm run validate:publish`. 15+ tests.

### Tests
- Pack contains only dist/, bin/, README, LICENSE
- No sensitive files in pack
- Size under 500KB
- Global install works
- CLI commands respond correctly
- Version matches package.json
- validate:publish script passes
- 15+ tests

---

## Task 4: Global Install E2E Test
- Model: opus
- Effort: high
- Files: tests/e2e/install-flow.test.ts (new), tests/e2e/first-sprint.test.ts (new)
- Scope: tests/e2e/

### Description
End-to-end test simulating a new user:
1. npm install -g deckent (from local pack)
2. mkdir test-project && cd test-project
3. deckent init (non-interactive, defaults)
4. Verify .deckent/, .brain/, DECKENT.md created
5. deckent doctor → all checks pass (except optional providers)
6. deckent set-directives "Add a hello world function"
7. deckent plan --mode structured → tasks created
8. deckent status → shows planned tasks
9. Cleanup: rm -rf test-project, npm uninstall -g deckent
This test proves the full user journey works. 15+ tests.

### Tests
- Init creates correct directory structure
- Doctor passes on fresh project
- Plan creates task files
- Status shows task list
- Full cleanup works
- 15+ tests

---

## Task 5: Provider Adapter Smoke Tests
- Model: opus
- Effort: normal
- Files: tests/e2e/provider-smoke.test.ts (new)
- Scope: tests/e2e/

### Description
Smoke test each provider adapter (without real API calls — mock at boundary):
1. Claude adapter: buildCommand produces valid claude CLI string, isAvailable checks claude --version
2. Codex adapter: buildCommand produces valid codex exec string, isAvailable checks codex + auth
3. Gemini adapter: buildCommand produces valid node -e API call, isAvailable checks GOOGLE_API_KEY
4. Provider registry: bootstrap detects available providers, sets correct default
5. Fallback chain: primary fails → fallback selected → equivalent model mapped
10+ tests.

### Tests
- Each adapter produces valid command string
- isAvailable checks correct prerequisites
- Registry bootstrap works
- Fallback chain selects alternative
- Model equivalence applied during fallback
- 10+ tests

---

## Task 6: Documentation Final Review
- Model: opus
- Effort: normal
- Files: README.md, docs/QUICKSTART.md, docs/MULTI-PROVIDER-GUIDE.md, docs/CONFIG-REFERENCE.md, CONTRIBUTING.md
- Scope: docs/, ./

### Description
Final documentation pass before beta:
1. README.md: current test count, feature list, platform matrix, provider list, badges
2. QUICKSTART.md: 30-second install → init → first sprint flow, current and accurate
3. MULTI-PROVIDER-GUIDE.md: all 3 providers documented, setup instructions per provider
4. CONFIG-REFERENCE.md: all config options including new provider config, mode aliases
5. CONTRIBUTING.md: current dev setup, test commands, PR template reference
6. Check ALL docs for stale Sprint numbers, outdated metrics, wrong file paths
No code changes — documentation only.

### Tests
- README test count matches actual
- QUICKSTART flow works as documented
- All config options documented
- No stale references in docs

---

## Task 7: CHANGELOG + Release Notes
- Model: opus
- Effort: normal
- Files: docs/CHANGELOG.md, docs/RELEASE-NOTES-BETA.md (new)
- Scope: docs/

### Description
1. Update CHANGELOG.md with Sprint 035-042 entries in semver format
2. Create RELEASE-NOTES-BETA.md:
```markdown
# Deckent v0.2.0-beta.1 Release Notes

## What's New
- Multi-provider support (Claude + Codex + Gemini)
- Worker feedback loop (self-healing: tsc + test verify)
- Human-friendly output (CLI, MCP, Dashboard, Doctor)
- Plugin system (install, hooks, lifecycle)
- Agent/skill system (8 agents, 10 skills, auto-selection)
- Provider-agnostic orchestration (decoupled from Claude)

## Key Metrics
- 9,400+ tests, 94% coverage
- 42 sprints of dogfooding
- 97+ tasks completed across 7 stabilization sprints
- NO_GO rate: 94.7% → 0% (worker feedback loop)

## Getting Started
npm install -g deckent
deckent init
deckent start "Build a REST API"

## Known Limitations
- Native Windows requires WSL2
- Codex/Gemini adapters need real CLI validation
- Skill marketplace registry not yet live

## Roadmap
- Messaging integration (Telegram/Discord)
- Proactive heartbeat (repo watching)
- Self-improvement loop (Brain prompt evolution)
```

### Tests
- CHANGELOG entries in semver format
- Release notes contain all major features
- Known limitations honest and accurate

---

## Task 8: Version Bump + Git Tag
- Model: sonnet
- Effort: low
- Files: package.json, src/core/constants.ts
- Scope: ./, src/core/

### Description
1. Bump version: package.json 0.1.0 → 0.2.0-beta.1
2. Update DECKENT_VERSION constant in constants.ts to match
3. Update any hardcoded version strings in docs
4. DO NOT create git tag yet — that happens after manual review
5. DO NOT npm publish — that's manual after beta tester approval

### Tests
- package.json version is 0.2.0-beta.1
- DECKENT_VERSION matches package.json
- No stale version strings in codebase
