# A25 — Strategy, Benchmark, Design & Governance Audit

**Task:** 345-025  
**Sprint:** 345  
**Date:** 2026-06-28  
**Worker:** w-345-025  
**Scope:** `docs/comparison/`, `docs/benchmark/`, `docs/design/` (memory-v2, multi-project, web-console), `docs/governance/INDEX.md`

---

## Audit Scope

| Document | Audit Type |
|---|---|
| `docs/comparison/why-deckent.md` | Competitive/product claims |
| `docs/benchmark/memory-v2.md` | Benchmark numbers, date/method labeling |
| `docs/benchmark/provider-fleet-notes.md` | Benchmark claims / topology accuracy |
| `docs/design/memory-v2-full-export.md` | SHIPPED vs DESIGN-ONLY classification |
| `docs/design/multi-project-isolation.md` | SHIPPED vs DESIGN-ONLY classification |
| `docs/design/web-console/README.md` | SHIPPED vs DESIGN-ONLY classification |
| `docs/design/web-console/reference/README.md` | SHIPPED vs DESIGN-ONLY classification |
| `docs/governance/INDEX.md` | Link resolution |

---

## 1. Comparison — `docs/comparison/why-deckent.md`

### Verdict: CLEAN — no false claims, no unsubstantiated numbers

This is a pure product description document. It makes no numeric competitive comparisons against named third-party products. All capabilities it describes are grounded in shipped code:

| Claimed Capability | Code Evidence | Status |
|---|---|---|
| Mixed-fleet multi-provider execution | `src/orchestra/task-router.ts` (`routeTask`), `provider-fleet-notes.md` routing table | ✅ SHIPPED |
| Agent and Skill Pool with routing | `src/core/routing-engine.ts` (`routeTaskV2`), `src/core/agent-pool.ts`, `src/core/skill-pool.ts` | ✅ SHIPPED |
| DB-First Memory (SQLite SSOT) | `src/core/memory-store.ts`, `src/core/memory-export.ts`, `.brain/memory.db` | ✅ SHIPPED |
| ADR Governance (mandatory constraints) | 94 accepted ADRs in DB; injected into worker/brain prompts | ✅ SHIPPED |
| Dependency Wave Execution (Kahn's sort) | ADR governing dependency pipeline; `dependency_pipeline_enabled` flag | ✅ SHIPPED |
| Evolutionary Agent/Skill Pipeline | Agent stats tracking (`totalUses`, `successRate`) via `selectAgent()` | ✅ SHIPPED |
| Nervous System (proactive meta-orchestrator) | `src/nervous/`, ADR-040 | ✅ SHIPPED |
| Autonomous and Reactive Operation | Backlog-driven execution with authority matrix (ADR-040, ADR-079 surface routing) | ✅ SHIPPED |
| MIT Licensed | MIT license per project | ✅ VERIFIED |
| Open Source | Public-facing repository per `docs/release/public-repo-manifest.md` | ✅ VERIFIED |

**Action required:** None.

---

## 2. Benchmark — `docs/benchmark/memory-v2.md`

### Verdict: CLEAN — numbers properly labeled, claim is conservative

The document asserts a "96% context reduction" for Memory V2. Key findings:

**Date and method:** Explicitly labeled — sprint-286 (2026-06-14), reproducible `wc -c` commands provided.

**Measured figures:**

| Measurement | Result |
|---|---|
| Full generated corpus vs loaded context | 98.70% reduction |
| Conservative (vs `decisions.md` alone) | 98.45% reduction |
| Advertised headline claim | 96% |

**Honest qualifications present:**
- The 96% claim is a conservative floor; actual reproducible figures exceed it.
- The legacy V1 ("flat-file, load everything") baseline is explicitly excluded because no `pre-v2/` archive exists in the repository — the document does not assert a V1→V2 comparison it cannot reproduce.
- The "vs raw DB" angle (99.76%) is mentioned and correctly excluded from the headline as non-apples-to-apples.
- `summary.md` exceeding its 5000-char design target is disclosed.

**Action required:** None. The document is a model of how to write an honest benchmark.

---

## 3. Benchmark — `docs/benchmark/provider-fleet-notes.md`

### Verdict: CLEAN — not a benchmark, correctly disclaimed

This document opens with: _"These notes are qualitative and describe routing behavior only. They are not latency, cost, throughput, or quality benchmarks."_

All routing topology descriptions are accurate:

| Provider | Stated Route | Code Verification |
|---|---|---|
| Claude | Docker worker backend → Anthropic cloud via Claude CLI | `src/providers/claude.ts` → `src/orchestra/tmux.js` (Docker path) |
| Codex | Host `CodexAdapter` → OpenAI cloud via host `codex` CLI | `src/providers/` (host child process) |
| Gemini | Host `GeminiAdapter` → Google cloud via host `gemini` CLI | `src/providers/` (host child process) |
| Ollama | Host adapter → `localhost:11434` | `OllamaAdapter`, host-local daemon |
| OpenAI-compatible | In-process HTTP only, no spawn | HTTP-only adapter; no spawn path, `NO_GO` if spawned |

The `isAdapterProvider()` predicate and the `openai-compatible` HTTP-only restriction both match the codebase (ADR-010 Node built-in `fetch`; no spawn mode for HTTP adapter).

**Action required:** None.

---

## 4. Design Docs — SHIPPED vs DESIGN-ONLY Classification

### 4.1 `docs/design/memory-v2-full-export.md`

**Document self-label:** "Partially Implemented" / "This is a **spec for a future sprint**, not an immediate change."

| Component | Status | Evidence |
|---|---|---|
| 4-exporter base (`summary`, `decisions`, `memory`, `debt`) | ✅ **SHIPPED** | `src/core/memory-export.ts` — `exportSummaryMd`, `exportDecisionsMd`, `exportMemoryMd`, `exportDebtMd`; confirmed by `memory-v2.md` benchmark |
| `writeGuardedExports()` wipe-prevention guard | ✅ **SHIPPED** | Sprint 227; `sprint-finalizer.ts` calls `writeGuardedExports` |
| `exportAdrsToFs()` DB→FS ADR sync | ✅ **SHIPPED** | Sprint 169, ADR-046 Amendment; writes per-ADR `.md` to `docs/adr/` |
| Schema additive migrations (`tenant_id`, `audit_hmac`) | ✅ **SHIPPED** | Sprint 179 audit chain, multi-tenant support noted |
| `exportRetroMd` → `exports/retro.md` | ❌ **DESIGN-ONLY** | Spec §4.1; not yet implemented |
| `exportSprintsMd` → `exports/sprints.md` | ❌ **DESIGN-ONLY** | Spec §4.1; not yet implemented |
| `exportPatternsMd` → `exports/patterns.md` | ❌ **DESIGN-ONLY** | Spec §4.1; not yet implemented |
| `exportIdentityMd` → `exports/identity.md` | ❌ **DESIGN-ONLY** | Spec §4.1; not yet implemented |
| Registry-driven `runMemoryExport` | ❌ **DESIGN-ONLY** | Spec §4.1 Phase 2 |
| `deckent doctor` DB↔export parity check | ❌ **DESIGN-ONLY** | Spec §8 Phase 3 |

**Assessment:** Document self-labeling is accurate and honest. The SHIPPED/DESIGN split is correctly communicated in the document itself. No action required on the document's classification accuracy.

---

### 4.2 `docs/design/multi-project-isolation.md`

**Document self-label:** "Approved" (ADR-034 reference); explicit `⚠️ NOT YET IMPLEMENTED` callouts for unbuilt features.

| Component | Status | Evidence |
|---|---|---|
| `isWithinScope()` symlink-aware enforcement | ✅ **SHIPPED** | `src/agents/worker.ts:492` (Sprint 134) |
| Unit tests for symlink enforcement | ✅ **SHIPPED** | `tests/agents/worker.test.ts:559` (Sprint 134) |
| ADR-034 formal decision record | ✅ **SHIPPED** | In `.brain/memory.db` |
| Per-project HKDF credential encryption | ❌ **NOT IMPLEMENTED** | Flagged with `⚠️`; actual impl uses single global master key in `~/.deckent/.keyring` |
| `writeProjectConfig()` path validation | ❌ **NOT IMPLEMENTED** | Flagged with `⚠️`; `src/core/config.ts` uses `writeFileSync()` directly |
| Integration tests (cross-project filesystem) | ❌ **NOT IMPLEMENTED** | Flagged with `⚠️`; `tests/integration/` does not contain these |
| Hardlink inode comparison | ❌ **NOT IMPLEMENTED** | Listed as accepted known limitation |
| `isWithinScope()` path cache | ❌ **NOT IMPLEMENTED** | Future sprint roadmap |
| Security regression test suite automation | ❌ **NOT IMPLEMENTED** | Future sprint roadmap |

**Assessment:** Document is heavily annotated with ⚠️ markers and historical timestamps (2026-04-11 original, 2026-05-22 audit, 2026-06-14 update). Status labeling is clear and honest. No misleading claims.

---

### 4.3 `docs/design/web-console/README.md` (Handoff Spec)

**Document purpose:** A handoff spec directing workers to apply the teal/gold design to the real dashboard at `src/dashboard/`.

**Classification of the handoff document itself:** DESIGN-ONLY spec (instructions for implementing the design, not the implementation itself).

**Classification of what it describes:** The production implementation IS shipped.

| Component | Status | Evidence |
|---|---|---|
| Interactive web terminal (xterm.js) | ✅ **SHIPPED** | `src/dashboard/src/components/terminal/TerminalView.tsx` — uses `@xterm/xterm@5.5.0`, `@xterm/addon-fit@0.10.0` |
| WebSocket terminal sessions | ✅ **SHIPPED** | `useTerminalSocket.ts` — WebSocket to `/api/terminal/ws` with session attach |
| Terminal session management | ✅ **SHIPPED** | `TerminalPanel.tsx` — `createSession`, `killSession`, `listSessions`, `getBootstrapToken` |
| Teal/gold theme in terminal | ✅ **SHIPPED** | `TerminalView.tsx` xterm theme: `background: '#0a0f0e'`, `cursor: '#5fcaa9'`, matching handoff §5 |
| IBM Plex Mono in terminal | ✅ **SHIPPED** | `TerminalView.tsx` `fontFamily: '"IBM Plex Mono"...'` |
| Terminal availability guard | ✅ **SHIPPED** | `TerminalPanel.tsx:D7` — `terminalEnabled` gate; renders `null` when token absent |

**Caveat:** This audit verifies the terminal dock specifically. A full acceptance checklist audit (all shadcn color token replacements, Hanken Grotesk in all UI components, responsive behavior at ≤860px) is outside A25 scope and would require running the dashboard UI.

**Assessment:** The handoff README correctly describes the reference files as prototypes. The production terminal implementation is verifiably shipped. The document's own classification is DESIGN-ONLY-SPEC; the shipped output it describes is SHIPPED.

---

### 4.4 `docs/design/web-console/reference/README.md`

**Document self-label:** _"A high-fidelity, interactive recreation… Cosmetic, not production code, but pixel-faithful and click-through."_

| Item | Assessment |
|---|---|
| Reference files (App.jsx, Dashboard.jsx, Terminal.jsx, etc.) | ❌ **DESIGN-ONLY** prototype — HTML/CDN-based, mocked data, no production use |
| The dashboard they mirror (`src/dashboard/`) | ✅ **SHIPPED** (see 4.3) |
| Self-description accuracy | ✅ Accurate — correctly states cosmetic/prototype role |

**Assessment:** Correctly labeled. No action required.

---

## 5. Governance — `docs/governance/INDEX.md` Link Resolution

**Checked:** 2026-06-28

| Link | Target Path | Status |
|---|---|---|
| `FINAL-EXECUTIVE-REPORT.md` | `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` | ✅ EXISTS |
| `God Analysis FINAL-REPORT.md` | `.deckent/archive/sprints/misc/sprint-god-analysis/FINAL-REPORT.md` | ✅ EXISTS |
| `blueprint.md` | `docs/vision/blueprint.md` | ❌ **BROKEN** — file not found; `docs/vision/` contains `VISION.md`, `VISION-TR.md`, `roadmap.md`, `agentic-run-ecosystem.md` but not `blueprint.md` |
| `beta-tracker.md` | `docs/release/beta-tracker.md` | ❌ **BROKEN** — file not found; `docs/release/` contains `release-notes.md`, `release-checklist.md`, `roadmap.md`, etc. |
| `beta-tracker-tr.md` | `docs/release/beta-tracker-tr.md` | ❌ **BROKEN** — file not found; same directory |
| `DECKENT.md` | `DECKENT.md` (project root) | ✅ EXISTS |
| `IDENTITY.md` | `.deckent/workspace/IDENTITY.md` | ✅ EXISTS |
| `summary.md` | `.brain/exports/summary.md` | ✅ EXISTS |

**5 of 8 links resolve; 3 are broken.**

### Broken Link Analysis

**`docs/vision/blueprint.md`**  
The INDEX note says: _"Sprint 172 doc-reorg: `DECKENT-MASTER-BLUEPRINT.md` → `docs/vision/blueprint.md`"_  
The move was recorded in INDEX but the destination file does not exist. Either the rename was incomplete (the file was deleted but not placed at the new path) or the file was never created at `docs/vision/blueprint.md`.  
`docs/vision/VISION.md` (946 bytes) may be the intended document under a different name.

**`docs/release/beta-tracker.md` and `docs/release/beta-tracker-tr.md`**  
The INDEX note says: _"Sprint 172 doc-reorg: `BETA-TRACKER.md` → `docs/release/beta-tracker.md`"_ and similarly for TR.  
Neither file exists at the stated path. The `docs/release/` directory exists and contains 6 other files. These files either were not moved or were removed during the reorg.

### Required Actions (outside this task's filesWrite scope — flagged for Brain)

1. **Fix `docs/vision/blueprint.md`**: Determine if `docs/vision/VISION.md` is the renamed blueprint or if the original `DECKENT-MASTER-BLUEPRINT.md` was lost. Update INDEX link accordingly.
2. **Fix `docs/release/beta-tracker.md`**: Locate the original `BETA-TRACKER.md` in git history (`git log --all --full-history -- BETA-TRACKER.md`) and restore, or update INDEX to remove the dead reference.
3. **Fix `docs/release/beta-tracker-tr.md`**: Same as above for the TR variant.

> These link fixes require editing `docs/governance/INDEX.md`, which is **outside this task's `filesWrite` scope**. Flagged here for the next governance sprint.

---

## 6. Summary Table

| Document | Verdict | Issues |
|---|---|---|
| `docs/comparison/why-deckent.md` | ✅ CLEAN | None |
| `docs/benchmark/memory-v2.md` | ✅ CLEAN | None — numbers accurate, method labeled, claim conservative |
| `docs/benchmark/provider-fleet-notes.md` | ✅ CLEAN | None — correctly disclaimed as topology-only |
| `docs/design/memory-v2-full-export.md` | ✅ CLEAN | Status labeling accurate (Partially Implemented) |
| `docs/design/multi-project-isolation.md` | ✅ CLEAN | Status labeling accurate (⚠️ on each unimplemented item) |
| `docs/design/web-console/README.md` | ✅ CLEAN | Handoff spec; production terminal is SHIPPED |
| `docs/design/web-console/reference/README.md` | ✅ CLEAN | DESIGN-ONLY; correctly self-labeled |
| `docs/governance/INDEX.md` | ⚠️ 3 BROKEN LINKS | `blueprint.md`, `beta-tracker.md`, `beta-tracker-tr.md` missing |

---

## 7. Design Doc SHIPPED vs DESIGN-ONLY Master Table

| Feature | Doc Source | Status |
|---|---|---|
| Memory exports: summary/decisions/memory/debt | `memory-v2-full-export.md` | ✅ SHIPPED |
| `writeGuardedExports` wipe-prevention | `memory-v2-full-export.md` | ✅ SHIPPED |
| `exportAdrsToFs` per-ADR file sync | `memory-v2-full-export.md` | ✅ SHIPPED |
| Memory exports: retro/sprints/patterns/identity | `memory-v2-full-export.md` | ❌ DESIGN-ONLY |
| Registry-driven `runMemoryExport` | `memory-v2-full-export.md` | ❌ DESIGN-ONLY |
| `isWithinScope()` symlink enforcement | `multi-project-isolation.md` | ✅ SHIPPED |
| Per-project HKDF credential encryption | `multi-project-isolation.md` | ❌ NOT IMPLEMENTED |
| `writeProjectConfig()` path validation | `multi-project-isolation.md` | ❌ NOT IMPLEMENTED |
| Multi-project integration test suite | `multi-project-isolation.md` | ❌ NOT IMPLEMENTED |
| Web console: interactive terminal (xterm.js + WebSocket) | `web-console/README.md` | ✅ SHIPPED |
| Web console: teal/gold theme in terminal | `web-console/README.md` | ✅ SHIPPED |
| Web console: reference HTML prototype files | `web-console/reference/README.md` | ❌ DESIGN-ONLY prototype |

---

*A25 audit complete. No edits were made to source documents. Broken governance links require a separate fix sprint.*
