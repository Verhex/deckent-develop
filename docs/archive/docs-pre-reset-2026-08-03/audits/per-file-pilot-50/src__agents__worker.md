# Audit Report: `src/agents/worker.ts`

**Sprint:** sprint-186 (per-file pilot batch 1, task 186-021)
**Auditor:** w-186-021 (doc-writer / typescript-expert / security-specialist)
**Date:** 2026-05-21
**Source LoC:** 593 (DIRECTIVES spec also says 593 — exact match)
**Companion tests:** none direct (`tests/agents/worker.test.ts` not found); module exercised indirectly by **50+ test files** across `tests/orchestra/`, `tests/integration/`, `tests/e2e/`, `tests/api/`, `tests/security/`, `tests/mcp/`, `tests/cli/`.

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/worker.ts` |
| LoC | 593 |
| Module type | **Core task I/O + re-export router** (post-Sprint 144 God-Object Split) |
| Banner notes (lines 1-12) | Sprint 144 split: 1670 LoC → 4 modules; this file keeps task lifecycle I/O (read/claim/heartbeat/result/scope) and re-exports the rest |
| Runtime imports (5) | `node:fs` (readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, realpathSync, openSync, closeSync, fsyncSync, fstatSync); `node:path` (join, normalize, sep); `../core/types.js` (TaskStatus, AgentStatus + types); `../core/constants.js` (TASKS_DIR); `../core/errors.js` (ErrorRegistry); `../orchestra/authority-enforcer.js` (checkAuthority, emitAuthorityViolation); `../orchestra/event-stream.js` (writeEvent, getCurrentSprintId, CHANNELS); `./worker-lifecycle.js` (atomicWriteFileSync as `_atomicWrite`); `./worker-rollback.js` (snapshotWorkerScope, writeStashRef) |
| Re-export modules | `./worker-rollback.js` (6 symbols), `./worker-verify.js` (12 symbols + 3 types), `./worker-lifecycle.js` (24 symbols + 3 types), `./worker-log.js` (7 symbols + 1 type), `../core/file-lock.js` (`LockError`) |
| Re-exported lock fns (wrappers) | `acquireLock`, `releaseLock`, `checkLock`, `releaseAllLocks` — thin pass-through to `_coreLock` / `_coreRelease` / `_coreCheck` / `_coreReleaseAll` |
| Exported error classes | `TaskClaimError`, `ScopeViolationError` (latter holds `filePath` + `scope`) |
| Exported task lifecycle fns | `setupTaskSnapshot`, `readTask`, `claimTask`, `writeTaskPlan`, `createHeartbeat`, `writeHeartbeat`, `writeResult`, `verifyResultPersisted`, `finalizeHeartbeat`, `writeFinishedHeartbeat` (`@deprecated`), `updateTaskStatus` |
| Exported scope/auth fns | `isWithinScope`, `checkWorkerAuthority` |
| Exported helper | `calculateProgress` (status-based progress %; e.g. EXECUTING=10, CODING=30+filesChanged*6, DONE=100) |
| Exported event emitter | `emitWorkerQuestion` (ADR-035 — worker→brain QUESTION channel) |
| Internal helpers | `taskFilePath`, `planFilePath`, `heartbeatFilePath`, `resultFilePath`, `now`, `ensureDir` |
| File-system side effects | Reads `task-{id}.json`; writes `task-{id}.json/.plan/.hb/.result`; reads `.git/`; calls `openSync`+`fsyncSync` for post-write verify; emits structured events via `event-stream` |
| Reverse deps (production `src/`) | 8+ files: `src/agents/index.ts`, `src/agents/worker-verify.ts`, `src/orchestra/sprint-spawner.ts`, `src/orchestra/sprint-lifecycle.ts`, `src/orchestra/debt-manager.ts`, `src/api/server.ts`, `src/cli/commands/spawn.ts` (plus everything re-exported through `agents/index.ts`) |
| Reverse deps (tests) | **50+** test files — central module across orchestra, integration, e2e, api, security, mcp, cli, nervous suites |
| Re-export shim health | All 5 modules' re-exports preserved with named-export lists — no `export *`; signature stable |

**Notable structural detail (lines 339-408):** `writeResult` is **the** integrity boundary of the worker pipeline. It applies the Sprint 165 "Honest Self-Gate" downgrade (lines 363-380), uses atomic write (line 383), updates task status (line 390), removes heartbeat (line 391), and emits both `RESULT` and `CODE_VERIFY_REQUEST` events (lines 395-407). A worker that exits without going through `writeResult` is undefined — Brain cannot evaluate.

**Sprint 144 split provenance (lines 1-12):** The pre-split 1670 LoC `worker.ts` was decomposed into:
- `worker-verify.ts` — build/test verify loops
- `worker-lifecycle.ts` — state machine, shutdown, verify-delta, feedback loop
- `worker-log.ts` — structured log I/O
- `worker.ts` (this file) — task I/O + re-export router

The re-export router pattern preserves the public API surface (`from '../agents/worker.js'`) so the 50+ downstream callers did not need migration.

---

## 2. Baglam (Architectural Context)

`src/agents/worker.ts` is the **canonical worker-side entry-point** of the Brain↔Worker contract. It defines the file-system protocol for `.tasks/task-{id}.{json,plan,hb,result}` artifacts and exposes the scope/authority gates that ADR-037 mandates.

**Triadic role inside the worker stack:**

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Entry-point (this file) | `worker.ts` | Task claim, plan write, heartbeat, result write, scope check, authority gate |
| Lifecycle | `worker-lifecycle.ts` | State machine, verify-delta baseline, atomicWriteFileSync, feedback loop |
| Verify | `worker-verify.ts` | tsc/vitest verify loops, max-retry policy, doc-only short-circuit |
| Log | `worker-log.ts` | Structured worker log read/write |
| Rollback | `worker-rollback.ts` | Pre-spawn git-stash snapshot (Sprint 177 Task 1) |

**Backend dichotomy:**
- **tmux backend** — uses file-based heartbeat (`task-{id}.hb`); no `child_process` IPC. This file is the heartbeat author.
- **subprocess backend** (`child_process.fork`) — adds typed-message IPC via `worker-ipc.ts` *in addition* to file-based heartbeat written here.
- **Docker backend** — same file-based pattern; relies on atomicWriteFileSync + fsync to survive SIGKILL (exit 137) after SIGTERM grace.

**ADR linkage:**

| ADR | Relationship |
|-----|--------------|
| ADR-006 (spawnSync Security Pattern) | Indirect — this file calls no `spawnSync`, but its callers (worker-verify.ts) do. |
| ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) | ✅ This file lives in `src/agents/`; all reverse deps point Brain→worker (correct direction). |
| ADR-009 (DEBT.md Markdown Tablo Formatı) | Indirect — `updateTaskStatus` may transition into NO_GO which downstream feeds DEBT. |
| ADR-027 (Hybrid Spawn Backend) | This module is backend-agnostic: tmux/subprocess/docker all consume the same I/O contract here. |
| ADR-034 (Multi-Project Isolation) | `setupTaskSnapshot`/git-stash respects projectRoot boundary (line 230 `existsSync(.git)` guard). |
| ADR-035 (Brain↔Worker↔Auditor Verification Protocol Standard) | ✅ `emitWorkerQuestion` is the QUESTION-channel emitter; `writeResult` emits `RESULT` + `CODE_VERIFY_REQUEST` (the 15-channel codes). |
| ADR-037 (RBAC Authority Matrix V1.0) | ✅ `checkWorkerAuthority` is the **runtime advisory hook** — flags violations but does **not block** (V1.0 design; hard-flip V2 post-GA). Note: function returns `true` in *both* allowed and not-allowed branches (lines 570 & 573) — only logs/emits on violation. |
| ADR-038 (Self-Modifying Task Detection) | `checkWorkerAuthority` accepts `isSelfModifyingSprint` flag — propagates to `checkAuthority` for the dogfood vs user-project discriminator. |
| ADR-043 (Brain Crash Recovery Protocol) | `verifyResultPersisted` (lines 425-443) is the post-write fsync gate; closes Sprint 182 "exitCode=0 but no .result" gap. |
| ADR-044 (Sprint State Observability Contract) | Every state transition emits an event via `event-stream` (writeHeartbeat / writeResult). |
| ADR-045 (Wave-Based Execution Semantics) | Indirect — `updateTaskStatus → DONE/NO_GO` is the wave-unblock signal. |
| ADR-046 (Brain Self-Update Hook Architecture) | The `.plan` file (line 351 missing-plan warning) is part of the prompt-lifecycle artifact set. |
| ADR-048 (Prompt Lifecycle Contract) | `writeTaskPlan` writes the `.plan` artifact this ADR mandates. |

**Sprint-history breadcrumbs visible in code:**
- Sprint 135 T-004 (askBrain IPC Registry) — not directly imported here; event emission references it
- Sprint 144 (God Object Split) — header comment lines 1-12
- Sprint 156-011 / 164 / 165 Task 1 (Bug X "stub DONE" exploit) — `writeResult` honest-gate lines 356-380
- Sprint 177 Task 1 (worker snapshot) — `setupTaskSnapshot` lines 214-243
- Sprint 182/183 W1-3 (`exitCode=0` but no `.result` gap) — `verifyResultPersisted` lines 410-443
- Sprint 165 Bug X (auto-promote regression) — the `codeVerified` strip on the dishonest shape

**Honest-gate (lines 356-380) — load-bearing:**
A worker that emits `selfAssessment='DONE'` with `linesAdded=0` AND `testsPassed=false` (or `codeVerified='CODE_VERIFIED_DONE'` with the same shape) is **downgraded to NO_GO at the write boundary**. The `codeVerified` field is also stripped so the legacy auto-promote path cannot re-fire on a second-chance read. This is the single most important integrity gate in the worker pipeline — without it, Sprint 156-011's stub-DONE exploit would re-emerge.

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Mitigation |
|------|----------|----------|------------|
| **`checkWorkerAuthority` always returns `true`** | **HIGH** | Lines 555-573: even when `result.allowed === false`, the function logs `[ADR-037 soft]`, emits an authority-violation event, and returns `true`. This is **intentional** per ADR-037 V1.0 (advisory mode, hard-flip post-GA V2), but **the return type is misleading** — callers see `boolean` and may assume `false` blocks. | Either: (a) change return type to `void` (signal: this is advisory only), (b) add a `mode: 'advisory' \| 'enforce'` parameter, or (c) at minimum a `@deprecated`-style JSDoc making the design intent explicit. |
| **`writeFinishedHeartbeat` deprecated but still exported** | LOW | Line 469-473 — `@deprecated` JSDoc but no migration push. Backward-compat shim risk. | Add migration tracking issue; grep current callers; remove in Sprint 188. |
| **Synchronous I/O throughout (ADR-005 deprecated)** | LOW | Every fs call is sync (`readFileSync`, `writeFileSync`, `openSync`). ADR-005 (Synchronous I/O) is **deprecated**, signaling async migration was intended but never completed for this module. | Track on `worker-async-migration` epic; this is wider than one file. |
| **Heartbeat write isn't atomic** | MEDIUM | Line 325 `writeFileSync(path, ..., 'utf-8')` — plain write. A SIGKILL between fs.write and fs.close could leave a partial JSON heartbeat. Compare to `writeResult` which uses `_atomicWrite` (line 383). | Apply `_atomicWrite` to `writeHeartbeat` too. |
| **`isWithinScope` realpath fails silently for non-ELOOP errors** | MEDIUM | Lines 509-514: if `realpathSync` throws an error that isn't `ELOOP` (e.g., `ENOENT` for a not-yet-existing file the worker plans to write), the catch block continues using the normalized non-real path. **Symlink-escape protection is bypassed for ENOENT files**. | Treat any `realpathSync` error other than ENOENT as fail-closed; for ENOENT, walk up to the first existing parent and realpath that, then re-append the trailing components. |
| **`setupTaskSnapshot` swallows all errors with console.warn** | MEDIUM | Lines 237-242 — catch-all returns null. A failed git-stash (e.g., dirty index, hook failure) silently degrades rollback capability. Brain has no signal. | Emit an event (`SNAPSHOT_FAILED` channel) so Auditor/Brain can detect rollback degradation. |
| **`writeResult` always overwrites without compare-and-set** | LOW | Lines 382-383: a second `writeResult` call for the same `taskId` would silently overwrite the first result (the honest-gate also re-applies, but legitimate retries become invisible). | Use `wx` flag or pre-existence check; warn on overwrite. |
| **`readTask` error mapping inverted** | LOW | Lines 252-257: `SyntaxError` → `DECKENT_E060`; **every other error** (including `ENOENT`) → `DECKENT_E061 "Task file not found"`. A permission-denied or I/O error would be reported as "not found" — misleading on triage. | Differentiate `ENOENT` vs `EACCES` vs other; add `DECKENT_E0XX` for I/O. |
| **No file-lock check before `writeFileSync` in `claimTask`/`updateTaskStatus`** | MEDIUM | Lines 284 & 485 write `task-{id}.json` without consulting `.locks/`. Two workers racing on the same task would both succeed in the write (last-write-wins). Brain-side ID dispense should prevent this in practice, but the file-system contract is racy. | Either add `acquireLock` around the write or document the invariant ("Brain guarantees unique workerId-taskId pairing"). |
| **`emitWorkerQuestion` lacks correlation/question-id** | MEDIUM | Lines 578-592: emits a `QUESTION` event but no `questionId` is passed — the IPC-registry (`askBrain`) uses correlation IDs. Two simultaneous questions could be conflated. | Add `questionId: string` parameter (also referenced in ADR-046). |
| **`calculateProgress` uses magic numbers** | LOW | Lines 200-212: hard-coded percentages (10/30/65/70/85/100). No reasoning, no tests visible. | Extract to a const map + add `@example`. |
| **`finalizeHeartbeat` setTimeout leaks if process exits before fire** | LOW | Lines 461-464 — `setTimeout(doCleanup, cleanupDelayMs)` is unref-able but isn't. Worker exits before delay → heartbeat file orphaned. | `setTimeout(...).unref()` is fine for cleanup; but the file deletion never happens. Either ignore (Auditor sweeps orphans) or use a sync queue. |
| **`verifyResultPersisted` catch swallows errors** | LOW | Lines 440-442: any `openSync`/`fsyncSync` exception → `persisted: false`. A permission error and a missing-file are indistinguishable to the caller. | Differentiate or surface the underlying error (e.g., `{ persisted, size, errno? }`). |
| **`looksLikeStub` heuristic may misjudge legitimate doc-only DONE** | MEDIUM | Lines 366-368: a *legitimate* doc-only task (e.g., `.md` audit task like this very task!) reports `linesAdded > 0` ✅. But a successful doc-only task that writes only **one large markdown file with no test run** could report `testsPassed=false` + `linesAdded=0` if the file system counter undercounts. The downgrade is then a false positive. | Verify `linesAdded` counts include doc files; or relax: only downgrade if `filesChanged.length===0`. |
| **Re-export shim list maintenance burden** | LOW | Lines 34-107 — 4 named-export blocks, ~50 symbols. Adding a new symbol to a sub-module requires manual sync here. | Consider `export *` after types audit (but loses tree-shake clarity); or accept the burden as the price of stable public API. |
| **`scope.filesWrite` exact-match doesn't normalize trailing-slash** | LOW | Lines 525-530: filesWrite match uses `===`. If `scope.filesWrite` contains `'docs/foo.md/'` (trailing slash) it never matches. Robust planners shouldn't write this, but the contract is brittle. | Normalize trailing slash off filesWrite entries. |
| **No unit test file visible** | MEDIUM | `tests/agents/worker.test.ts` not present (only worker-verify-coverage, worker-rollback, worker-lifecycle test files were found). The 593 LoC module is exercised only through integration paths. | Sprint 188 add `tests/agents/worker.test.ts` with focused unit coverage for `isWithinScope`, `looksLikeStub` honest-gate, `verifyResultPersisted`, `setupTaskSnapshot`. |

**Total debt risk:** **MEDIUM–HIGH** — the file is well-encapsulated post-Sprint-144 split, but **two issues stand out: (a) `checkWorkerAuthority` always-true return** (architecturally surprising, mitigates only via log/event), and **(b) lack of dedicated unit tests** for a module that 50+ test files transitively depend on.

---

## 4. Dead Code Candidates

```bash
$ grep -rn "writeFinishedHeartbeat" src/ tests/
src/agents/worker.ts:471
src/agents/index.ts:25  (re-export passthrough)
# Zero production callers — only the deprecated wrapper survives
```

```bash
$ grep -rn "from.*worker\\.js" src/
src/agents/worker-verify.ts:16 → createHeartbeat, writeHeartbeat
src/agents/index.ts:18         → barrel re-export
src/cli/commands/spawn.ts:3    → readTask
src/orchestra/debt-manager.ts:15 → updateTaskStatus, releaseAllLocks
src/orchestra/sprint-spawner.ts:95 → broad re-export consumer
src/orchestra/sprint-lifecycle.ts:60 → releaseAllLocks
src/api/server.ts:26          → readWorkerLog (via re-export shim from worker-log.ts)
```

```bash
$ grep -rn "checkWorkerAuthority" src/ tests/
src/agents/worker.ts:537 (definition)
# Need to confirm caller — currently a public export only; no in-repo runtime call site visible
```

```bash
$ grep -rn "emitWorkerQuestion" src/ tests/
src/agents/worker.ts:578 (definition)
# Need to confirm caller — public export only; in-repo callers may live in spawn-backend / tmux
```

```bash
$ grep -rn "setupTaskSnapshot" src/ tests/
src/agents/worker.ts:229 (definition)
# Sprint 177 Task 1 introduced this. Callers expected in spawn-backend.ts / tmux.ts
```

| Symbol | Verdict | Kanıt |
|--------|---------|-------|
| `readTask` | **LIVE** | `cli/commands/spawn.ts:3`, every spawn flow |
| `claimTask` | **LIVE** | worker spawn path |
| `writeTaskPlan` | **LIVE** | worker prompt lifecycle |
| `createHeartbeat` / `writeHeartbeat` | **LIVE** | `worker-verify.ts:16` + indirect via Brain |
| `writeResult` | **LIVE** | every worker exit path |
| `verifyResultPersisted` | **LIVE** (Sprint 183 W1-3) | post-write fsync gate |
| `finalizeHeartbeat` | **LIVE** | called by `writeResult` line 391 |
| `writeFinishedHeartbeat` | **DEPRECATED, possibly dead** — `@deprecated` JSDoc; only the file itself uses the symbol. Re-exported via `agents/index.ts` for back-compat | grep above |
| `updateTaskStatus` | **LIVE** | `debt-manager.ts:15`, sprint pipeline |
| `isWithinScope` | **LIVE** | Auditor + worker self-check |
| `checkWorkerAuthority` | **AMBIGUOUS** — definition exists, no obvious in-repo runtime call site found in this audit pass. Sprint 188 must confirm whether spawn-backend wires this hook | grep above (definition-only) |
| `calculateProgress` | **LIVE** | `writeHeartbeat` line 316 |
| `setupTaskSnapshot` | **AMBIGUOUS** — Sprint 177 Task 1; callers presumed in `spawn-backend.ts` / `tmux.ts` but not verified in this pass | grep above (definition-only) |
| `emitWorkerQuestion` | **AMBIGUOUS** — ADR-035 wire; needs runtime caller confirmation | grep above (definition-only) |
| `TaskClaimError`, `ScopeViolationError` | **LIVE** (types) — `claimTask` throws TaskClaimError; ScopeViolationError is exported but throw-site needs confirmation | self-reference |
| All re-exports (worker-verify/lifecycle/log/rollback) | **LIVE** — preserved for the 50+ downstream callers | re-export blocks |

**Disposition candidates for Sprint 188:**
1. **Remove `writeFinishedHeartbeat`** — `@deprecated` since Sprint 144 (?); zero production callers found.
2. **Confirm `checkWorkerAuthority` runtime wire** — if dead, this is ADR-037 V1.0 dormant; if live, return-type fix is urgent.
3. **Confirm `setupTaskSnapshot` callers** — Sprint 177 deliverable; if no wire, the snapshot-rollback feature is in defined-but-unused state.
4. **Confirm `emitWorkerQuestion` wire** — ADR-035 QUESTION channel needs a real emitter; if no caller, this is a contract stub.

---

## 5. Documentation Gaps

| Gap | Açıklama | Priority |
|-----|----------|----------|
| **`checkWorkerAuthority` always-true return semantics** | The function's `boolean` return is **always `true`** — V1.0 advisory mode. Zero JSDoc explains this. Callers assuming `if (!checkWorkerAuthority(...)) abort()` are silently wrong. | **HIGH** |
| **Honest-gate (`looksLikeStub`) rationale** | Lines 356-380 reference Sprint 165 Task 1 / Bug X / Sprint 156-011. No ADR link; no test pattern documented. A new contributor cannot reverse-engineer why the downgrade exists. | **HIGH** |
| **`.plan` file requirement undocumented** | Line 352 warns "Workers should write .tasks/task-{id}.plan before coding." This is **part of the prompt-lifecycle contract (ADR-048)** but the worker rules file mentions it only in passing. | MEDIUM |
| **`tokenUsage` contract not enforced here** | Sprint 140 rejects results with missing tokenUsage as NO_GO, but this file does **not** validate it. The validation lives elsewhere (sprint-controller / result-evaluator) — undocumented split. | MEDIUM |
| **Backend-specific behavior not documented** | tmux/subprocess/Docker each rely on slightly different heartbeat lifetimes. Module header doesn't surface the difference. | MEDIUM |
| **`isWithinScope` symlink-escape semantics** | `realpathSync` + project-prefix check (lines 499-508) protects against `/etc/passwd` symlink escapes — but only when the file already exists. Undocumented. | MEDIUM |
| **No example of "doc-only" task flow** | Doc-only tasks short-circuit verify; `worker-verify.ts:isDocOnlyScope` is the gate. The worker.ts side (this file) has no `@see` link. | LOW |
| **`verifyResultPersisted` use case for Sprint 183** | The JSDoc references Sprint 182/183 audit paths but no link to `docs/audits/sprint-183/worker-timeout-rc.md` (file path may be correct, drift risk). | LOW |
| **`ScopeViolationError` is exported but no throw-site visible** | Class lives but no in-repo `throw new ScopeViolationError(...)`. If this is intentional API surface for external consumers, document it. | LOW |
| **JSDoc inconsistency across exports** | `setupTaskSnapshot` (lines 216-228), `writeResult` (lines 339-346), `verifyResultPersisted` (lines 410-424), `finalizeHeartbeat` (line 446), `writeFinishedHeartbeat` (line 468) have varying depths of JSDoc. `readTask`, `claimTask`, `writeTaskPlan`, `createHeartbeat`, `writeHeartbeat`, `updateTaskStatus`, `isWithinScope`, `checkWorkerAuthority`, `emitWorkerQuestion` have **zero**. | MEDIUM |
| **No sequence diagram of worker lifecycle** | The worker flow (claim → plan → heartbeat → execute → result → cleanup) is the canonical contract but has no diagram anywhere in `docs/reference/`. | MEDIUM |
| **`agents/index.ts` re-export shape undocumented** | Worker module is consumed via `agents/index.ts` barrel; that barrel's contract isn't documented. | LOW |

---

## 6. ADR Compliance Check

| ADR | Relevance | Compliance | Detay |
|-----|-----------|------------|-------|
| **ADR-001** (TypeScript + ESM) | ✅ Applies | ✅ COMPLIANT | Pure TS, ESM with `.js` import extensions throughout. |
| **ADR-002** (Node16 Module Resolution) | ✅ Applies | ✅ COMPLIANT | All relative imports use `.js` extension. |
| **ADR-003** (vitest over Jest) | ✅ Applies | ⚠️ PARTIAL | No dedicated `tests/agents/worker.test.ts` found — only indirect coverage via 50+ integration tests. |
| **ADR-005** (Synchronous I/O) | ⚠️ DEPRECATED | ⚠️ N/A | Module is fully sync I/O. ADR-005 deprecation signals async migration intent that hasn't shipped. |
| **ADR-006** (spawnSync Security Pattern) | ⚪ Indirect | ⚪ N/A | This file doesn't call `spawnSync` directly. |
| **ADR-008** (Brain Merkezi Import — Tek Yönlü Bağımlılık) | ✅ Applies | ✅ COMPLIANT | Worker module is leaf-of-import for the agent layer; orchestra modules import *from* it, and it imports only from `core/` + `orchestra/event-stream` + `orchestra/authority-enforcer` (acceptable per ADR-008 because those are protocol-level). |
| **ADR-009** (DEBT.md Markdown Tablo Formatı) | ⚪ Indirect | ⚪ N/A | Not in scope. |
| **ADR-010** (Tek Runtime Dependency — commander.js) | ✅ Applies | ✅ COMPLIANT | Zero runtime deps — only `node:fs`, `node:path` built-ins. |
| **ADR-027** (Hybrid Spawn Backend) | ✅ Applies | ✅ COMPLIANT | Backend-agnostic — tmux/subprocess/Docker all consume same I/O contract. |
| **ADR-034** (Multi-Project Isolation) | ✅ Applies | ✅ COMPLIANT | `projectRoot` passed explicitly to every file-path helper; no cross-project leakage. |
| **ADR-035** (Brain↔Worker↔Auditor Verification Protocol Standard) | ✅ Applies | ✅ COMPLIANT | `emitWorkerQuestion`, `writeResult` emit RESULT/CODE_VERIFY_REQUEST channels; `writeHeartbeat` emits HEARTBEAT channel. |
| **ADR-036** (ADR Governance Integration) | ✅ Applies | ✅ COMPLIANT (downstream) | ADR injection happens via the prompt; this file doesn't inject ADRs itself. |
| **ADR-037** (RBAC Authority Matrix V1.0) | ✅ Applies | ⚠️ **PARTIAL** | `checkWorkerAuthority` is the runtime advisory hook **but always returns `true`** — V1.0 design (advisory). The misleading return type is debt §3. Hard-flip V2 post-GA needs this function's signature changed. |
| **ADR-038** (Self-Modifying Task Detection — Dead Code Disposition) | ✅ Applies | ⚠️ PARTIAL | `writeFinishedHeartbeat` (`@deprecated`) survives without disposition; `checkWorkerAuthority`/`setupTaskSnapshot`/`emitWorkerQuestion` runtime callers unconfirmed. |
| **ADR-040** (Nervous System Architecture) | ⚪ Indirect | ⚪ N/A | Nervous events don't ride this transport (separate channel). |
| **ADR-041** (Agent Taxonomy — Horizontal Skills vs Vertical Agents) | ⚪ Indirect | ⚪ N/A | Not in scope. |
| **ADR-043** (Brain Crash Recovery Protocol) | ✅ Applies | ✅ COMPLIANT | `verifyResultPersisted` (lines 425-443) is the post-write fsync gate closing Sprint 182 recovery gap. |
| **ADR-044** (Sprint State Observability Contract) | ✅ Applies | ✅ COMPLIANT | Every state transition emits a structured event via `event-stream`. |
| **ADR-045** (Wave-Based Execution Semantics) | ✅ Applies (downstream) | ✅ COMPLIANT | `updateTaskStatus → DONE/NO_GO` is the wave-unblock signal. |
| **ADR-046** (Brain Self-Update Hook Architecture) | ✅ Applies | ✅ COMPLIANT | `.plan` artifact required (line 352 warning); QUESTION channel wire (`emitWorkerQuestion`). |
| **ADR-048** (Prompt Lifecycle Contract) | ✅ Applies | ✅ COMPLIANT | `writeTaskPlan` is the `.plan` artifact author this ADR mandates. |
| **ADR-053** (TaskType Taxonomy) | ✅ Applies (audit context) | ✅ COMPLIANT | Audit task itself adheres to `document-write` taxonomy. |
| **ADR-064** (TOPP — Continuous Dispatch) | ✅ Applies (downstream) | ✅ COMPLIANT | `updateTaskStatus → DONE/NO_GO` immediately frees the wave slot — TOPP-compatible. |

**Aksiyon gereken ADR'lar:**
1. **ADR-037 V2 (post-GA):** Change `checkWorkerAuthority` return to `void` OR introduce `'advisory' \| 'enforce'` mode.
2. **ADR-005:** Track async migration of this module as part of the wider sync-I/O epic.
3. **ADR-038:** Disposition `writeFinishedHeartbeat`; confirm runtime wire for `setupTaskSnapshot`/`emitWorkerQuestion`/`checkWorkerAuthority`.
4. **ADR-003:** Add dedicated `tests/agents/worker.test.ts` — too central for indirect-only coverage.

---

## 7. Refactor Recommendations

**R1 — `checkWorkerAuthority` return-type fix (high priority):**
The current `boolean` return is always `true` but the type suggests it could be `false`. Two acceptable paths:
- Option A: Change signature to `void` + rename → `recordAuthorityCheck()`. Forces callers to update.
- Option B: Add explicit `mode: 'advisory' \| 'enforce'` parameter; `false` returned in enforce-mode on violation. Backwards-compatible if default is `'advisory'`.
Pair with an ADR-037 V2 amendment.

**R2 — Atomic heartbeat write:**
`writeHeartbeat` (line 322) currently uses plain `writeFileSync`. Apply the same `_atomicWrite` (temp + fsync + rename) as `writeResult`. This closes the SIGKILL race for heartbeat consistency.

**R3 — Add `tests/agents/worker.test.ts`:**
Focused unit tests for:
- `isWithinScope` symlink-escape (project boundary)
- `looksLikeStub` honest-gate (each branch)
- `verifyResultPersisted` (present/absent/fsync-error)
- `setupTaskSnapshot` (non-git root graceful degradation)
- `calculateProgress` (each status)
- `checkWorkerAuthority` return semantics (lock the V1.0 design into tests so post-GA V2 flip is intentional)

**R4 — Differentiate `readTask` error codes:**
Add `DECKENT_E062` for permission errors, `DECKENT_E063` for I/O errors. Map `ENOENT`-only to E061.

**R5 — `emitWorkerQuestion` correlation id:**
Add `questionId: string` parameter, propagate to event payload. Required for ADR-046 `askBrain` correlation.

**R6 — `setupTaskSnapshot` event emission:**
On catch (line 237), emit a `SNAPSHOT_FAILED` event so Auditor/Brain can detect rollback-capability degradation.

**R7 — `looksLikeStub` doc-only relaxation:**
Refine the heuristic: only downgrade if `filesChanged.length === 0` (a doc-only DONE with a real `.md` written has `filesChanged.length > 0`). Current logic risks false-positive downgrade for doc-only tasks.

**R8 — Remove `writeFinishedHeartbeat`:**
Zero production callers; `@deprecated`. Delete in Sprint 188.

**R9 — `isWithinScope` fail-closed on non-ELOOP realpath error:**
Treat any `realpathSync` error other than ENOENT as `return false` (fail-closed). For ENOENT (file not yet written), walk up to the first existing parent and realpath that. Closes the symlink-escape gap for not-yet-existing target paths.

**R10 — JSDoc completeness pass:**
Add JSDoc to: `readTask`, `claimTask`, `writeTaskPlan`, `createHeartbeat`, `writeHeartbeat`, `updateTaskStatus`, `isWithinScope`, `checkWorkerAuthority`, `emitWorkerQuestion`. Match the depth of `writeResult`/`setupTaskSnapshot` JSDoc.

**R11 — Magic-number extraction:**
`calculateProgress` percentages → `WORKER_PROGRESS_BY_STATUS` const.
`looksLikeStub` thresholds (linesAdded=0, notes-slice 400) → named constants.

**R12 — Per-file documentation header:**
Add a `@module` block linking to `docs/reference/api-surface.md#tasks-file-format`, the worker-rules file, and the worker-guide file.

---

## 8. Sprint 188 Follow-up Items

| Item | Owner | Priority | Effort | Notes |
|------|-------|----------|--------|-------|
| **F1:** `checkWorkerAuthority` return-type fix (R1) | architect | **HIGH** | normal | ADR-037 V2 paired amendment; CR-impact ~minimal (no current `!checkWorkerAuthority(...)` blocking callers visible) |
| **F2:** Add `tests/agents/worker.test.ts` (R3) | testing-expert (via task-bazlı, ADR-041) | **HIGH** | normal | 593 LoC central module — indirect coverage insufficient |
| **F3:** Atomic heartbeat write (R2) | bug-fixer | **HIGH** | low | SIGKILL race closure; pairs with Sprint 139 Docker HB Core Fix lineage |
| **F4:** `isWithinScope` symlink-escape hardening (R9) | security-auditor | **HIGH** | low | OWASP — path-traversal style. Fail-closed default. |
| **F5:** Confirm `checkWorkerAuthority` / `setupTaskSnapshot` / `emitWorkerQuestion` runtime callers (ADR-038) | refactorer | MEDIUM | low | Three grep + decision points |
| **F6:** Remove `writeFinishedHeartbeat` (`@deprecated`) (R8) | refactorer | MEDIUM | low | Zero callers; delete + bump |
| **F7:** Honest-gate doc-only relaxation (R7) | bug-fixer | MEDIUM | low | False-positive risk on legit doc-only tasks |
| **F8:** `readTask` error code differentiation (R4) | refactorer | LOW | low | Triage clarity |
| **F9:** `emitWorkerQuestion` correlation-id (R5) | architect | MEDIUM | low | ADR-046 alignment |
| **F10:** `setupTaskSnapshot` failure event (R6) | bug-fixer | MEDIUM | low | Snapshot-degradation observability |
| **F11:** JSDoc completeness pass (R10) | doc-writer | MEDIUM | normal | 9 functions need coverage |
| **F12:** Magic-number extraction (R11) | code-reviewer | LOW | low | Readability |
| **F13:** Worker lifecycle sequence diagram in `docs/reference/api-surface.md` | doc-writer | MEDIUM | normal | High-value onboarding |
| **F14:** Confirm `ScopeViolationError` throw-sites — keep or delete | refactorer | LOW | low | Dead-class risk check |

---

## 9. Summary

`src/agents/worker.ts` (593 LoC) is the **canonical worker entry-point** post-Sprint-144 God-Object Split — it owns the file-system contract for `.tasks/task-{id}.{json,plan,hb,result}` artifacts, the integrity boundary at `writeResult` (Sprint 165 honest-gate against the Sprint 156-011/164 stub-DONE exploit), the scope/authority gates (ADR-037 V1.0 advisory), the Sprint 183 W1-3 fsync gate, and re-exports 50+ symbols from 4 sister modules. **It is load-bearing**: 50+ test files transitively depend on it, and **7+ production modules** (orchestra, api, cli) import directly.

**Kritik bulgular:**
- 🔴 **`checkWorkerAuthority` always returns `true`** — V1.0 advisory by design (ADR-037), but the `boolean` return type is misleading and could cause silent contract violation in future callers. **Highest-priority follow-up.**
- 🔴 **No dedicated unit test file** — `tests/agents/worker.test.ts` is missing; 50+ integration tests cover indirectly. Refactor risk is high.
- 🟡 **`writeHeartbeat` non-atomic** — unlike `writeResult` which uses temp+fsync+rename, heartbeat write is plain. SIGKILL race possible.
- 🟡 **Possibly dormant exports** — `writeFinishedHeartbeat` (`@deprecated`), and unconfirmed callers for `checkWorkerAuthority`, `setupTaskSnapshot`, `emitWorkerQuestion`. ADR-038 disposition needed.
- 🟡 **`isWithinScope` symlink-escape gap on ENOENT** — when the target file doesn't yet exist, `realpathSync` fails and the catch block silently continues with the normalized non-real path. Path-traversal hardening incomplete.
- 🟡 **`looksLikeStub` false-positive risk on doc-only tasks** — honest-gate downgrade may misjudge legitimate doc-only DONE if `linesAdded === 0` despite `filesChanged.length > 0`.
- 🟢 **Sprint 165 honest-gate (lines 356-380) is load-bearing** — the single most important integrity gate against stub-DONE exploits. Intact and tested via Sprint 165's E2E lineage.
- 🟢 **Sprint 183 fsync gate** — `verifyResultPersisted` closes the "exitCode=0 but no .result" gap cleanly.
- 🟢 **ADR-008 direction correct** — agent module is a leaf-of-import; orchestra imports from it, not vice-versa.
- 🟢 **Zero runtime deps** — only Node built-ins. ADR-010 satisfied.
- 🟢 **Re-export shim health** — Sprint 144 split's 4-module structure preserves the public API for 50+ downstream callers without breakage.

**Önerilen aksiyon (Sprint 188):** Treat this as a **HIGH-PRIORITY refactor target** despite its mature surface. The three load-bearing fixes are (1) `checkWorkerAuthority` return-type alignment with ADR-037 V2, (2) dedicated `tests/agents/worker.test.ts` unit suite (R3 / F2), (3) atomic `writeHeartbeat` (R2 / F3). These three together harden the worker contract for the upcoming GA, close the SIGKILL race on heartbeat, and lock the V1.0 advisory design into tests so the post-GA V2 hard-flip is intentional rather than accidental.

**Per-file pilot meta-notu:** worker.ts is the **most heavily-depended file in the agents/ namespace** — 50+ test files, 7+ src modules. Architectural concerns here ripple across every sprint phase (SPAWN, EXECUTE, EVALUATE, FIX, CLEANUP). A Sprint 188 focused refactor on this file alone is **high leverage** — comparable to the worker-ipc.ts placement concern flagged in task 186-016, but more central. Pair the two follow-ups for a coherent worker-stack hardening sprint.
