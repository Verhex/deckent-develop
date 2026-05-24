# Sprint Learnings (auto-generated)

## Sprint sprint-191 Learnings
- Sprint sprint-191 Learnings: ## Sprint sprint-191 Learnings
- 191-002 — `runtime_extension_enabled: true` default + worker timeout extension wire: NO_GO
- 191-003 — Sprint 190 retroactive agent stats reclassify + outcome-tracker correction tool: NO_GO — Sprint 191 Task 003 — reclassifyTaskOutcome + agent reclassify CLI command + ADR-046 audit-trail wire.

IMPLEMENTATION:

- 191-004 — Cost-gate planSprint mode-respecting (start.ts:349 fix): NO_GO — Sprint 191 Task 191-004 — Cost-gate planSprint() mode-respecting + AI→structured fallback chain wired.

## Changes

### 
- 191-007 — CLI top-level error handler — silent exit kill: NO_GO — CLI top-level error handler — silent exit kill (Sprint 191 P191-10).

IMPLEMENTATION:
1. src/cli/helpers/error-handler.t
- 191-008 — Memory DB retro entry write hook — Sprint 167 chronic gap closure: NO_GO — Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard (user approval require
- 191-009 — IDENTITY.md AUTOGEN block extension (Project Status table managed): NO_GO
- 191-010 — Dashboard non-terminal endpoints token bootstrap fix (auth): NO_GO
- 191-011 — Temp agent PROMPT.md generator template (Sprint 190 7x warning): NO_GO
- 191-012 — Karpathy 4-discipline anchor rule doc (.claude/rules/karpathy-discipline.md): NO_GO
- 191-013 — Built-in agent PROMPT.md Karpathy refactor pass 1 (top 5 agents): NO_GO

## Sprint sprint-190 Learnings
- Sprint sprint-190 Learnings: ## Sprint sprint-190 Learnings
- Docker OOM cycle drove ~14 false NO_GO (reclassify pending Sprint 191 Task 003)
- 190-009 Ollama adapter: TECH_DEBT — list parse/tier mapping incomplete (Sprint 191 Task 017 closure)
- Backfilled retroactively per Sprint 191 Task 008.

## Sprint sprint-189 Learnings
- Sprint sprint-189 Learnings: ## Sprint sprint-189 Learnings
- 189-009 deckent_kill MCP parite: NO_GO — investigate root cause
- 189-011 API endpoint E2E test suite: NO_GO — investigate root cause
- Backfilled retroactively per Sprint 191 Task 008.

## Sprint sprint-188 Learnings
- Sprint sprint-188 Learnings: ## Sprint sprint-188 Learnings

## Sprint sprint-187 Learnings
- Sprint sprint-187 Learnings: ## Sprint sprint-187 Learnings

## Sprint sprint-186 Learnings
- Sprint sprint-186 Learnings: ## Sprint sprint-186 Learnings
- Audit src/core/cascade-detector.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/ci-learning.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/condition-evaluator.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config-migration.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config-types.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config-validator.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/config.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/constants.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/cost-calculator.ts: NO_GO — Worker exited without writing result (exitCode=0)
- Audit src/core/cost-config-loader.ts: NO_GO — Worker exited without writing result (exitCode=0)

## Sprint sprint-185 Learnings
- Sprint sprint-185 Learnings: ## Sprint sprint-185 Learnings

## Sprint sprint-183 Learnings
- Sprint sprint-183 Learnings: ## Sprint sprint-183 Learnings
- W3-3 — v1.0.0-beta.1 final smoke (build:all + vitest + dashboard + serve): NO_GO — W3-3 final smoke gate: 6/6 GREEN. Read-only verification task, no source changes. Gate-by-gate: (1) `npm run build:all` 

## Sprint sprint-182 Learnings
- Sprint sprint-182 Learnings: ## Sprint sprint-182 Learnings
- W1-1 — Mock hygiene: orphan-cleaner-ipc + archive-debt `renameSync` ekle: NO_GO — Worker exited without writing result (exitCode=0)
- W1-3 — Full vitest sweep CI=true parity verify: NO_GO — Worker exited without writing result (exitCode=0)
- W2-2 — Auto-debt prepend offset drift fix (Dependencies title-prefix resolver): NO_GO — Worker exited without writing result (exitCode=0)
- W3-PQ-7 — Integration smoke: Sprint 181-001/002 prompt regression: NO_GO — Worker exited without writing result (exitCode=0)
- W4-1 — Beta launch smoke: validate:publish 6/6 gate green: NO_GO — W4-1 Beta launch smoke — validate:publish 6/6 GREEN, exit 0.

Gate verdicts:
  [PASS] pack_size_and_count — 2.7 MB (2,83

## Sprint sprint-181 Learnings
- Sprint sprint-181 Learnings: ## Sprint sprint-181 Learnings
- W1-1 — CI workflow'una dashboard deps install adımı ekle: NO_GO — W1-1 primary fix tamamlandı: (1) .github/workflows/ci.yml typecheck job'una `npm ci --prefix src/dashboard --ignore-scri

## Sprint sprint-180 Learnings
- Sprint sprint-180 Learnings: ## Sprint sprint-180 Learnings
- W1-1 — sprint-state-tracker getSprintStateSnapshot (Step B): NO_GO — W1-1 sprint-state-tracker — getSprintStateSnapshot(projectRoot) exports a fresh SprintStateSnapshot built from .deckent/
- W1-2 — Nervous bootstrap fabrika (Step A): GO_WITH_TECH_DEBT — W1-2 — Nervous bootstrap fabrika tamamlandı. `createNervousSystemIfEnabled(config, projectRoot, sprintStateProvider, act
- W2-1 — Nervous action handlers (Step C): GO_WITH_TECH_DEBT — W2-1 — Nervous action handlers (Step C) implemented per NERVOUS-TODO §11.2 Step C. Module exports: ActionHandlerResult (
- W3-1 — Sprint-controller nervous wire (Step D): GO_WITH_TECH_DEBT — Sprint 180 W3-1 — Sprint-controller nervous wire (Step D) tamamlandı. NERVOUS-TODO §11.2 Step D wire eklendi: runSprint(
- W3-2 — Faz 1 smoke config: NO_GO — W3-2 Faz 1 smoke config tamamlandı. nervous_system.mode: balanced→strict, notifications.severity_min: info→critical. 3 d
- W3-3 — Nervous integration runtime test: GO_WITH_TECH_DEBT — W3-3 — Nervous integration runtime test landed: tests/nervous/integration-runtime.test.ts (257 LoC). Drives the full ner
- W4-1 — Worker .result coverage zorunluluk ★ BETA MUST: GO_WITH_TECH_DEBT — Sprint 180 W4-1 — Worker .result coverage zorunluluk implemented across 2 source files + 1 new test file.

## Bug Fix Re
- W4-2 — Panic guard onay UI (Layer 3 synergy): GO_WITH_TECH_DEBT — W4-2 — Panic guard onay UI Sprint 179 dogfood keşfi ([[project-panic-guard-no-approval-ui]]) çözümlendi. 3 path land ett
- W4-3 — Self-audit gate vitest fix ★ BETA MUST: NO_GO — Worker exited without writing result (exitCode=0)
- W5-1 — npm publish v1.0.0-beta.1 readiness ★ BETA LAUNCH: NO_GO — W5-1 npm publish readiness — 6 gate validator + 20 unit tests + package.json wiring. DELIVERABLES: (1) scripts/validate-

## Sprint sprint-179 Learnings
- Sprint sprint-179 Learnings: ## Sprint sprint-179 Learnings
- W0-1 — Dependency aggregate fix-aware (Bug A foundation): GO_WITH_TECH_DEBT — W0-1 (Bug A foundation) tamamlandı. TDD akışı RED→GREEN. 5/5 case PASS: (a) getAggregateVerdict ana NO_GO + fix DONE → D
- W1-1 — Auto-debt empty-scope inheritance: GO_WITH_TECH_DEBT — W1-1 Auto-debt empty-scope inheritance implemented. (1) DebtItem extended with optional class ('verified-no-result' | 's
- W2-3 — DEP0190 shell:true win32-only conditional: GO_WITH_TECH_DEBT — DEP0190 fix: 3 call-sites changed from shell:true to shell:process.platform==='win32'.
- src/core/plugin-hooks.ts:399 (r
- W2-7 — CI-only test flakes (PID portability + mock hygiene): GO_WITH_TECH_DEBT — W2-7 CI-only test flakes — final hygiene. Pre-work audit: src/core/pid-liveness.ts already shipped (Sprint 178 Task 4 fo
- W3-5 — Dashboard TS errors + root lint wire: GO_WITH_TECH_DEBT — W3-5 implementation per sub-project #2 plan Task 5. (1) NEW src/dashboard/src/i18n/types.ts: Translator (strict, key: Tr
- W3-6 — doctor DECISIONS.md obsolete + 5-file cascade: GO_WITH_TECH_DEBT — W3-6 doctor DECISIONS.md obsolete + 5-file cascade COMPLETE. TDD RED→GREEN: 2 tests in tests/cli/doctor-memory-v2.test.t
- W4-8 — Prompt guard (I1 + I2 invariants) ★ BETA MUST: GO_WITH_TECH_DEBT — W4-8 Prompt Guard (I1 + I2) tamamlandı. matchPromptPatterns() 3 pattern (base_blob ≥256, osc_escape, curl_pipe_shell) + 
- W4-9 — Command guard (I3 default-deny remote) ★ BETA MUST: GO_WITH_TECH_DEBT — W4-9 Command Guard (I3 default-deny remote) — TDD complete.

IMPLEMENTATION (src/api/terminal/command-guard.ts, NEW):
- 
- W5-11 — mTLS hook (AuthProvider interface) ★ BETA MUST: GO_WITH_TECH_DEBT — W5-11 mTLS hook (AuthProvider interface) tam implement edildi. AuthProvider interface'e optional `verifyClientCert?(cert

## Sprint sprint-178 Learnings
- Sprint sprint-178 Learnings: ## Sprint sprint-178 Learnings
- Fix debt: Tech debt from 175-020-fix: All 5 automatic verification gates executed:

1. npm: NO_GO — Priority fix for debt-175-020-fix (CRITICAL, open 3 sprints). Task JSON ships with EMPTY scope (scope.directories=[], sc

## Sprint sprint-177 Learnings
- Sprint sprint-177 Learnings: ## Sprint sprint-177 Learnings
- Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented: NO_GO — Worker exited without writing result (exitCode=0)
- 177-003 — Tmux backend deprecate path: GO_WITH_TECH_DEBT — 3 required TDD tests PASS (default→docker + explicit-warns + warn-once). Functional requirements fully met: resolveBacke

## Sprint sprint-176 Learnings
- Sprint sprint-176 Learnings: ## Sprint sprint-176 Learnings
- Fix debt: ADR-019 reconciliation: language-agnostic verify not implemented: NO_GO — REFUSED — empty-scope debt-injection dispatch. The task as dispatched is a live reproduction of the exact bug that W1-1 
- W1-1 — Auto-debt empty-scope inheritance: NO_GO — Worker exited without writing result file
- W1-2 — Re-plan orphan task file cleanup: NO_GO
- W2-3 — DEP0190 shell:true win32-only conditional: NO_GO — Fixed DEP0190 deprecation: 3 call-sites changed from shell:true to shell:process.platform==='win32'. (1) src/core/plugin
- W2-4 — Coverage hard-floor / aspirational split: NO_GO — Worker exited without writing result file
- W3-5 — Dashboard TS errors + root lint wire: NO_GO — Worker exited without writing result file
- W3-6 — doctor DECISIONS.md obsolete + 5-file cascade: NO_GO — Worker exited without writing result file
- W2-7 — CI-only test flakes (PID portability + mock hygiene): NO_GO — Worker exited without writing result file
- W4-8 — Prompt guard (I1+I2): NO_GO — Worker exited without writing result file
- W4-9 — Command guard (I3 default-deny remote): NO_GO — Worker exited without writing result file

## Sprint sprint-175 Learnings
- Sprint sprint-175 Learnings: ## Sprint sprint-175 Learnings
- W1.2 — SessionBackend + LocalPtyBackend: NO_GO — W1.2 — SessionBackend interface + LocalPtyBackend implementation, plan §Task 1.2 ile birebir aynı. RED→GREEN TDD akışı:

- W1.4 — PtySessionManager: NO_GO — W1.4 PtySessionManager — implemented per plan §1.4. TDD: wrote 4 tests first (bounded ring, detach≠kill, maxSessions, id
- W2.2 — HTTP control + localhost bootstrap inject: NO_GO — Worker exited without writing result (exitCode=0)
- W3.3 — TerminalView (xterm): NO_GO — W3.3 TerminalView (xterm) — TDD complete. RED phase confirmed: 'Failed to resolve import TerminalView' before implementa
- W3.4 — TerminalTabs + TerminalPanel: NO_GO — W3.4 multi-tab TerminalPanel + quick-launch (claude/gemini/codex/deckent/shell) implemented per plan §3.4 verbatim. TDD 
- W3.5 — DockPanel + Layout: NO_GO — W3.5 DockPanel + Layout integration complete (TDD).

## Deliverables
1. src/dashboard/src/components/DockPanel.tsx (NEW,
- W3.6 — ConfigPage Terminal kategori + i18n: NO_GO — Added 5 Terminal config fields (terminal.enabled, terminal.allowShellKind, terminal.maxSessions, terminal.idleTimeoutMs,
- W4.1 — E2E reattach integration: NO_GO — W4.1 — E2E reattach integration test implemented per Plan §Task 4.1 and DIRECTIVES Task 18.

Flow (1 it(), real `node-pt
- W4.3 — Final verification: GO_WITH_TECH_DEBT — Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard (user approval require

## Sprint sprint-174 Learnings
- Sprint sprint-174 Learnings: ## Sprint sprint-174 Learnings
- Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp: NO_GO — Worker exited without writing result (exitCode=0)

## Sprint sprint-173 Learnings
- Sprint sprint-173 Learnings: ## Sprint sprint-173 Learnings

## Sprint sprint-172 Learnings
- Sprint sprint-172 Learnings: ## Sprint sprint-172 Learnings
- C1 — update-readme-stats.mjs auto-gen + CI gate: NO_GO — TDD discipline: önce tests/scripts/update-readme-stats.test.ts yazıldı (RED — script yok, import fail), sonra scripts/up
- C2 — reference docs auto-gen (MCP/ADR/CLI/agents): NO_GO — Sprint 172 Task C2 — reference docs auto-gen (5 üretici TDD). RED: tests/scripts/gen-reference-docs.test.ts ilk çalıştır
- C3 — lint:link dead-link gate: NO_GO — Sprint 172 C3 — lint:link dead-link gate. TDD RED→GREEN: 28/28 unit test pass. `node scripts/lint-links.mjs` exit 0 (156
- B1 — archive DB-parity doğrulama (B2 ön-koşulu): NO_GO — B1 archive ↔ memory.db parity verifier tamamlandı (read-only). Çıktı: 23 parity-OK retro + 196 DB-eksik (121 sprint + 75
- B2 — .gitignore/.npmignore + archive git rm --cached: NO_GO — B2 tamamlandı — kısmi (B1 parity eksikliği nedeniyle). 

## DONE:
1. .gitignore §4.3 bloğu eklendi: sprint-*-tasks/, spr
- B5 — deckent-hub kararı + examples workspace fix: NO_GO — Step 1 TAMAMLANDI: examples/quickstart/package.json 'workspace:*' → '^1.0.0-beta.1'. OSS kullanıcıları artık 'npm instal

## Sprint sprint-171 Learnings
- Sprint sprint-171 Learnings: ## Sprint sprint-171 Learnings
- Doc Audit Root: NO_GO — Sprint 171 Task 23 — Doc Audit Root tamamlandı. Repo kökündeki 19 markdown dosyası tek tek denetlendi (DIRECTIVES'in idd

## Sprint sprint-170 Learnings
- Sprint sprint-170 Learnings: ## Sprint sprint-170 Learnings
- P0-3 Tmux Prompt Filename TaskId-Aware: GO_WITH_TECH_DEBT — Sprint 170 P0-3 (Bug 2B / ADR-048 §Negative closure) — fix architecturally complete; 3/3 mandated TDD tests GREEN; 5 pre
- P0-5 Docker Spawn Race Window Closure: GO_WITH_TECH_DEBT — P0-5 Docker Spawn Race Window Closure — Sprint 169 Bug 2A eradication. TDD red-green disciplined: 6 tests written first 
- Fix: P0-6 Event Stream Prompt Write/Delete Visibility: NO_GO — Worker exited without writing result (exitCode=0)
- P0-6 Event Stream Prompt Write/Delete Visibility: GO_WITH_TECH_DEBT — P0-6 Event Stream Prompt Write/Delete Visibility tamamlandı.

## Yapılanlar
1. src/orchestra/event-stream.ts: CHANNELS.P

## Sprint sprint-169 Learnings
- Sprint sprint-169 Learnings: ## Sprint sprint-169 Learnings
- W3.1 C0c Collision Detection Live Trigger Investigation + Fix: NO_GO — W3.1 RC identified as path-normalization gap (RC-C from plan §2.1). `detectScopeCollisions` (conflict-resolver.ts:173) c
- W3.2 Smoke Directive Dependency Parser Fix: NO_GO — Sprint 169 W3.2 fix: parseDependencyField helper added (src/orchestra/task-builder.ts:186) accepting 3 formats — bare st
- C1 Memory Relations Migration: NO_GO — Sprint 169 C1 — Memory Relations Migration complete.

What changed:
1. src/core/memory-types.ts — added MemoryRelation i
- H2 Stub Memory Entries Backfill: NO_GO — Sprint 169 H2 — Stub Memory Entries Backfill implemented per plan Task 4 (Steps 4.1-4.5, 4.7). Added MemoryStore.update(
- H3 OSS Pre-Flip Secret Scan Baseline: NO_GO — H3 OSS Pre-Flip Secret Scan Baseline — 3/3 deliverable şartı eksiksiz. (1) scripts/security/secret-baseline.mjs: 10 rege
- H4 Dashboard Build CI Gate: NO_GO — H4 Dashboard Build CI Gate tamamlandı. Yeni .github/workflows/dashboard-build.yml workflow'u: Node 18.x/20.x/22.x matrix
- H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook: NO_GO — Sprint 169 H1 — ADR DB→FS Export Pipeline + ADR-046 Bi-Directional Hook amendment COMPLETE. (1) src/core/memory-export.t

## Sprint sprint-168 Learnings
- Sprint sprint-168 Learnings: ## Sprint sprint-168 Learnings
- T3 Kill Recovery Simulation (DEPENDS T1): NO_GO — Task blocked by unmet dependency. Task 168-003 (T3 Kill Recovery Simulation) depends on task sprint-168-smoke-T1 (T1 Sco

## Sprint sprint-167 Learnings
- Sprint sprint-167 Learnings: # Sprint sprint-167 Learnings

Sprint 167 Read-Only Self-Audit deliverable'ları (kaynak: .audit/sprint-167/T*.md — hiçbir source/doc mutasyonu yok, salt tespit).

## T1 — Code Inventory + Dead Code + Unused Features (167-001, code-reviewer)
Kaynak: .audit/sprint-167/T1-code-inventory.md. Kod envanteri + ölü kod + kullanılmayan feature taraması (Sprint 171 dead-code audit'inin öncülü).

## T2 — Doc Inventory + Reference Validation + Ground-Truth (167-002, doc-writer)
Kaynak: .audit/sprint-167/T2-doc-inventory.md. READ-ONLY doc envanteri + kırık referans + ground-truth doğrulama. (Sprint 167 retro NO_GO bu task'tı.)

## T3 — ADR Compliance + Status (167-003, code-reviewer)
Kaynak: .audit/sprint-167/T3-adr-compliance.md. 50 ADR enumeration (DB↔FS parity) + 8 ADR runtime compliance + ADR-046 Step 1-4 wire canlı trigger + identity-generator Step 2 decommission önerisi + ADR-053/055/060 (Sprint 156'dan beri proposed) closure önerisi. Tümü Sprint 168 suggested_fix input'u.

## T4 — Memory.db + Data Integrity (167-004, data-engineer)
Kaynak: .audit/sprint-167/T4-memory-integrity.md. memory.db schema + FTS5 + relations integrity (Sprint 171 memory-db-integrity audit'inin öncülü).

## T5 — Brain/Worker/Auditor Wire + Manuel Survival (167-005, bug-fixer FORENSIC)
Kaynak: T5-brain-wire-audit.md + T5-brain-debug-phase1.md + T5-brain-debug-phase2.md. 9 Brain orchestration bug + BUG-HH forensic; 5 cluster pattern analysis; manuel survival pattern kanıtı (ADR-047 input).

## T6 — Test + Build + Security + OSS Readiness (167-006, security-auditor)
Kaynak: .audit/sprint-167/T6-test-build-security.md. tsc PASS / vitest 2 fail / OSS gate readiness forensic.

## T7 — Cross-Cutting Synthesis + Brain Crash Addendum (167-007, architect)
Kaynak: T7-cross-cutting-synthesis.md + T7-brain-crash-addendum.md. Meta-audit konsolidasyon + Alperen request Brain crash sebep detayı (live evidence).

## Kalıcı Öğrenim
- ADR-046 hook chain Sprint 161/163/166/167 dört kez wire denendi, hâlâ kısmî → BA-05'in (Sprint 171) doğrudan kökü; tam crash-safe fix post-GA integrity-V2 sprintine.
- Sprint metrics math guard (Duration negatif / Coverage NaN) sprint-167.md'de canlı kanıt — finalize crash imzası.
- Read-only self-audit deseni Sprint 171'in 29-task mega-audit'inin doğrudan atası.

## Sprint sprint-166 Learnings
- Sprint sprint-166 Learnings: # Sprint sprint-166 Learnings

## 4 Architectural Root Cause Fix
1. **Bug M (adrInsert hook):** docs/adr/*.md → memory.db migration eksikti. Step 3 unconditional invocation pattern + syncAdrFilesToDb upsert ile çözüldü. ADR-046 Section 5.1 Step Ordering Contract kontract.
2. **Bug N (onRuleRegen wire):** Manuel finalize path .claude/rules/*.md regenerate etmiyordu (13 sprint stale). finalize.ts:166 callback wire + rule-generator.ts CUSTOM_TEMPLATE empty placeholder.
3. **Bug S (sprint-aware cache key):** doc-cache.ts cache key fileHash+entryHash idi, sprint.id eklendi. Runner wire-up Sprint 167'e ertelendi (GO_WITH_TECH_DEBT).
4. **Bug Y2 (ground-truth defense):** Doc-sync agent'lar stale numeric claim üretiyordu (15 vs 16 agents Sprint 164 regression). 3-layer defense (plan-time + helper + runtime) + .deckent/ground-truth-overrides.json whitelist.

## Key Decision: ADR-046 Brain Self-Update Hook Architecture
- Post-finalize hook chain architectural contract dokümante
- Step ordering: Step 1 memoryExport → Step 2 identityRegen (deprecated) → Step 3 adrInsert → Step 4 ruleRegen → Step 5 updateProjectDocs
- 3 mimari prensip: unconditional invocation, cache key completeness, single registration target
- Falsifiable M1-M4 monitoring criteria for Sprint 167-168
- Sprint 170 refactor trigger criteria documented

## Manuel Survival Pattern (Sprint 164→165→166 zincir kanıt)
- Brain SPAWN/finalize otomatik chain çalışmıyor, manuel müdahale ile her sprint başarılı
- npx deckent spawn <task-id> --auto-approve (CLI proven)
- npx deckent run "<description>" (sprint-dışı proven)
- Wave 1.5 strict gate manuel CHECKPOINT (npx deckent memory rebuild + decision JSON)

## 4 New Bug Live Replay (Sprint 167 P0)
- **Bug E:** Spawn-lock leak — DECKENT.md, .md, brain.md bare token lock conflict, 3× replay aynı sprint
- **Bug G:** OOM exit 137 — Container 4GB → 8GB workaround proven (spawn-backend-docker.ts:374)
- **Bug Z2:** Planner Files parser — DIRECTIVES.md Files: listesinden bare token üretiyor (.md, brain.md, git commit hash)
- **Bug Z3:** memory rebuild semantic — destructive (delete-or-error, exports yetersiz). Sprint 167'de fix: rebuild = export, import = new command

## Bug V Backfill Manuel Test
- T6 commit "production backfill ran 100 debt rows" — DB'de hâlâ NULL bulundu (Sprint 166 sonu inspection)
- Worker farklı db kullandığı veya code-path canlı tetiklenmediği için
- Sprint 166 manuel backfill script (bu script) ile bu açık kapatıldı (UPDATE entries SET sprint_id=metadata.originSprintId)

## Sprint sprint-165 Learnings
- Sprint sprint-165 Learnings: ## Sprint sprint-165 Learnings
- Sprint 165 Learnings: # sprint-165

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 0 |
| Completed | 0 |
| Tech Debt | 0 |
| No-Go | 0 |
| Coverage | 0.0% |
| Duration | 12909690ms |
| Files Changed | - |

## Agents
Agents: -
Skills: -

## Tasks
| Task | Agent | Skills | Status |
|------|-------|--------|--------|

## Sprint sprint-164 Learnings
- Sprint sprint-164 Learnings: ## Sprint sprint-164 Learnings
- Vitest Gate +1 Fail Closure — Chronic Regression Eradication: NO_GO — Vitest gate +1 fail chronic regression closure — TAMAMLANDI. Discovery: full vitest run 17 fail / 8 dosya tespit etti (n

## Sprint sprint-163 Learnings
- Sprint sprint-163 Learnings: ## Sprint sprint-163 Learnings

## Sprint sprint-162 Learnings
- Sprint sprint-162 Learnings: ## Sprint sprint-162 Learnings
- Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003, composite): GO_WITH_TECH_DEBT — T-003 composite (phase observability + EvaluationAuditTrail runtime wire) complete. persistPhaseTransition helper export
- Crash Injection Integration Test + E2E Smoke (T-007): NO_GO — T-007 — 9/9 tests PASS (6 crash injection + 3 e2e smoke). Crash file: 6 it() blocks S1-S6 (grep -nE 'S[1-6]:' → 18 match

## Sprint sprint-161 Learnings
- Sprint 161 Learnings: Sprint 161 learnings — no .brain/sprints/sprint-161.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-160 Learnings
- Sprint 160 Learnings: Sprint 160 learnings — no .brain/sprints/sprint-160.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-159 Learnings
- Sprint 159 Learnings: # sprint-159

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 15 |
| Completed | 2 |
| Tech Debt | 2 |
| No-Go | 13 |
| Coverage | NaN% |
| Duration | -106ms |
| Files Changed | - |

## Agents
Agents: temp-react-ts-specialist, doc-writer
Skills: typescript-expert, system-architect, security-specialist, documentation-writer, ci-testing

## Tasks
| Task | Agent | Skills | Status |
|------|-------|--------|--------|
| 159-001: EvaluationAuditTrail Foundation | temp-react-ts-specialist | typescript-expert, system-architect | GO_WITH_TECH_DEBT |
| 159-002: Dual-Evaluator Race Close (Bug X) | temp-react-ts-specialist | typescript-expert, system-architect | GO_WITH_TECH_DEBT |
| 159-003: Sprint-Stall Fix-Fix Spawn Loop | temp-react-ts-specialist | typescript-expert, system-architect | NO_GO |
| 159-004: handleEvaluation → updateTaskStatus Wire | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-005: Heartbeat Write Atomicity | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-006: sprint-state.json Phase Transition Update | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-007: scoreTestCoverage null Neutral Score | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-008: AUDIT_RUBRIC Dinamik Threshold | temp-react-ts-specialist | typescript-expert, system-architect | NO_GO |
| 159-009: Retro Naming Off-By-One Fix | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-010: sprint-phases.ts cleanup 'spawn-fail' Argument | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-011: DeckentConfig dependency_pipeline_enabled Field | temp-react-ts-specialist | typescript-expert | NO_GO |
| 159-012: Per-Change Security Review | doc-writer | security-specialist, documentation-writer | NO_GO |
| 159-013: 2 Yeni ADR Draft | doc-writer | system-architect, documentation-writer | NO_GO |
| 159-014: EvaluationAuditTrail E2E Smoke Test | temp-react-ts-specialist | typescript-expert, ci-testing | NO_GO |
| 159-015: Sprint 157 Retro + Bug Close Forensic | doc-writer | documentation-writer | NO_GO |

## Sprint sprint-158 Learnings
- Sprint 158 Learnings: Sprint 158 learnings — no .brain/sprints/sprint-158.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-157 Learnings
- Sprint 157 Learnings: Sprint 157 learnings — no .brain/sprints/sprint-157.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-156 Learnings
- Sprint sprint-156 Learnings: ## Sprint sprint-156 Learnings
- Workflow Rename VERIFY (read-only audit): NO_GO — Audit-only task completed. All 3 primary workflow files (ci.yml, docs.yml, cross-platform-e2e.yml) confirmed to use bran
- dependency_pipeline_enabled Default Flip: NO_GO — Sprint 156 Task 2 — dependency_pipeline_enabled default flipped from undefined (falsy) → true. Three precise changes ins
- Cascade/Unblock Runtime Wire: GO_WITH_TECH_DEBT — Sprint 156 Task 003 complete. Wired applyCascadeToSprint into runEvaluatePhase (after each NO_GO with a real result file
- Task Tmpfile Cleanup Discipline: NO_GO — Sprint 156 Task 4 — Task Tmpfile Cleanup Discipline. Three changes:

1) spawn-backend-docker.ts:567-581 — Removed the in
- IDEMPOTENCY_KEY Worker Prompt Inject: NO_GO — IDEMPOTENCY_KEY worker prompt + container env injection wired end-to-end. (1) spawn-backend-docker.ts dockerArgs: append
- Brain Self-Rebuild Gate (NO BUILD CALL): GO_WITH_TECH_DEBT — Sprint 156 Task 008 — Brain Self-Rebuild Gate (NO BUILD CALL) implemented.

WHAT WAS DONE:
1. src/orchestra/sprint-phase
- assertSpawnSafe Whitelist Runtime: NO_GO — HONEST SELF-ASSESSMENT: Module + tests fully shipped (100% of in-scope work). spawn-backend-docker.ts wire-up explicitly
- Runtime File Lock (flock spawn-time): NO_GO — Implemented spawn-time `.spawnlock` API in src/core/file-lock.ts (acquireSpawnLock, releaseSpawnLock, acquireSpawnLocks 
- EffectClass Annotation rubric-registry: GO_WITH_TECH_DEBT — EffectClass annotation eklendi. src/orchestra/rubric-registry.ts'e: (1) EffectClass type union ('pure'|'reversible'|'ide

## Sprint sprint-155 Learnings
- Sprint sprint-155 Learnings: ## Sprint sprint-155 Learnings

## Sprint sprint-154 Learnings
- Sprint sprint-154 Learnings: ## Sprint sprint-154 Learnings
- RubricRegistry Core Foundation: NO_GO — RubricRegistry foundation created at src/orchestra/rubric-registry.ts (196 LoC). Spec compliance: (1) TaskType taxonomy 
- RubricRegistry Test Suite: NO_GO — Created tests/orchestra/rubric-registry.test.ts with 26 test cases (exceeds 20+ requirement): isAuditTask (7), isDocumen

## Sprint sprint-153 Learnings
- Sprint sprint-153 Learnings: ## Sprint sprint-153 Learnings
- Brain 8-Phase Sprint Lifecycle: NO_GO — Brain 8-Phase Sprint Lifecycle dokümantasyonu oluşturuldu. Her faz için Amaç, Kritik Karar ve Temel I/O bölümleri yazıld
- Memory V2 SQLite Schema: NO_GO — Memory V2 SQLite schema documentation written. File docs/smoke-2026-05-12/T-SMOKE-03.md created with 1001 words (minimum
- Multi-Provider Routing: NO_GO — docs/smoke-2026-05-12/T-SMOKE-04.md oluşturuldu. 587 kelime (gerekli ≥200). İçerik: multi-provider genel bakış tablosu, 
- Nervous System Detector'ları: NO_GO — T-SMOKE-06.md oluşturuldu: 982 kelime (≥200 minimum karşılandı). 11 detector tam olarak belgelendi: stale-worker, scope-
- Ed25519 Skill Signature: NO_GO — T-SMOKE-07.md yazıldı: 722 kelime (≥200 şart karşılandı). Kapsanan konular: OpenClaw %20 malicious skill problemi, Ed255
- Sprint Kill ve Cleanup Disiplini: NO_GO — T-SMOKE-08.md oluşturuldu. 679 kelime (≥200 koşulu sağlandı). Sprint kill kullanıcı onayı zorunluluğu, Nervous System lo
- ADR-008 Unidirectional Imports: NO_GO — ADR-008 Unidirectional Imports dokümantasyonu oluşturuldu. 773 kelime (≥200 eşiği aşıldı). Kapsam: Brain→orchestra→core 
- Beta GA 20-Gate Listesi: NO_GO — Beta GA 20-Gate dökümanı oluşturuldu. Her kapı için açıklama, ölçüm kriteri ve Sprint 152 sonu durumu (PASS/IN_PROGRESS)

## Sprint sprint-152 Learnings
- Sprint 152 Learnings: Sprint 152 learnings — no .brain/sprints/sprint-152.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-151 Learnings
- Sprint sprint-151 Learnings: ## Sprint sprint-151 Learnings
- Public Repo Flip — VerhexIO/deckent-dev → VerhexIO/deckent: GO_WITH_TECH_DEBT — DURUM: ../deckent-public dizini mevcut değil — Alperen'in önce git clone yapması gerekiyor. Handoff dökümanı bu senaryoy
- Discord Bot Deploy + Smoke Test: GO_WITH_TECH_DEBT — ## Tamamlanan İşler

**scripts/deploy-discord.sh** (yeni, ~185 satır):
- Prereq kontrolü: Node >= 18, .deck dosyası, DIS
- Nervous System 6-10 Detector Activation (Sprint 147 Plan): GO_WITH_TECH_DEBT — 5 yeni nervous system detector oluşturuldu (6→11 toplam): BuildFailureRecurrenceDetector, TokenSpikeDetector, AgentRouti

## Sprint sprint-150 Learnings
- Sprint sprint-150 Learnings: ## Sprint sprint-150 Learnings
- Docker Worker Exit Pattern Final Fix (Sprint 146+148 Debt): GO_WITH_TECH_DEBT — Docker Worker Exit Pattern Final Fix completed. 3 changes: (1) containers Map now stores {containerId, model} so host-si
- Scope Sanitizer Code Snippet False Positive Fix (Sprint 148 Debt): NO_GO — All requirements from Sprint 148 debt already implemented in Sprint 149. Verified: (1) isPlaceholderPath() rejects foo/b
- Auditor Stale Alert Race Condition Fix (Sprint 148 Debt): GO_WITH_TECH_DEBT — Auditor stale alert race condition fix was already implemented in Sprint 149 (auditor.ts lines 293-316 + heartbeat-types
- VerhexIO/deckent-hub Repo Create + Templates: GO_WITH_TECH_DEBT — deckent-hub/ local dizin scaffold tamamlandı. Docker worker tarafından önceden yazılmış tüm dosyalar doğrulandı ve eksik
- AGENTS.md Refresh (39 Sprint Behind): NO_GO — AGENTS.md dosyası incelendi. Sprint 149'da zaten güncel durumda: 15 built-in agent (ADR-041 reform sonrası), 'test-write
- npm pack --dry-run + Version Bump 1.0.0-beta.1: GO_WITH_TECH_DEBT — npm pack --dry-run PASSES: tarball 1.08MB (<2MB limit), no secrets, no sensitive dirs, all 6 package.json metadata field
- `cleanOrphanIpcDirs` Wire-Up with Live-PID Check: NO_GO — cleanOrphanIpcDirs function updated: new sync API with live-PID check support (opts: { checkLivePid, minAgeMs }). Old as
- Feature Manifest Canlılaştırma (Tam Scope): GO_WITH_TECH_DEBT — Feature Manifest Canlılaştırma — 7 adımlı plan tamamlandı:

1. scripts/sync-manifest.mjs (~230 LoC): 31 feature tanımlı,
- `deckent audit` + `deckent recover` User-Facing CLI + MCP Yüzeyi: GO_WITH_TECH_DEBT — Implemented `deckent audit` + `deckent recover` CLI commands and `deckent_audit` + `deckent_recover` MCP tools. Full ADR

## Sprint sprint-149 Learnings
- Sprint sprint-149 Learnings: ## Sprint sprint-149 Learnings
- `deckent mode` CLI Command: GO_WITH_TECH_DEBT — Created `deckent mode` CLI command with 5 subcommands: show, sprint, task, auto, global. Follows ADR-012 register<Name>(

## Sprint sprint-148 Learnings
- Sprint sprint-148 Learnings: ## Sprint sprint-148 Learnings
- Vitest Triage — 135 Fail → < 50 Fail: NO_GO — Docker worker exited without writing result file
- Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix: GO_WITH_TECH_DEBT — Docker Worker Exit Pattern root cause fixed. Problem: Container SIGKILL (exit 137, OOM kill) bypasses all shell traps — 

## Sprint sprint-147 Learnings
- Sprint sprint-147 Learnings: ## Sprint sprint-147 Learnings

## Sprint sprint-146 Learnings
- Sprint sprint-146 Learnings: ## Sprint sprint-146 Learnings
- Agent Truncation Bug Fix: GO_WITH_TECH_DEBT — Root cause: task-builder.ts:761 had `agentPrompt.slice(0, 2000)` which truncated agent prompts to 2000 chars. This cause
- ADR Relevance Scoring Engine: GO_WITH_TECH_DEBT — ADR Relevance Scoring Engine implemented. Created src/orchestra/adr-selector.ts (~330 LoC) with: selectRelevantAdrs() sc
- Scope Sanitizer: GO_WITH_TECH_DEBT — Created scope-sanitizer.ts with 8 filter rules (absolute path reject, path traversal reject, dist/ remove, extension-onl
- Generative Useful God Template — buildTaskPrompt Single Entry: GO_WITH_TECH_DEBT — buildTaskPrompt() implemented as single entry point in prompt-god-template.ts (~270 LoC). Pipeline: agent block → skill 
- DIRECTIVES.md Mid-Sprint Silme Bug Fix: GO_WITH_TECH_DEBT — Phase guard added to archiveDirectives() — rejects calls outside CLEANUP/COMPLETE phase. Emergency restore function adde
- Rubric System Consolidation: GO_WITH_TECH_DEBT — Rubric system consolidated: (1) Removed rubricScores spec from worker prompt in prompt-god-template.ts — workers no long
- Sprint 145 vitest Regression Fix: NO_GO — Docker worker exited without writing result file

## Sprint sprint-145 Learnings
- Sprint sprint-145 Learnings: ## Sprint sprint-145 Learnings
- Brain Heuristic Timeout Estimator: NO_GO — Brain Heuristic Timeout Estimator implemented as specified. New file timeout-estimator.ts (~170 LoC) with brainEstimateT
- EventBus Abstraction + Subscribe API: GO_WITH_TECH_DEBT — EventBus Abstraction + Subscribe API implemented as specified.

1. NEW: src/orchestra/event-bus.ts (~250 LoC) — EventBus
- ADR-037 RBAC Runtime Wire — checkWorkerAuthority: GO_WITH_TECH_DEBT — ADR-037 RBAC Runtime Wire completed. Changes:

1. Fixed checkWorkerAuthority() bug — was always returning true even on v
- CHANNELS.NOTIFY writeEvent Emit Wire: GO_WITH_TECH_DEBT — Added emitNotify() helper to event-stream.ts (source='deckent', target='user', channel=CHANNELS.NOTIFY). Added 4 strateg
- NotifyDispatcher Wire + 3 Adapter: GO_WITH_TECH_DEBT — NotifyDispatcher successfully wired in both MCP server and CLI entry points. 3 adapters (MCP, CLI, File) connected via e
- ADR-038 Self-Modifying Detector Runtime Wire: GO_WITH_TECH_DEBT — ADR-038 Self-Modifying Detector Runtime Wire completed. Three changes: (1) Added alias exports to self-modifying-detecto
- registerResume CLI Wire + CLI Registration Test Harness: GO_WITH_TECH_DEBT — Fixed registerResume (audit finding #5) + registerHelp (also unregistered, found during investigation). Added tests/cli/
- T-144-002 Helper Migration — countDebtItems → store.getByType: GO_WITH_TECH_DEBT — DB-first debt counting migration complete. Created src/cli/helpers/debt-counter.ts with MemoryStore.getByType('debt') im
- worker.sh Template Update — TASK_TIMEOUT Env Var: GO_WITH_TECH_DEBT — All 3 backends updated with adaptive timeout wiring:

1. DockerSpawnBackend: worker.sh template now uses `TIMEOUT=${TASK
- Result Atomicity Guarantee — TIMEOUT_WITH_WORK Partial Result: GO_WITH_TECH_DEBT — TIMEOUT_WITH_WORK partial result mechanism implemented across 4 source files + 1 test file (14 tests). Changes: (1) Dock

## Sprint sprint-144 Learnings
- Sprint sprint-144 Learnings: ## Sprint sprint-144 Learnings
- worker.ts Split (1669 → 4 dosya): NO_GO — Worker timeout — process exceeded time limit and was killed
- Ölü Kod Silme Wave A (Agent + V1 Routing, 17 dosya, 2780 LoC): NO_GO — Worker timeout — process exceeded time limit and was killed
- Ölü Kod Silme Wave B (Orchestra Sahipsiz + Feature Flag, 12 dosya, 2139 LoC): NO_GO — Docker worker exited without writing result file
- Event Stream Emit Wire: GO_WITH_TECH_DEBT — Sprint 138 event-stream.ts foundation wired into Brain, Worker, and Auditor. 7 new CHANNELS constants added: SPRINT_STAR
- Retro sprint-id Normalize: GO_WITH_TECH_DEBT — Retro sprint-id normalize completed: (1) sprint-retro-writer.ts already used canonical `retro-${sprint.id}` format → no 

## Sprint sprint-143 Learnings
- Sprint sprint-143 Learnings: ## Sprint sprint-143 Learnings
- Memory V2 Tam Migrasyon (ci-reporter + managed-docs): NO_GO — Docker worker exited without writing result file
- MCP Disconnect Fix (Background Sprint Runner): GO_WITH_TECH_DEBT — MCP Disconnect Fix implemented. sprint-runner-entry.ts provides a detached child process entry point for running sprints

## Sprint sprint-142 Learnings
- Sprint sprint-142 Learnings: ## Sprint sprint-142 Learnings
- src/core/ batch 1 — Memory V2 modulleri: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 files completed. 10 per-file reports written to .deckent/sprint-god-analysis/src/core/. Al
- src/core/ batch 2 — Types + Routing: GO_WITH_TECH_DEBT — Read-only deep analysis completed for 10 files in src/core/ batch 2 (Types + Routing). All 10 files analyzed with 16-sec
- src/core/ batch 4 — Provider + Model + Notification: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 assigned files + 1 bonus (webhook.ts) = 11 analysis reports. All reports follow the 16-sec
- src/core/ batch 5 — Utils + Security + Remaining: GO_WITH_TECH_DEBT — Read-only deep analysis completed for all 10 assigned files. Key findings:

**P0 Findings:**
- deck-file.ts: createDeckT
- src/core/ batch 6 — Remaining core files: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 src/core/ files completed. All 10 reports written with 16-section template. Key findings: 
- src/core/ batch 7 — Final core files: GO_WITH_TECH_DEBT — Read-only deep analysis of 13 source files completed. 13 per-file reports written, each ≥40 lines with full 16-section t
- src/orchestra/ batch 1 — Brain + Sprint lifecycle: GO_WITH_TECH_DEBT — Read-only deep analysis of 6 sprint lifecycle core files completed. All 6 reports written with 16-section template, each
- src/orchestra/ batch 2 — Debt + Result + Retro: GO_WITH_TECH_DEBT — Read-only deep analysis of 8 orchestra files (debt-manager, sprint-retro-writer, sprint-reporter, result-evaluator, resu
- src/orchestra/ batch 3 — Task + Routing + Spawn: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 src/orchestra/ files (task-builder, task-router, task-analyzer, task-retry, planner, spawn
- src/orchestra/ batch 4 — Event stream + Pattern + Decision: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 orchestra files completed. 10 per-file reports written using 16-section template. All repo

## Sprint sprint-141 Learnings
- Sprint sprint-141 Learnings: ## Sprint sprint-141 Learnings
- src/orchestra/ Analysis (82 dosya): NO_GO — Docker worker exited without writing result file
- src/cli/ Analysis (75 dosya): GO_WITH_TECH_DEBT — src/cli/ analizi tamamlandı. 75 rapor dosyası oluşturuldu (.deckent/sprint-140-analysis/src/cli/ altında). Tüm dosyalar 
- src/agents/ + src/providers/ + src/monitor/ + src/api/ + src/extensions/ Analysis (30 dosya): NO_GO — Docker worker exited without writing result file
- tests/ Category Analysis (28 kategori): GO_WITH_TECH_DEBT — 28 test kategorisi READ-ONLY analizi tamamlandı. Tüm raporlar .deckent/sprint-140-analysis/tests/ altında. Toplam 5133 s
- docs/ Analysis (260 markdown): GO_WITH_TECH_DEBT — Batch analysis of 260 markdown docs across 8 categories. Read-only analysis completed successfully. Produced 7 detailed 
- META — Architecture Graph + Circular Dependency: GO_WITH_TECH_DEBT — Comprehensive architecture graph and circular dependency analysis completed. 354 TypeScript files analyzed across 11 mod
- META — Dead Code + Type Safety + Security: GO_WITH_TECH_DEBT — Read-only cross-cutting analysis completed: (1) Dead Code — 4 fully dead modules (~360 LoC), 14+ unused exports, ADR-038
- META — ADR Compliance + CLI/MCP Parity + i18n: GO_WITH_TECH_DEBT — Comprehensive 3-section cross-cutting analysis completed: (1) ADR Compliance: 40/40 ADRs audited — 36 COMPLIANT, 2 PARTI
- META — Test Coverage Map + Performance + Error Handling + TODO inventory: GO_WITH_TECH_DEBT — Completed all 4 cross-cutting analyses. Report at .deckent/sprint-140-analysis/meta/coverage-perf-errors-todo.md (563 li
- META — Memory V2 Integrity Verification: GO_WITH_TECH_DEBT — Memory V2 Integrity Verification completed. 482-line report covering all 7 dimensions: (1) DB Schema: 5/5 tables + FTS5 

## Sprint sprint-140 Learnings
- Sprint 140 Learnings: Sprint 140 learnings — no .brain/sprints/sprint-140.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-139 Learnings
- Sprint 139 Learnings: ## Sprint sprint-139 Learnings

## Sprint sprint-138 Learnings
- Sprint 138 Learnings: - ADR-035 Verification Protocol Standard: GO_WITH_TECH_DEBT — ADR-035 Brain ↔ Worker ↔ Auditor Verification Protocol Standard başarıyla .brain/DECISIONS.md dosyasına eklendi. 15 kana
- Worker Honest Assessment Calibration v2: GO_WITH_TECH_DEBT — Worker Honest Assessment Calibration v2 tamamlandı. 3 alt-iş uygulandı:

1. Alt-iş A (task-builder.ts): buildWorkerPromp

## Sprint sprint-137 Learnings
- Sprint 137 Learnings: - Brain Budget Decay No-Op Bug Fix: GO_WITH_TECH_DEBT — Fixed brain budget decay no-op bug in runDecay() (debt-manager.ts). Root cause: shouldRun guard used total linesBefore (

## Sprint sprint-136 Learnings
- Sprint 136 Learnings: - 5 Test Regression Fix (Sprint 136 Opener): GO_WITH_TECH_DEBT — 5 target test files (start-sandbox, start, i18n-integration, docker-backend, error-handling-unification) all pass (262 t
- Async I/O İlk Kademe (Hot Path fs.promises Migration): NO_GO — Docker worker exited without writing result file
- Brain Spurious NO_GO Evaluation Reconciliation (Sprint 135 N9): GO_WITH_TECH_DEBT — Brain Spurious NO_GO Evaluation Reconciliation implemented. Added tryCodeVerifiedDone() helper to result-evaluator.ts wi
- `.deckent/sprint-NNN-gate.json` Output Wiring (Sprint 135 N5): GO_WITH_TECH_DEBT — gate.json wiring implemented. Added `import { promises as fsPromises } from 'node:fs'` to sprint-finalizer.ts. Inside th
- `load-test-report.md` Auto-Generation (Sprint 135 N6): GO_WITH_TECH_DEBT — Wired generateLoadReport() into finalizeSprint() in sprint-finalizer.ts. Added import of generateLoadReport from core/ob
- T-005 Dep Pipeline Canlı Dogfood Rerun (Sprint 135 Chicken-Egg): NO_GO — Fix A (sprint-controller.ts): Added 'priority?' and 'dependencies?' fields to directiveSources type annotation (line 505
- ErrorRegistry Lint Rule Enforcement: NO_GO — Docker worker exited without writing result file
- sprint-controller.ts Full Slim (Sprint 134 T-010 Final): NO_GO — Docker worker exited without writing result file
- Rubric Field Null Fix for Test-Writer Tasks (Sprint 135 N7): GO_WITH_TECH_DEBT — Added rubric requirement to test-writer agent systemPrompt and worker prompt building in task-builder.ts. Fixed test thr
- sprint-docs-helpers.ts Test Coverage (Sprint 135 T-010 Debt): GO_WITH_TECH_DEBT — Wrote comprehensive unit tests for sprint-docs-helpers.ts module. 61 test cases covering all 8 exported functions: build

## Sprint sprint-135 Learnings
- Sprint 135 Learnings: - Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix): GO_WITH_TECH_DEBT — Docker graceful shutdown offensive root cause fix implemented. Changes: (1) spawn-backend-docker.ts kill() method: docke
- askBrain() Extraction Finish — Conservative Move + Re-Export Shim: NO_GO — Docker worker exited without writing result file
- Structured Planner Priority + Dependencies Parsing: GO_WITH_TECH_DEBT — parseStructuredDirectives() and parseBulletOrNumberedTasks() now parse '- Priority: CRITICAL|HIGH|NORMAL|LOW' lines. New
- GO_WITH_GATE_FAILURE Status Propagation Wire: GO_WITH_TECH_DEBT — GO_WITH_GATE_FAILURE status propagation wire implemented:
1. Added `import { getRecentSprintStats, GO_WITH_GATE_FAILURE 
- Dashboard vs MCP State Divergence Fix: NO_GO — Created src/monitor/sprint-state.ts with getCurrentSprintId() that reads .deckent/sprint-state.json (source 1: sprint-ac
- Brain Memory Budget Enforcement + Config Sync: GO_WITH_TECH_DEBT — Brain Memory Budget Enforcement + Config Sync tamamlandı. (1) DECAY_EXEMPT constant: DECISIONS.md ve PROJECT-IDENTITY.md

## Sprint sprint-134 Learnings
- Sprint 134 Learnings: Sprint 134 learnings — no .brain/sprints/sprint-134.md log was available at backfill time. Stub inserted by Sprint 166 Task 6 (Bug U+V).

## Sprint sprint-133 Learnings
- Sprint 133 Learnings: - HTTP API Bearer Token Auth: GO_WITH_TECH_DEBT — HTTP API Bearer Token Authentication implemented. Changes:

1. NEW FILE: src/api/auth.ts — bearerAuthMiddleware with res
- loadConfig() Module-Level Cache: GO_WITH_TECH_DEBT — loadConfig() module-level cache implemented. Changes: (1) Added module-level cachedConfig/cacheStamp/cachedProjectRoot v
- Sprint 131 ADR'leri Yazımı (ADR-029..032): GO_WITH_TECH_DEBT — 4 ADR yazıldı (ADR-029 through ADR-032), her biri ≥50 satır. ADR-029 (51 lines): Managed-Docs Universalization — kullanı
- Competitive Analysis Güncelleme: GO_WITH_TECH_DEBT — Competitive analysis fully updated for April 2026. Changes: (1) competitive-analysis.md — title updated 'March 2026' → '

## Sprint sprint-132 Learnings
- Sprint 132 Learnings: 

## Sprint unknown Learnings
- help: help
