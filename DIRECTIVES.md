# DIRECTIVES — Sprint 9 (CI, Version, History, Archive-Debt)

## Hedef: Build pipeline, dynamic version, enriched history, debt archival

## Task 1: CI Pipeline
- Create .github/workflows/ci.yml for continuous integration
- Triggers: push to master, pull_request to master
- Jobs: install deps (npm ci), run tests (npm test), build (npm run build), type check (tsc --noEmit)
- Matrix strategy: Node 18.x and Node 20.x
- Use actions/checkout@v4 and actions/setup-node@v4
- Single workflow file, no changes to existing code
- Kapsam: .github/workflows/ci.yml

## Task 2: Dynamic DECKENT_VERSION
- In src/core/constants.ts line 69, replace hardcoded DECKENT_VERSION = '0.1.0' as const
- Read version from package.json at module load time using readFileSync + JSON.parse
- Resolve package.json path relative to the constants.ts file location (use fileURLToPath + import.meta.url)
- Graceful fallback: if package.json missing or parse error, default to '0.0.0'
- Keep the export name and type compatible
- Update tests/core/constants.test.ts to verify version matches package.json
- Dosya: src/core/constants.ts, tests/core/constants.test.ts

## Task 3: Enrich deckent history
- Modify src/cli/commands/history.ts to show richer sprint history
- Current 4 columns: Sprint, Tasks, Coverage, Duration
- New 6 columns: Sprint, Tasks, Completed, No-Go Rate, Coverage, Duration
- Parse Completed count from sprint log line matching Completed metric row
- Parse No-Go count from sprint log line matching No-Go metric row
- Parse Total Tasks for rate calculation
- Calculate No-Go Rate as noGo/totalTasks formatted as percentage (e.g. 0%, 50%)
- Format Duration from milliseconds to human-readable: under 60s show Ns, over 60s show Nm Ns
- Update history tests in tests/cli/commands.test.ts
- Dosya: src/cli/commands/history.ts, tests/cli/commands.test.ts

## Task 4: deckent archive-debt CLI command
- Create new file src/cli/commands/archive-debt.ts
- Command: deckent archive-debt
- Read .brain/DEBT.md, parse the markdown debt table
- Implement own debt table parser (do NOT import from brain.ts — those functions are private)
- Use DEBT_TABLE_HEADER constant from src/core/constants.ts as table format reference
- Split resolved (resolved column = true) from unresolved items
- Write unresolved items back to .brain/DEBT.md with header and separator
- Append resolved items to .brain/archive/DEBT-ARCHIVE.md (create dir and file if needed)
- Print: Archived N resolved debt items. M items remaining.
- If no resolved items: No resolved debt items to archive.
- Register in src/cli/index.ts with import + registerArchiveDebt(program) call
- Follow src/cli/commands/cleanup.ts as registration pattern
- Create tests/cli/archive-debt.test.ts with mocked node:fs
- Dosya: src/cli/commands/archive-debt.ts, src/cli/index.ts, tests/cli/archive-debt.test.ts

## Kalite Kuralları
- Mevcut testler regresyona uğramamalı (702 test)
- tsc --noEmit clean kalmalı
- Her görev için testler yazılmalı