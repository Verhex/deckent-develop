# Audit Report: `src/agents/worker-ipc.ts`

**Sprint:** sprint-186 (per-file pilot batch 1)
**Auditor:** w-186-016 (doc-writer / typescript-expert / security-specialist)
**Date:** 2026-05-21
**Source LoC:** 369 (DIRECTIVES spec said "370" — actual 369 — header blank line drift)
**Companion test LoC:** `tests/agents/worker-ipc.test.ts` (primary suite) + 7 indirect orchestra/IPC test files

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/worker-ipc.ts` |
| LoC | 369 |
| Module type | TypeScript type-defs + 3 runtime classes + 1 type guard + 1 re-export shim |
| Imports (runtime) | **HİÇBİRİ** — zero runtime imports (only `import type { ChildProcess } from 'node:child_process'`) |
| Re-exports | 8 symbols from `../orchestra/ipc-registry.js`: `getQuestionPath`, `getAnswerPath`, `writeQuestionFile`, `readQuestionFile`, `writeAnswerFile`, `readAnswerFile`, `cleanupQuestionFiles`, `askBrain` |
| Exported types | `IPCMessageType` (union), `IPCMessage`, `HeartbeatPayload`, `StatusResponsePayload`, `IPCMessageHandler` |
| Exported classes | `WorkerChannel`, `WorkerSideChannel`, `ChannelRegistry` |
| Exported functions | `isIPCMessage` (type guard) |
| Message types (union) | `'HEARTBEAT'`, `'STATUS_REQUEST'`, `'STATUS_RESPONSE'`, `'PAUSE'`, `'RESUME'`, `'KILL'`, `'QUESTION'`, `'ANSWER'` (8 variants) |
| Reverse deps (production `src/`) | 6 files: `src/orchestra/ipc-registry.ts`, `src/orchestra/result-collector.ts`, `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-lifecycle.ts`, `src/orchestra/brain.ts`, `src/agents/permission-guard.ts` |
| Reverse deps (tests) | 17 files (primary: `tests/agents/worker-ipc.test.ts`; integration: `tests/orchestra/brain-ipc.test.ts`, `result-collector.test.ts`, `ipc-registry.test.ts`, plus 13 others touching IPC indirectly) |
| Side effects | Class instantiation registers `'message'` listener on `proc`/`process` — must `close()` to detach |
| Async surface | None — all methods sync; messages flow via Node event emitter (asynchronous in practice but no `await`) |
| File regions | 6 markdown-style banner sections: Message Types, Handler Type, WorkerChannel, Type Guard, WorkerSideChannel, Channel Registry, Re-export Shim |

**Notable structural detail:** Lines 357-369 are a **Sprint 135 T-004 re-export shim** — file-based IPC (`askBrain`, `getQuestionPath`, …) was relocated to `../orchestra/ipc-registry.ts`. This file keeps the symbols importable from `worker-ipc.js` for backward compatibility.

---

## 2. Baglam (Architectural Context)

`worker-ipc.ts` is the **typed-message backbone** of Brain↔Worker bidirectional communication when workers are spawned via `child_process.fork()` (subprocess backend, ADR-027 hybrid spawn). For tmux-backed workers, file-based heartbeat is used instead — but the **typed message contract** (`IPCMessage` shape, message types) is shared.

**Triadic role inside the IPC stack:**

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Wire | `worker-ipc.ts` (this file) | `IPCMessage` schema, channel classes, type guard |
| Registry | `orchestra/ipc-registry.ts` | File-based IPC + `askBrain` + per-task channel registry (Sprint 135 T-004) |
| Orchestration | `orchestra/sprint-controller.ts`, `result-collector.ts`, `brain.ts` | Lifecycle binding, message routing, dispatch |

**Process-side dichotomy:**
- `WorkerChannel` — used by **parent (Brain)**, wraps `ChildProcess` handle.
- `WorkerSideChannel` — used by **child (Worker)**, wraps `process` itself (cast as `EventEmitter`).
- `ChannelRegistry` — singleton-like registry inside Brain to track all active `WorkerChannel` instances by `taskId`.

**ADR linkage:**

| ADR | Relationship |
|-----|--------------|
| ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) | This file lives in `src/agents/` but is imported by `src/orchestra/*` — **wrong-direction concern** flagged below in §3. The Sprint 135 plan acknowledges this (re-export shim) but doesn't relocate the runtime symbols. |
| ADR-027 (Hybrid Spawn Backend) | This module is the IPC primitive enabling the `fork` half of hybrid spawn. Without it, subprocess backend cannot do bidirectional comms. |
| ADR-035 (Brain↔Worker↔Auditor Verification Protocol Standard) | `IPCMessageType` union is the wire-level verification protocol carrier. `HEARTBEAT`, `STATUS_REQUEST/RESPONSE` are the 15-channel codes' transport. |
| ADR-037 (RBAC Authority Matrix V1.0) | `PAUSE`/`RESUME`/`KILL` are **Brain-authorized actions** — but enforcement happens caller-side, not in this file (advisory in V1.0; hard-flip post-GA V2). |
| ADR-046 (Brain Self-Update Hook Architecture) | The `QUESTION`/`ANSWER` message types are the `askBrain` IPC carrier (Sprint 135 T-004). |

**Sprint 135 T-004 historical note:** The re-export shim at the bottom is **load-bearing** — multiple downstream files still import `askBrain`/`writeQuestionFile` from `worker-ipc.js` (e.g., `tests/agents/worker-ipc.test.ts:25`, `tests/orchestra/result-collector.test.ts:41`). Removing the shim is a breaking change.

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Mitigation |
|------|----------|----------|------------|
| **ADR-008 wrong-direction import concern** | MEDIUM | `src/orchestra/ipc-registry.ts:11-13` imports `ChannelRegistry`, `WorkerChannel`, `WorkerSideChannel` from `../agents/worker-ipc.js`. ADR-008 says Brain (orchestra) is the central importer — agents should not be import sources for orchestra. However, this is **wire-protocol type infrastructure**, not orchestration logic, so the ADR-008 spirit may permit it. Status: ambiguous, undocumented. | Either (a) relocate `worker-ipc.ts` → `src/core/ipc-types.ts` (true wire layer), or (b) document ADR-008 exception explicitly. |
| **`unknown` payload + minimal type guard** | MEDIUM | `IPCMessage.payload: unknown` — completely untyped. `isIPCMessage` only validates `type/taskId/timestamp` strings; payload structure is never validated. A malformed `HEARTBEAT` payload reaches handlers as-is. | Add discriminated union: `IPCMessage<HEARTBEAT, HeartbeatPayload>` with payload schema validation per type. Optionally Zod. |
| **Swallowed handler errors** | MEDIUM | Lines 191-194 + 237-242: handler throws are silently swallowed (`// swallow`). A buggy handler can fail every message and Brain has no signal. | Add `onHandlerError?: (err, msg) => void` opt-in callback or emit to `debug-log.ts`. |
| **Cross-process `taskId` collision risk** | LOW | `taskId` is the only routing key. A worker that mistakenly sends with another worker's `taskId` would be silently dispatched to the wrong handler. | Add origin process PID claim verification (`expectedPid`) in `WorkerChannel` constructor. |
| **No backpressure / queue** | MEDIUM | `proc.send()` returns boolean (Node may queue or drop). Code uses return value but doesn't retry or report send failure to caller. `sendHeartbeat`/`requestStatus` callers cannot distinguish "process dead" from "queue full". | Bubble up send failures via emitter event or return `'sent' \| 'dropped' \| 'closed'` enum. |
| **`closeAll()` race with `register()`** | LOW | `ChannelRegistry.closeAll()` iterates+clears (lines 341-346) without lock. If `register()` is called mid-iteration (rare in practice — single-threaded JS), a new channel could leak. | Single-threaded Node makes this safe in practice; document the invariant. |
| **`process as unknown as NodeJS.EventEmitter` cast** | LOW | Line 231: double-cast bypasses TS safety. If `emitter` injected without `.on`, constructor silently no-ops. | Either tighten signature (`EventEmitter & { send?: typeof process.send }`) or runtime-check `on` exists before constructing. |
| **No `messageerror` event handling** | LOW | Node's `child_process` emits `messageerror` when received JSON cannot be parsed. Neither `WorkerChannel` nor `WorkerSideChannel` listens. Silently dropped malformed messages. | `proc.on('messageerror', ...)` + dispatcher. |
| **`isIPCMessage` accepts unknown `type` strings** | LOW | The type guard doesn't enforce `obj.type` belongs to `IPCMessageType` union — any string passes. Downstream `handlers.get(type)` returns `undefined` and the message is dropped. | Validate `type` against a `Set<IPCMessageType>` constant. |
| **No version/protocol field** | MEDIUM | `IPCMessage` has no `version` field. Future protocol evolution (ADR-035 v2) cannot be backward-compatibly negotiated. | Add `version?: '1'` (default `'1'`) and bump on protocol break. |
| **Missing DI for `process.send`** | LOW | `WorkerSideChannel.send` directly uses `process.send` (lines 257, 267) — not injectable like `emitter`. Tests must mock global. | Accept optional `sender?: typeof process.send` parameter. |
| **Re-export shim erosion** | LOW | Lines 360-369 shim is stable but creates a hidden coupling. Some consumers may not know they should import directly from `ipc-registry`. | Add `@deprecated` JSDoc on each shimmed export → migration push. |

**Total debt risk:** MEDIUM — well-encapsulated module, but payload typing and protocol versioning are the two clearest gaps. The ADR-008 placement concern is the most architecturally significant.

---

## 4. Dead Code Candidates

```bash
$ grep -rn "from.*worker-ipc" src/
src/orchestra/ipc-registry.ts:11
src/orchestra/ipc-registry.ts:12
src/orchestra/ipc-registry.ts:13
src/orchestra/result-collector.ts:30
# Plus indirect via index/barrel exports (none in src/agents/index.ts as of audit date)
```

```bash
$ grep -rn "WorkerSideChannel" src/
src/agents/worker-ipc.ts:221 (declaration)
src/orchestra/ipc-registry.ts:13 (type re-export only)
# No production runtime instantiation of WorkerSideChannel in src/
```

```bash
$ grep -rn "WorkerSideChannel" tests/
tests/agents/worker-ipc.test.ts (primary suite)
tests/core/non-null-safety.test.ts:17
# Tests instantiate it — no production caller
```

| Symbol | Verdict | Kanıt |
|--------|---------|-------|
| `WorkerChannel` | **LIVE** — instantiated by `result-collector.ts` & `sprint-controller.ts` (indirectly via `ChannelRegistry`) | grep matches in orchestra/ |
| `ChannelRegistry` | **LIVE** — re-exported by `ipc-registry.ts`, used by `result-collector.ts:30` as type | grep above |
| `WorkerSideChannel` | **POTENTIALLY DORMANT** — only test instantiation in `src/`. The actual worker process (`src/agents/worker.ts`) does **not** import `WorkerSideChannel` — it uses file-based heartbeat instead. Subprocess-backend worker IPC may be wired elsewhere; if not, this class is dead for the worker side. | Requires confirmation; flagged for Sprint 188 |
| `StatusResponsePayload` | **POSSIBLY DEAD** — `IPCMessageType` includes `'STATUS_RESPONSE'` but no production code sends one (grep returns 0 hits in `src/` for `STATUS_RESPONSE`). | grep `STATUS_RESPONSE` src/ → only worker-ipc.ts itself |
| `'PAUSE' \| 'RESUME'` message types | **POSSIBLY DORMANT** — Brain pause/resume tests exist (`tests/orchestra/brain-pause-resume.test.ts`) but production wire usage needs verification. | Sprint 188 dependency check |
| Re-export shim (lines 360-369) | **LIVE** — `askBrain` is the canonical caller via this shim per Sprint 135 T-004 design. | `import { askBrain } from '../agents/worker-ipc.js'` in active codepaths |
| `isIPCMessage` type guard | **LIVE** — used internally in `_dispatch` (line 184) and `WorkerSideChannel.boundListener` (line 233). Not re-exported beyond this file in production. | self-reference only |

**Disposition candidates for Sprint 188:**
1. **Confirm `WorkerSideChannel` usage** in actual worker process (subprocess backend). If worker.ts uses file-based HB only, this class is dormant.
2. **Confirm `STATUS_RESPONSE` flow** — possibly add `respondToStatus()` helper or remove from the union.
3. **Cleanup `_archive` test files** — multi-test indirect deps may inflate maintenance.

---

## 5. Documentation Gaps

| Gap | Açıklama | Priority |
|-----|----------|----------|
| **Sequence diagram missing** | The Brain↔Worker message flow (HEARTBEAT → STATUS_REQUEST → STATUS_RESPONSE → PAUSE/RESUME/KILL) isn't documented anywhere — neither in this file nor in `docs/reference/api-surface.md`. | HIGH |
| **`payload: unknown` per-type schema** | Each `IPCMessageType` has implicit payload expectations. Only `HeartbeatPayload` and `StatusResponsePayload` are typed; `PAUSE`/`RESUME`/`KILL`/`QUESTION`/`ANSWER` payloads are documented nowhere. | HIGH |
| **`askBrain` re-export shim rationale undocumented** | Sprint 135 T-004 mention exists (line 357 banner) but no link to ADR or migration guide. New contributors will mis-import. | MEDIUM |
| **`WorkerSideChannel.emitter` injection use case unclear** | The injectable emitter (line 229) is for tests, but there's no `@example` showing the test pattern. | LOW |
| **No `@throws` on `send()`** | Catches are silent — but downstream callers might want to know failure modes. | MEDIUM |
| **Tmux-vs-subprocess fallback not documented** | The file header (line 5-6) mentions tmux fallback but doesn't show how Brain decides which path to use. | MEDIUM |
| **ADR-035 channel code mapping absent** | The 15-channel verification protocol (ADR-035) should map to the 8 `IPCMessageType` variants — that mapping table isn't present. | MEDIUM |
| **No CHANGELOG-style notes** | The file has evolved (Sprint 135 T-004, presumably others). No version/history block. | LOW |
| **JSDoc inconsistency** | Some methods have full JSDoc (`send`, `close`), others have only one-liner banners (`requestStatus`, `pause`, `resume`, `kill`). | LOW |
| **`ChannelRegistry` lifecycle undocumented** | When should `closeAll()` be called? Sprint cleanup? Process exit? Brain shutdown? No guidance. | MEDIUM |
| **Boundary with `permission-guard.ts`** | `src/agents/permission-guard.ts` imports from this file — relationship undocumented. | LOW |

---

## 6. ADR Compliance Check

| ADR | Relevance | Compliance | Detay |
|-----|-----------|------------|-------|
| **ADR-001** (TypeScript + ESM) | ✅ Applies | ✅ COMPLIANT | Pure TS, ESM with `.js` import extension on re-export. |
| **ADR-002** (Node16 Module Resolution) | ✅ Applies | ✅ COMPLIANT | Re-export uses `.js` extension correctly (line 369). |
| **ADR-003** (vitest over Jest) | ✅ Applies | ✅ COMPLIANT | Test file is vitest-native. |
| **ADR-008** (Brain Merkezi Import — Tek Yönlü Bağımlılık) | ⚠️ Applies | ⚠️ **AMBIGUOUS / NON-COMPLIANT** | Orchestra modules (`ipc-registry.ts`, `result-collector.ts`) import classes from `src/agents/worker-ipc.ts`. ADR-008 forbids non-Brain modules importing from `agents/`. **Spirit-wise**, these classes are wire-protocol primitives (closer to `core/` than `agents/`). **Action:** either relocate to `src/core/ipc-types.ts` OR document ADR-008 exception. |
| **ADR-010** (Tek Runtime Dependency — commander.js) | ✅ Applies | ✅ COMPLIANT | Zero runtime deps (only `node:child_process` type import). |
| **ADR-027** (Hybrid Spawn Backend) | ✅ Applies | ✅ COMPLIANT | This module is the IPC primitive enabling the fork path. |
| **ADR-032** (i18n Pattern System — TR/EN) | ⚪ Indirect | ⚪ N/A | No user-facing strings — code-level module. |
| **ADR-035** (Brain↔Worker↔Auditor Verification Protocol) | ✅ Applies | ⚠️ PARTIAL | `IPCMessageType` carries the 15-channel codes implicitly, but a direct mapping is undocumented. Protocol versioning absent. |
| **ADR-036** (ADR Governance Integration) | ⚪ Indirect | ⚪ N/A | Module doesn't query/inject ADRs. |
| **ADR-037** (RBAC Authority Matrix V1.0) | ✅ Applies | ⚠️ PARTIAL | `PAUSE`/`RESUME`/`KILL` are Brain-authorized. This file is the transport — enforcement is caller-side (advisory in V1.0; consistent with ADR-037 design intent). |
| **ADR-038** (Dead Code Disposition) | ⚠️ Applies | ⚠️ PARTIAL | `WorkerSideChannel` production usage needs confirmation; if dormant, ADR-038 disposition kicks in. |
| **ADR-040** (Nervous System Architecture) | ⚪ Indirect | ⚪ N/A | Nervous-system events don't ride this transport (separate channel). |
| **ADR-043** (Brain Crash Recovery Protocol) | ✅ Applies | ⚠️ PARTIAL | If Brain crashes, `ChannelRegistry` state is lost in-memory. Recovery protocol needs to re-attach to orphaned worker processes — this file doesn't expose attach-by-PID. |
| **ADR-044** (Sprint State Observability Contract) | ✅ Applies | ⚠️ PARTIAL | `STATUS_RESPONSE` is the observability channel — but production wire absent (see §4). |
| **ADR-046** (Brain Self-Update Hook Architecture) | ✅ Applies | ✅ COMPLIANT | `QUESTION`/`ANSWER` types carry `askBrain` requests (Sprint 135 T-004). |
| **ADR-048** (Prompt Lifecycle Contract) | ⚪ Indirect | ⚪ N/A | Not in scope. |
| **ADR-053** (TaskType Taxonomy) | ✅ Applies (audit context) | ✅ COMPLIANT | Audit task itself adheres to `document-write` taxonomy. |

**Aksiyon gereken ADR'lar:**
1. **ADR-008:** Wrong-direction import — relocate or document exception (Sprint 188 high-priority).
2. **ADR-035:** Add explicit channel-code → message-type mapping in module header.
3. **ADR-044:** Wire `STATUS_RESPONSE` flow OR remove from `IPCMessageType` union.
4. **ADR-043:** Add `WorkerChannel.attach(pid)` for crash recovery.

---

## 7. Refactor Recommendations

**R1 — Relocate to `src/core/ipc-types.ts` (ADR-008 alignment):**
The 3 classes + types are wire-protocol infrastructure, not agent logic. Move them:
```
src/agents/worker-ipc.ts (current)
  → src/core/ipc-types.ts (move WorkerChannel, WorkerSideChannel, ChannelRegistry, IPCMessage*)
  → src/agents/worker-ipc.ts (shrink to re-export shim only — backward compat)
```
Effort: normal. Breaking change: none (re-exports preserve API).

**R2 — Typed payload discriminated union:**
```typescript
type IPCMessage =
  | { type: 'HEARTBEAT'; taskId: string; payload: HeartbeatPayload; timestamp: string }
  | { type: 'STATUS_REQUEST'; taskId: string; timestamp: string }
  | { type: 'STATUS_RESPONSE'; taskId: string; payload: StatusResponsePayload; timestamp: string }
  | { type: 'PAUSE'; taskId: string; payload?: { reason?: string }; timestamp: string }
  | { type: 'RESUME'; taskId: string; timestamp: string }
  | { type: 'KILL'; taskId: string; payload?: { signal?: NodeJS.Signals }; timestamp: string }
  | { type: 'QUESTION'; taskId: string; payload: { question: string; questionId: string }; timestamp: string }
  | { type: 'ANSWER'; taskId: string; payload: { answer: string; questionId: string }; timestamp: string };
```
This makes `isIPCMessage` enforce per-type payload schemas and improves call-site safety.

**R3 — Protocol versioning:**
Add `version: '1'` field. Bump for v2.

**R4 — `onHandlerError` callback:**
Replace silent `// swallow` with opt-in error reporting.

**R5 — `closeAll()` returns count:**
For Brain shutdown logs: `closeAll(): number` returning closed channel count.

**R6 — `WorkerChannel.attach(childProcess, taskId)`:**
Reattach to a forked child after Brain crash (paired with ADR-043).

**R7 — Migrate re-export shim consumers:**
Add `@deprecated` JSDoc on shim exports. Update test imports to point at `ipc-registry.ts` directly.

**R8 — `messageerror` listener:**
```typescript
if (typeof this.proc.on === 'function') {
  this.proc.on('message', this.boundListener);
  this.proc.on('messageerror', (err) => { /* log + emit */ });
}
```

**R9 — Sender DI for `WorkerSideChannel`:**
Accept optional `sender?: typeof process.send` to remove global `process.send` reference.

**R10 — Drop or wire `STATUS_RESPONSE`:**
Add `WorkerSideChannel.respondStatus(payload)` helper OR remove unused `STATUS_RESPONSE` from the union.

---

## 8. Sprint 188 Follow-up Items

| Item | Owner | Priority | Effort | Notes |
|------|-------|----------|--------|-------|
| **F1:** Resolve ADR-008 placement — relocate to `src/core/ipc-types.ts` or document exception | architecture-planner | HIGH | normal | Hidden architectural debt — cleanest fix is relocation + re-export shim |
| **F2:** Confirm `WorkerSideChannel` production usage in `src/agents/worker.ts` | refactorer | HIGH | low | If dormant → ADR-038 disposition |
| **F3:** Confirm `STATUS_RESPONSE` flow — wire or remove from union | refactorer | MEDIUM | low | Type-cleanness + observability gap |
| **F4:** Add protocol `version` field + ADR-035 v2 negotiation | architect | MEDIUM | normal | Future-proofing for protocol evolution |
| **F5:** Add ADR-035 channel-code → `IPCMessageType` mapping table in module header | doc-writer | MEDIUM | low | Documentation gap fix |
| **F6:** Typed discriminated `IPCMessage` union (R2) | typescript-expert | MEDIUM | normal | Breaking change — test impact ~17 files |
| **F7:** `onHandlerError` opt-in callback (R4) | refactorer | LOW | low | Quality of life — debug visibility |
| **F8:** `messageerror` listener (R8) | bug-fixer | LOW | low | Edge case hardening |
| **F9:** `WorkerChannel.attach(pid, taskId)` for ADR-043 crash recovery | architect | MEDIUM | high | Paired with sprint-checkpoint resume work |
| **F10:** Mark re-export shim with `@deprecated` + migration tracking issue | doc-writer | LOW | low | Lights the path for shim retirement |
| **F11:** Add IPC sequence diagram to `docs/reference/api-surface.md` | doc-writer | MEDIUM | normal | High-value onboarding artifact |
| **F12:** Test coverage report for this file — confirm branch coverage on closed-channel + handler-throw paths | testing-expert | LOW | low | Verification |

---

## 9. Summary

`src/agents/worker-ipc.ts` (369 LoC) is **production-critical IPC infrastructure** — it carries the wire protocol for Brain↔Worker bidirectional communication in subprocess (fork) backend, and via re-export shim hosts the `askBrain` registry from Sprint 135 T-004. It is well-encapsulated, dependency-free, and **live in production**.

**Kritik bulgular:**
- 🔴 **ADR-008 wrong-direction concern** — orchestra/ modules import wire-protocol classes from agents/. Either relocate to `src/core/ipc-types.ts` or document exception. **Highest-priority follow-up.**
- 🟡 **Untyped payloads** — `payload: unknown` weakens the entire IPC contract. Discriminated union refactor is moderate effort, high value.
- 🟡 **Possibly dormant `WorkerSideChannel`** — production usage uncertain (worker.ts uses file-based HB). ADR-038 disposition needed.
- 🟡 **`STATUS_RESPONSE` declared but never sent** — observability gap (ADR-044 partial).
- 🟡 **No protocol versioning** — ADR-035 v2 evolution cannot be negotiated.
- 🟢 **Re-export shim healthy** — Sprint 135 T-004 design intact, no breakage risk.
- 🟢 **Zero runtime deps** — ADR-010 fully satisfied.
- 🟢 **Test surface large** — 17 test files indirectly cover this module; refactor risk well-mitigated.

**Önerilen aksiyon (Sprint 188):** **Relocate** wire-protocol classes to `src/core/ipc-types.ts` (R1) + add **typed discriminated payload union** (R2) + add **protocol version field** (R3). These three changes together resolve the ADR-008 architectural concern, harden the contract, and future-proof the protocol — all with backward-compatible re-export shim retention.

**Per-file pilot meta-notu:** worker-ipc.ts is the **load-bearing transport** for nearly every other module in this 50-task pilot. Architectural concerns here (ADR-008 placement) ripple outward — a Sprint 188 focused refactor on this file alone could unlock cleaner imports across `src/orchestra/`, `src/agents/permission-guard.ts`, and the IPC registry. High leverage.
