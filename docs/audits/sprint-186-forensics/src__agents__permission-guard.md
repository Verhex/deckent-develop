# Audit: src/agents/permission-guard.ts — 2026-05-21

## 1. Inventory
- **LoC:** 219
- **Last modified (git log -1 --format=%cs):** 2026-03-22
- **First commit sprint:** Sprint 033 (2026-03-22, "feat: Sprint 033 — Integration tests, skill marketplace, adaptive agent advanced, analytics, performance")
- **Public exports:**
  - `type AgentRole = 'brain' | 'auditor' | 'worker'` — three-role taxonomy aligned with ADR-037
  - `interface ModificationAttempt` — `{ agentId, agentRole, targetPath, action, timestamp }`, the canonical input record for guard checks
  - `interface ValidationResult` — `{ allowed: boolean, reason: string }`, uniform return shape
  - `interface PermissionGuardFS` — FS dependency-injection surface (`existsSync`, `readFileSync`, `appendFileSync`, `mkdirSync`); enables test isolation
  - `class PermissionGuard` — primary export; constructor `(projectRoot, { logDir?, fs? })`; methods `validateAgentModification(attempt)`, `getLogPath()` plus four private rule checks
- **Direct imports:**
  - `node:fs` → `existsSync`, `readFileSync`, `appendFileSync`, `mkdirSync`
  - `node:path` → `join`, `resolve`, `normalize`, `sep`
  - **No project-internal imports** (zero coupling to deckent code), matching ADR-008 (Brain-centralized import) by being a leaf module.
- **Reverse dependencies (`grep -rn "permission-guard\|PermissionGuard" src/ tests/ --include="*.ts"`):**
  - `tests/agents/permission-guard.test.ts` (lines 2-3, 7, 31, 37, 48, 59, 71, 81, 91, ...) — exclusive caller of `PermissionGuard`
  - `src/agents/permission-guard.ts:114` — self-reference to `'permission-guard.log'` log filename
  - **Zero production callers in `src/`** — no `worker.ts`, `auditor.ts`, `brain.ts`, `file-lock.ts`, `sprint-controller.ts`, or any other runtime path imports `PermissionGuard`.
- **PermissionGuardFS surface drift:** `readFileSync` is declared on the interface and re-injected via `defaultFS`, but the class body never calls `this.fs.readFileSync`. It is import-pull only — dead member.

## 2. Bağlam (Architectural Context)
- **Layer:** Agent layer (`src/agents/`) — security/policy support module intended to gate filesystem mutations from worker/auditor processes.
- **Sub-system role:** File-path RBAC validator. Encodes four hard-coded rules — (a) no self-modification (each role has a protected own-source path list), (b) no tool escalation (`.claude/settings.json`, `.claude/settings.local.json`, `.mcp/` are brain-only), (c) only Brain can write into `PROTECTED_AGENT_PATHS` (`.claude/rules/`, `.deckent/workspace/`, `src/agents/`, `src/orchestra/brain.ts`, `src/monitor/auditor.ts`), (d) auditor cannot write under `src/` or `tests/`. Blocked attempts are append-logged to `.deckent/logs/permission-guard.log` as one JSON object per line. FS access is dependency-injected for unit tests.
- **ADR-related:**
  - **ADR-037 (Brain-Auditor-Worker Authority Matrix — RBAC V1.0):** This file is the *intended* file-path-level enforcement vehicle. Sprint 171 god-analysis explicitly flagged that ADR-037 V1.0 documents the runtime layer as **advisory/soft** with hard-flip slated for V2 post-GA — and PermissionGuard never got runtime wired, matching that ADR carve-out. See `.brain/exports/decisions.md` ADR-037 description and CLAUDE.md "Scope enforcement" gotcha ("V1.0 Layer-2 kasıtlı eksik").
  - **ADR-038 (Dead Code Disposition — Sprint 139 Audit Results):** PermissionGuard was identified as production-unwired in Sprint 171 (see `.deckent/archive/sprints/misc/sprint-god-analysis/FINAL-REPORT.md:386` and `tests/remaining.md:77`). No promote/retire decision has been committed since.
  - **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık):** Compliant by construction — leaf module, no project imports.
  - **ADR-001 / ADR-002 (TypeScript + ESM, Node16 .js suffix):** Compliant — uses `node:fs`, `node:path` built-ins; would need `.js` suffix on any cross-module import (none present, so trivially satisfied).
  - **ADR-006 (spawnSync Security Pattern):** N/A — no subprocess spawning here.

## 3. Debt Risk
| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| Production-dead module (zero runtime callers) | high | `src/agents/permission-guard.ts:57` (class export) vs. grep showing only test imports | Decide promote-or-delete in Sprint 187 (P0) |
| Path-match brittleness in `_checkSelfModification` | medium | `src/agents/permission-guard.ts:132` — `targetPath.startsWith(ownPath.replace('.ts', ''))` substrings everything beginning with `src/agents/worker` (e.g. `src/agents/worker-utils.ts`, `src/agents/worker-ipc.ts`, `src/agents/worker-prompt-injector.ts`, future `src/agents/workerpool.ts`); false-positive scope | Use exact path match or a `Set<string>` lookup; treat extension stripping as opt-in |
| `readFileSync` declared in `PermissionGuardFS` but never called | low | `src/agents/permission-guard.ts:5`, `:28`, `:33` | Drop from interface + `defaultFS` if the module is kept (otherwise resolved by deletion) |
| Silent log failure (`catch {}`) hides operational issues | low | `src/agents/permission-guard.ts:215-217` | Emit a single `console.warn` once per process, or surface via event-stream (ADR-035 verification channels) |
| Hard-coded `PROTECTED_AGENT_PATHS` / `TOOL_CONFIG_PATHS` lists | low | `src/agents/permission-guard.ts:41-53` | If runtime-wired, move to `core/config.ts` so projects can extend per `ADR-034` multi-project isolation |
| `_normalizePath` POSIX/Windows separator handling is correct but untested for `\\?\` prefixes | low | `src/agents/permission-guard.ts:193-202` | Document supported input shapes in JSDoc once disposition decided |

## 4. Dead Code Candidates
- [x] **Class `PermissionGuard` (exported) — production zero-caller.** Grep across `src/**/*.ts` returns no `import { PermissionGuard }` or `from '.*permission-guard'` outside the class file itself. The only consumer is `tests/agents/permission-guard.test.ts`. This is a textbook ADR-038 dead-export: tests prove correctness of a module that is never wired into the runtime control path.
  - Evidence: `grep -rn "PermissionGuard" src/ --include="*.ts"` returns only `src/agents/permission-guard.ts` (self) plus the log filename. Worker boundary checks live elsewhere (`src/orchestra/file-lock.ts`, scope checks in worker prompt). The Auditor's `git diff --stat` boundary-violation detection is the live enforcement layer per CLAUDE.md gotcha.
- [x] **Interface member `PermissionGuardFS.readFileSync`** — never invoked (see §1). Pure import-pull.
- [ ] No unreachable branches inside methods themselves — each rule check is statically reachable through `validateAgentModification`.
- [ ] No deprecated markers (no `@deprecated` JSDoc anywhere in the file).
- **ADR-038 cross-reference:** Sprint 171 god-analysis (`.deckent/archive/sprints/misc/sprint-god-analysis/`) already enumerated PermissionGuard alongside the prompt-evolution sub-system + 4 other classes (genealogy/retirement/cross-sprint/drift) as "dead in production". No disposition entry has been committed to `.brain/exports/decisions.md` since. This audit re-raises the finding 2 sprints later, still unresolved.

## 5. Documentation Gaps
- **Class-level JSDoc missing.** `class PermissionGuard` at line 57 has no `/** ... */` block; the only prose is the file-top header comment ("Validates agent modifications to prevent self-modification...") which does not surface in IDE hover.
- **Interface-level JSDoc missing** on `AgentRole`, `ModificationAttempt`, `ValidationResult`, `PermissionGuardFS` — each property lacks an inline doc comment, so consumers must read the source to learn that, for example, `targetPath` is expected absolute *or* relative-to-`projectRoot` (the `_normalizePath` helper accepts both, but this contract is undocumented).
- **`validateAgentModification` JSDoc partially complete** — the four numbered rules are listed (lines 70-75), but it does not state the *order* of evaluation, that the first failure short-circuits, or that side-effects include log writes. Future readers won't know without tracing.
- **No example invocation anywhere** — no integration sketch in `docs/` showing how a runtime hook (worker pre-write, auditor pre-scan) would call `validateAgentModification`. Combined with §4, this contributes to the dead-wiring problem.
- **No mention of POSIX normalization contract** in `_normalizePath` JSDoc — Windows users would not know separators are collapsed to `/`.
- **Stale comment risk:** the line-3 header says "Only Brain can modify agent configurations" but the in-method comment at line 144 hedges with "Only Brain can modify tool configs, but even Brain should be careful" — language drift between two sources of truth.

## 6. ADR Compliance Check
| ADR | Relevant? | Compliant? | Evidence/Violation |
|-----|-----------|------------|--------------------|
| ADR-001 TypeScript + ESM | yes | yes | All types explicit, ESM-friendly imports (`node:fs`, `node:path`); no `require()`/CJS shims |
| ADR-002 Node16 (.js suffix on relative imports) | yes | yes (trivially) | File has zero relative imports — nothing to suffix |
| ADR-004 3-Layer Config Merge | no | n/a | Module hard-codes its paths instead of reading config; if promoted, should integrate per ADR-004 (see §3) |
| ADR-006 spawnSync Security Pattern | no | n/a | No subprocess invocation |
| ADR-007 SpawnOptions Interface | no | n/a | No subprocess invocation |
| ADR-008 Brain Centralized Import | yes | yes | Leaf module, no project imports; cannot create a cycle |
| ADR-010 Single Runtime Dependency (commander) | yes | yes | Uses only Node built-ins |
| ADR-034 Multi-Project Isolation | yes | partial | `PROTECTED_AGENT_PATHS` / `TOOL_CONFIG_PATHS` constants are global, not per-project; acceptable for v1 but undermines multi-project boundary if module is promoted |
| ADR-035 Verification Protocol Standard | yes | violation (silent) | Logs blocked attempts to a file, but does not emit a verification-channel event for Brain/Auditor pipelines to observe |
| ADR-037 Brain-Auditor-Worker Authority Matrix RBAC V1.0 | yes | partial | The module *implements* the RBAC rules ADR-037 prescribes (intent-aligned), but is **not runtime-wired**, matching the ADR's own carve-out that "runtime advisory/soft (V1.0 Layer-2 kasıtlı eksik)". Hard-flip is required for V2 post-GA; this module is the obvious wiring target |
| ADR-038 Dead Code Disposition | yes | violation (unresolved) | Sprint 171 audit flagged module as dead; no disposition decision recorded |
| ADR-041 Agent Taxonomy (Horizontal Skills vs Vertical Agents) | no | n/a | Module is infrastructure, not an agent/skill |
| ADR-046 Brain Self-Update Hook Architecture | yes | n/a | Brain self-update flow does not pass through this guard; could optionally integrate |

## 7. Refactor Recommendations
1. **Disposition decision (delete vs. wire).** — `src/agents/permission-guard.ts:1` — Choose one of the following in Sprint 187 (P0). The current "implemented + tested + unwired" state is the worst-of-both: maintenance cost without enforcement benefit, and a misleading green signal to anyone grepping for ADR-037 RBAC.
   - **Option A — Delete.** Remove `src/agents/permission-guard.ts` + `tests/agents/permission-guard.test.ts`. ADR-037 V1.0 already accepts advisory enforcement; Auditor `git diff --stat` covers boundary violations operationally (CLAUDE.md gotcha). ~1-day effort, no behavioral change.
   - **Option B — Wire.** Inject `PermissionGuard` into the worker write path (`src/orchestra/file-lock.ts` or `src/agents/worker.ts` pre-write hook) and into Brain's task-builder scope materialization. Emit a `DECKENT→AUDITOR:PERMISSION_DENIED` verification channel event per ADR-035. ~3-5 day effort with cascade on existing soft-mode tests.
2. **Fix `_checkSelfModification` prefix bug.** — `src/agents/permission-guard.ts:132` — Replace `targetPath.startsWith(ownPath.replace('.ts', ''))` with `targetPath === ownPath || (selfDirPaths.includes(targetPath))`. The current pattern blocks `src/agents/worker-ipc.ts` correctly but also `src/agents/worker-utils.ts`, `src/agents/worker-prompt-injector.ts`, and any future `worker*.ts`. Effort: low. Only meaningful if Option B above is chosen.
3. **Remove dead `readFileSync` from `PermissionGuardFS`.** — `src/agents/permission-guard.ts:28`, `:33` — Drop the unused FS member. Effort: trivial. Only meaningful if Option B; if Option A the file disappears anyway.
4. **Move path lists to `core/config.ts`.** — `src/agents/permission-guard.ts:41-53` — If promoted, expose `protectedAgentPaths` and `toolConfigPaths` through the 3-layer config merge (ADR-004) so user projects can extend per ADR-034. Effort: medium (requires schema update + migration note).
5. **Emit verification-channel events on block.** — `src/agents/permission-guard.ts:204-218` — Replace silent `catch {}` log fallback with a typed event publication into the event-stream (`src/orchestra/event-stream.ts`), so Auditor and dashboards see denials in real time per ADR-035. Effort: medium; gated on Option B.
6. **Add class-level + interface-level JSDoc.** — `src/agents/permission-guard.ts:25-66` — Document targetPath contract (absolute or relative-to-root), evaluation order, side-effect (log write), and example call site. Effort: low. Gated on Option B; if Option A, all docs are deleted.

## 8. Sprint 187 Follow-up Items
- [ ] **P0** — Disposition decision for `src/agents/permission-guard.ts` (Option A delete vs. Option B wire). Record outcome as an ADR-038 entry in `.brain/exports/decisions.md` so the same finding does not re-surface in Sprint 188's audit.
- [ ] **P0** — If Option B chosen, wire `PermissionGuard.validateAgentModification` into `src/orchestra/file-lock.ts` (`acquireLock` precheck) and `src/agents/worker.ts` pre-write hook; add event-stream emission per ADR-035.
- [ ] **P1** — Fix `_checkSelfModification` prefix bug (line 132) — only required under Option B, but trivial to land regardless if the module is kept.
- [ ] **P1** — Drop `readFileSync` from `PermissionGuardFS` interface + `defaultFS` (line 28, 33) — only required under Option B.
- [ ] **P2** — Add class + interface JSDoc with usage example pointing to the wired call site — only required under Option B.
- [ ] **P2** — Hoist `PROTECTED_AGENT_PATHS` / `TOOL_CONFIG_PATHS` into `core/config.ts` schema with project-level override (ADR-034) — only required under Option B.
- [ ] **P2** — If Option A chosen, also remove `tests/agents/permission-guard.test.ts` (~250 lines of test infra freed) and update `.deckent/archive/sprints/misc/sprint-god-analysis/` reference list.

## 9. Summary
- **Overall health:** dead-code-candidate.
- **Top 3 priorities:**
  1. **Decide disposition (P0).** The module has been "implemented + unit-tested but unused" since Sprint 033, and Sprint 171's god-analysis already flagged it. Continuing to carry it without wiring contradicts ADR-038 and gives a false sense of ADR-037 RBAC coverage. Sprint 187 must commit to Option A (delete) or Option B (wire); the current limbo is the costliest state.
  2. **If Option B (wire), fix the prefix-match bug (P1).** Line 132's `startsWith(ownPath.replace('.ts', ''))` over-blocks any future `worker*` file. This is a latent correctness bug masked only by the fact that the module is unwired.
  3. **If Option B (wire), surface block events via ADR-035 verification channels (P2).** Today blocks only land in `.deckent/logs/permission-guard.log` and silently swallow log failures — Auditor and dashboards see nothing. For a security-critical guard, this is unobservability.
