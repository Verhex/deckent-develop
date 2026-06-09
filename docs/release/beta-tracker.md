<!-- Language: EN | Technical terms remain as-is -->
> ⚠️ **SUPERSEDED (2026-06-01, Sprint 211).** Beta-gate status consolidated into [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md) §9 — the single source of truth. Preserved for provenance.

# Deckent Beta Tracker

**Last updated:** 2026-05-31 (Sprint 197 — Worker Prompt God-Level Stream + Disk-Verify Gate + 7 synthetic NO_GO source map landed) | **Latest sprint:** 197 (canonical complete per memory.db; Sprint 198 KAYNAK 6+7 closure in flight) | **Version:** v1.0.0-beta.1 → v1.0.0 GA target (1 Haziran 2026 OSS beta launch) | **Branch:** `main` (Sprint 175 `docs/embedded-web-terminal-spec` long-merged)

**Related:** [roadmap.md](../vision/roadmap.md) — Sprint 149-200 master plan

---

## Beta GA Exit Criteria (Post Sprint 166 — 2026-05-14)

Before tagging `v1.0.0-beta.2` and running `npm publish`, **all 20 gates must PASS**. Sprint 166 final state: **19/20 PASS, 1 PENDING (#11 docker e2e live re-verify), 0 FAIL** — vitest chronic +1 fail closed in Sprint 165 T3, Sprint 166 added 35+ new tests delta 0 fail.

| # | Gate | Target | Status |
|---|------|--------|--------|
| 1 | `tsc --noEmit` zero errors | 0 errors | ✅ PASS |
| 2 | `npx vitest run` ≥99.5% pass | ≥99.5% | ✅ **PASS** (Sprint 165 T3 closed chronic +1 since Sprint 159; Sprint 166 +35 new tests, delta 0 fail) |
| 3 | Coverage ≥ 85% (line) | 85%+ | ✅ **89.33%** (no longer gate #2 bound) |
| 4 | All MCP tools functional | 27+/27 | ✅ PASS (27 tools — audit, recover, feature_query, watch, nervous_* live) |
| 5 | All CLI commands functional | 45+ | ✅ PASS (55-56 commands — recall, remember, memory rebuild/export/stats included) |
| 6 | `npm pack --dry-run` clean | 0 warnings | ✅ PASS (1.08 MB) |
| 7 | Cross-platform: macOS + Linux + WSL2 | 3/3 | ✅ Sprint 148 |
| 8 | Multi-provider: Claude + Codex + Gemini tested | ⚠ PARTIAL | abstraction ready; Docker runtime=Claude-only; Codex/Gemini tmux/subprocess [^gate8] |
| 9 | i18n: CLI 100% + MCP 100% + Dashboard 95%+ | 95%+ | ✅ Sprint 145 |
| 10 | Memory V2 stress test pass | FTS5 + decay + rebuild | ✅ Sprint 145 + Sprint 166 (ADR-046 self-update hook chain confirmed) |
| 11 | Documentation: README, API ref, config ref current | All synced | 🟡 Sprint 166 T8 living docs in (TOOLS/BOOT/WORKER-GUIDE auto-generators wired) — Sprint 168 docker e2e live re-verify pending |
| 12 | Zero open CRITICAL/HIGH debt | 0 items | ✅ Sprint 165 closed all chronic debt (Bug X stub replay closed, sprint-156-011 resolved); Sprint 166 added M+N+S+Y2 fixes |
| **13** | **Messaging trio smoke** — Discord + Telegram + WhatsApp | 2/2 + WhatsApp scaffold | 🟡 Token activation pending |
| **14** | **`deckent_style` toggle** — sprint/task switch config driven | Live | ✅ Sprint 150A |
| **15** | **DeckentHub 20 seed skills** — Ed25519 signed, AST sandboxed | 20/20 published | ✅ Sprint 165 publish target met |
| 16 | ADR governance — 46 ADRs accepted | 46 ADRs | ✅ ADR-046 Brain Self-Update Hook Architecture added Sprint 166 (Wave 1.5 bootstrap gate) |
| 17 | Brain stability — 5/6 task gate | ≥5/6 DONE | ✅ Sprint 163 (6/6 DONE, sealed); Sprint 166 (11/11, 10 DONE + 1 GO_WTD) |
| 18 | Wire code-complete (dependency pipeline) | 13 grep matches | ✅ Sprint 164 (`respawnEligibleTasks` 13 matches); Sprint 167 `dependency_pipeline_enabled` flip live |
| 19 | Bug X (Sprint 156-011 stub) replay analysis | Reproduced + Closed | ✅ Sprint 165 T1 (Bug X stub removed, Brain processQueue legacy FIFO stall closed) |
| 20 | Bug W (Auditor `dead_event_stream`) | Open since Sprint 148 | ✅ Sprint 165 T4 (dead_event_stream activated); Sprint 166 T9 (emitAlert helper + stale_md detector wired) |
| **21** | **Brain dürüst raporlama — synthetic NO_GO disk-verify gate** | 7/7 source paths gated | ✅ **LANDED Sprint 200-001** (commit `2363c794`) — `verifyDiskAgainstClaim` now wired on the two remaining ungated callsites (`sprint-phases.ts` `runEvaluatePhase` + `sprint-controller.ts` `graceKill` panic-guard & explicit-kill = KAYNAK 6+7). Disk evidence present → `MANUAL_REVIEW_REQUIRED` instead of synthetic NO_GO; `BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH` emitted. +188 LoC across both files, 11 gate tests pass. All 7/7 synthetic NO_GO source paths now disk-verified. |

[^gate8]: Docker imaj tasarım gereği Claude-only. Codex/Gemini yalnızca tmux/subprocess backend ile çalışır. Tam provider parity F1-004/F1-005 kapsamında (P1, Sprint 202 sonrası).

### Sprint 195-197 gate evidence overlay

The 20-gate Sprint 175 baseline above remained PASS/PASS across Sprint 184-197. Concrete Sprint 195-197 evidence per critical gate:

- **Gate 1 (`tsc --noEmit`):** ✅ PASS — Sprint 197 commits `37e01242` (post-sprint hygiene) and `cd4df0ed` (managed-docs + CHANGELOG entry) both compile-clean. Sprint 198-001 will keep the line.
- **Gate 2 (`vitest`):** ✅ PASS-WITH-BASELINE — 17411/17502 pass (Sprint 197 baseline 41 fail, kategorize per `docs/audits/sprint-196/test-fail-categorize.md`: ~25 persistent baseline + ~6 regression + ~12 TDD-pending + ~5 environment). Sprint 198-006 attacks Tier-1 (commands/rich-output/vitepress/github-pages-deploy ≥15 fail).
- **Gate 11 (Documentation):** 🟡 Sprint 197 197-003 backfilled 40 CHANGELOG entries (Sprint 157→197 catch-up); Sprint 198-004 refreshes the three master-plan artifacts (this entry, roadmap.md, comprehensive-work-plan.md) — current refresh in flight.
- **Gate 16 (ADR governance):** ✅ Sprint 184-197 added ADR-053 (TaskType Taxonomy), ADR-061 (AEGIS proposed), ADR-062 (Embedded Web Terminal), ADR-063 (Consent-Based Prerequisite Provisioning), ADR-064 (TOPP — Continuous Dispatch); total accepted ADR count ≥48.
- **Gate 17 (Brain stability):** ✅ Sprint 195 rescue (164 new tests, ~6500 LoC across Sprint 195-197), Sprint 196-007 test-fail audit, Sprint 197 6/8 task DONE (2 NO_GO rescued in 197-004 WSL2 OOM + 197-005 persona-task matcher live verify).

---

## Sprint 195-197 — Worker Prompt God-Level Stream + Disk-Verify Gate (2026-05-23 → 2026-05-26) — DELIVERED

A three-sprint band that re-anchored Brain honesty after the Sprint 192-194 chain produced ~14 false NO_GO outcomes (Docker OOM cycle + Sprint 190 retro). What landed:

**What shipped:**
- **Worker Prompt God-Level Stream WP-1 .. WP-12 Tier-1 wire** — full prompt-time injection of the Karpathy 4-discipline anchor, agent PROMPT.md canonical source (no truncation), skill content full-fidelity, ADR cosine-similarity threshold tuning (0.3), idempotency-key per `${sprintId}-${taskId}-${retryCount}`, scope.filesWrite auto-include of test paths (WP-3 `deriveTestScope`), override semantic warning, DIRECTIVES parser fixes
- **Disk-verify gate (KAYNAK 1-5) live** — `verifyDiskAgainstClaim` runtime in 5 of 7 synthetic NO_GO callsites (`result-collector.ts:518-583` + 4 sibling paths); worker exits without `.result` but with non-empty git diff → `MANUAL_REVIEW_REQUIRED` rather than synthetic NO_GO
- **7 synthetic NO_GO source map** — Sprint 197 197-001 worker mapped the two remaining ungated callsites (`sprint-phases.ts:1318-1330` runEvaluatePhase + `sprint-controller.ts:963-1003` graceKill panic-guard + explicit-kill) for Sprint 198-001 closure
- **memory.db sprint-log finalize bug discovery** — Sprint 197 197-002 reclassify worker discovered `sprint-log-194` and `sprint-log-196` rows are MISSING from memory.db (Brain finalize crash/skip path); reclassify completed 2/12 + 10 skipped "sprint-entry-missing" — full fix in Sprint 198-002
- **managed-docs auditor.md template regression** — Sprint 197 chore commit `cd4df0ed` regenerated `.claude/rules/auditor.md` AUTO-START/END block from the still-stale template (PATTERNS.md reference + "Append new patterns" line) — Sprint 198-003 fixes the template
- **WSL2 OOM mitigation (Sprint 197-004 rescue)** — config tightened: `max_workers 2→6`, `worker_memory_limit 3g→2g` (6 × 2g = 12 GB peak, fits 24 GB host); `deckent doctor --ram-experiment` flag scheduled for Sprint 198-005 verification
- **Persona-task matcher live validation (Sprint 197-005 rescue)** — threshold tuning verified canlı; persona override path traced end-to-end

**Metrics:**
- ~17 rescue commits across the band (12+ Sprint 195, 4+ Sprint 196, 6+ Sprint 197)
- ~6500 LoC delta (+5800 / -1700)
- 164 new tests (Sprint 195 +90, Sprint 196 +44, Sprint 197 +30)
- Sprint 195-197 test baseline 52 → 41 fail (Tier-1 attack pending Sprint 198-006)
- ADR-053 (TaskType Taxonomy) accepted Sprint 196; ADR-061 (AEGIS) status proposed pending beta-stability

**Honest debt:**
- Synthetic NO_GO source paths KAYNAK 6+7 ungated (Sprint 198-001)
- memory.db sprint-log rows 194 + 196 missing (Sprint 198-002 backfill + finalize fix)
- managed-docs auditor.md template still emits legacy PATTERNS.md text (Sprint 198-003)
- 41 baseline vitest fail open (Sprint 198-006 closes ~15)
- ADR-037 V1.0 Layer-2 runtime advisory/soft kept (hard-flip post-GA V2)

**Process learnings (durable feedback memories written):**
- `feedback_brain_synthetic_nogo_disk_verify` — 7-source map is the canonical reference; any new Brain code-path that builds a synthetic NO_GO MUST call `verifyDiskAgainstClaim` first
- `feedback_no_auth_touch_during_sprint` — never run `/login`, `claude logout`, or MCP restart while a sprint is live (auth invalidation cascades into false NO_GO)
- `feedback_worker_prompt_engineering_god_level` — WP-1..WP-12 stream is the canonical prompt-time injection; any future trim/truncation must amend the contract, not silently drop content

Source archives: `.brain/archive/DIRECTIVES-sprint-195.md`, `.brain/archive/DIRECTIVES-sprint-196.md`, `.brain/archive/DIRECTIVES-sprint-197.md`. Sprint 198 plan: `DIRECTIVES.md` (live, 4-wave 6-task spec).

---

## Sprint 175 — Embedded Web Terminal (2026-05-19 → 2026-05-20) — DELIVERED

VSCode-style dockable terminal panel inside the dashboard. **Sub-project #1 of a 4-part agentic-OS path.** Operationally smoke-confirmed by Alperen on 2026-05-20: `+claude` / `+gemini` / `+shell` tabs all spawn real interactive PTY sessions.

**What shipped:**
- `node-pty` PTY backend behind `SessionBackend` interface (enterprise seam for #3 k8s pod-exec)
- WebSocket gateway with token in `Sec-WebSocket-Protocol` subprotocol, auth verified BEFORE pty spawn (browsers can't set `Authorization` on `WebSocket`)
- `LocalTokenAuthProvider` — bypass-independent (deliberately ignores `DECKENT_API_AUTH_DISABLED`; SHA-256 + `timingSafeEqual`)
- HTTP control routes (`/api/terminal/sessions` CRUD) + localhost-only bootstrap inject of `window.__DECKENT_TERMINAL_TOKEN__` into served `index.html`
- Multi-tab UI: `claude` / `gemini` / `codex` / `deckent` / shell quick-launch with `DockPanel` mounted outside the React Router `Outlet` for cross-page session persistence
- tmux-style reattach: bounded in-memory scrollback ring buffer per session, `detach ≠ kill`, e2e test verifies MARKER replay across client disconnect (server-restart NOT supported — explicit boundary)
- Transparent tenant-scoped audit → `memory.db` (low-volume structured events only; raw PTY output is **never** persisted)
- `deckent serve --host` / `--no-terminal` CLI surface; remote bind refuses to enable the terminal without an explicit token
- ADR-062 (Embedded Web Terminal) accepted; ADR-010 Sprint-172 Amendment extended with both new runtime deps (`node-pty`, `ws`) — dependency count 7→9, all ADR-justified

**Metrics:**
- 46/46 terminal-specific tests PASS (backend 30, frontend 15, e2e reattach 1)
- `tsc --noEmit` clean; `vite build` SUCCESS (1066KB / gzip 296KB)
- `npm pack --dry-run` clean (node-pty + ws bundled)
- 17 commits on `docs/embedded-web-terminal-spec` (5 wave-based feature commits + 2 hotfixes + spec/plan/DIRECTIVES + debt closure + #2 backlog notes)

**Honest debt:**
- node-pty linux-x64 prebuild absent in `node-pty@^1.0.0` — manual workaround applied during Sprint 175 (copy from `@lydell/node-pty-linux-x64`); permanent fix (optionalDep) targeted for Sprint 176 (~5 min work)
- `DECKENT_API_AUTH_DISABLED=1` still required for the dashboard's non-terminal data calls (SSE / status / events) because the frontend has no general API auth plumbing — this is **not** a terminal regression (terminal auth is independent), but a known limit of sub-project #1 (frontend auth infra deferred to #2/#3)

**Sub-project #2-#4 backlog (formal record, spec §1d):**
1. Self-security procedure (prompt/command guard) + planner state-hygiene (6 captured items: auto-debt-inject empty-scope bug, re-plan orphan cleanup, DEP0190 `shell:true`, schema-gate `coverage` enforcement, pre-existing WorkerCard/DashboardPage TS errors, doctor `DECISIONS.md` obsolete check)
2. Million-scale: multi-tenant isolation, real `tenantId`, `SessionBackend` k8s pod-exec impl, sandbox, rate/resource limits, OIDC/SSO `AuthProvider` impl
3. Enterprise external-world integrations + secure data exchange (audit enrichment, compliance: SOC2/GDPR)

**Process learnings (durable feedback memories written):**
- `feedback_trust_brain_eval_not_worker` — worker `.result.selfAssessment` is a hint; Brain's evaluation verdict is the real gate. They can disagree; I learned the hard way.
- `feedback_trust_deckent_recovery` — deckent's lifecycle has its own FIX phase / recovery channels; manual intervention is the LAST recommendation, not the first.

Spec: `docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md`. Plan: `docs/superpowers/plans/2026-05-19-embedded-web-terminal.md`. User guide: `docs/guide/terminal.md`. PR: `https://github.com/VerhexIO/deckent-develop/pull/new/docs/embedded-web-terminal-spec`.

---

## Sprint 145-150 Roadmap — Beta GA Countdown

| Sprint | Day | Theme | Key Deliverables | Readiness |
|--------|-----|-------|------------------|-----------|
| Sprint 145 | Mon Apr 20 | Adaptive Timeout + Observability + Doc Reform | 27 tasks: i18n 95%, event bus, timeout watcher, config Zod, Memory V2 stress test, BETA-TRACKER calibration | 4.10/5 ✅ |
| Sprint 146 | Mon Apr 20 – Tue Apr 21 | Prompt God Template Reform + Bug Fix + Rubric Consolidation | Agent truncation fix, routing V2 retrain, ADR relevance scoring, scope sanitizer, prompt god template, DIRECTIVES protection, SDL rehab, rubric consolidation — 17 tasks | 4.25/5 ✅ |
| Sprint 147 | Tue Apr 21 | Nervous System Core Implementation | 13 modules + 25 test files, ADR-040 accepted, NervousObserver + Dispatcher + SafetyFloor + 5 Detectors + CLI TUI + 5 MCP tools | 4.45/5 ✅ |
| Sprint 148 | Mon Apr 20 | Meta-Dogfood + Agent Taxonomy Reform + Nervous Activation | test-writer removed, testing-expert auto-activate, nervous enabled=true balanced, 5 detectors live, cross-platform 3/3, routing V3 | 4.65/5 ✅ |
| Sprint 149 | Wed Apr 22 | **Hybrid Foundation + Debt + Security + God-Level Start** | 27 tasks — 6 blocks: A-Mode toggle (`deckent_style`), B-P0 Security (Dockerfile+`.deck` interpolation), C-Messaging Trio (Discord+Telegram+WhatsApp scaffold), D-DeckentHub+Ed25519+20 seed skill, E-Doc consolidation (388 .md), F-ADR-041 accept + npm dry-run | 4.85/5 |
| Sprint 150 | Thu Apr 23 2026 | 🚀 **Beta GA Cutover + Dashboard ChatPage + Public Repo Flip** | npm publish v1.0.0-beta.1, git tag, GitHub release, ChatPage.tsx (dashboard 7. page), deckent-hub public, Discord+Telegram bots live, Show HN + Reddit + Twitter announce | 5.0/5 |
| Sprint 151-156 | Apr 24 – May 5 2026 | **Post-GA Stabilization** — Public repo flip + Sprint-156 dogfood (Bug X dual-eval race + Sprint-Stall + state freeze) | Public repo `VerhexIO/deckent` live, watch --ms CLI promoted, T4 minimum discipline baseline | Stabilization |
| Sprint 157-162 | May 6-10 2026 | **TaskType + Wave Scheduler + Survivor Wire** | TaskType+EnvironmentType taxonomy, 5-layer pipeline, ADR-044 Wave semantics, sprint-controller survivor branch fix | Architecture deepening |
| Sprint 163 | May 11 2026 | **Brain Stability Hattı SEALED** | 6/6 DONE, 0 NO_GO — brain processQueue + state freeze regression closure, RETRO line cleanup | 6/6 ✅ |
| Sprint 164 | May 12-13 2026 | **Wave-Based Execution Semantics + ADR-045** | 5/6 DONE + 1 phantom stub (164-006 worker docker HB shutdown), `respawnEligibleTasks` wire 13 grep match code-complete, runtime gated `dependency_pipeline_enabled: false`, vitest gate FAIL +1, Brain processQueue legacy FIFO stall live-reproduced, Bug X (Sprint 156-011 stub) replay, Bug W (Auditor dead_event_stream) dormant since Sprint 148 | GO_WITH_GATE_FAILURE |
| Sprint 165 | May 13 2026 | **Bug X/Y/Z/W Close + Documentation Freeze + npm publish prep** | 5/5 DONE: T1 Bug X stub removal (sprint-156-011 closed), T2 Bug Y Sprint-Stall fix, T3 Bug Z chronic vitest +1 fail fixed, T4 Bug W `dead_event_stream` activated, T5 docs freeze + public repo prep, v1.0.0-beta.1 npm publish ready | 18/20 PASS ✅ |
| Sprint 166 | May 13-14 2026 | **Brain Self-Update + Data Integrity Closure + ADR-046** | 11/11 (10 DONE + 1 GO_WTD), ~2735 LoC, 35+ new tests. Bug M (adrInsert hook + Step 3 wire), Bug N (onRuleRegen manual finalize wire + AUTO/CUSTOM block), Bug S (doc-cache sprint-aware key), Bug Y2 (3-layer ground-truth defense — 15 agents anchor), Bug R+T+U+V+C+X+P+Q+W+K+L bundled fixes, ADR-046 Brain Self-Update Hook Architecture accepted. 4 new bugs detected → Sprint 167 P0 (Bug E, G, Z2, Z3) | 19/20 PASS ✅ |
| Sprint 167 | May 15+ 2026 | **Bug E+G+Z2+Z3 Fix + dependency_pipeline_enabled Flip + M1-M4 Monitoring Baseline** | 4 new bugs from Sprint 166 detection fixed + `dependency_pipeline_enabled: true` flip live (Wave scheduling goes live, Sprint 135 T-005 6th canlı dogfood), minimal 3-task multi-wave smoke + M1-M4 (cache key + rule regen + adr insert + stale_md) baseline tracking established | Stabilization |
| Sprint 168 | May 16+ 2026 | 🚀 **Open Source GA — Public Repo Flip + npm publish v1.0.0-beta.2 + Show HN** | Public repo flip (`VerhexIO/deckent` → `VerhexIO/deckent` public), npm publish v1.0.0-beta.2, GitHub release, Show HN + Reddit + Twitter announce, community onboarding | 🚀 5.0/5 |

---

## M0-M9 Milestone Progress Matrix

| Milestone | Name | Status | Target Sprint | Notes |
|-----------|------|--------|---------------|-------|
| M0 | Foundation | ✅ Complete | Sprint 1-70 | TypeScript ESM, 3-layer config, tmux backend |
| M1 | Multi-Provider | ✅ Complete | Sprint 97 | ModelRegistry 13 models, 3 providers, tier routing |
| M2 | MCP + CLI Parity | 🔄 In Progress | Sprint 146 | 22 MCP tools, 41+ CLI — outputSchema + --root parity remaining |
| M3 | Memory V2 | ✅ Complete | Sprint 145 | SQLite FTS5, dual-layer i18n normalize, DB-first architecture |
| M4 | Observability | 🔄 In Progress | Sprint 145 | Event stream, debug-log levels, ERRORS.md filter — Sprint 145 T-014 |
| M5 | Cost System | ✅ Complete | Sprint 124-125 | Token tracker, context-aware routing, rubric grading |
| M6 | Cross-Platform | 🔄 In Progress | Sprint 148 | macOS + Linux ✅, WSL2 ✅, Windows native — Sprint 148 validation |
| M7 | Plugin Sandbox | 🔄 In Progress | Sprint 148 | SHA-256 signing ✅, AST scan ✅, e2e plugin test pending |
| M8 | Documentation | 🔄 In Progress | Sprint 145+149 | README ✅, Memory V2 docs 🔄, API ref 🔄, config ref ✅ |
| M9 | Beta Cutover | ✅ Complete | Sprint 150 + Sprint 165-166 | v1.0.0-beta.1 published, Sprint 168 Open Source GA (v1.0.0-beta.2) on track |

---

## Sprint 184-197 Post-Crisis Continuation Ledger

The Sprint 145-150 cutover table and Sprint 175 Embedded Web Terminal section cover the GA prep through to Open Source GA flip. The band below picks up after Crisis Stabilization closure (see `roadmap.md` §Crisis Stabilization Initiative) and runs through to the 1 Haziran 2026 OSS beta launch window.

| Sprint | Date (2026) | Theme | Outcome | Anchor |
|--------|-------------|-------|---------|--------|
| **184** | May 22 | Repo Housekeeping + Documentation Cleanup | ✅ Done — 388+ md triaged, README/CONTRIBUTING polish, Brain Quality Scorer calibration backlog | roadmap.md |
| **185** | May 22 | Codebase Self-Audit — 6 subdirectory audit reports | ✅ Done — Brain runtime regen `5db72192` | `docs/audits/sprint-185/` |
| **186** | May 22 | Per-file audit pilot — 35 audit reports + debt-store extract | ✅ Done — 479-file pilot, 31 DONE + 4 recovered, debt-store.ts `d43d679b` | `docs/audits/sprint-186/` |
| **187** | May 22 | Comprehensive analysis cycle | ✅ Done — managed-docs auditor.md AUTOGEN block live + Sprint 188 audit groundwork | `.brain/archive/DIRECTIVES-sprint-187.md` |
| **188** | May 23 | 360° audit cycle (12 reports, 250 KB, 80+ findings) | ✅ Done — input feed for Sprint 189 W-stream plan | `docs/audits/sprint-188/*.md` |
| **189** | May 23 | OSS GA Blocker Wave 1 (W-A + W-B + W-G + W-H Faz 1) | ✅ 5/5 P0 closed — CHANGELOG backfill 30 sprint, MCP tool count drift fixed, dashboard StatusPage wire, ADR-008 core→orchestra ihlali fix | `.brain/archive/DIRECTIVES-sprint-189.md` |
| **190** | May 23 | OSS GA Blocker Wave 2 (Sprint 189 follow-up + 191-002 wire) | ✅ Done — `runtime_extension_enabled: true` default + worker timeout extension wire; Docker OOM cycle drove ~14 false NO_GO (later reclassified Sprint 197-002) | `.brain/archive/DIRECTIVES-sprint-190.md` |
| **191** | May 24 | Karpathy 4-discipline anchor land + Worker Discipline Anchor | ✅ Done — `karpathy-discipline.md` mandatory anchor wired into worker-default.md, brain.md, auditor.md | `.brain/archive/DIRECTIVES-sprint-191.md` |
| **192** | May 24 | Mid-band stabilization (max_workers tuning, RAM verify groundwork) | ✅ Done — Docker OOM mitigation seed (Sprint 197 finalized via WSL2 detect) | `.brain/archive/DIRECTIVES-sprint-192.md` |
| **193** | May 25 | i18n duplicate cleanup + bootstrap fixes | ✅ Done (SMOKE-001 NO_GO classified as legitimate baseline) | `.brain/archive/DIRECTIVES-sprint-193.md` |
| **194** | May 25 | Brain finalize halted mid-flow (memory.db row missing) | ⚠ Done — discovered Sprint 197 — sprint-log-194 row missing (Sprint 198-002 backfill) | `.brain/archive/DIRECTIVES-sprint-194.md` |
| **195** | May 25 | Worker Prompt God-Level Stream Tier-1 wire + 90 new tests + models.dev bootstrap | ✅ Done — 195-005 host-RAM detect (24 GB WSL2 / meminfo) live; 195-004 catalog bootstrap NO_GO → Sprint 196 carry-over | `.brain/archive/DIRECTIVES-sprint-195.md` |
| **196** | May 26 | Disk-verify gate KAYNAK 1-5 live + WP-3 deriveTestScope + test-fail categorize (52→41) | ✅ Done — 196-005 token-counter.ts NO_GO exposed KAYNAK 6+7 ungated paths (Sprint 198-001 seed); 44 new tests | `.brain/archive/DIRECTIVES-sprint-196.md` |
| **197** | May 26 | Synthetic NO_GO source map (7/7) + persona-task matcher live + Sprint 195-196 retroactive reclassify | ✅ 6/8 DONE + 2 rescued (197-004 WSL2 OOM mitigation, 197-005 persona threshold tuning); ~30 new tests; CHANGELOG 40-entry backfill | `.brain/archive/DIRECTIVES-sprint-197.md` |

**Sprint 198 (in flight, 2026-05-26 → 2026-05-31)** — Brain dürüst raporlama %100 closure (KAYNAK 6+7 fix), memory.db sprint-log finalize fix + Sprint 194/196 row backfill, managed-docs auditor.md template regression fix, this document refresh, 6-worker × 2g RAM deney readiness verification, baseline 41 → 26 attack. 4 dalga, 6 task + 3 opsiyonel. See `DIRECTIVES.md` (live).

**Sprint 199-200 (planned)** — npm publish v1.0.0-beta.1 packaging + Dockerfile.worker image build/push automation + beta announcement materials + remaining baseline fail attack; Sprint 200 = `v1.0.0-beta.1 NPM PUBLISH` (Alperen manual `npm publish` per project policy) on the 1 Haziran 2026 OSS beta launch day.

---

## Current Status
| Metric | Value |
|--------|-------|
| Version | 1.0.0-beta.1 |
| Sprint | sprint-254 |
| MCP Tools | 32 |
| MCP Resources | 8 |
| CLI Commands | 55+ |
| Dashboard Pages | 12 |
| Agents | 15 built-in + 2 custom |
| Skills | 21 built-in |
| Providers | 4 (Claude, Codex, Gemini, Ollama) |

## Overview

145+ sprints, 12,485+ tests, 882 TypeScript modules. Three spawn backends verified: tmux (fastest, 2m55s), subprocess (working, 6m53s), Docker (live verified — Sprint 119-129). Self-dogfooding active — Deckent fixes its own test regressions and documentation via sprints. Documentation consolidated: BETA-TRACKER (EN+TR), docs.json auto-updates 7 documents. Memory V2 DB-first architecture (SQLite FTS5) deployed and stable.

**Strategy:** npm package → dogfood on own projects → feedback → fix → public repo (VerhexIO/deckent)

**Current State:** v0.4.0-beta.1 — Sprint 145 is the final meta-sprint before Beta GA countdown. All three backends live-verified. Docker backend fully operational (Sprint 119-129). Sprint 125-126 Rubric-Based Grading + Context-Aware Routing + Token Usage Tracker. Sprint 129 enterprise tech debt cleanup: zero open debt. Sprint 130 codebase accuracy reform: MCP 21→22 tools, real coverage 89.33%. Sprint 133 security hardening: plugin SHA-256 + AST sandbox. Sprint 134 product-not-service vision (ADR-033). Sprint 135 operational hardening: zero coordinator crash. Sprint 136 sprint-controller.ts 1890→209 LoC. Sprint 137 verification protocol wire. Sprint 138 ADR governance + event stream foundation (11/11 DONE). Sprint 139 massive codebase analysis (41 tasks, +14K LoC). Sprint 141-142 comprehensive read-only auditing (59 analysis tasks, +54K LoC reports). Sprint 143 chain reform: error handling + Memory V2 migration. Sprint 144 god split cycle 2 + ADR-008 enforcement: doctor.ts split, retro.ts split, +6.8K LoC, -2K LoC. 12,485+ tests passing, zero open critical debt.

---

## Phase Plan

### Phase 1: "Eat Your Own Dog Food" — COMPLETE ✅
### Phase 1.5: "Init UX + Onboarding" — COMPLETE ✅ (Sprint 070-071)

### Phase 2: "General Usability" — ACTIVE

**Sprint 072 — COMPLETE (2026-03-27):**
- [x] P1-7: Plan tiers → performance/balanced/economic + backward compat
- [x] P1-8: Init wizard → general provider selection, $ removed
- [x] P1-9: MODEL_API_IDS mapping + resolveApiModelId()
- [x] P2-13: README.md → 12,192+ tests, 86+ sprints, Windows full, 19 MCP tools
- [x] P5-31: sprint-controller.ts → 7 phase functions extracted to sprint-phases.ts

**Sprint 073 — COMPLETE (2026-03-30) — Self Dogfooding:**
- [x] 100 test regressions fixed (43+16+9+23+3 = 100 fail → 0 fail)
- [x] test-writer agent 5/5 tasks DONE, 17m 41s

**Sprint 074 — COMPLETE (2026-03-30) — Docs + Debt:**
- [x] P2-13: README.md numbers updated (12,176+ tests, 73+ sprints)
- [x] P2-16: CHANGELOG + SPRINT-LOG Sprint 072-073 entries
- [x] .brain/ consistency (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md module counts fixed (orchestra 47, core 49, MCP 19)
- [x] debt-069-005 (TempAgent) + debt-069-006 (scope parser) closed
- [x] doc-writer agent 5/5 + bug-fixer 2/2, 7m 29s

**Sprint 075 — COMPLETE (2026-03-30) — Language Consistency + Vision:**
- [x] P2-14: docs/CHANGELOG.md localized to Turkish — 300+ EN → TR translations
- [x] P2-18: VISION.md created — 7 sections, competitive analysis (5 tables), roadmap
- [x] P2-19: docs/ link audit — 4 broken links detected and fixed
- [x] P4-29: .detect-secrets v1.5.0 installed — .pre-commit-config.yaml
- [x] P5-31: God object split Phase 2 — sprint-controller.ts → result-collector.ts extraction

**Sprint 076 — COMPLETE (2026-03-31):**
- [x] P3-20: Stale heartbeat root cause fix — finalizeHeartbeat + auditor DONE skip
- [x] P3-22: Dashboard API integration test — 10 new tests, 6 describe blocks
- [x] P6-40: Graceful shutdown — SIGINT → interruptActiveSprint + killAllSessions
- [x] P5-31: God object split Phase 3 — result-collector.ts extraction (233 lines)

**Sprint 077 — COMPLETE (2026-03-31) — Docs:**
- [x] CHANGELOG + SPRINT-LOG Sprint 076 entries
- [x] .brain/ update (PROJECT-IDENTITY, DECISIONS)
- [x] CLAUDE.md + DECKENT.md module counts updated

**Sprint 078 — COMPLETE (2026-04-01), 6m 57s:**
- [x] Blueprint sync, i18n infrastructure, TR/EN docs, /api/tasks
- [x] CHANGELOG + SPRINT-LOG catch-up, HistoryPage success rate trend

**Sprint 079 — COMPLETE (2026-04-01), ~15m:**
- [x] README-TR fix, dashboard control buttons, init language-first, /api/cleanup

**Sprint 080 — COMPLETE (2026-04-01), 9m 06s:**
- [x] Dashboard UX Overhaul: WorkerCard, SprintPhaseTimeline, ActivityFeed

**Sprint 081 — COMPLETE (2026-04-01), 12m 38s:**
- [x] Settings+Config merge, full i18n coverage (44 keys), terminal logs

**Sprint 082 — COMPLETE (2026-04-02):**
- [x] MCP/CLI parity: 19 tools, 33 CLI, ADR-022
- [x] Usage card removal, v0.3.0-beta.1, init test fix
- [x] Dashboard Phase B: skeleton loading, AgentDetail enrichment, EmptyState, polish

**Sprint 130 — COMPLETE (2026-04-10) — Codebase Accuracy Reform:**
- [x] MCP server.ts instructions string fixed: Tools (15) → Tools (21), 6 missing tools added
- [x] README.md, README-TR.md, CONTRIBUTING.md MCP tool counts corrected to 21
- [x] 4 new Key Features added to README.md + README-TR.md (Rubric Grading, Worker Questions, Context-Aware Routing, Token Tracker)
- [x] Decision-engine V1 modules @deprecated (4 files), ADR-028 written
- [x] Real coverage measured: 89.33% (was falsely claiming 96%+)
- [x] .contracts/api-surface.md rubricScores + evaluationDecision fields added

**Sprint 131 — COMPLETE (2026-04-10) — HTTP API Auth + Config Cache:**
- [x] HTTP API Bearer Token Authentication implemented (auth.ts middleware)
- [x] loadConfig() module-level cache: cachedConfig/cacheStamp/cachedProjectRoot
- [x] 4 ADRs written (ADR-029 through ADR-032, each ≥50 lines)
- [x] Competitive analysis fully updated for April 2026

**Sprint 132 — COMPLETE (2026-04-10) — 360° Enterprise Readiness Audit:**
- [x] Full static audit: 6 parallel workers, 118 findings (5 CRITICAL, 22 HIGH, 40 MEDIUM, 28 LOW, 23 INFO)
- [x] Readiness score baseline established: 3.2/5
- [x] W5 identified sprint-reporter.ts (2132 LoC) as top god object — Sprint 134 target
- [x] W2 identified 799 sync I/O calls — Sprint 135-137 async migration target

**Sprint 133 — COMPLETE (2026-04-10) — Security Hardening:**
- [x] Plugin SHA-256 signature verification (PluginSecurityError)
- [x] SkillSandbox AST scan + allowed_paths enforcement
- [x] 12/12 tasks DONE, 27m 21s, +147 net tests (12,372 → 12,485+ passing)
- [x] Readiness: 3.2/5 → 3.6/5 (+0.4)

**Sprint 134 — COMPLETE (2026-04-10/11) — Triple Dogfooding + Product Vision:**
- [x] sprint-reporter.ts 4-way split (2297 → 96-line barrel): sprint-metrics, sprint-retro-writer, sprint-docs-updater, ci-reporter
- [x] Task Dependency Pipeline (T-001): parseStructuredDirectives dependencies parsing
- [x] Local Observability Seviye 2 (T-011): data locality verified, metrics.jsonl live
- [x] Brain Self-Audit Gate (T-014): live PASS via .deckent/run-self-audit.mjs
- [x] ADR-033 Product-Not-Service Vision + ADR-034 Multi-Project Isolation
- [x] docs/vision/roadmap.md (202 lines) + docs/design/multi-project-isolation.md (421 lines)
- [x] 11 DONE + 4 GO_WITH_TECH_DEBT + 0 NO_GO (manual recovery after coordinator crash)
- [x] Tests: 12,372 → 12,485 (+113 net), Readiness: 3.6/5 → 3.86/5 (+0.26)

**Sprint 135 — COMPLETE (2026-04-12) — Operational Hardening:**
- [x] Coordinator resilience: sprint-pid-manager.ts (258 LoC) — zero coordinator crash
- [x] Docker graceful shutdown: docker stop --time=10 (fix for spurious NO_GO pattern)
- [x] askBrain() extraction: ipc-registry.ts 37→270 LoC
- [x] Planner Priority/Dependencies parsing (6 regex tests)
- [x] GO_WITH_GATE_FAILURE status propagation wire
- [x] Brain memory budget DECAY_EXEMPT + config drift fix (600→900 line budget)
- [x] 10 DONE + 4 TECH_DEBT + 3 NO_GO (physical code check: 13/13 present)
- [x] Tests: 12,485 → 12,478 pass (505 → 512 files, +14 new, -5 regression)
- [x] Readiness: 3.86/5 → 3.93/5 (+0.07), 1h 0m 54s natural completion

**Sprint 136 — COMPLETE (2026-04-13) — Architectural Deepening + Regression:**
- [x] sprint-controller.ts **1890 → 209 LoC** (-1681 lines) — god object fully slim
- [x] T-005 canlı dogfood: sprint-controller.ts:528 priority wire bug fixed in-sprint
- [x] tryCodeVerifiedDone() helper: result-evaluator.ts +408 lines (wire Sprint 137)
- [x] gate.json + load-report.md wire hooks code-ready (runtime restore Sprint 137)
- [x] 5 test regression fix (start-sandbox, start, i18n-integration, docker-backend, error-handling-unification)
- [x] 7 DONE + 3 NO_GO (docker HB shutdown bug pattern), vitest 124 fail (Task 8 refactor side effect)
- [x] Tests: 12,478 → 12,684 passing target (post-Sprint 137 T-001 restoration), tsc 0 errors
- [x] Readiness: 3.93/5 → 3.925/5 (marginal -0.005, architectural win offsets vitest regression)

**Sprint 137 — COMPLETE (2026-04-14) — Verification Protocol Wire:**
- [x] tryCodeVerifiedDone wire + in-process recovery (code verification without .result files)
- [x] ErrorRegistry lint script wiring
- [x] gate.json + load-report.md automated generation
- [x] Brain budget decay no-op bug fix (runDecay() was silent no-op)
- [x] Sprint-state lifecycle management
- [x] BETA-TRACKER + BLUEPRINT Sprint 137 update
- [x] 6/6 DONE, 0% NO_GO, 35m 53s, +523 LoC, 93/100 avg rubric

**Sprint 138 — COMPLETE (2026-04-15) — ADR Governance + Event Stream:**
- [x] ADR-035 Verification Protocol Standard (15 channel codes V1.0)
- [x] ADR-036 Governance Integration (MADR v3 hybrid + 37 ADR migration)
- [x] Auditor Authority Extension 3-Pipeline (verifyWorkerResult + verifyFunctional + validateTechDebt)
- [x] Structured Event Stream + plan-time scope collision detection (event-stream.ts 305 LoC)
- [x] Layer 4 Runtime Wire forensic fix (ADR-006 live enforcement)
- [x] Auto-Archive ArchiveOrphanTasks extension
- [x] Worker Honest Assessment Calibration v2
- [x] Long-Running Sprint Resume capability MVP (sprint-checkpoint.ts + resume.ts)
- [x] 11/11 DONE, 0% NO_GO, 53m 46s, +3108 LoC, 91/100 avg rubric

**Sprint 139 — COMPLETE (2026-04-15) — Massive Codebase Analysis:**
- [x] 41+ tasks completed on first try (meta-sprint, largest single sprint)
- [x] Docker HB Core Fix 5-sprint P0 (atomicWriteFileSync + SIGTERM handler)
- [x] Chain Dependency Scheduler Wave 1 (Kahn's algorithm topological sort)
- [x] Backend Parity 3/3 (Docker + tmux + subprocess E2E test suites)
- [x] ADR-037 Brain-Auditor-Worker Authority Matrix RBAC V1.0 (+1370 LoC)
- [x] ADR-038 Self-Modifying Task Detection (+789 LoC)
- [x] Worker Event Hook + Notification Dispatcher (notify-adapters/)
- [x] Event Stream Runtime E2E Test (full pipeline simulation)
- [x] +14,471 LoC, 44 new test files

**Sprint 141 — COMPLETE (2026-04-16) — Read-Only Codebase Audit:**
- [x] 15/18 tasks completed (3 NO_GO — Docker timeout on large analysis)
- [x] src/cli/ (75 files), src/mcp/ (37 files), src/dashboard/ batch analysis
- [x] docs/ analysis (260 markdown files), .brain/ + config analysis
- [x] Architecture graph + circular dependency + dead code + type safety audit
- [x] ADR compliance + CLI/MCP parity + i18n + Memory V2 integrity audit
- [x] Test coverage map + performance + error handling + TODO inventory
- [x] +17,723 LoC analysis reports, 96/100 avg rubric

**Sprint 142 — COMPLETE (2026-04-17) — Deep Source Analysis:**
- [x] 44/49 tasks completed (5 NO_GO — Docker timeout on large batches)
- [x] 16-section analysis template across entire codebase
- [x] src/core/ (7 batches), src/orchestra/ (9 batches), src/cli/ (7 batches)
- [x] src/mcp/ (3 batches), src/dashboard/ (2 batches), tests/ (6 batches)
- [x] META cross-cutting: Architecture, Dead Code, Security, Performance, i18n, Memory V2
- [x] +36,470 LoC analysis reports, 94/100 avg rubric

**Sprint 143 — COMPLETE (2026-04-18) — Chain Reform:**
- [x] Error handling + exception architecture unification
- [x] Memory V2 full migration (ci-reporter + managed-docs)
- [x] Event stream + audit trail integration
- [x] Coordinator post-sprint regression fixes
- [x] 19/20 DONE, chain culmination sprint

**Sprint 144 — COMPLETE (2026-04-19) — God Split Cycle 2 + ADR-008:**
- [x] doctor.ts split (1102 → 3 files: doctor.ts + doctor-checks.ts + helpers)
- [x] retro.ts split (453 → 3 files)
- [x] Auditor async scan loop (52 syscalls)
- [x] Turkish locale fix (.toLowerCase() i18n)
- [x] i18n CLI foundation (5 commands TR/EN)
- [x] Docker HB deploy wire + Dockerfile hardening
- [x] Event stream emit wire (7 CHANNELS constants)
- [x] Memory V2 CLI tests (+40 tests)
- [x] Orphan cleanup (.tasks + locks)
- [x] 24/27 DONE, 3 NO_GO (worker timeout), +6865 LoC, -1997 LoC, 94/100 avg rubric

**Sprint 145 — IN PROGRESS (2026-04-20) — Adaptive Timeout + Observability + Doc Reform:**
- [ ] See Sprint 145 Deliverables Checklist below
- [ ] 27 tasks planned across 7 waves
- [ ] Readiness target: 3.93/5 → 4.10/5

**Upcoming (Sprint 146-150): See Sprint 145-150 Roadmap above**
- [ ] P1-10..12: Multi-provider live test (Sprint 147 target)

### Sprint 145 Deliverables Checklist (27 Tasks, 7 Waves)

**Wave 1 — Feature Co-Evolve (1 task)**
- [ ] T-145-001: Feature-Level Co-Evolve — `.deckent/features-manifest.json` + `scripts/sync-docs.mjs` + auto-generate docs/reference/

**Wave 2 — i18n 95 (3 tasks)**
- [ ] T-145-002: CLI Full i18n — 200+ hardcoded strings → `src/cli/helpers/messages.ts` (TR/EN)
- [ ] T-145-003: MCP Tool i18n — 22 tool descriptions TR/EN + `src/mcp/helpers/i18n.ts`
- [ ] T-145-004: Dashboard ConfigPage i18n — 28 missing keys × 2 locales = 56 new translations

**Wave 3 — Dashboard V2 + Test Stabilization (2 tasks)**
- [ ] T-145-005: Dashboard Memory V2 Full Integration — FTS5 search UI + relation graph
- [ ] T-145-007: Vitest 99.9% Stabilization — 5/5 consecutive identical PASS runs

**Wave 4 — CI + Skill Coverage (2 tasks)**
- [ ] T-145-006: CI Workflow Green — Node 18/20/22 × ubuntu/macos matrix, fail-fast: false
- [ ] T-145-008: Skill Test Coverage — 11 new skill test files, ≥5 tests each (55+ tests)

**Wave 5 — Documentation + Observability + Config (7 tasks)**
- [ ] T-145-009: README + README-TR Update — reflect Sprint 145 state
- [ ] T-145-010: AGENTS + CLAUDE + DECKENT + IDENTITY cross-validation
- [ ] T-145-011: docs/architecture/memory-system.md Rewrite (≥300 lines)
- [ ] T-145-012: .npmignore + Publishing Rules — `npm pack --dry-run` validation
- [ ] T-145-014: Observability Layer — debug-log 4 levels + unified error hierarchy
- [ ] T-145-015: Config Zod Validation — DeckentConfigSchema + loadConfig parse
- [ ] T-145-025: BETA-TRACKER.md Sprint 145-150 Milestone Calibration (this task)

**Wave 6 — Cleanup + Archive + Chain Review (3 tasks)**
- [ ] T-145-013: .deckent Cleanup Policy + Periodic Archive — retention rules
- [ ] T-145-016: DECISIONS.md Archive Finalize — SHA verification
- [ ] T-145-017: Chain Review Report — 500+ line 3-sprint chain summary (Sprint 137-145)

**Wave 7 — Sprint 146 Pre-Flight (1 task)**
- [ ] T-145-018: Sprint 146 Pre-Flight Planning — Multi-provider + cross-platform theme

**Additional Sprint 145 Tasks (8 tasks):**
- [ ] T-145-019: Adaptive timeout estimator — Sprint 141-144 historical data → dynamic timeout
- [ ] T-145-020: Event bus unified interface — Sprint 138 event-stream.ts → unified bus
- [ ] T-145-021: Monitor adapter — Sprint 145 dashboard ↔ event stream bridge
- [ ] T-145-022: Timeout watcher — Sprint 139 Docker HB Core Fix → per-worker enforcement
- [ ] T-145-023: MCP watch tool — Sprint 145 real-time sprint status SSE via MCP
- [ ] T-145-024: Status renderer polish — Sprint 144 CLI split → ANSI formatting + follow mode
- [ ] T-145-026: DECKENT-ANA-PLAN-TR Sprint 145 milestone update
- [ ] T-145-027: Memory V2 stress test — Sprint 140 DB-first → FTS5 search + decay + rebuild

**Sprint 145 Completion Criteria:**
- i18n score ≥ 95% (Sprint 145 CLI + MCP + Dashboard)
- 12,485+ tests pass, 99.9% stability (Sprint 145 vitest stabilization)
- All Sprint 145 wave 1-7 tasks evaluated
- Config Zod validation live (Sprint 145 T-015)
- Memory V2 stress test PASS (Sprint 145 T-027)

**Sprint 145 Gate Checks:**
1. All 11 health dimensions verified
2. docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md completed
3. MVP constraints honored (no unsafe patterns, no core breaks)
4. Chain safety gate PASS (5/5 checks)
5. Readiness: 3.93/5 → 4.10/5

### Phase 3: "Documentation"
TR+EN dual language, VISION, link audit, config dashboard

### Phase 4: "Public Repo"
.detect-secrets, migrate to VerhexIO/deckent, CI/CD, npm publish

---

## Priority Matrix (P0-P6)

## P0 — npm Packaging + Dogfooding — COMPLETE ✅

| # | Issue | Status | Note |
|---|-------|--------|------|
| 1 | npm publish test | **DONE** | 518KB, 479 files, local install works |
| 2 | `deckent init` real project test | **DONE** | Tested on Windows with Vizetron (Python/FastAPI) |
| 3 | `deckent doctor` external environment | **DONE** | WSL2 + Windows, SKIP/OK/FAIL, healthScore fix |
| 4 | Shebang + bin entry | **DONE** | `deckent` + `deckent-mcp` working |
| 5 | First sprint UX | **DONE** | Sprint-002 completed successfully on Vizetron |
| 6 | Windows native support | **DONE** | shell:true in 7 files, heartbeat periodic, log capture |

## P1 — Provider & Tier Generalization

| # | Issue | Status | Note |
|---|-------|--------|------|
| 7 | Plan tiers are Claude-specific | **DONE** | performance/balanced/economic + backward compat (Sprint 072) |
| 8 | Claude subscription dependency | **DONE** | Init wizard provider-agnostic, $ removed (Sprint 072) |
| 9 | Model name currency | **DONE** | MODEL_API_IDS + resolveApiModelId() (Sprint 072) |
| 10 | Multi-provider simultaneous test | **TODO** | Claude + Codex + Gemini never tested in the same sprint |
| 11 | API + Subscription together | **TODO** | Does API key work alongside subscription? |
| 12 | Codex/Gemini CLI binary check | **TODO** | Real CLI binary verification |

## P2 — Documentation

| # | Issue | Status | Note |
|---|-------|--------|------|
| 13 | README.md stale data | **DONE** | Badge + numbers updated (Sprint 074) |
| 14 | Language inconsistency | **DONE** | docs/CHANGELOG.md localized to Turkish (Sprint 075) |
| 15 | TR+EN dual language | **PARTIAL** | .deckent/docs/ TR/EN support added |
| 16 | CHANGELOG.md empty | **DONE** | docs/CHANGELOG.md 1159 lines, Sprint 1-073 (Sprint 074) |
| 17 | Config reference missing | **DONE** | .deckent/docs/config-reference.md |
| 18 | VISION.md missing | **DONE** | VISION.md created — vision, competitive analysis, roadmap (Sprint 075) |
| 19 | docs/ link check | **DONE** | 4 broken links detected and fixed (Sprint 075) |

## P3 — UX & Dashboard

| # | Issue | Status | Note |
|---|-------|--------|------|
| 20 | Dashboard data accuracy | **DONE** | Idle state with last sprint summary, no more 404 on /api/status |
| 21 | Dashboard config interface | **DONE** | 50+ fields across 13 categories, read/write via API, fully functional |
| 22 | Dashboard real test | **DONE** | 7+ real sprints recorded, 429 dashboard tests passing, API integration tested |
| 23 | Config.json complexity | **PARTIAL** | config-reference.md exists, dashboard selection missing |
| 24 | First-use experience | **DONE** | quick-start.md, directives-guide.md, workflow guide |

## P4 — Platform & Infrastructure

| # | Issue | Status | Note |
|---|-------|--------|------|
| 25 | Windows native | **DONE** | Full support: spawn, heartbeat, log, encoding, ps guard |
| 26 | Why Node >= 18? | **TODO** | OpenClaw requires Node 22+, ES2022+ feature check |
| 27 | Docker/Sandbox | **DONE** | Live verified Sprint 119-122: CLI+MCP, 10 e2e tests, CI skip guard |
| 28 | CI/CD billing | **TODO** | Will be resolved with public repo |
| 29 | .detect-secrets | **DONE** | .pre-commit-config.yaml installed, detect-secrets v1.5.0 (Sprint 075) |

## P5 — Code Quality

| # | Issue | Status | Note |
|---|-------|--------|------|
| 30 | .gitignore runtime state | **DONE** | |
| 31 | God objects | **DONE** | Phase 1 (Sprint 072), Phase 2 (Sprint 075), Phase 3 (Sprint 076) — result-collector.ts extraction complete |
| 32 | V2 routing test-writer bias | **PARTIAL** | Exclude rule written |

## P6 — User Experience Improvements

| # | Issue | Status | Note |
|---|-------|--------|------|
| 33 | Error messages not user-friendly | **DONE** | DeckentError + suggestion + howToFix (53 error codes) |
| 34 | `deckent explain` missing from MCP | **DONE** | MCP tool added (Sprint 125), 43 tests passing |
| 35 | Telemetry/analytics | **TODO** | Opt-in usage analytics |
| 36 | `deckent upgrade` test | **DONE** | `--local` flag added, beta workflow |
| 37 | Skill marketplace backend | **TODO** | CLI command exists but no backend |
| 38 | Plugin system e2e test | **TODO** | Never tested with a real plugin |
| 39 | Rate limiting production | **TODO** | Is 100 req/60s enough? |
| 40 | Graceful shutdown | **DONE** | SIGINT handler + interruptActiveSprint + killAllSessions (Sprint 076) |

---

## Competitive Analysis

### A. OpenClaw (Open-Source Personal AI Assistant)

**Overview:** Open-source (MIT) personal AI assistant created by Peter Steinberger. **343,000+ GitHub stars** (April 2026 — surpassed React in 60 days, most-starred software project on GitHub), **1,000+ contributors**, **2 million monthly active users**, **27 million monthly web visits** (925% growth). Previous names: Clawdbot → Moltbot → OpenClaw.

**Architecture (5 Layers):**

| Layer | Name | Function | Deckent Equivalent |
|-------|------|----------|--------------------|
| 1 | **Gateway** | Always-on daemon (port 18789), message routing, session management, Control UI + WebChat | api/server.ts + mcp/server.ts |
| 2 | **Brain** | LLM orchestration via ReAct reasoning loop | orchestra/sprint-controller.ts |
| 3 | **Memory** | Persistent context in Markdown files (local-first) | .brain/ directory |
| 4 | **Skills** | 13,729 ClawHub skills (65%+ MCP server wrappers): filesystem, shell, browser, email, 400+ apps | 21 built-in skills |
| 5 | **Heartbeat** | Autonomous task scanning daemon at 30-minute intervals | ✅ heartbeat-daemon.ts (Sprint 088) |

**OpenClaw Features Missing from Deckent:**

1. ~~**Heartbeat Daemon**~~ — ✅ Added in Sprint 088: `deckent heartbeat --daemon` for periodic task scanning, reads `.deckent/HEARTBEAT.md` and executes.
2. **50+ Channel Integrations** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix. Deckent only has CLI + MCP + Dashboard.
3. **Browser Control** — Web browser automation, page navigation, form filling. Not in Deckent.
4. **Always-On Gateway** — Persistent running daemon. Deckent is sprint-based (start-finish model).
5. **Autonomous Scheduled Tasks** — Runs without user prompting via HEARTBEAT.md. Deckent always waits for human trigger.
6. **Local-First Memory** — Persistent memory in Markdown. Deckent has .brain/MEMORY.md which is similar but more limited (300-line cap).

**OpenClaw's Weaknesses Compared to Deckent:**

1. Single-agent — no parallel multi-worker support
2. No sprint planning — every request is one-shot
3. No scope enforcement — full filesystem access
4. No multi-provider orchestration — single LLM
5. No structured task decomposition
6. No quality evaluation (GO/NO_GO)

**Lessons for Deckent:**
- Heartbeat daemon model is important — a proactively running system
- Channel integrations (Slack, Telegram) expand user reach
- Always-on gateway model is more autonomous than sprint-based
- Skill marketplace (13,729 skills, ClawHub) ecosystem growth strategy — the SKILL.md markdown pattern is simple and effective
- 2M MAU, 27M web visits — open-source community growth strategy worth studying

---

### B. Microsoft Copilot Cowork (Enterprise AI Orchestrator)

**Overview:** Enterprise AI agent system developed by Microsoft in collaboration with Anthropic. Offered in the M365 Frontier product. Launched March 2026.

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Multi-model | GPT + Claude "critique layer" — GPT writes, Claude verifies | Multi-provider (Claude + Codex + Gemini) |
| Enterprise Graph | Outlook, Teams, Calendar, SharePoint, Excel integration | Filesystem + git only |
| Autonomous Plan | User defines outcome, Cowork plans execution | DIRECTIVES.md → plan → execute |
| Checkpoints | Human approval points during plan execution | ✅ human_checkpoints config (Sprint 088) |
| Background Work | Tasks continue in the background | Sprint runs in background (tmux/subprocess) |

**Cowork Features Missing from Deckent:**

1. ~~**Human Checkpoints**~~ — ✅ Added in Sprint 088: approval points at plan/evaluate/fix phases, `waitForHumanApproval()` mechanism.
2. **Critique Layer** — Model A writes, Model B verifies. Deckent uses a single model per task.
3. **Enterprise Data Graph** — Email, calendar, file relationships. Deckent handles only code + files.
4. **Progressive Disclosure** — User can see as much detail as desired. Deckent is all-or-nothing (dashboard or terminal).

**Cowork's Weaknesses Compared to Deckent:**

1. Limited code-writing capability — focused on general work automation
2. No self-hosted option — Microsoft cloud required
3. Not open source — not extensible
4. Price: $30+/user/month mandatory M365 license

**Lessons for Deckent:**
- Critique layer (Model A writes + Model B verifies) improves quality
- Human checkpoints enable reliable yet autonomous workflows
- Enterprise data integration (Jira, Linear, GitHub) is an important expansion area

---

### C. Perplexity Computer (Multi-Model AI Agent System)

**Overview:** Launched February 25, 2026. $200/month (Max, 10,000 credits included), $325/seat/month (Enterprise Max). Orchestrates **19 specialized AI models**. Spending limit: default $200, max $2,000.

**Model Roles:**

| Model | Role | Deckent Equivalent |
|-------|------|--------------------|
| Claude Opus 4.6 | Central reasoning engine | brain_provider: claude |
| GPT-5.2 | Long-context recall, web search | worker_provider alternative |
| Gemini | Deep research | worker_provider alternative |
| Grok (xAI) | Lightweight, speed-priority operations | haiku tier equivalent |
| Nano Banana | Image generation | N/A |
| Veo 3.1 | Video generation | N/A |
| +13 others | Special-purpose tasks | N/A |

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Multi-model | 19 models, automatic task-based selection | 3 providers, 13 models, ModelRegistry + routing engine |
| Task Decomposition | Goal → subtask → sub-agent → specialist model | DIRECTIVES → task JSON → worker |
| Parallel Execution | Multiple sub-agents running simultaneously | Max 4-5 workers in parallel |
| Cloud Sandbox | Isolated environment, real filesystem, browser | Local filesystem |
| 400+ Apps | Slack, Gmail, GitHub, Notion integration | Limited (git, files, tests) |
| Duration | Can run for hours, days, even months | Sprint-based (minutes-hours) |
| Credit System | 10K credits/month, consumption based on task complexity | N/A (flat usage) |

**Perplexity Computer Features Missing from Deckent:**

1. **19 Specialized Models** — Best model automatically selected per subtask. Deckent has 13 models + ModelRegistry + routing engine with similar logic, but fewer models.
2. **Tasks Lasting Days/Months** — Long-running autonomous operation. Deckent is sprint-based (short duration).
3. **400+ App Integrations** — Web, email, social media, database. Deckent only covers development tools.
4. **Cloud Sandbox** — Isolated environment, security. Deckent is local (both an advantage and disadvantage).
5. **Credit-Based Pricing** — Usage-scaled cost. Deckent is flat (free but resource-limited).

**Perplexity Computer's Weaknesses Compared to Deckent:**

1. $200-325/month price — Deckent is free + open source
2. No self-hosted option — data security concerns
3. Limited code expertise — general purpose
4. No sprint planning/retrospective
5. No scope enforcement

**Lessons for Deckent:**
- Increasing model count (Grok, Llama, Mistral) provides competitive advantage
- Long-running task support (multi-sprint chaining)
- ✅ Dynamic model selection strengthened with ModelRegistry (Sprint 097) — 13 models, tier-based routing

---

### D. Devin 2.0/3.0 (Autonomous Software Engineer)

**Overview:** Cognition Labs. $20/month (Core, $2.25/ACU), $500/month (Team, $2.00/ACU, 250 ACU included). 1 ACU ≈ 15 minutes of work. v2.0 March 2026, v3.0 added dynamic replanning.

**Compound AI Architecture (Not a Single Model, but a Model Swarm):**

| Component | Role | Deckent Equivalent |
|-----------|------|--------------------|
| **Planner** | High-reasoning model, strategy determination | planner.ts (AI mode) |
| **Coder** | Code-specialist model, trained on trillions of tokens | Worker (general purpose) |
| **Critic** | Adversarial model, security + logic review | N/A — single model per task |

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Interactive Planning | Collaborative planning with user, back-and-forth | DIRECTIVES.md (one-directional) |
| Cloud IDE | Parallel Devin instances, in-browser editor | tmux/subprocess workers |
| Devin Wiki | Automatic repo indexing, architecture diagrams, source links | .brain/ memory system |
| Dynamic Replanning (v3.0) | Completely changes strategy when stuck | mid-sprint-adapter.ts (limited, max 1 reroute) |
| Legacy Refactoring | COBOL/Fortran → Rust/Go/Python | Stack detection exists, refactoring limited |
| UI Mockup → Code | Figma/visual → code generation | N/A |
| Code + Test + Deploy | Full software lifecycle | Code + test (no deploy) |

**Devin Features Missing from Deckent:**

1. **Interactive Planning** — Collaborative planning with the user. In Deckent, DIRECTIVES are written and planning is one-directional.
2. **Dynamic Replanning** — Completely different strategy when stuck. Deckent's mid-sprint reroute is limited (max 1 attempt).
3. **Devin Wiki** — Automatic repo indexing + architecture diagrams. Not in Deckent.
4. **Cloud IDE** — Live code editor in browser. Deckent is CLI-based.
5. **Deploy Capability** — Deploy to production. Not in Deckent.

**Devin's Weaknesses Compared to Deckent:**

1. Single-agent — no parallel multi-agent support
2. No sprint/retrospective system — limited learning
3. $20-500/month — Deckent is free
4. No self-hosted option
5. No multi-provider orchestration
6. No scope enforcement

**Lessons for Deckent:**
- Interactive planning (user collaboration) is an important UX improvement
- Codebase Wiki/indexing (semantic search) is a major advantage
- Dynamic replanning (mid-sprint plan changes) needs strengthening

---

### E. Claude Agent SDK + Computer Use (Anthropic Ecosystem)

**Overview:** Anthropic's official agent SDK. Built on the Claude Code infrastructure. Computer Use Agent launched March 2026.

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Computer Use | Desktop control: click, type, launch apps | N/A |
| Agent SDK | Autonomous agent creation infrastructure | MCP integration |
| Worktree Isolation | Isolated work via git worktree | Scope enforcement |
| Background Agents | Parallel subtasks | Workers (similar) |
| Voice Mode | Voice control in 20 languages | N/A |
| Loop/Schedule | Cron-style scheduled tasks | ✅ heartbeat-daemon.ts (Sprint 088) |
| Dispatch | Autonomous operation when user is away | Sprint background execution (similar) |

**Lessons for Deckent:**
- Claude Agent SDK integration is a natural expansion path
- Computer Use capability (browser, desktop) is a differentiator
- Loop/schedule (scheduled tasks) is similar to heartbeat daemon
- Worktree isolation already exists in scope enforcement — can be strengthened

---

### F. Claude Managed Agents — CMA (Anthropic Cloud Agent Platform)

**Overview:** Anthropic's managed agent infrastructure. Beta launched April 1, 2026 (`managed-agents-2026-04-01` header). Fully managed cloud platform where agents run on Anthropic's infrastructure — distinct from the Claude Agent SDK (Section E), which is a local development toolkit. REST API + SDKs in 7 languages (Python, TypeScript, Java, Go, C#, Ruby, PHP). Agents run in provisioned cloud containers with pre-installed packages and configurable network rules. Pricing: pay-per-use API billing. CLI tool: `ant` (Go-based).

**Architecture:**

| Feature | Detail | Deckent Equivalent |
|---------|--------|--------------------|
| Versioned Agents | Every agent update creates immutable version, rollback possible | agent.json (static, no versioning) |
| Versioned Memory | API-managed memory stores with SHA-based optimistic concurrency, redact for compliance | .brain/MEMORY.md (flat file, no versioning) |
| Rubric-Based Grading | Define rubrics, auto-grade with separate context window grader, iterate up to 20x | result-evaluator.ts (simple GO/NO_GO) |
| Managed Environments | Cloud containers with pre-installed packages (pip/npm/apt/cargo/gem/go), network rules | Docker backend (Sprint 101+, less structured) |
| Multi-SDK | Python, TS, Java, Go, C#, Ruby, PHP SDKs | TypeScript CLI only |
| Session Threads | Multi-agent with isolated context windows per agent thread | Worker scope enforcement (file-level, not context-level) |
| Custom Tools API | JSON schema tool definitions, client-side execution | MCP tools (similar, but no custom tool definition API) |
| Progressive Skills | Anthropic pre-built (xlsx, pptx, pdf, docx) + custom skills, on-demand loading | skill-registry (similar, AST sandbox) |
| SSE Streaming | Server-Sent Events for real-time agent output, event-driven architecture | HTTP API + SSE (Sprint 10, less structured) |

**CMA Features Missing from Deckent:**

1. **Rubric-Based Grading** — Define evaluation rubrics, auto-grade with separate context window grader, iterate up to 20x until rubric passes. Deckent's result-evaluator.ts does simple GO/NO_GO without structured rubric definitions.
2. **Versioned Memory Stores** — API-managed memory with immutable version history, SHA-based optimistic concurrency, redact operations for compliance. Deckent's .brain/MEMORY.md is a flat file with no versioning or concurrency control.
3. **Agent Versioning** — Every agent update creates a new immutable version, rollback to any previous version. Deckent's agent.json is static — no version history.
4. **Multi-SDK Support** — SDKs in 7 languages enabling any tech stack to drive agents. Deckent is TypeScript-only CLI.
5. **Managed Cloud Containers** — Provisioned containers with pre-installed packages (6 package managers) and network access rules (unrestricted/limited). Deckent has Docker backend but less structured environment management.
6. **Session Thread Isolation** — Each agent in a multi-agent session has its own context window and conversation history. Deckent's scope enforcement is file-level, not context-level.

**CMA's Weaknesses Compared to Deckent:**

1. Single provider (Claude only) — Deckent supports 3 providers, 13 models via ModelRegistry
2. No sprint lifecycle — session-based, stateless between sessions
3. No learning loop / self-improvement — no routing evolution, no synergy tracking
4. No scope enforcement / boundary violation detection — agents have full container access
5. No auditor pattern — no independent runtime quality monitoring
6. No tech debt tracking — no DEBT.md equivalent
7. No retrospective system — no cross-session learning
8. Cloud-only, no self-hosting option — data leaves your infrastructure
9. Paid API service — Deckent is free + open source
10. Single-level delegation only (coordinator → agents, no deeper nesting)

**Lessons for Deckent:**
- Rubric-based grading would transform result-evaluator.ts from binary GO/NO_GO to structured, iterative quality assessment
- Versioned memory stores would add rollback + compliance capabilities to .brain/ system
- Agent versioning would enable safe A/B testing and rollback of agent configurations
- Multi-SDK approach (at minimum a REST API with OpenAPI spec) would expand Deckent beyond TypeScript users
- Managed environment templates could further structure the Docker backend

---

### G. Comparison Matrix

| Capability | OpenClaw | Cowork | Perplexity | Devin | Claude SDK | CMA | **Deckent** |
|------------|----------|--------|------------|-------|------------|-----|-------------|
| **Open Source** | MIT | No | No | No | SDK yes | No | **MIT** |
| **Self-Hosted** | Yes | No | No | No | Partial | No | **Yes** |
| **Price** | Free | M365 | $200/mo | $20/mo | API | API pay-per-use | **Free** |
| **Multi-Agent Parallel** | No | Limited | Yes | No | Partial | Yes (threads) | **Yes** |
| **Sprint Planning** | No | No | No | No | No | No | **Yes** |
| **Scope Enforcement** | No | No | Cloud | No | Worktree | No | **Yes** |
| **Multi-Provider** | No | 2 | 19 | No | 1 | 1 | **3 (13 models, ModelRegistry)** |
| **Retrospective/Learning** | Limited | No | No | Wiki | No | No | **Yes** |
| **MCP Native** | No | No | No | No | Yes | No | **Yes (22 tools)** |
| **Memory V2 DB** | Limited | No | No | No | No | Yes (SHA) | **✅ Yes (Sprint 140, SQLite FTS5)** |
| **Heartbeat Daemon** | 30min | No | Yes | No | Loop | No | **✅ Yes (Sprint 088)** |
| **Human Checkpoints** | No | Yes | No | Yes | No | No | **✅ Yes (Sprint 088)** |
| **Interactive Planning** | No | Yes | No | Yes | No | No | **No** |
| **Browser Control** | Yes | No | Yes | Yes | Yes | No | **No** |
| **Channel Integration** | 50+ | M365 | 400+ | Slack | No | API | **No** |
| **Codebase Indexing** | No | No | No | Wiki | No | No | **No** |
| **Always-On** | Yes | Yes | Yes | No | Dispatch | Yes (cloud) | **No** |
| **Long-Running Tasks** | Yes | Yes | Days | Hours | Hours | Hours | **Unlimited (Sprint 088)** |
| **Skill Ecosystem** | 13,729 | - | - | - | 5,700 | Custom tools | **21** |
| **Critique Layer** | No | GPT+Claude | No | Planner+Critic | No | Rubric grader | **No** |
| **Rubric Grading** | No | No | No | No | No | Yes (20x iterate) | **✅ Yes (Sprint 125, 4-criteria)** |
| **Event Stream** | No | No | No | No | No | No | **✅ Yes (Sprint 138, JSONL)** |
| **RBAC Authority** | No | No | No | No | No | No | **✅ Yes (Sprint 139, ADR-037)** |
| **Agent Versioning** | No | No | No | No | No | Yes (immutable) | **No** |
| **Versioned Memory** | Limited | No | No | No | No | Yes (SHA-based) | **No** |
| **Multi-SDK** | No | No | No | No | Limited | 7 languages | **TS only** |
| **GitHub Stars** | 343K+ | - | - | - | - | - | **~0 (beta)** |
| **Community** | 1,000+ contrib | - | - | - | - | - | **1 (solo)** |

### H. Deckent's Unique Position

**Features found together in no other competitor (as of Sprint 145):**
1. Multi-agent parallel execution + scope enforcement + sprint planning + retrospective learning + multi-provider + MCP native + open source + free + self-hosted + rubric grading + event stream + RBAC + Memory V2 DB-first

**Strategic position:** Deckent is the only open-source solution in the "developer team orchestrator" niche. Competitors are either single-agent (Devin, OpenClaw), closed/expensive (Cowork, Perplexity), or cloud-only API services (CMA).

**Growth comparison:**
- OpenClaw: 0 → 343K stars in 4 months. Stars/day: ~2,860
- Deckent: Not yet published as open source. Launch strategy will be decisive.

---

## Verified Blockers (Code-Verified)

Every blocker was directly verified in the codebase. False claims have been corrected.

### BLOCKER-1: LEARNING LOOP BROKEN — ✅ RESOLVED (Sprint 091)

**Original state:** 3/4 sub-claims were true

| Sub-Claim | Original | Sprint 091 Fix |
|-----------|----------|----------------|
| RuleEvolver generates rules but doesn't apply them | **TRUE** | ✅ Evolved rules now auto-applied; injected into agent/skill activation during planSprint() |
| Agent tiebreaker not working in V2 | **TRUE** | ✅ getLearningBonus() reads from learnings.json (instead of agent.json stats) |
| Promotion/demotion not executing | **TRUE** | ✅ pipeline.promote() and pipeline.demote() are now called |
| Quality score not used | **TRUE** | ✅ avgQualityScore integrated into routing bonus calculation |
| Skill stats not updating | **TRUE** | ✅ updateSkillStats() called in V1, skill table generated in RETRO |
| Hard-coded constants | **TRUE** | ✅ Read from LearningConfig (minSamplesForBonus, recentSprintWindow) |

**Result:** Learning loop fully closed. 8 broken points fixed in Sprint 091.

### BLOCKER-2: INTENT CLASSIFIER IS STATIC (VERIFIED)

**Status:** VERIFIED

- `intent-classifier.ts:10-44` — `INTENT_KEYWORDS`, `OPERATION_KEYWORDS`, `SCOPE_INTENT_SIGNALS` all defined as `const`
- No dynamic functions like `updateWeights()`, `learn()`, `feedback()`
- Keyword weights unchanged across 84 sprints
- No mechanism for misclassification feedback

### BLOCKER-3: SILENT ERROR SWALLOWING — ✅ RESOLVED (Sprint 085+086+087+088)

**Original:** 49 silent catch blocks
**Fix:** Converted to debugLog (Sprint 085: 15, Sprint 086: 14, Sprint 088: remaining ~20)
- Converted: cleanup(7), finalizeSprint(7), spawnWorkers(5), evaluateResults(5), planSprint(5), utility functions

### BLOCKER-4: COVERAGE THRESHOLD — ✅ RESOLVED (Sprint 086)

**Original:** 90% hardcoded, no config override
**Fix:** `config.coverage_threshold` (default 90) — 6 files updated:
- config-types.ts: field added to DeckentConfig + ResolvedConfig
- config.ts: added to defaults + loadConfig return
- result-evaluator.ts: received as evaluateResult() parameter
- sprint-phases.ts: passed by runEvaluatePhase() + runFixPhase()
- sprint-controller.ts: passes config.coverage_threshold

### Corrected False Claims

| Claim | Reality | Evidence |
|-------|---------|----------|
| "AI planner has no fallback" | **FALSE** — `auto` mode falls back to structured | sprint-controller.ts:601-643 |
| "Agent stats not persisted" | **FALSE** — `updateAgentStats()` called at sprint end, writes to agent.json | agent-pool.ts:344-371, sprint-controller.ts:1292 |
| "goNogo.goCriteria ignored" | **FALSE** — Limited checking is in place | result-evaluator.ts:68-76 |

---

## Self-Improvement Roadmap

### PHASE 0: Observability Foundation — ✅ COMPLETE (Sprint 085)

- ✅ debugLog() 3-param overload + .brain/ERRORS.md (max 200 lines, append)
- ✅ Decision trail: .deckent/routing/decisions/decision-{sprint}-{task}.json
- ✅ applyEvolvedRules(): confidence >= 0.85 → automatic manifest update + rollback
- ✅ getSynergyBonuses(): skill pair success rate → routing bonus/penalty (+2/-2)

### PHASE 1: Close the Learning Loop — ✅ COMPLETE (Sprint 086)

- ✅ sprintId/taskId/projectRoot added to routeTaskV2 call sites (decision trail active)
- ✅ 14 additional silent catches → debugLog (29/49 total converted)
- ✅ coverage_threshold: hardcoded 90 → config.coverage_threshold (DeckentConfig + ResolvedConfig)
- ✅ INTENT_WEIGHTS: dynamic weight system + updateIntentWeights() + loadIntentWeights()
- ✅ getWorstCombinations(5): PAST RESULTS block added to AI planner prompt
- ⚠️ Remaining tech debt: ~20 silent catches, task-router.ts call site, planner integration

### PHASE 2: Autonomous Adaptation — ✅ COMPLETE (Sprint 088+091)

**Goal:** System modifies its own structure

**2.1 Adaptive Thresholds** — ✅ COMPLETE (Sprint 088)
- ✅ applyAdaptiveThresholds() + getRecentSprintStats()
- ✅ NO_GO rate > 30% → automatically lower agent_min_score
- ✅ Consistently low coverage → adjust threshold to project average
- ✅ `adaptive_thresholds: true` + `adaptive_config` configurable

**2.2 Dynamic Model Selection Improvement** — ✅ COMPLETE (Sprint 097 — ModelRegistry)
- ✅ ModelRegistry class: 13 models, 3 providers, single source of truth (model-registry.ts)
- ✅ Tier-based routing: premium_plus/premium/standard/economy tiers
- ✅ Provider-agnostic config: brain_tier/worker_tier (instead of model names)
- ✅ MODE_PRESETS: performance/balanced/economic/api strategies (mode-presets.ts)
- ✅ BUILTIN_MODELS catalog: cost, speed, context information
- ✅ Init wizard tier selection: selectTiers() + tierToModel() refactor
- ⏳ Token usage tracking (historicalTokenUsage) — detailed work plan in Section X.I
- ⏳ Context-Aware Routing (context budget → model selection → task splitting) — Section X.I

**2.3 Mid-Sprint Reroute Strengthening** — ✅ COMPLETE (Sprint 088)
- ✅ Max reroute: config.max_reroutes (default 3)
- ✅ Reroute option on GO_WITH_TECH_DEBT (config.reroute_on_tech_debt)
- ✅ Confidence threshold: reroute only when confidence > 0.7

**2.4 Agent/Skill Evolution Pipeline** — ✅ COMPLETE (Sprint 091)
- ✅ Agent tiebreaker: reads from learnings.json via getLearningBonus()
- ✅ Promotion/demotion: pipeline.promote() and pipeline.demote() execute
- ✅ Evolved rules: auto-applied rules injected into activation
- ✅ Skill stats: updateSkillStats() called in V1, skill table in RETRO
- ✅ Quality score: avgQualityScore integrated into routing bonus
- ✅ Config-driven: minSamplesForBonus, recentSprintWindow read from LearningConfig
- ✅ Integration test: evolution-pipeline.test.ts end-to-end test

### PHASE 3: Proactive System — ✅ PARTIALLY COMPLETE (Sprint 088)

**Goal:** OpenClaw's heartbeat daemon model — system runs on its own

**3.1 Heartbeat Daemon** — ✅ COMPLETE (Sprint 088)
- ✅ `.deckent/HEARTBEAT.md` scan file
- ✅ `HeartbeatDaemon` class: periodic execution (configurable interval)
- ✅ `deckent heartbeat` CLI command (one-shot + daemon + stop)
- ✅ Results logged to `.brain/heartbeat-log.md`
- ⏳ Notify user of results (Slack/terminal/dashboard) — not yet implemented

**3.2 Always-On Gateway (Optional)** — ⏳ PENDING
- Run API server as daemon
- Continuous monitoring via SSE
- Remote control: start/stop sprint from phone/web

**3.3 Multi-Sprint Chaining** — ⏳ PENDING
- Automatically start Sprint B when Sprint A completes
- `## Next Sprint:` block in DIRECTIVES.md
- Long-running tasks: sprint chains running for days

### PHASE 4: Human-in-the-Loop — ✅ PARTIALLY COMPLETE (Sprint 088)

**Goal:** Cowork/Devin-level human collaboration

**4.1 Worker Question Mechanism** — ⏳ PENDING
- Worker: `askBrain(question)` → IPC message to Brain
- Brain → relay question to user (CLI prompt / dashboard dialog / Slack)
- Answer → return to worker
- Timeout: default action if no response in 5 minutes

**4.2 Human Checkpoints** — ✅ COMPLETE (Sprint 088)
- ✅ After plan phase: `waitForHumanApproval('plan', ...)` approval
- ✅ After evaluate phase: `waitForHumanApproval('evaluate', ...)` approval
- ✅ Before fix phase: `waitForHumanApproval('fix', ...)` approval
- ✅ Configurable: `human_checkpoints: ['plan', 'evaluate', 'fix']`
- ✅ File-based approve/reject: `.deckent/checkpoints/` directory
- ✅ `SprintStatus.ABORTED` — sprint halted if rejected

**4.3 Interactive Planning** — ⏳ PENDING
- Devin model: collaborative planning with the user
- DIRECTIVES draft → AI suggests → user edits → finalize
- Plan editor in dashboard

### PHASE 5: Ecosystem Expansion (4+ sprints)

**Goal:** Perplexity/OpenClaw-level integration breadth

**5.1 Channel Integrations**
- Slack bot: sprint status, notifications, commands
- GitHub Issues/PR integration: issue → automatic task
- Linear/Jira: ticket → DIRECTIVES

**5.2 Codebase Semantic Indexing**
- Devin Wiki-style: automatic repo indexing
- AST-based dependency graph
- "If you change this file, these files are affected" knowledge
- RAG for enriching worker context

**5.3 Critique Layer (Cowork Model)**
- Model A writes, Model B verifies
- AI-powered evaluation in result-evaluator.ts
- Worker's own code reviewed by a different provider

**5.4 Browser/Computer Use**
- Claude Computer Use SDK integration
- Web application test automation
- UI/UX review (screenshot analysis)

**5.5 Provider Expansion**
- Grok, Llama, Mistral, DeepSeek adapters
- 13 → 19+ model support (ModelRegistry infrastructure ready — Sprint 097)
- Approaching Perplexity's 19-model footprint

**5.6 Rubric-Based Grading (CMA Model)**
- Define evaluation rubrics per task type (code quality, test coverage, documentation completeness)
- Separate grader context window — evaluator does not share context with worker
- Iterative improvement: re-attempt up to N times until rubric passes
- Upgrade result-evaluator.ts from binary GO/NO_GO to rubric-scored evaluation

**5.7 Versioned Memory & Agent Versioning (CMA Model)**
- .brain/MEMORY.md → versioned memory store with SHA-based concurrency
- Agent version history: every agent.json change creates immutable version
- Rollback to any previous agent or memory version
- Redact operations for compliance (PII removal from memory history)

**5.8 Multi-SDK / REST API (CMA Model)**
- REST API layer on top of HTTP API for programmatic access
- Language-agnostic client: any HTTP client can drive Deckent sprints
- OpenAPI spec → SDK generators (Python/Go/Java clients)

---

## Sprint Metrics
| Metric | Value |
|--------|-------|
| Sprint | sprint-254 |
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 0 |
| Duration | 13dk 21sn |
| Coverage | N/A |

## Sprint History (Sprint 136-166)
| Sprint | Tasks | Done | NO_GO | Duration | Avg Rubric | Theme |
|--------|-------|------|-------|----------|------------|-------|
| sprint-136 | 10 | 7 | 3 | ~1h | 90/100 | sprint-controller.ts 1890→209 LoC |
| sprint-137 | 6 | 6 | 0 | 35m 53s | 93/100 | Verification protocol wire |
| sprint-138 | 11 | 11 | 0 | 53m 46s | 91/100 | ADR governance + event stream |
| sprint-139 | 41 | 41 | 0 | ~3h | 92/100 | Massive codebase analysis |
| sprint-141 | 18 | 15 | 3 | 1h 14m | 96/100 | Read-only codebase audit |
| sprint-142 | 49 | 44 | 5 | 2h 54m | 94/100 | Deep source analysis |
| sprint-143 | 20 | 19 | 1 | ~5h | 93/100 | Chain reform |
| sprint-144 | 27 | 24 | 3 | 1h 47m | 94/100 | God split cycle 2 + ADR-008 |
| sprint-145 | 27 | 27 | 1 | 92m 30s | 92/100 | Adaptive timeout + observability |
| sprint-146 | 17 | 17 | 0 | ~50m | 93/100 | Prompt god template + rubric consolidation |
| sprint-147 | 23 | 23 | 0 | 49m 34s | 94/100 | Nervous System core + ADR-040 |
| sprint-148 | 28 | 28 | 0 | 60m 47s | 95/100 | Meta-dogfood + Agent taxonomy + Nervous live |
| sprint-149 | 4 | 4 | 0 | 33m 23s | 90/100 | npm publish + last mile |
| sprint-150 | — | — | — | — | — | 🚀 Beta GA Cutover |
| sprint-151 | — | — | — | — | — | Public repo flip (VerhexIO/deckent) |
| sprint-153 | 16 | 3 | 13 | 35m 32s | — | watch --ms CLI promote, doc-writer focus |
| sprint-156 | 22 | 7 | 0 | — | — | T4 dogfood — Bug X dual-eval race + Sprint-Stall + state freeze (3 major bugs reproduced) |
| sprint-157-162 | — | — | — | — | — | TaskType + Wave Scheduler + Survivor wire |
| sprint-163 | 6 | 6 | 0 | — | — | **Brain stability hattı SEALED** (6/6 DONE, zero NO_GO) |
| sprint-164 | 6 | 5 | 0 | — | — | Wave-Based Execution Semantics + ADR-045, wire 13 grep match code-complete, runtime gated, GO_WITH_GATE_FAILURE (vitest +1) |
| sprint-165 | 5 | 5 | 0 | ~2h | — | **Bug X/Y/Z/W close + docs freeze** — Bug X stub removal (sprint-156-011), Bug Y Sprint-Stall fix, Bug Z chronic vitest +1 fail closed, Bug W dead_event_stream activated, T5 docs freeze + public repo prep, v1.0.0-beta.1 npm publish ready |
| sprint-166 | 11 | 10 + 1 GO_WTD | 0 | ~3h | — | **Brain Self-Update + Data Integrity Closure** — Bug M (adrInsert hook), Bug N (onRuleRegen wire), Bug S (sprint-aware cache key), Bug Y2 (3-layer ground-truth defense), Bug R+T+U+V+C+X+P+Q+W+K+L bundled, ADR-046 accepted (~2735 LoC, 35+ tests). 4 new bugs E+G+Z2+Z3 detected → Sprint 167 P0 |

## Dogfooding Bug Tracker

### Sprint 070 — Init UX Overhaul (15 fixes)

| Bug | Description | Fix |
|-----|-------------|-----|
| BUG-3 | Claude CLI spawn ENOENT (Windows) | `shell: process.platform === 'win32'` — 7 files |
| BUG-4 | Worker rules hardcoded `tsc --noEmit` | Pass `detectFullStack()` result to worker rules |
| BUG-6 | Stack detection `Language: unknown` | Always run stack detection |
| BUG-7 | Doctor FAIL+OK contradiction | FAIL → SKIP label (optional providers) |
| BUG-8 | Framework `next` (should be fastapi) | Skip JS framework detection in Python/Go/Rust projects |
| BUG-9 | IDENTITY.md file missing | Create workspace IDENTITY.md during init |
| BUG-10 | DECKENT.md `Build: tsc` (in Python project) | `!== undefined` check + `echo "no build step"` |
| BUG-11 | DIRECTIVES.md empty placeholder | Stack-aware example task format + TR/EN template |
| BUG-12 | Worker rules hardcoded `npx vitest run` | Use `detectFullStack().commands.test` |
| BUG-13 | Brain rules wrong limits | 200→300, 600→900 |
| BUG-14 | TempAgent not created | Expanded matching with `detectedLanguages` |
| BUG-15 | BOOT.md no user hints | User-friendly explanation + tips (TR/EN) |
| BUG-16 | `ps: unknown option -- o` (Windows) | `process.platform !== 'win32'` guard |
| BUG-18 | MCP binary name inconsistent | Documentation: `deckent-mcp` separate binary |

### Sprint 071 — Dogfooding Bug Fixes (7 fixes + upgrade)

| Bug | Description | Fix |
|-----|-------------|-----|
| BUG-19 | UTF-8 encoding Windows | LANG + PYTHONIOENCODING env vars added to subprocess |
| BUG-21 | Doctor healthScore=0 all checks passed | `c.ok` → `c.passed` field mismatch fixed |
| BUG-22 | Review "No tasks found" after sprint | `loadTaskResults()` archive/ fallback added |
| BUG-23 | Heartbeat 28x stale, sequence=1 | setInterval 15s periodic heartbeat update |
| BUG-24 | Worker not writing .result file | Fallback .result on child exit |
| BUG-25 | Scope parser ignoring Files/Scope | Explicit `Files:` / `Scope:` label parsing |
| BUG-26 | Task log empty (Windows) | closeSync(logFd) moved to child exit handler |
| — | Version bump + upgrade --local | `deckent upgrade --local <path.tgz>` beta workflow |

### Sprint 070 — New Features

| Feature | Description |
|---------|-------------|
| `.deckent/workspace/IDENTITY.md` | Project identity populated with stack detection results |
| `.deckent/docs/quick-start.md` | First sprint guide in 5 steps (TR/EN) |
| `.deckent/docs/directives-guide.md` | DIRECTIVES format guide + field descriptions |
| `.deckent/docs/config-reference.md` | Full config.json settings reference |
| TempSkill at init | `project-conventions` skill auto-created |
| TempAgent at init | Temp agents created based on project stack |
| DECKENT.md Workflow | Workflow steps, DIRECTIVES format, Providers section |
| Worker prompt stack-aware | DECKENT.md reference instead of hardcoded `tsc`/`vitest` |
| allowedTools expansion | `Edit`, `Glob`, `Grep` added to worker tools |

### Known Open Bugs

| Bug | Description | Severity | Note |
|-----|-------------|----------|------|
| BUG-17 | Worker not writing .result (original) | Low | Partially resolved by BUG-24 fallback |
| BUG-20 | Permission dialog slowing down worker | Low | Can be bypassed with `--dangerously-skip-permissions` |

---

## Docker & Infrastructure

### A. Critical Issues Found and Fixed (3)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Container auth fail | `~/.cache/claude/` mount → credentials at `~/.claude/.credentials.json` | `~/.claude/` mount |
| `--dangerously-skip-permissions` blocked | Container running as root, Claude CLI blocks root | `--user uid:gid` for non-root |
| Config warnings | `~/.claude.json` not mounted | Conditional `.claude.json` mount |

### B. E2E Test Results

- **Single worker**: `.result` file reached host from container ✅
- **2 parallel workers**: Both completed independently ✅
- **Container auto-cleanup**: `docker wait` + `docker rm -f` ✅
- **Heartbeat**: `exitCode: 0`, `status: DONE`, `backend: docker` ✅
- **Timeout marker**: Not created on successful job ✅

### C. Sprint 103 Results (7 Tasks)

| Result | Count | Detail |
|--------|-------|--------|
| DONE | 5 | ANALYSIS update, README badge, module counts, Docker test, Docker guide |
| NO_GO | 1 | don't-ask mode → Edit/Write permission denied (debt-098-001) |
| GO_WITH_TECH_DEBT | 1 | Already resolved debt, only DEBT.md marking remaining |

### D. New Features Added

1. **`checkDocker()`** — Docker daemon + worker image check added to Doctor (14 checks)
2. **Init Docker detection** — Automatic `spawn_backend: docker` set when Docker is available
3. **`tests/e2e/docker-backend.test.ts`** — 10 integration tests (spawn, heartbeat, cleanup, concurrent, log extraction)
4. **`docs/guide/docker-backend.md`** — 362-line comprehensive guide

### E. Container Exit Code Analysis (Sprint 103 Test Containers)

| Exit Code | Meaning | Count | Detail |
|-----------|---------|-------|--------|
| 0 | Successful | 1 | debug2 container |
| 137 | SIGKILL (timeout) | 8 | Kill after test timeout |

### F. Issues Detected and Resolved

| # | Issue | Status | Fix |
|---|-------|--------|-----|
| 1 | MCP server caching old dist/ | ⚠️ Known | MCP restart required after `tsc` (dynamic import does not bypass ESM cache) |
| 2 | Worker don't-ask mode | ✅ **RESOLVED** | MCP start `autoApprove: default(true)` — commit `574ef65` |
| 3 | autoApprove not passing | ✅ **RESOLVED** | MCP start default(false)→default(true) — commit `574ef65` |
| 4 | Worker exits without writing .result | ✅ **RESOLVED** | Shell EXIT trap added (tmux + docker) — commit `c5d2c89` |
| 5 | Config revert (spawn_backend deleted) | ✅ **RESOLVED** | `updateLastSprintId()` null guard — commit `574ef65` |
| 6 | MCP run not spawning worker | ✅ **RESOLVED** | `buildWorkerPrompt` + `SpawnBackendFactory` added — commit `574ef65` |
| 7 | Docker auth mount wrong | ✅ **RESOLVED** | `~/.cache/claude/`→`~/.claude/` + non-root — commit `e807891` |
| 8 | Doctor missing Docker check | ✅ **RESOLVED** | `checkDocker()` added — commit `e807891` |
| 9 | debt-098-001 duplicate ID | ✅ **RESOLVED** | `debtId` guard added — commit `5080d16` |

### G. `deckent run` Test Results

**Previous state (before fix):**

| Method | Model | Result | Detail |
|--------|-------|--------|--------|
| MCP `deckent_run` | sonnet | **TIMEOUT** | Worker not spawned (only wrote JSON) |
| CLI `deckent run --auto-approve` | haiku | **TIMEOUT** | No EXIT trap, not writing .result |

**Current state (after fix — verification pending):**
- MCP run: config-aware worker spawn via `SpawnBackendFactory`
- EXIT trap: fallback NO_GO result on worker crash/timeout
- autoApprove: `default(true)` — `--dangerously-skip-permissions` automatic

### H. Current Work Plan (Sprint 104+)

**Priority 1 — Docker Sprint Live Verification**
1. ✅ Docker sprint live test after MCP server restart (Sprint 120-122)
2. ✅ `deckent run` MCP + CLI live verification (Sprint 121 CLI exit 0, Sprint 122 MCP reconnect OK)
3. ✅ Docker container timeout reading from config (`docker_timeout` in config.json, default 1200s)

**Priority 2 — Beta Preparation**
4. ✅ README Docker backend section + Quick Start (README.md:387-405, docs/guide/docker-backend.md)
5. ✅ Version bump 0.4.0-beta.1 (already done)
6. ✅ CLI/MCP start parity (both read config.spawn_backend via SpawnBackendFactory, MCP doctor skip documented)

**Priority 3 — Feature Expansion**
7. ⏳ Hybrid backend (Docker worker + subprocess auditor) — ADR to be written
8. ⏳ Dashboard Docker container status display
9. ✅ spawnWorkerMultiProvider config-aware (reads config.spawn_backend + docker_image + docker_timeout)

### Session Wrap-Up (April 7, 2026 — 10 commits)

Docker backend brought to working state in live environment during this session. Summary:

| Category | Detail |
|----------|--------|
| Commits | 10 (3 feat, 6 fix, 1 docs) |
| New files | `tests/e2e/docker-backend.test.ts` (7 tests), `docs/guide/docker-backend.md` (362 lines) |
| CI | ❌ 3 fail → ✅ 19/19 GREEN |
| Debt | 2 open → 0 open |
| Tests | 12,062 pass, 0 fail |
| Coverage | 90% line, 89% branch, 95% function |

**Critical fixes:** Docker auth (3 fixes), Worker EXIT trap (.result guarantee), Config revert guard, MCP autoApprove default(true), MCP run worker spawn, MockSpawnBackend CI crash.

### Session Wrap-Up (April 8-9, 2026 — Docker Live Verification)

Docker backend live E2E sprint verification completed across Sprint 119-122. Summary:

| Category | Detail |
|----------|--------|
| Sprints | 119 (NO_GO), 120 (NO_GO), 121 (CLI GO), 122 (MCP GO) |
| Docker tests | 7 → 10 e2e tests (log extraction, monitor updates) |
| CI fix | Coverage job Docker e2e `skipIf(!dockerAvailable)` guard added |
| Live results | CLI exit 0 verified, MCP reconnect verified, smoke files created |
| Files created | `docs/docker-smoke/cli-test.md`, `docs/docker-smoke/mcp-ok.md` |

**Key insight:** Sprint 119-120 Docker worker exited without writing result file — identified as MCP cache issue. After MCP server restart + CLI fallback, Sprint 121 CLI and Sprint 122 MCP both succeeded.

### I. Token Usage Analysis + Context-Aware Routing Work Plan

#### Current State (April 7, 2026 — Real JSONL Data)

**Last 30 days real token usage** (Claude Code JSONL transcript parse):

| Metric | Value |
|--------|-------|
| Sessions | 1,189 (1,001 with usage data) |
| API calls | 56,713 |
| Input tokens | 1.6M |
| Output tokens | 13.0M |
| Cache write tokens | 176.2M |
| Cache read tokens | 5,084.9M |
| **Total (including cache)** | **5.28 Billion tokens** |

**Per-model breakdown:**

| Model | Input | Output | Cache Read | API Calls | API Cost |
|-------|-------|--------|------------|-----------|----------|
| Opus 4.6 | 1.18M | 6.92M | 3,677M | 32,253 | $9,527 |
| Sonnet 4.6 | 0.32M | 5.50M | 1,253M | 21,525 | $669 |
| Haiku 4.5 | 0.07M | 0.57M | 154M | 2,885 | $8 |

**Cache impact:**

| Scenario | Cost |
|----------|------|
| With cache (actual) | $10,212 |
| Without cache (hypothetical) | $61,468 |
| Cache savings | $51,256 (83% discount) |
| Claude Code Max Plan | $200 |
| **ROI** | **51x** |

**Key metrics:**
- Average per API call: 89,666 tokens from cache, 28 tokens new input, 229 tokens output
- 97% of context comes from cache
- Cache hit rate: 99.9%
- Max cache read: 553,047 tokens (single call)
- Weekly trend: +122% increase (Deckent sprint intensity growing)

#### Problem: Cache ≠ Context Savings

Cache only reduces cost — tokens still occupy the context window:
- Even if 90K tokens are read from cache, the model still "sees" those 90K
- Opus/Sonnet 4.6: 200K context limit
- In long conversations, context compression kicks in → information loss

#### Work Plan: Context-Aware Routing (Sprint 104+)

**Layer 1: Context Estimator**
- Estimate context budget per task
- Calculate system prompt size (CLAUDE.md + rules + skill prompts)
- Estimate total token count of task scope files
- Add expected tool call overhead
- Activate existing `token-counter.ts` (orphan, has tests)

**Layer 2: Context-Aware Router**
- Add context size as a factor in `task-router.ts`
- Add `contextLimit` field to ModelRegistry (per model)
- Routing decision: Budget < 75% model limit → this model OK, otherwise upgrade or split
- Decision logic:
  ```
  Budget < 150K → Sonnet 200K (cheap, sufficient)
  Budget 150K-180K → Opus 200K (smarter, tight fit)
  Budget > 180K → SPLIT task or route to 1M context model
  Budget > 800K → Definitely split
  ```

**Layer 3: Task Splitter**
- Automatic scope splitting when context budget exceeds model limit
- Create subtasks based on file grouping
- Each subtask must be independently executable (minimize shared context)

**Layer 4: Token Usage Tracker (Sprint Reporter Integration)**
- Add `tokenUsage` field to worker result file:
  ```json
  { "inputTokens": 15420, "outputTokens": 3200, "provider": "claude", "model": "opus" }
  ```
- Claude: post-hoc parse from JSONL transcript
- Gemini: save existing `parseGeminiOutput()` result (already parsing)
- Codex: capture API response usage field
- Add token summary table to sprint reporter (RETRO.md)

**Estimated effort:** 3-4 sprints (Layers 1-2 priority, Layers 3-4 in next phase)

---

## Success Metrics & Risk

### Self-Improvement Metrics

| Metric | Before Sprint 084 | After Sprint 086 | Target (10 sprints) | Measurement |
|--------|-------------------|-------------------|---------------------|-------------|
| Sprint NO_GO rate | ~15% | 0% (085+086) | <5% | Sprint retro |
| Agent selection accuracy | Unknown | Measurable (decision trail) | >85% | Decision JSON |
| Auto-applied rules | 0 | Infrastructure ready | 5+ per sprint | applied-rules.json |
| Intent classifier learning | None | updateIntentWeights() active | <10% misclassification | intent-weights.json |
| Silent errors | 49 | ~20 | 0 | grep count |
| Planner historical context | None | getWorstCombinations() | Every sprint | Planner prompt |
| Coverage threshold | Hardcoded 90% | Read from config | Per-project | config.json |

### Autonomy Metrics

| Metric | Current | Target (15 sprints) | Measurement |
|--------|---------|---------------------|-------------|
| Human intervention / sprint | ~3-5 | <1 | Sprint log |
| Proactive task count | ✅ Daemon active | 5+ / day | Heartbeat log |
| Self-heal rate | 0% | >50% | Auto-fix / total error |
| Cross-sprint learning | Minimal | Full | Memory recall accuracy |

### Competitive Convergence

| Metric | Current | Target | Reference Competitor |
|--------|---------|--------|----------------------|
| Skill/integration count | 21 | 50+ | OpenClaw (13,729) |
| Model count | 13 (ModelRegistry) | 15+ | Perplexity (19) |
| Channel integrations | 0 | 5+ | OpenClaw (50+) |
| Human checkpoints | ✅ 3 phases (Sprint 088) | 3+ phases | Cowork |
| Codebase indexing | None | AST+RAG | Devin Wiki |

### Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Auto-apply rules break the system | Low | High | Rule versioning + rollback + sandbox testing |
| Heartbeat daemon resource consumption | Medium | Medium | Configurable interval, idle detection |
| Human checkpoint UX friction | High | Medium | Progressive disclosure, smart defaults |
| Intent feedback wrong learning | Medium | High | Minimum sample (10+), slow decay |
| Multi-sprint chaining infinite loop | Low | High | Max chain depth, cost guard |
| Browser control security vulnerability | Medium | High | Sandbox, permission system |

---

## Strategic Positioning

### ✅ Short Term — COMPLETE (Sprint 085-086): "Learning Orchestrator"
- ✅ Learning loop closed (rule auto-apply + synergy + intent feedback + planner historical context)
- ✅ Rules evolve automatically (applyEvolvedRules, confidence >= 0.85)
- ✅ Decision logging + observability (decision trail + .brain/ERRORS.md)
- ✅ Intent classifier learns from outcomes (INTENT_WEIGHTS)
- **Differentiator:** No competitor (OpenClaw, Devin, Perplexity, Cowork) has closed a learning loop

### ✅ Medium Term — COMPLETE (Sprint 087-097): "Proactive Developer Assistant"
- ✅ Proactive operation via Heartbeat daemon (OpenClaw model) — Sprint 088
- ✅ Reliable autonomy via Human checkpoints (Cowork model) — Sprint 088
- ✅ Sprint timeout reform — unlimited duration support — Sprint 088
- ✅ Adaptive thresholds (automatic adjustment based on NO_GO rate) — Sprint 088
- ✅ Mid-sprint reroute strengthening (max 3 attempts) — Sprint 088
- ✅ Agent/Skill Evolution Pipeline (promotion/demotion, evolved rules) — Sprint 091
- ✅ ModelRegistry + tier-based routing (13 models, 3 providers, single source of truth) — Sprint 097
- ⏳ Slack/GitHub integrations
- **Differentiator:** Multi-agent + learning + proactive + checkpoints + open source

### ✅ Infrastructure Maturity — COMPLETE (Sprint 137-145): "Foundational Hardening"
- ✅ ADR governance with mandatory enforcement (Sprint 138 — MADR v3, 37 ADRs)
- ✅ Structured event stream with 15 channel codes (Sprint 138 — ADR-035)
- ✅ RBAC authority matrix for Brain-Auditor-Worker (Sprint 139 — ADR-037)
- ✅ Self-modifying task detection (Sprint 139 — ADR-039, dogfood discrimination)
- ✅ Comprehensive 360° codebase audit (Sprint 141-142 — 59 analysis tasks)
- ✅ Chain reform: error handling unification (Sprint 143 — 19/20 DONE)
- ✅ God split cycle 2: doctor.ts + retro.ts (Sprint 144 — 24/27 DONE)
- ⏳ Sprint 145: adaptive timeout + observability + i18n + doc reform (IN PROGRESS)
- **Differentiator:** 9-sprint chain (Sprint 137-145) with zero architectural regression

### Long Term (Sprint 146-150+): "Beta GA + Autonomous Software Team"
- Codebase semantic understanding (Devin Wiki model)
- Critique layer with multi-model verification (Cowork model)
- Browser/desktop control (Claude Computer Use)
- Multi-sprint chaining (tasks running for days, Perplexity model)
- Provider expansion: Grok, Llama, Mistral, DeepSeek (ModelRegistry infrastructure ready)
- Rubric-based grading with iterative improvement (CMA model — structured evaluation beyond GO/NO_GO)
- Versioned memory + agent versioning with rollback (CMA model — compliance, A/B testing)
- REST API / Multi-SDK access (CMA model — beyond TypeScript CLI)
- **Differentiator:** Full team simulation — a whole team from a single person

---

## Conclusion

**Deckent's current state (Sprint 166, v1.0.0-beta.1 → v1.0.0-beta.2 Sprint 168 GA):**
- 166+ sprints, 16,434+ tests (413 dashboard), 882+ TypeScript files
- 15 built-in agents (+2 temp), 21 built-in skills — ADR-041 Agent Taxonomy reform stable (Sprint 148, reconfirmed Sprint 150 + Sprint 166 ground-truth defense)
- 13 models, 3 providers (Claude, Codex, Gemini), single source of truth via ModelRegistry
- 27 MCP tools + 8 resources, 55-56 CLI commands
- 46 ADRs accepted (ADR-046 Brain Self-Update Hook Architecture added Sprint 166)
- Memory V2 DB-first architecture ACTIVE (SQLite FTS5, dual-layer i18n normalize)
- Self-improving routing ACTIVE (rule evolution, synergy, intent learning)
- Decision trail with full observability
- ✅ ADR Governance Integration (37 ADRs migrated, MADR v3 hybrid) — Sprint 138
- ✅ Structured Event Stream (15 channel codes, event-stream.ts) — Sprint 138
- ✅ Worker Honest Assessment Calibration v2 — Sprint 138
- ✅ Long-Running Sprint Resume (sprint-checkpoint.ts) — Sprint 138
- ✅ RBAC Authority Matrix (Brain-Auditor-Worker) — Sprint 139
- ✅ Self-Modifying Task Detection (ADR-039) — Sprint 139
- ✅ Chain Dependency Scheduler (Kahn's topological sort) — Sprint 139
- ✅ Backend Parity 3/3 (Docker + tmux + subprocess E2E) — Sprint 139
- ✅ Comprehensive Codebase Audit (59 analysis tasks, +54K LoC) — Sprint 141-142
- ✅ God Split Cycle 2 (doctor.ts, retro.ts) — Sprint 144
- ✅ ADR-008 Enforcement (tek yönlü bağımlılık) — Sprint 144

---

**Completed strategic goals (Sprint 085-145):**
1. ✅ **Close the learning loop** — rule auto-apply + synergy → router + intent feedback (Sprint 085-086)
2. ✅ **Observability** — silent catch → debugLog + decision trail + .brain/ERRORS.md (Sprint 085-088)
3. ✅ **Coverage config** — hardcoded 90% → config.coverage_threshold (Sprint 086)
4. ✅ **Heartbeat daemon** — proactive operation (OpenClaw model) (Sprint 088)
5. ✅ **Human checkpoints** — approval at sprint phases (Sprint 088)
6. ✅ **Sprint timeout reform** — unlimited duration support (Sprint 088)
7. ✅ **Adaptive thresholds** — automatic adjustment based on NO_GO rate (Sprint 088)
8. ✅ **Mid-sprint reroute strengthening** — max 3 attempts (Sprint 088)
9. ✅ **Agent/Skill evolution pipeline** — promotion/demotion (Sprint 091)
10. ✅ **ModelRegistry** — 13 models, 3 providers, tier-based routing (Sprint 097)
11. ✅ **Sprint History Fix** — MCP history reads .brain/archive/ (Sprint 098)
12. ✅ **Job Output Reform** — finalizeSprint() enriched (Sprint 099)
13. ✅ **Docker Spawn Backend** — container isolation, E2E tests (Sprint 101)
14. ✅ **Docker Live E2E Verification** — CLI+MCP sprint tested (Sprint 119-122)
15. ✅ **Context-Aware Routing** — context budget → model selection (Sprint 124)
16. ✅ **Token Usage Tracker** — provider-native counting (Sprint 124)
17. ✅ **Rubric-Based Grading** — 4-criteria rubric, evaluateWithRubric() (Sprint 125-129)
18. ✅ **Worker Question Mechanism** — askBrain IPC (Sprint 125-129)
19. ✅ **Enterprise Tech Debt Cleanup** — zero open debt (Sprint 129)
20. ✅ **MCP 22 Tools** — server.ts instructions + watch tool (Sprint 130+145)
21. ✅ **Decision-Engine V1 Archive** — ADR-028, V1 @deprecated (Sprint 130)
22. ✅ **Security Hardening** — SHA-256 signing + AST sandbox (Sprint 133)
23. ✅ **Product Vision** — ADR-033 Product-Not-Service (Sprint 134)
24. ✅ **Operational Hardening** — zero coordinator crash (Sprint 135)
25. ✅ **God Object Elimination** — sprint-controller 1890→209 LoC (Sprint 136)
26. ✅ **Verification Protocol** — ADR-035 (15 channel codes) (Sprint 137-138)
27. ✅ **ADR Governance** — MADR v3 hybrid, mandatory enforcement (Sprint 138)
28. ✅ **Event Stream Foundation** — append-only JSONL observability (Sprint 138)
29. ✅ **RBAC Authority Matrix** — ADR-037 Brain-Auditor-Worker (Sprint 139)
30. ✅ **Self-Modifying Detection** — ADR-039 dogfood discrimination (Sprint 139)
31. ✅ **Comprehensive Audit** — 59 analysis tasks, 11 health dimensions (Sprint 141-142)
32. ✅ **Chain Reform** — error handling + Memory V2 migration (Sprint 143)
33. ✅ **God Split Cycle 2** — doctor.ts + retro.ts split (Sprint 144)

**Next priorities (Sprint 145-150 — Beta GA path):**
1. 🔄 **i18n 95%** — CLI + MCP + Dashboard full localization (Sprint 145)
2. 🔄 **Observability Layer** — debug-log 4 levels + error hierarchy (Sprint 145)
3. 🔄 **Config Zod Validation** — strict schema enforcement (Sprint 145)
4. ⏳ **Dead Code Wave C** — final cleanup pass (Sprint 146)
5. ⏳ **Multi-Provider Hardening** — Claude + Codex + Gemini live test (Sprint 147)
6. ⏳ **Cross-Platform Validation** — macOS + Linux + WSL2 (Sprint 148)
7. ⏳ **npm Publish Dry-Run** — .npmignore + pack validation (Sprint 149)
8. 🚀 **Beta GA Cutover** — v1.0.0-beta.1 tag + publish (Sprint 150, Apr 23 2026)

**Readiness score progression:**
- Sprint 132: 3.2/5 (baseline — 360° enterprise audit)
- Sprint 133: 3.6/5 (+0.4 security hardening, SHA-256 + AST)
- Sprint 134: 3.86/5 (+0.26 product vision ADR-033 + god split)
- Sprint 135: 3.93/5 (+0.07 operational hardening)
- Sprint 136: 3.925/5 (-0.005 regression offset, architectural win)
- Sprint 137: 3.94/5 (+0.015 verification protocol, 6/6 DONE)
- Sprint 138: 3.97/5 (+0.03 ADR governance + event stream, 11/11 DONE)
- Sprint 139: 3.99/5 (+0.02 RBAC + chain scheduler + backend parity)
- Sprint 141: 4.01/5 (+0.02 comprehensive codebase audit)
- Sprint 142: 4.03/5 (+0.02 deep source analysis, 16-section template)
- Sprint 143: 4.05/5 (+0.02 chain reform, error handling unification)
- Sprint 144: 4.07/5 (+0.02 god split cycle 2, ADR-008 enforcement)
- Sprint 145 target: 4.10/5 (adaptive timeout + observability + i18n)
- Sprint 146 target: 4.25/5 (dead code + config audit + CLI parity)
- Sprint 147 target: 4.45/5 (multi-provider beta-hardening)
- Sprint 148 target: 4.65/5 (cross-platform + plugin sandbox)
- Sprint 149 target: 4.85/5 (doc consolidation + npm dry-run)
- Sprint 150 target: 5.0/5 (🚀 Beta GA — npm publish, Apr 23 2026)

**Estimated time to Beta GA:** 5 sprints (Sprint 146-150, Apr 20-23 2026)
**Self-improving orchestrator: ✅ COMPLETE (Sprint 102+)**
**Memory V2 DB-first: ✅ COMPLETE (Sprint 140+)**

---

## Sources

### OpenClaw
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) — 343K+ stars (April 2026), MIT license
- [OpenClaw Architecture](https://docs.openclaw.ai/concepts/architecture) — Gateway, Brain, Memory, Skills, Heartbeat
- [OpenClaw 250K Milestone](https://openclaws.io/blog/openclaw-250k-stars-milestone) — Surpassed React in 60 days (March 3, 2026)
- [OpenClaw 335K Stats](https://openclawvps.io/blog/openclaw-statistics) — 2M MAU, 27M web visits, 1000+ contributors
- [OpenClaw Surpasses React](https://www.star-history.com/blog/openclaw-surpasses-react-most-starred-software) — Most-starred software project on GitHub
- [OpenClaw vs Claude Code](https://claudefa.st/blog/tools/extensions/openclaw-vs-claude-code) — Category difference analysis
- [ClawHub Skills](https://github.com/openclaw/clawhub) — 13,729 community skills, 65%+ MCP server wrappers
- [OpenClaw Security](https://thenewstack.io/openclaw-github-stars-security/) — Security concern analysis

### Microsoft Copilot Cowork
- [Cowork Launch](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/09/copilot-cowork-a-new-way-of-getting-work-done/) — Multi-model orchestrator (GPT + Claude critique)
- [Cowork Frontier](https://www.microsoft.com/en-us/microsoft-365/blog/2026/03/30/copilot-cowork-now-available-in-frontier/) — Anthropic collaboration, March 2026
- [Cowork Fortune](https://fortune.com/2026/03/09/microsoft-copilot-cowork-ai-agents-anthropic-e7-m365-saas/) — Enterprise details
- [Cowork SiliconANGLE](https://siliconangle.com/2026/03/30/microsoft-accelerates-agentic-automation-copilot-cowork-complex-workflows/) — Agentic automation

### Perplexity Computer
- [Perplexity Computer](https://www.perplexity.ai/hub/blog/introducing-perplexity-computer) — 19 models, $200/month
- [Perplexity VentureBeat](https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at/) — Launch details
- [Perplexity Enterprise](https://theaiinsider.tech/2026/02/28/perplexity-unveils-enterprise-focused-ai-agent-system-powered-by-multi-model-architecture/) — $325/seat/month
- [Perplexity vs OpenClaw](https://www.pymnts.com/artificial-intelligence-2/2026/perplexity-enters-autonomous-ai-race-with-launch-of-computer/) — Competition analysis
- [Perplexity Pricing](https://www.sentisight.ai/how-much-perplexity-computer-cost/) — 10K credits/month, spending limit

### Devin
- [Devin 2.0 VentureBeat](https://venturebeat.com/programming-development/devin-2-0-is-here-cognition-slashes-price-of-ai-software-engineer-to-20-per-month-from-500/) — $500 → $20 price drop
- [Devin Pricing](https://devin.ai/pricing) — Core $20/month, Team $500/month, ACU system
- [Devin Alternatives](https://www.augmentcode.com/tools/best-devin-alternatives) — Competitor analysis
- [Devin Review 2026](https://vibecoding.app/blog/devin-review) — v3.0 dynamic replanning, Compound AI

### Claude Ecosystem
- [Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) — Official agent infrastructure
- [Claude Computer Use](https://www.cnbc.com/2026/03/24/anthropic-claude-ai-agent-use-computer-finish-tasks.html) — Desktop automation
- [Claude Dispatch](https://claude.com/blog/dispatch-and-computer-use) — Phone → computer task flow
- [Claude Code Features](https://help.apiyi.com/en/claude-code-2026-new-features-loop-computer-use-remote-control-guide-en.html) — Loop, Schedule, Computer Use
- [AI Agents Comparison 2026](https://blog.iskohm.com/en/posts/ai-agents-comparison-2026-cursor-copilot-kilo-code-claude-code/) — Full comparison

### Claude Managed Agents (CMA)
- [CMA Overview](https://platform.claude.com/docs/en/managed-agents/overview) — Managed agent infrastructure (beta April 2026)
- [CMA Quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart) — Agent creation, sessions, streaming guide

## Sprint History
_No sprint history._

## Sprint 163 — Detailed Summary

**Theme:** Brain Stability Hattı SEALED
**Date:** May 11 2026
**Tasks:** 6 | **Status:** Complete (6/6 DONE, 0 NO_GO)

Brain processQueue + state freeze regression chain CLOSED. RETRO line cleanup applied. Zero NO_GO sealed Brain stability hattı after multi-sprint regression chain.

---

## Sprint 164 — Detailed Summary

**Theme:** Wave-Based Execution Semantics + ADR-045
**Date:** May 12-13 2026
**Tasks:** 6 | **Status:** GO_WITH_GATE_FAILURE (5/6 DONE + 1 phantom stub)

### Key Outcomes

- **ADR-045 Wave-Based Execution Semantics** accepted (45th ADR)
- **Wire code-complete:** `respawnEligibleTasks` 13 grep matches across sprint-controller chain
- **Runtime gated:** `dependency_pipeline_enabled: false` — wire ready, runtime disabled until Sprint 165 vitest gate close
- **Phantom stub:** 164-006 worker docker HB shutdown left as stub (not wired into runtime)
- **+14 new tests:** 8 wire validation + 6 integration

### Bugs Reproduced/Sleeping (Sprint 164 evidence)

- **Bug X (Sprint 156-011 stub):** Brain processQueue legacy FIFO stall **live-reproduced** in Sprint 164 — replay confirms stub still active
- **Bug W (Auditor `dead_event_stream`):** Dormant since Sprint 148 — queued for Sprint 165 wake & close
- **Vitest chronic +1 fail:** Persists since Sprint 159 — Sprint 165 T3 close target

### Sprint 165 Targets

- **T3:** Vitest gate cleanup (Bug Y close — chronic +1 fail since Sprint 159)
- **Bug X close:** Brain processQueue legacy FIFO stall — Sprint 156-011 stub replay close
- **Bug W close:** Auditor `dead_event_stream` wake & resolve
- **T5:** Documentation freeze (README, API ref, config ref final sync)
- **DeckentHub seed skills:** 20/20 publish target (Gate #15)
- **Goal:** 17/20 → 19/20 PASS

---

## Sprint 165 — Detailed Summary

**Theme:** Bug X/Y/Z/W Close + Documentation Freeze + npm publish prep
**Date:** May 13 2026
**Tasks:** 5 | **Status:** Complete (5/5 DONE, 0 NO_GO)

### Key Outcomes

- **T1 — Bug X stub removal:** sprint-156-011 stub closed; Brain processQueue legacy FIFO stall live-reproduced in Sprint 164 finally eradicated
- **T2 — Bug Y Sprint-Stall fix:** Sprint state freeze regression closed
- **T3 — Bug Z chronic vitest +1 fail:** Closed chronic regression since Sprint 159 — vitest gate clean
- **T4 — Bug W `dead_event_stream` activation:** Auditor dead_event_stream awakened, event emission live since Sprint 148 dormant
- **T5 — Docs freeze + public repo prep:** README, API ref, config ref final synchronization for Open Source GA path
- **npm publish v1.0.0-beta.1 prepared** — package ready for Sprint 168 GA cutover

### Forensic Outcome

Sprint 165 forensic baseline established for Sprint 166 root cause analysis:
- 4 deeper architectural bugs detected (Bug M, N, S, Y2) — became Sprint 166 P0 targets
- Token forensic baseline: 377K in+out + 514K cache = 891K grand total (5 tasks × ~75K avg)
- Manual recovery chain proven (kill → cleanup → recover → run → spawn)

---

## Sprint 166 — Detailed Summary

**Theme:** Brain Self-Update + Data Integrity Closure + ADR-046
**Date:** May 13-14 2026
**Tasks:** 11 | **Status:** Complete (10 DONE + 1 GO_WITH_TECH_DEBT, 0 NO_GO)

### Key Outcomes

4 architectural root causes from Sprint 164-165 forensic eradicated:

- **Bug M Fix (T1) — adrInsert hook + Step 3 wire:** `src/core/adr-file-sync.ts` new module (MADR v3 parsing + memory.db upsert); `identity-generator.ts` postFinalizeHooks chain — Step 3 (adrInsert) inserted, Step 4 (ruleRegen) renumbered. ADR-043/044/045/046 now flow into memory.db
- **Bug N Fix (T2) — onRuleRegen manual finalize path wire:** `cli/commands/finalize.ts:166` `finalizeSprint(...)` now passes `onRuleRegen` (Sprint 152+ manual finalize was leaving `.claude/rules/*.md` stale 13 sprints). Bonus Bug O: AUTO+CUSTOM block design fix
- **Bug S Fix (T3) — doc-cache sprint-aware cache key:** `doc-cache.ts` cache key extended `fileHash + entryHash + sprint.id` (Sprint 154+ managed-doc-runner per-sprint CLAUDE.md updates now active)
- **Bug Y2 Fix (T4) — 3-layer ground-truth defense:** Unit test + integration test + Auditor runtime (`verifyDocSyncGroundTruth`); whitelist via `.deckent/ground-truth-overrides.json` (agents_count=15 anchor, ADR-041 Sprint 148 reform stable)
- **Bug R+T Fix (T5):** AGENTS.md added to docs.json autoSections; identityRegen deprecated; 5 root .md files corrected (CLAUDE.md, DECKENT.md, README.md, README-TR.md, IDENTITY.md) — Sprint 164 commit `a4f3be4` mistaken agent count claim reverted to 15 (ground truth per ADR-041), former test taxonomy references removed
- **Bug U+V Fix (T6):** Sprint type insert restored post-Sprint 140; 100 debt entries `sprint_id` backfill via parseDebtMd regex; 9 sprint memory backfill (134, 140, 152, 157-161, 165)
- **Bug C+X Fix (T7):** DECKENT.md broken `.brain/DECISIONS.md` ref → `.brain/exports/decisions.md`; `memory-export.ts` summary debt filter `status != 'resolved'`
- **Bug P Fix (T8):** TOOLS.md/BOOT.md/WORKER-GUIDE.md auto-content generators wired (27 MCP tools + 56 CLI enumeration + verify-ran marker discipline + RBAC ADR-037)
- **Bug Q+W Fix (T9):** Provider parity (.codex/.gemini/.cursor frontmatter sync) + emitAlert helper (`src/monitor/alert-emitter.ts` +30 LoC) + stale_md detector (M4 monitoring source codepath)
- **Bug K+L Fix (T10):** verify-ran marker atomic write pattern (writeFileSync → renameSync); 3 stale doc test sprint count updates
- **T11 — ADR-046 Brain Self-Update Hook Architecture (Wave 1.5 bootstrap gate):** MADR v3 hybrid format, accepted; Step ordering contract (Step 1-5) documented; regression test for hook call order

### Metrics

- **LoC:** ~2735 net
- **New tests:** 35+ (vitest delta 0 fail — Sprint 165 GO_WITH_TECH_DEBT closure)
- **ADR count:** 45 → 46 (ADR-046)
- **maxWorkers:** 6
- **Plan structure:** 4-wave + bootstrap gate (Wave 1.5 strictly serial Alperen manual `npx deckent memory rebuild` CHECKPOINT)

### 4 New Bugs Detected → Sprint 167 P0

Sprint 166 surfacing 4 architectural follow-ups (Sprint 167 priority):

- **Bug E:** [Detected Sprint 166 — Sprint 167 forensic]
- **Bug G:** [Detected Sprint 166 — Sprint 167 forensic]
- **Bug Z2:** [Detected Sprint 166 — Sprint 167 forensic]
- **Bug Z3:** [Detected Sprint 166 — Sprint 167 forensic]

---

## Sprint 167 + 168 Timeline — Open Source GA Path

### Sprint 167 — Bug E+G+Z2+Z3 Fix + Dependency Pipeline Flip + M1-M4 Monitoring Baseline (May 15+ 2026)

- **4 new bugs fix:** Bug E, G, Z2, Z3 (detected during Sprint 166 forensic)
- **`dependency_pipeline_enabled: true` flip:** Wave scheduling goes live — Sprint 135 T-005 6th canlı dogfood (Sprint 167 anchor for DIRECTIVES)
- **Minimal 3-task multi-wave smoke:** First production wave scheduling validation
- **M1-M4 baseline tracking:**
  - **M1:** Cache key completeness (Bug S anchor monitoring)
  - **M2:** Rule regen (Bug N anchor monitoring)
  - **M3:** ADR insert (Bug M anchor monitoring)
  - **M4:** Stale-md detector (Bug W anchor monitoring)
- **Token cumulative >900K checkpoint policy:** Sprint 166 advisory → Sprint 167 P0 automatic blocker

### Sprint 168 — 🚀 Open Source GA Cutover (May 16+ 2026)

- **Public repo flip:** `VerhexIO/deckent` → `VerhexIO/deckent` (public)
- **npm publish v1.0.0-beta.2:** Tag, GitHub release
- **Show HN announcement:** Hacker News launch
- **Reddit + Twitter announce:** r/programming, r/MachineLearning, AI/dev Twitter
- **Community onboarding:** Issue templates, contribution guide, Discord channel live
- **Sprint 169:** VS Code extension adapter (T9 was OUT scope from Sprint 166)
- **Sprint 170:** ADR-046 refactor trigger evaluation (M1-M4 monitoring data review)

---

## Sprint 146 — Detailed Summary

**Theme:** Prompt God Template Reform + Critical Bug Fix + Rubric Consolidation
**Date:** Mon Apr 20 – Tue Apr 21, 2026
**Tasks:** 17 | **Waves:** 6 | **Status:** Active

### Sprint 146 Deliverables

**Wave 1 — Foundation (parallel):**
- T1: Agent Truncation Bug Fix — agent-pool.ts satır 29 kırpma kaldırıldı (full PROMPT.md yükleme)
- T2: Agent Routing V2 Retrain — intent classifier refresh, test-writer %52 → ≤%22
- T3: ADR Relevance Scoring Engine — adr-selector.ts, topN=3, age penalty
- T4: Scope Sanitizer — dist/ remove, global file protection, path deduplication

**Wave 2 — Build (parallel):**
- T5: Generative God Template — prompt-god-template.ts ~400 LoC, buildTaskPrompt() single entry
- T6: ADR Preset Matrix + Filler Cleanup — 7 task types, empty header suppression
- T7: Prompt Quality Linter — scripts/prompt-linter.mjs, exit code 0 avg ≥75/100

**Wave 3 — Bug Fix (parallel):**
- T8: DIRECTIVES Mid-Sprint Protection — phase guard, CLEANUP-only archiving
- T9: SDL Decision Log Rehab — v2-only logging, meaningful steps, deckent explain integration
- T10: Rubric System Consolidation — Quality Assessor canonical, worker self-report removed

**Wave 4 — Preflight (parallel):**
- T11: Sprint 145 vitest Regression Fix — 3 fail resolved, ≥99.3% pass
- T12: Nervous System Preflight — `src/core/nervous-types.ts`, ADR-040 status: proposed
- T13: Sprint 146 Retro + Docs — Sprint-146.md, CHANGELOG 0.4.0-beta.2

**Wave 5 — Integrate (parallel):**
- T14: Agent Exclusion Dynamic — getDynamicExclusions(), no more global hard-code
- T15: Chain Safety Gate — scripts/chain-gate-check.mjs, 6 gates

**Wave 6 — Docs (parallel):**
- T16: Living Record Update — FINAL-EXECUTIVE-REPORT.md sections 1/5/6/8 + append
- T17: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 146 append (this entry)

### Sprint 147 Preview — Nervous System

Sprint 147 theme: **Deckent Nervous System** — runtime authority enforcement + notification engine + safety floor.

- **nervous-types.ts** placeholder ready (Sprint 146 T12)
- **ADR-040** draft registered, status: `proposed` → `accepted` at Sprint 147 end
- Components: AuthorityMode, ApprovalPolicy, NervousNotification, SafetyFloorAction
- Design spec: `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`

**Beta GA path:** Sprint 146 ✅ → Sprint 147 ✅ → Sprint 148 ✅ → Sprint 149 🟡 → Sprint 150 🔵 (Thu 🚀 GA Apr 23)

---

## Sprint 148 — Detailed Summary

**Theme:** Meta-Dogfood + Agent Taxonomy Reform + Nervous Dogfood Activation + Cross-Platform Validation
**Date:** Mon Apr 20, 2026
**Tasks:** 28 | **Waves:** 6 | **Status:** Complete
**BETA-TRACKER Canonical Status:** Sprint 145 ✅ 146 ✅ 147 ✅ 148 ✅ 149 🟡 150 🔵

### Key Insights — Sprint 148

**Agent Taxonomy Reform (Breaking Change):**
- `test-writer` agent **removed** — 16 → 15 built-in agents
- Root cause: Sprint 145 %52, Sprint 146 %53, Sprint 147 **%95** anomaly (100% threshold exceeded)
- Fix: `testing-expert` skill now auto-activates when task scope includes `tests/**` or `*.test.ts`
- Intent 'testing' removed from classifier → 'test-coverage' tag replaces it
- Router V2 fallback chain: `core-dev → architect → refactorer` (no test-writer)

**Nervous System Live Activation:**
- `nervous_system.enabled = true` (balanced preset) — first production sprint
- Ana PID constraint enforced: `DECKENT_WORKER_MODE=1` check in all spawn scripts (ADR-037)
- All 5 detectors active: StaleWorker, ScopeCollision, DebtTrend, AgentRouting, DirectivesProtection
- `AgentRoutingHealth` severity downgraded: `critical` → `warning` (reform successful evidence)

**Cross-Platform Validation (Beta GA 1 day away):**
- macOS E2E (tmux): ✅ | Linux E2E (subprocess): ✅ | WSL2 E2E (Docker): ✅
- GitHub Actions matrix: `cross-platform-e2e.yml` added
- Node 18/20/22 fresh install: all pass
- i18n parity: TR/EN routing identical (8/8 test pairs)

**Vitest Triage:**
- Sprint 147 baseline: 135 fail
- Sprint 148 target: < 50 fail ✅

### Sprint 148 Deliverables Summary

| Block | Tasks | Theme | Status |
|-------|-------|-------|--------|
| A | T1-T5 | Agent Taxonomy Reform | ✅ 5/5 |
| B | T6-T13 | Nervous Dogfood Activation | ✅ 8/8 |
| C | T14-T19 | Cross-Platform Validation | ✅ 6/6 |
| D | T20-T28 | Polish + Debt + Docs | ✅ 9/9 |

### Sprint 149 Preview — Last Mile

Sprint 149 theme: **Last Mile** — npm publish + docs consolidation + ADR-041 accept.

- `npm publish v1.0.0-beta.1` (Sprint 148 dry-run rehearsed)
- ADR-041: Agent Taxonomy → proposed → **accepted**
- vitest fail: < 10 target
- **Beta GA 1 day to Sprint GA: Sprint 150 on Thu Apr 23 🚀**
