# Audit: src/agents/permission-guard.ts — Sprint 187 Per-File Pilot 50

**Audit date:** 2026-05-21
**Source LoC:** 219 (verified via `wc -l`)
**Test LoC:** 248 (`tests/agents/permission-guard.test.ts`)
**Special focus:** ADR-037 RBAC compliance (per task spec 186-007)

---

## 1. Inventory
- **Path:** `src/agents/permission-guard.ts`
- **LoC:** 219 (file ends at line 219; trailing blank counts give 220 by some tools — DIRECTIVES quoted 220)
- **First commit sprint:** Sprint 033 (introduced as part of the early Permission Guard / RBAC scaffolding)
- **Public exports:**
  - `type AgentRole = 'brain' | 'auditor' | 'worker'` — three-role taxonomy aligned with ADR-037.
  - `interface ModificationAttempt` — `{ agentId, agentRole, targetPath, action, timestamp }`. Canonical input record for guard checks.
  - `interface ValidationResult` — `{ allowed: boolean, reason: string }`. Uniform return shape.
  - `interface PermissionGuardFS` — Dependency-injection seam exposing `existsSync`, `readFileSync`, `appendFileSync`, `mkdirSync`. Enables test isolation.
  - `class PermissionGuard` — Primary export. Constructor `(projectRoot, { logDir?, fs? })`. Public methods: `validateAgentModification(attempt)`, `getLogPath()`. Four private rule-check methods + two helpers.
- **Direct imports:**
  - `node:fs` → `existsSync`, `readFileSync`, `appendFileSync`, `mkdirSync`
  - `node:path` → `join`, `resolve`, `normalize`, `sep`
  - **No project-internal imports.** Leaf module — zero coupling to deckent runtime code. (Confirmed via `grep "from ['\"]\.\." src/agents/permission-guard.ts`.)
- **Reverse dependencies (production):** **none.**
  - `grep -rn "from .*permission-guard" src/**/*.ts` → 0 matches.
  - Only consumer is `tests/agents/permission-guard.test.ts:2-3` (`import { PermissionGuard } from '../../src/agents/permission-guard.js'`).
- **Dead member:** `PermissionGuardFS.readFileSync` is declared on the interface and injected via `defaultFS` (lines 28, 33) but **never called** by the class body. Pure import-pull.

## 2. Bağlam (Architectural Context)
- **Layer:** Agent layer (`src/agents/`). Acts as a security/policy support module intended to gate filesystem mutations from worker/auditor processes.
- **Sub-system role:** File-path RBAC validator. Encodes four hard-coded rules:
  1. **No self-modification** — each role has a protected own-source path list (brain → `src/orchestra/brain.ts`; auditor → `src/monitor/auditor.ts`; worker → `src/agents/worker.ts`, `src/agents/worker-ipc.ts`).
  2. **No tool escalation** — `.claude/settings.json`, `.claude/settings.local.json`, `.mcp/` are brain-only.
  3. **Agent-config write monopoly** — only Brain may write into `PROTECTED_AGENT_PATHS` (`.claude/rules/`, `.deckent/workspace/`, `src/agents/`, `src/orchestra/brain.ts`, `src/monitor/auditor.ts`).
  4. **Auditor source-write ban** — auditor cannot write under `src/` or `tests/`.
- Blocked attempts are append-logged to `.deckent/logs/permission-guard.log` as one JSON object per line; FS access is dependency-injected so unit tests can swap a fake FS.
- **ADR-related:**
  - **ADR-037 (Brain-Auditor-Worker Authority Matrix RBAC V1.0)** — primary alignment target. ADR-037 V1.0 documents the runtime layer as **advisory/soft** with hard-flip slated for V2 post-GA (see CLAUDE.md gotcha "Scope enforcement … V1.0 Layer-2 kasıtlı eksik"). This file is the *intended* file-path-level enforcement vehicle for that V2 promotion, but it was never wired into a runtime callpath.
  - **ADR-038 (Dead Code Disposition)** — module was flagged as production-unwired in Sprint 171 god-analysis (`.deckent/archive/sprints/misc/sprint-god-analysis/src/agents/all-agents-analysis.md`). No promote/retire ADR entry has been committed since.
  - **ADR-008 (Brain Merkezi Import)** — compliant by construction; leaf module, no project imports.
  - **ADR-001 / ADR-002 (TypeScript + ESM, Node16)** — compliant; uses `node:fs`, `node:path` built-ins. Trivially satisfies `.js` suffix rule (no relative imports).
  - **ADR-006 (spawnSync Security Pattern)** — N/A; no subprocess spawning.

## 3. Debt Risk
| # | Risk Area | Severity | Evidence (file:line) | Recommendation |
|---|-----------|----------|----------------------|----------------|
| 1 | Production-dead module (zero runtime callers) | **high** | `src/agents/permission-guard.ts:57` (class export) vs. grep showing only test imports across `src/**/*.ts` | Decide promote-or-delete in Sprint 188 (P0) |
| 2 | Path-match brittleness in `_checkSelfModification` | medium | `src/agents/permission-guard.ts:132` — `targetPath.startsWith(ownPath.replace('.ts', ''))` substrings any file beginning with `src/agents/worker` (false-positive against `worker-utils.ts`, `worker-ipc.ts`, `worker-prompt-injector.ts`, future `worker*.ts`) | Use exact path match or a `Set<string>` lookup; remove the silent `.ts → ''` substring expansion |
| 3 | `readFileSync` declared on `PermissionGuardFS` but never invoked | low | `src/agents/permission-guard.ts:5`, `:28`, `:33` | Drop from interface + `defaultFS` if module is kept |
| 4 | Silent log failure (`catch {}`) hides operational issues | low | `src/agents/permission-guard.ts:215-217` | Emit one `console.warn` per process or surface via event-stream (ADR-035 verification channels) |
| 5 | Hard-coded `PROTECTED_AGENT_PATHS` / `TOOL_CONFIG_PATHS` lists | low | `src/agents/permission-guard.ts:41-53` | Move to `core/config.ts` 3-layer merge (ADR-004) so projects can extend per ADR-034 multi-project isolation |
| 6 | `_normalizePath` POSIX/Windows separator handling untested for `\\?\` UNC prefixes | low | `src/agents/permission-guard.ts:193-202` | Document supported input shapes in JSDoc once disposition decided |
| 7 | Self-mod table only lists `worker.ts` + `worker-ipc.ts` for the `worker` role | medium | `src/agents/permission-guard.ts:127` | Worker code is now spread across many files (`worker-lifecycle.ts`, `worker-verify.ts`, `worker-rollback.ts`, `worker-log.ts`); list is stale and would under-block under Option B |

## 4. Dead Code Candidates
- [x] **Class `PermissionGuard` (exported) — production zero-caller.** `grep -rn "PermissionGuard\|permission-guard" src/ --include="*.ts"` returns only `src/agents/permission-guard.ts` (self) and the log filename literal `'permission-guard.log'` at line 114. The only external consumer is `tests/agents/permission-guard.test.ts` — a textbook ADR-038 dead-export. Worker boundary checks live elsewhere (`src/orchestra/file-lock.ts`, scope checks in worker prompt). Auditor's `git diff --stat` is the de-facto live enforcement layer per CLAUDE.md gotcha.
- [x] **Interface member `PermissionGuardFS.readFileSync`** — declared and injected, never invoked anywhere in the class. Pure import-pull.
- [ ] No unreachable branches inside methods — each rule check is statically reachable through `validateAgentModification`.
- [ ] No `@deprecated` markers in the file.
- **ADR-038 cross-reference:** Sprint 171 god-analysis (`.deckent/archive/sprints/misc/sprint-god-analysis/FINAL-REPORT.md`) already enumerated PermissionGuard alongside the prompt-evolution sub-system + 4 other classes as "dead in production". Sprint 186 forensics (`docs/audits/sprint-186-forensics/src__agents__permission-guard.md`) re-raised the finding. No disposition entry has been committed to `.brain/exports/decisions.md`. This Sprint 187 pilot re-raises it a third time — still unresolved.

## 5. Documentation Gaps
- **Class-level JSDoc missing.** `class PermissionGuard` at line 57 has no `/** ... */` block; the only prose is the file-top header comment ("Validates agent modifications to prevent self-modification, tool escalation, and unauthorized changes. Only Brain can modify agent configurations.") which does not surface in IDE hover.
- **Interface-level JSDoc missing** on `AgentRole`, `ModificationAttempt`, `ValidationResult`, `PermissionGuardFS`. Each property lacks an inline doc comment, so consumers must read the source to learn that `targetPath` is expected absolute *or* relative-to-`projectRoot` (the `_normalizePath` helper accepts both, but this contract is undocumented).
- **`validateAgentModification` JSDoc partially complete** (lines 68-75) — the four numbered rules are listed, but the order of evaluation, the first-failure short-circuit, and the log-write side-effect are unstated.
- **No example invocation anywhere** in `docs/` showing how a runtime hook (worker pre-write, auditor pre-scan) would call `validateAgentModification`. Combined with §4, this contributes to the dead-wiring problem.
- **No mention of POSIX normalization contract** in `_normalizePath` JSDoc — Windows users would not know separators are collapsed to `/`.
- **Stale comment risk:** the line-3 header says "Only Brain can modify agent configurations" but the in-method comment at line 144 hedges with "Only Brain can modify tool configs, but even Brain should be careful" — language drift between two sources of truth.

## 6. ADR Compliance Check
| ADR | Relevant? | Compliant? | Evidence / Violation |
|-----|-----------|------------|----------------------|
| ADR-001 TypeScript + ESM | yes | ✅ yes | All types explicit; ESM-friendly imports (`node:fs`, `node:path`); no `require()`/CJS shims |
| ADR-002 Node16 (.js suffix on relative imports) | yes | ✅ yes (trivially) | Zero relative imports — nothing to suffix |
| ADR-004 3-Layer Config Merge | yes | ⚠ partial | Hard-codes path lists rather than reading config; acceptable today (unwired) but blocks ADR-034 extension under Option B |
| ADR-006 spawnSync Security Pattern | no | n/a | No subprocess invocation |
| ADR-007 SpawnOptions Interface | no | n/a | No subprocess invocation |
| ADR-008 Brain Centralized Import | yes | ✅ yes | Leaf module, no project imports; cannot create a cycle |
| ADR-010 Single Runtime Dependency (commander) | yes | ✅ yes | Uses only Node built-ins |
| ADR-034 Multi-Project Isolation | yes | ⚠ partial | `PROTECTED_AGENT_PATHS` / `TOOL_CONFIG_PATHS` constants are global, not per-project; undermines multi-project boundary if module is promoted |
| ADR-035 Verification Protocol Standard | yes | ❌ violation (silent) | Logs blocked attempts to a file but emits no verification-channel event for Brain/Auditor pipelines to observe |
| **ADR-037 Brain-Auditor-Worker Authority Matrix RBAC V1.0** | **yes (primary)** | ⚠ **partial — intent-aligned, runtime-unwired** | Module *implements* the RBAC rules ADR-037 prescribes (rule taxonomy maps 1:1 to ADR-037 role columns), but is **not wired into any runtime callpath**. Matches ADR-037's own carve-out: "runtime advisory/soft (V1.0 Layer-2 kasıtlı eksik) — ihlal warn+emit bloke ETMEZ, hard-flip V2 post-GA". This module is the obvious Layer-2 wiring target for V2 hard-flip. Until then, the live enforcement layer is Auditor `git diff --stat` (advisory) — PermissionGuard contributes **zero runtime enforcement** in V1.0 |
| ADR-038 Dead Code Disposition | yes | ❌ violation (unresolved) | Sprint 171 audit flagged module as dead; no disposition decision recorded across Sprints 172–186 |
| ADR-041 Agent Taxonomy | no | n/a | Module is infrastructure, not an agent/skill |
| ADR-046 Brain Self-Update Hook Architecture | yes | n/a | Brain self-update flow does not pass through this guard; could optionally integrate under Option B |

### ADR-037 RBAC Deep-Dive (task-specified focus)
- **Role taxonomy match:** `AgentRole = 'brain' | 'auditor' | 'worker'` is identical to ADR-037's three-role matrix. ✅
- **Authority columns:**
  - **Brain** — sole write access to `.claude/rules/`, `.deckent/workspace/`, `src/agents/`, `src/orchestra/brain.ts`, `src/monitor/auditor.ts`, and tool configs. ✅ encoded in `_checkAgentConfigModification` + `_checkToolEscalation`.
  - **Auditor** — read-only over `src/` and `tests/`. ✅ encoded in `_checkAuditorSourceWrite`.
  - **Worker** — fenced by `scope.filesWrite`; cannot self-modify `src/agents/worker*.ts`. ✅ partially encoded (only `worker.ts` + `worker-ipc.ts` listed — see §3 risk 7).
- **Self-modification ban:** ADR-037 requires that no agent rewrites its own source. Implemented in `_checkSelfModification` but with the line-132 prefix bug.
- **Runtime wiring (the only thing that matters for V2 hard-flip):** ❌ — `PermissionGuard.validateAgentModification` is never invoked in `src/`. ADR-037 V1.0's "warn+emit, bloke ETMEZ" contract is satisfied by Auditor `git diff --stat`, not by this class. **For ADR-037 to graduate to V2 "hard-flip" enforcement, this module must be wired into `src/orchestra/file-lock.ts` acquisition path and worker write hooks** — or the class must be deleted in favor of a redesigned mechanism.

## 7. Refactor Recommendations
1. **Disposition decision (delete vs. wire).** — `src/agents/permission-guard.ts:1` — Choose one of the following in Sprint 188 (P0). The current "implemented + tested + unwired" state is the worst-of-both: maintenance cost without enforcement benefit, and a misleading green signal to anyone grepping for ADR-037 RBAC.
   - **Option A — Delete.** Remove `src/agents/permission-guard.ts` + `tests/agents/permission-guard.test.ts`. ADR-037 V1.0 already accepts advisory enforcement; Auditor `git diff --stat` covers boundary violations operationally. ~1-day effort, no behavioral change.
   - **Option B — Wire.** Inject `PermissionGuard` into the worker write path (`src/orchestra/file-lock.ts` `acquireLock` precheck and/or `src/agents/worker.ts` pre-write hook) and into Brain's task-builder scope materialization. Emit a `DECKENT→AUDITOR:PERMISSION_DENIED` verification-channel event per ADR-035. ~3-5 day effort with cascade on existing soft-mode tests; advances ADR-037 toward V2 hard-flip.
2. **Fix `_checkSelfModification` prefix bug.** — `src/agents/permission-guard.ts:132` — Replace `targetPath.startsWith(ownPath.replace('.ts', ''))` with `targetPath === ownPath` (or use a `Set<string>` lookup against explicit paths). The current pattern over-blocks any file starting with `src/agents/worker` (e.g. `worker-utils.ts`, `worker-prompt-injector.ts`). Only meaningful under Option B; low effort.
3. **Update worker self-path list.** — `src/agents/permission-guard.ts:127` — Add `src/agents/worker-lifecycle.ts`, `worker-verify.ts`, `worker-rollback.ts`, `worker-log.ts` to the `worker` self-path list, otherwise `_checkSelfModification` under-blocks (issue is masked by §7-2 prefix bug; both fixes must land together). Only meaningful under Option B.
4. **Remove dead `readFileSync` from `PermissionGuardFS`.** — `src/agents/permission-guard.ts:28`, `:33` — Drop the unused FS member. Trivial effort. Only meaningful under Option B; under Option A the file disappears.
5. **Move path lists to `core/config.ts`.** — `src/agents/permission-guard.ts:41-53` — If promoted, expose `protectedAgentPaths` and `toolConfigPaths` through the 3-layer config merge (ADR-004) so user projects can extend per ADR-034 multi-project isolation. Medium effort (schema update + migration note).
6. **Emit verification-channel events on block.** — `src/agents/permission-guard.ts:204-218` — Replace silent `catch {}` log fallback with a typed event publication into the event-stream so Auditor and dashboards see denials in real time per ADR-035. Medium effort; gated on Option B.
7. **Add class-level + interface-level JSDoc.** — `src/agents/permission-guard.ts:25-66` — Document targetPath contract (absolute or relative-to-root), evaluation order, side-effect (log write), example call site. Low effort. Gated on Option B.

## 8. Sprint 188 Follow-up Items
- [ ] **P0** — Disposition decision (Option A delete vs. Option B wire). Record outcome as an ADR-038 entry in `.brain/exports/decisions.md` so the same finding does not re-surface in Sprint 189's audit (it has already re-surfaced three times: Sprint 171 god-analysis, Sprint 186 forensics, this Sprint 187 pilot).
- [ ] **P0** — If Option B chosen, wire `PermissionGuard.validateAgentModification` into `src/orchestra/file-lock.ts` (`acquireLock` precheck) and `src/agents/worker.ts` pre-write hook; add event-stream emission per ADR-035. Required step on the ADR-037 V1.0 → V2 hard-flip path.
- [ ] **P1** — Fix `_checkSelfModification` prefix bug at line 132 + update worker self-path list at line 127. Only required under Option B but trivial to land regardless if the module is kept.
- [ ] **P1** — Drop `readFileSync` from `PermissionGuardFS` interface + `defaultFS` (lines 28, 33). Only required under Option B.
- [ ] **P2** — Add class + interface JSDoc with usage example pointing to the wired call site. Only required under Option B.
- [ ] **P2** — Hoist `PROTECTED_AGENT_PATHS` / `TOOL_CONFIG_PATHS` into `core/config.ts` schema with project-level override (ADR-034). Only required under Option B.
- [ ] **P2** — If Option A chosen, also remove `tests/agents/permission-guard.test.ts` (~248 lines of test infra freed) and update `.deckent/archive/sprints/misc/sprint-god-analysis/` reference list to mark the file as RETIRED.

## 9. Summary
- **Overall health:** **dead-code-candidate** (high-confidence; verified through three independent audits).
- **ADR-037 RBAC compliance (task focus):** intent-aligned but **runtime-unwired** — this is the most important finding. The module faithfully encodes the ADR-037 role matrix (brain/auditor/worker) and the four authority rules, but contributes **zero runtime enforcement** because nothing in `src/` calls it. Under ADR-037 V1.0 the soft/advisory contract is satisfied by Auditor `git diff --stat`, so PermissionGuard is a no-op today. For the V2 post-GA hard-flip, this module is the natural wiring target — but only if Sprint 188 commits to keeping it.
- **Top 3 priorities:**
  1. **Decide disposition (P0).** The module has been "implemented + unit-tested but unused" since Sprint 033 (~150 sprints). Sprint 171, Sprint 186 forensics, and this Sprint 187 pilot have all flagged it. Continuing to carry it without wiring contradicts ADR-038 and gives a false sense of ADR-037 coverage. Sprint 188 must commit to Option A (delete) or Option B (wire).
  2. **If Option B (wire), fix the prefix-match bug (P1) and refresh the worker self-path list (P1).** Line 132's `startsWith(ownPath.replace('.ts', ''))` over-blocks any `worker*` file, while line 127 only lists 2 of 6+ current worker files — both bugs cancel each other today only because the module is unwired.
  3. **If Option B (wire), surface block events via ADR-035 verification channels (P2).** Today blocks land only in `.deckent/logs/permission-guard.log` and silently swallow log failures — Auditor and dashboards see nothing. For a security-critical guard, this is unobservability.
