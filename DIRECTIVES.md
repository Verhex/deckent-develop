# DIRECTIVES — Sprint 263: Fable-Authored Deckent Analysis (3 doc tasks, all claude-fable-5)

## Goal: Have Claude Fable 5 (now live) author THREE rigorous, QUANTITATIVE analyses of the deckent codebase. Each doc must be **number-dense** — concrete counts, LoC, tallies, percentages — because the results will be independently verified numerically. Pure DOC-ONLY sprint (docs/analysis/ scope), runs in parallel with unrelated src/ work (no file collision). Fleet: **all fable** (proves claude-fable-5 across real workers). Each task: doc-only (no tsc/test), distinct file, **MUST write its `.result`** (the codex/gemini exit-without-result lesson — a doc with no .result grades NO_GO).

## Ortak kurallar
- DOC-ONLY: no source/test changes, no tsc. Write to your single assigned file under `docs/analysis/`.
- **Number-dense:** every claim that CAN be a number MUST be a number (file counts, LoC, module counts, ADR counts, test counts, BUILT/PARTIAL/MISSING tallies). Use tables. State HOW each number was obtained (the command/method) so it is verifiable.
- Read the real codebase to derive numbers — do NOT estimate or invent. If a number is approximate, label it "approx" + say why.
- i18n N/A (analysis docs are English). **WRITE `.tasks/task-XXX.result`** honestly.
- One writer per file (3 distinct files).

---

## Task 1: Architecture & Module Inventory Analysis
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/analysis/deckent-architecture-inventory.md
- Scope: docs/analysis/

### Description
Author `docs/analysis/deckent-architecture-inventory.md` — a QUANTITATIVE architecture inventory of deckent. Derive every number from the real tree (state the command used). Include, as tables:
1. **Module count per top-level `src/` directory** (orchestra, core, agents, nervous, monitor, connectors, providers, api, mcp, cli, dashboard, extensions) — `.ts` file count each + total.
2. **Source vs test LoC** — total `src/**/*.ts` LoC, total `tests/**/*.ts` LoC, ratio.
3. **Top 15 largest source files** by LoC (path + LoC).
4. **ADR inventory** — total ADRs, count by status (accepted / proposed / deprecated) from `.brain/exports/decisions.md` or `.claude/rules/*.md`.
5. **Import-layering (ADR-008)** — does `core/` import from `orchestra/` or `nervous/`? Report any violations found (grep-based, with counts).
6. **CLI command count, MCP tool count, built-in agent/skill counts** (verify against source, not docs).
Close with a 5-bullet "architectural observations" section grounded in the numbers.

**Kanıt:** `test -f docs/analysis/deckent-architecture-inventory.md && grep -ciE "LoC|module|ADR|count|[0-9]" docs/analysis/deckent-architecture-inventory.md`. **Test:** yok (doc-only) — but WRITE the .result.

---

## Task 2: Enterprise & Autonomous Capability Maturity Analysis
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/analysis/deckent-capability-maturity.md
- Scope: docs/analysis/

### Description
Author `docs/analysis/deckent-capability-maturity.md` — a QUANTITATIVE maturity assessment of deckent's enterprise + autonomous layers. For EACH capability, classify as **BUILT** (implemented + wired + has a production caller), **PARTIAL** (exists but dormant / no production caller / behind a default-off flag), or **MISSING**, with a `file:line` anchor + the evidence (e.g. caller count from grep). Cover, as a scored table:
- Enterprise: RBAC/authority (`authority-matrix.ts`, `rbac.ts`), multi-tenancy (`memory-store.ts` tenantId + strict flag), audit hash-chain + lineage (`audit-writer.ts`, `audit-query.ts`), SSO/OIDC (`auth-oidc.ts`, `auth-session.ts`), SIEM (`siem-forwarder.ts`), compliance (`compliance-report.ts`), secret vault (`credentials.ts`/`$DECK:`), policy-engine (`policy-engine.ts`), capability-broker (`capability-broker.ts`) + handlers, ERP (`erp-connector.ts`), cost-gate budget.
- Autonomous: scheduled-flow cron, recurring backlog re-enqueue, ExecutionPool wiring, observer driving, work-generator, MCP autonomous tool.
Produce TALLIES: total capabilities assessed, # BUILT, # PARTIAL, # MISSING, and a **"dormant seam" count** (modules with zero production callers — the key risk metric). Close with the top-5 highest-leverage wiring gaps (ranked).

**Kanıt:** `test -f docs/analysis/deckent-capability-maturity.md && grep -ciE "BUILT|PARTIAL|MISSING|dormant|caller|[0-9]" docs/analysis/deckent-capability-maturity.md`. **Test:** yok (doc-only) — WRITE the .result.

---

## Task 3: Test & Quality Posture Analysis
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/analysis/deckent-quality-posture.md
- Scope: docs/analysis/

### Description
Author `docs/analysis/deckent-quality-posture.md` — a QUANTITATIVE test & quality posture report. Derive numbers from the real tree + (where safe/read-only) test metadata. Include, as tables:
1. **Test inventory** — total `tests/**/*.test.ts(x)` file count, total test descriptors (`it(`/`test(` occurrence count), describe-block count.
2. **Test distribution** by directory (tests/core, tests/orchestra, tests/agents, tests/e2e, tests/integration, tests/cli, ...) — file count each.
3. **Pre-existing-failure inventory** — categorize the KNOWN non-deterministic / live-env failures (e.g. provider-bootstrap requires real ollama, doctor live-env, commands.test.ts readline-timeout) — list each cluster + the root cause + count if determinable from the test files (DO NOT run the full suite; reason from the test code + the documented known-failures). Distinguish "live-env" vs "stale-assertion" vs "flaky".
4. **Hermeticity** — count of test files that read gitignored local state (.deckent/config.json, .brain/memory.db, ~/.deckent) without a guard (grep-based estimate), referencing the `test:ci-sim` reproducer.
5. **Coverage** — report the documented coverage figure + its source; note if stale.
Close with a 5-bullet "quality-risk" ranking grounded in the numbers.

**Kanıt:** `test -f docs/analysis/deckent-quality-posture.md && grep -ciE "test|descriptor|coverage|hermetic|failure|[0-9]" docs/analysis/deckent-quality-posture.md`. **Test:** yok (doc-only) — WRITE the .result.

---

**Beklenen:** 3 doc task, hepsi **claude-fable-5** (fable'ı çok-worker'da kanıtlar), DOC-ONLY, docs/analysis/ altında 3 distinct dosya, number-dense. Paralel src/ wiring ile çakışmaz (docs vs src). CC: sprint sonu her doc'un SAYILARINI bağımsız ground-truth ile doğrular (file/LoC/ADR/test count'ları yeniden hesaplar) + Alperen'e sayısal doğruluk raporu verir. Worker'lar `.result` YAZAR.
