# ADR-D-004: Layer-1 Import Direction (Brain-Family Boundary)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=`authority-enforcer.ts` (ADR-008 check) scans **`core/ → orchestra/` only**, advisory/soft per ADR-G-020 V1.0 — warns + emits, no hard-block; the other Layer-1 edges are contract invariants **not yet scanned** → tomorrow=LAYER-1 inversion cleanup + exception registry (data-file) + extend scan to all edges + hard-flip under the ADR-G-020 enforcement-engine
**Status:** accepted (provisional — closes when LAYER-1 cleanup + exception registry + hard-gate land) · **Date:** 2026-06-30 · **Absorbs:** ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) · **Supersedes:** —
**Crosswalk:** ADR-008 → ADR-D-004; role-separation split out → ADR-G-020

> **Scope note:** This ADR owns **import direction / Layer-1 boundaries / sanctioned import exceptions / graph-level enforcement only**. The "Brain orchestrates but never authors code" *role-separation* concern was split out during the 2026-06-30 review and now lives in **ADR-G-020** (Authority Matrix, Rule-4 / ROLE-GUARD). Do not put role-separation here.

> **Format note:** the immutable core lives in the **Contract** section — the `Immutable:` taxonomy flag stays the ADR-D binary `no` (dev conventions evolve; ADR-G-019), and the Contract carries the stronger-than-typical-D stability in prose. Lean `C1–C7` list, symmetric with ADR-D-002's house style — not a verbose I1–I8 block.

---

## Context

Cyclic imports across architectural layers are an **architecture hazard** — *not* language-spec "undefined behavior." Node.js ESM resolves cycles deterministically (live bindings, depth-first evaluation), but a cross-layer cycle produces fragile semantics: a `const`/`class` export read before its module finishes evaluating throws a TDZ `ReferenceError`; `function` hoisting masks the same bug intermittently; CJS/ESM interop adds further edges. Deckent therefore forbids cycles that cross Layer-1 boundaries even when the module system can technically represent them.

Deckent's layering avoids cycles by a strict one-way dependency direction: orchestration imports lower layers; lower layers never import upward. The original ADR-008 stated this as "Brain is the only module that imports tmux/auditor/worker," verified by a `from.*brain` grep. That phrasing aged twice. First, the god-object split (ADR-D-006, ex-024/026) deliberately broke the monolithic Brain into many `sprint-*` organs — so "the only importer" is no longer a single file. Second, the *real* enforced invariant is broader and more precise than the original grep, and code drift left genuine inversions. This record restates the rule as a **Layer-1 import-direction contract** against today's module map and tracks the residual violations as cleanup.

---

## Contract (immutable — import-direction core)

Enforcement tooling, family membership, and cleanup work-items may evolve; the invariants below MUST hold until a superseding ADR explicitly revokes them.

**C1 — Lower layers never import upward.** `core/` MUST NOT import `orchestra/`, `cli/`, `api/`, or `mcp/`. `core/` owns reusable domain/runtime primitives and stays independent of orchestration and delivery surfaces.

**C2 — Orchestration does not depend on surfaces.** `orchestra/` MAY import `core/`, but MUST NOT import `cli/`, `api/`, or `mcp/`.

**C3 — Surfaces are thin and non-cross-importing.** `cli/`, `api/`, `mcp/` MAY call `core/` and approved `orchestra/` entrypoints, but MUST NOT host reusable business logic, and MUST NOT import one another (`api/ ↔ cli/`, `mcp/ ↔ cli/`, `mcp/ ↔ api/`) except as an explicitly whitelisted migration shim.

**C4 — Brain-family is an explicit allowlist.** Only the listed Brain-family modules may import `tmux` / `auditor` / `worker` internals. Membership is **never** inferred from directory, filename, or `sprint-` prefix. A file under `src/orchestra/` is not family by location. New members require an ADR-D-004 amendment or a tracked governance work-item.

**C5 — Provider-adapter exception is narrow + registered.** Provider CLI-spawn adapters MAY wrap approved `tmux` / `spawn-backend` symbols. They MUST NOT import `auditor`, `worker`, or `sprint-*` internals, nor mutate orchestration state directly. Every such exception lives in the **exception registry**; no registry entry → no import.

**C6 — No Layer-crossing cycles.** See *Context*. Cross-Layer-1 cycles are forbidden by construction, not merely discouraged.

**C7 — Mechanical enforcement is authoritative.** ADR prompt-recall and reviewer warnings are advisory ergonomics. The canonical target is a **graph-level import-direction gate** that fails before merge once ADR-G-020 hard-flips. Until then the invariant is documentation + warn-level signal on a single edge.

---

## Decision (Today)

### 1. The one-way Layer-1 model

```
core  ←  orchestra  ←  { cli · api · mcp }
                ↑
         providers/ (capability adapters — see §3; placement TBD, see Roadmap)
```

The arrow means **"may depend on."** Lower layers do not import upward.

- **`core/`** — reusable runtime/domain base (no orchestration, no surface deps).
- **`orchestra/`** — Brain-family orchestration: worker coordination, spawning, planning, lifecycle, result collection/evaluation, debt/resource management, approved internals.
- **`cli/` · `api/` · `mcp/`** — delivery surfaces; thin; no shared business logic; no cross-surface imports.

### 2. What is actually scanned today (be precise)

The live check in `src/orchestra/authority-enforcer.ts` (`checkAdr008`) currently enforces **the most critical boundary only**: `core/ → orchestra/` is forbidden. Per ADR-G-020 V1.0 it is **advisory/soft** — warns + emits an audit signal, does not block merge. The remaining Layer-1 edges (`core/ → {cli,api,mcp}`, `orchestra/ → {cli,api,mcp}`, surface↔surface) and the Brain-family `tmux`/`auditor`/`worker` allowlist are **contract invariants but not yet machine-scanned** — they are tracked as the LAYER-1 cleanup items below. Extending the scan to all edges is W6.

### 3. Brain-family allowlist + sanctioned exceptions

**Brain-family (allowlist)** = `sprint-controller` + extracted phase/helper organs (`sprint-phases`, `sprint-spawner`, `sprint-lifecycle`, `sprint-planner`, `sprint-finalizer`, `sprint-utils`, `result-collector`, `result-evaluator`, `debt-manager`, `resource-monitor`) + spawn abstractions (`spawn-backend`, `spawn-backend-docker`) + thin compatibility re-export shims (`brain.ts`, `index.ts`). Only these may import `tmux` / `auditor` / `worker`. The one-way principle is invariant: **tmux/auditor/worker never import brain; `core/` never imports any upper layer.**

**Sanctioned exceptions (registry — canonical form is a data file the enforcer reads, D004-W5; this table is the mirror):**

| ID | From | To | Allowed symbols | Reason | Owner | Expiry |
|---|---|---|---|---|---|---|
| D004-E1 | `src/providers/claude.ts` | `orchestra/tmux.js` | `killWorker`, `listWorkers`, `ensureSession`, … | CLI-spawn adapter wrapping the tmux/spawn-backend arm (ADR-G-008 + ADR-027→ADR-G-014) | Brain-family | permanent / reviewed |
| D004-E2 | `orchestra/event-stream.ts` | `core/event-stream.ts` | `export *` re-export (+1 local channel-const) | compatibility shim after the Sprint-279 move of event-stream into `core/` | Core owner | review / remove candidate |

> Rule: a provider adapter may wrap `tmux`/`spawn-backend`; it may **never** import `auditor`/`worker`; the one-way direction still holds.

**Resolved cycle (Sprint 279):** the `core/audit-writer` + `core/audit-query` → `orchestra/event-stream` cycle was fixed by **moving `event-stream` into `core/`** (`src/core/event-stream.ts`); `orchestra/event-stream.ts` is now the re-export shim above (D004-E2, `export * from '../core/event-stream.js'`). This is the precedent for §Roadmap's capability-relocation direction (W8) — and for the i18n-helper relocation (W9).

### 4. Routing / anchoring

The canonical refined statement of these import rules also lives in `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules) — advisory ergonomics, with the gate (C7) as the source of truth.

---

## Intent / Roadmap (Tomorrow)

**LAYER-1 inversion cleanup** — advisory enforcement let genuine inversions persist; each is tracked. Code-grounded census (2026-06-30): `core/ → orchestra/` = **1**, `core/ → cli/` = **1**, `orchestra/ → cli/` = **5**, `api/ → cli/` = **6**.

| ID | Prio | Work | Acceptance |
|---|---|---|---|
| ADR-008-W | P0 | `core/routing-engine.ts:32` imports `analyzeSkillInMemory` from `../orchestra/ecosystem-intelligence.js` — the one remaining `core/ → orchestra/` import. Move the function into `core/` or invert the dependency. | `core/ → orchestra/` = zero |
| CORE-W1 | P0 | `directive-interrogator.ts:18` — the one `core/ → cli/` violation. It is a `getMessage` import → **resolved by W9** (messages.ts → core), not a bespoke logic-move. | `core/ → cli/` = zero |
| ORCH-W1 | P0 | `orchestra/ → cli/` = 5 files. **Logic-inversions:** `task-mode-runner.ts:18-19 → cli/commands/run + spawn` (the ~302-LoC `spawnWorkerMultiProvider` lives in `cli/commands/spawn.ts:48`; move spawn logic into orchestra, CLI a thin wrapper) + `sprint-finalizer.ts:105` / `sprint-phases.ts:93 → cli/helpers` (rich-summary / splash presentation). **i18n pair:** `mission-deliver.ts:1` + `flow-reporter.ts:7` are `getMessage` imports → **resolved by W9**, not spawn-relocation. | `orchestra/ → cli/` = zero (spawn+presentation relocated; i18n via W9) |
| API-W1 | P1 | systemic `api/ → cli/` = 6 files (docs-health, nervous, process, coverage, chat-stream, server); business logic belongs in core/orchestra; cli/api/mcp are thin surfaces. | api + cli share core/orchestra services; `api/ → cli/` = zero |
| D004-W9 | P1 | **i18n root-cause (MESSAGES-CORE).** `getMessage` lives in `cli/helpers/messages.ts` but `core/`+`orchestra/` need it — **3 upward-imports** (`directive-interrogator` + `mission-deliver` + `flow-reporter`). Move `messages.ts` → `core/` (down-layer); one architectural fix dissolves CORE-W1 **and** the 2 ORCH-W1 i18n-edges. Links LOCALE-W / i18n-architecture. | `messages.ts` in `core/`; the 3 i18n upward-edges = zero |
| D004-W5 | P1 | **Exception registry as data-file** — machine-readable allowlist (symbols, reason, owner, expiry) the enforcer reads; ADR table mirrors it. | registry file exists; enforcer consumes it; "no entry → no import" |
| D004-W6 | P1 | **Hard graph gate + full-edge scan** — extend the advisory scan to all Layer-1 edges + the Brain-family allowlist, and hard-flip to merge-block once ADR-G-020's enforcement-engine graduates (ADR-094 flag-gated vein → default-on). | all edges scanned; new violation fails before merge |
| D004-W7 | P2 | re-export shim audit — shims hold no logic; new imports target the owning layer; long-lived shims carry an expiry rationale. | shim inventory clean; D004-E2 resolved or justified |
| D004-W8 | P2 (candidate) | **Capability relocation (dissolves D004-E1)** — move `tmux` / `spawn-backend` out of `orchestra/` into `core/` (or a new `runtime/` capability layer), mirroring the Sprint-279 event-stream move. Then provider adapters import *downward* and the exception disappears. Requires first locating `providers/` in the Layer-1 model. | exception D004-E1 removable; provider→capability is a downward edge |

When ADR-G-020's enforcement-engine graduates, the advisory import check **hard-flips** to a blocking gate (W6).

---

## Consequences

**(+)** Clean, cycle-free one-way Layer-1 model; a precise, code-verified census of which modules invert (1 + 1 + 5 + 6 edges); thin cli/api/mcp surfaces with business logic concentrated in core/orchestra; the god-object split is reconciled (its organs are allowlisted family, not violations); the cyclic-imports rationale is now technically accurate (ESM-deterministic / TDZ); the provider exception is registered and has a strategic dissolution path (W8); the i18n root-cause is identified — 3 of the inversions collapse into one `messages.ts → core` move (W9).

**(−)** Provisional: enforcement is advisory and **covers only the `core/ → orchestra/` edge today** — the other three Layer-1 edges + the Brain-family allowlist are contract invariants with no machine scan yet (extended in W6). Real inversions remain open (ADR-008-W, CORE-W1, ORCH-W1, API-W1; W9 dissolves 3 of those edges). The provider exception is a tactical patch until W8 relocates the capability. Until the G-020 engine hard-flips, the invariant is documentation + warn-level signal on one edge, not a blocking gate.

---

## References / Absorbed

- **Absorbs:** ADR-008 (one-way import direction; Brain-family definition; sanctioned provider-adapter exception; Sprint-279 event-stream cycle-fix).
- **Split out:** role-separation ("Brain never authors code") → **ADR-G-020** (Authority Matrix Rule-4 / ROLE-GUARD).
- **Cross-ref:** ADR-D-006 (the god-object split created the Brain-family organs) · ADR-G-014 (Spawn Backend — provider-adapter wrapping) · ADR-G-008 (provider adapters) · ADR-027→ADR-G-014 (hybrid spawn) · ADR-094 (enforcement-engine flag-gated vein) · ADR-G-019 (ADR-D contributor convention under the taxonomy) · LOCALE-W / ADR-G-004 (i18n-architecture — the `messages.ts` relocation, W9).
- **Born work-items:** ADR-008-W · CORE-W1 · ORCH-W1 · API-W1 (LAYER-1 inversion cleanup) · D004-W9 (MESSAGES-CORE i18n root-cause) · D004-W5 (exception-registry data-file) · D004-W6 (hard graph gate + full-edge scan) · D004-W7 (shim audit) · D004-W8 (capability relocation, candidate).
- **Direction / anchoring:** `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules); `src/orchestra/authority-enforcer.ts` (`checkAdr008` — the live core→orchestra check).
