# Audit — `src/agents/shared-context.ts`

> **Sprint 186 / Task 186-014 — 50-Task Per-File Pilot**
> Audit type: doc-only line-by-line review
> Auditor: w-186-014 (doc-writer agent, opus)
> Date: 2026-05-21

---

## 1. Inventory

| Field | Value |
|-------|-------|
| **Path** | `src/agents/shared-context.ts` |
| **LoC (wc -l)** | 120 (manifest declared 121 — 1-line delta; both within tolerance) |
| **Language** | TypeScript (ESM, Node16 module resolution) |
| **Module type** | Library class — no side effects on import |
| **Exports** | `SharedContext` (class), `SharedContextEntry` (interface) |
| **Default export** | None |

### Public Surface

| Symbol | Kind | Signature | Notes |
|--------|------|-----------|-------|
| `SharedContextEntry` | `interface` | `{ agentId: string; value: unknown; timestamp: string }` | Persisted record shape |
| `SharedContext` | `class` | `new SharedContext(projectRoot: string)` | Holds resolved `.tasks/shared-context.json` path |
| `.write` | method | `(agentId, key, value) => void` | Atomic merge-write, validates inputs |
| `.read` | method | `(key) => SharedContextEntry \| undefined` | Single-key lookup |
| `.readAll` | method | `() => Record<string, SharedContextEntry>` | Returns the whole map |
| `.clear` | method | `() => void` | Best-effort file deletion |
| `.remove` | method | `(key) => boolean` | Returns `true` if removed, `false` if absent |
| `.size` | method | `() => number` | Count of entries |
| `.has` | method | `(key) => boolean` | Existence check |

### Imports

| Import | Source | Purpose |
|--------|--------|---------|
| `readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync` | `node:fs` | Synchronous file I/O |
| `join, dirname` | `node:path` | Path composition |
| `ErrorRegistry` | `../core/errors.js` | Typed error creation (`DECKENT_E062`, `DECKENT_E063`) |

### Reverse Dependencies (production code)

| Consumer | Usage |
|----------|-------|
| `src/orchestra/multi-agent.ts:4,73,99` | Type import `SharedContext`; `runPipeline()` accepts an instance and calls `sharedContext.write(step.agentId, "pipeline:" + phase, …)` for every step result |
| `src/core/errors.ts:482-495` | Registers `DECKENT_E062` / `DECKENT_E063` consumed exclusively by this file |

### Reverse Dependencies (tests)

| Test file | Coverage focus |
|-----------|----------------|
| `tests/agents/shared-context.test.ts` (186 LoC) | Direct unit tests, mocked `node:fs`, covers `.write` / `.read` / `.readAll` / `.clear` / `.remove` / `.size` / `.has` |
| `tests/orchestra/multi-agent.test.ts` | Indirect coverage through `runPipeline()` |
| `tests/core/error-handling-unification.test.ts` | Verifies `DECKENT_E062` / `DECKENT_E063` registry wiring |

---

## 2. Bağlam — Architectural Context

`SharedContext` is the **inter-agent message bus for sequential pipelines**. It supports ADR-040's nervous-system orchestration model and the multi-agent pipeline pattern in `src/orchestra/multi-agent.ts`, where each pipeline step writes its output to a well-known key (`pipeline:{phase}`) so downstream agents can read upstream artifacts without an in-process callback.

**Persistence layer:** `.tasks/shared-context.json` — a single JSON object keyed by user-supplied string keys; values are `SharedContextEntry` records carrying the writing `agentId`, the payload, and an ISO 8601 timestamp.

**Atomicity contract:** writes are *single-process atomic* via a temp-file + `renameSync` pattern (POSIX `rename(2)` atomic on the same filesystem). The class makes **no concurrency guarantees across multiple worker processes** — the lock layer in `.locks/` (worker file lock contract per ADR-008/PATTERNS) is **not** acquired by `SharedContext`. Concurrent writers in the docker/tmux backends can therefore race on the read-modify-write sequence in `.write()` (see Debt Risk §3).

**Scope position:** sits in `src/agents/` despite acting as orchestra-level shared state. It is consumed from `src/orchestra/multi-agent.ts`, which imports it as a *type only* (`import type { SharedContext }`); the orchestra layer injects a constructed instance, so the class lives where the agent runtime can also instantiate it directly without crossing the orchestra/agents boundary in the wrong direction (ADR-008 compliant: agents → core, orchestra → agents).

**Related ADRs:**
- **ADR-008** (Brain Merkezi Import — Tek Yönlü Bağımlılık): the import direction here is agents → core; multi-agent.ts (orchestra) imports it downward. Compliant.
- **ADR-002** (Node16 Module Resolution): all relative imports carry `.js` extension. Compliant.
- **ADR-005** (Synchronous I/O — *deprecated*): this file still uses fully synchronous `node:fs` APIs, predating the deprecation. See §6, §7.
- **ADR-037** (Authority Matrix RBAC): writers self-identify via `agentId` — Auditor can post-hoc trace who wrote which key.

---

## 3. Debt Risk

| Risk | Severity | Evidence (file:line) | Description |
|------|----------|----------------------|-------------|
| **Multi-process race** | HIGH | `shared-context.ts:32-38, 73-78` | `.write()` does read-modify-write without `.locks/` coordination; two docker/subprocess workers writing different keys simultaneously can lose one update. Token-level atomicity (`renameSync`) only protects the *file*, not the *transaction*. |
| **Silent error swallow** | MEDIUM | `shared-context.ts:107-109` | `_readAll()` catches every error and returns `{}` — disk errors, permission failures, and malformed JSON are indistinguishable from "no file yet". This masks corruption and operational issues. |
| **Silent error swallow (clear)** | LOW | `shared-context.ts:65-67` | `.clear()` `catch {}` block swallows all errors with a "Best-effort clear" comment; if the unlink fails (e.g. EBUSY on Windows or permission), no signal reaches the caller. |
| **No payload schema validation** | MEDIUM | `shared-context.ts:103-106` | `_readAll()` only checks that the parsed root is a non-array object; entry shape (`agentId`, `value`, `timestamp`) is asserted-not-validated via `as Record<string, SharedContextEntry>`. A hand-edited or corrupted file can silently return type-violating data to callers. |
| **No file size / entry cap** | LOW | `shared-context.ts:32-38` | Unbounded growth — long-running sprints could accumulate thousands of `pipeline:{phase}` entries. No TTL, no `decay`, no per-sprint partition. |
| **Deprecated ADR-005 pattern** | LOW | `shared-context.ts:99, 101, 114, 117, 118` | Uses synchronous `node:fs` even though ADR-005 is deprecated. Acceptable for the worker hot-path (worker is single-threaded) but a long-term wart. |
| **`mkdirSync` per write** | LOW | `shared-context.ts:113-114` | `dirname(filePath)` is `.tasks/`, which is always pre-created by the orchestra. Calling `mkdirSync(..., { recursive: true })` on every write is a redundant syscall (cheap but wasteful). |
| **No concurrent readers/writers test** | MEDIUM | `tests/agents/shared-context.test.ts` (mock-based) | Tests mock `node:fs` with an in-memory `Map` — no fsync, no concurrent access, no real ENOENT race. The test suite cannot catch the §3.1 multi-process race. |

---

## 4. Dead Code Candidates

Grep audit of public methods against the entire repository (excluding `.deckent/archive/**` and `docs/archive/**`):

| Method | Production callers (grep) | Test callers | Verdict |
|--------|---------------------------|--------------|---------|
| `.write` | `src/orchestra/multi-agent.ts:99` | `tests/agents/shared-context.test.ts`, `tests/orchestra/multi-agent.test.ts` | LIVE |
| `.read` | _none in `src/**`_ | `tests/agents/shared-context.test.ts` | **CANDIDATE — only exercised by its own unit tests; no orchestra/agent caller** |
| `.readAll` | _none in `src/**`_ | `tests/agents/shared-context.test.ts` | **CANDIDATE — same as `.read`** |
| `.clear` | _none in `src/**`_ | `tests/agents/shared-context.test.ts` | **CANDIDATE — never invoked at sprint start; orchestra does not clear context between sprints** |
| `.remove` | _none in `src/**`_ | `tests/agents/shared-context.test.ts` | **CANDIDATE** |
| `.size` | _none in `src/**`_ | `tests/agents/shared-context.test.ts` | **CANDIDATE** |
| `.has` | _none in `src/**`_ | `tests/agents/shared-context.test.ts` | **CANDIDATE** |

### Grep Evidence

```text
$ grep -rE "sharedContext\.(read|readAll|clear|remove|size|has)\b" src/
(no matches)

$ grep -rE "sharedContext\.write\b" src/
src/orchestra/multi-agent.ts:99:      sharedContext.write(step.agentId, `pipeline:${step.phase}`, {

$ grep -rE "SharedContext" src/
src/agents/shared-context.ts:13:export class SharedContext {
src/orchestra/multi-agent.ts:4: import type { SharedContext } from '../agents/shared-context.js';
src/orchestra/multi-agent.ts:73:  sharedContext: SharedContext,
src/core/errors.ts:482: registry.set('DECKENT_E062', { … })
src/core/errors.ts:490: registry.set('DECKENT_E063', { … })
```

**Interpretation:** the read-side API is fully dead in production. `multi-agent.ts` writes pipeline outputs but never reads them back through `SharedContext`. Either (a) the read-side is **planned future surface** (per `docs/directives/sprint-029.md` which mentions this module) and should be flagged "API reserved for downstream consumers", or (b) it is genuine dead code that should be tagged `@internal` / removed.

This is an audit observation, not a removal recommendation — see §7.

---

## 5. Documentation Gaps

| Gap | Where | Recommendation |
|-----|-------|----------------|
| **Module-level docblock missing** | Top of file | Add a `/** @module shared-context */` block explaining purpose, persistence path (`.tasks/shared-context.json`), and concurrency model |
| **Concurrency semantics undocumented** | Class JSDoc | State explicitly: "*Single-process atomic via temp+rename. NOT safe across multiple worker processes — callers must coordinate via `.locks/`*" |
| **`SharedContextEntry` lacks field docs** | Lines 7-11 | Add per-field `/** */` comments (e.g. `timestamp: ISO 8601 UTC`) |
| **`.read` / `.readAll` return-shape contract** | Lines 41-55 | Document that `_readAll()` swallows parse errors — callers cannot distinguish "missing file" from "corrupted file" |
| **`.clear` failure modes** | Lines 57-68 | Document that `.clear()` is best-effort and never throws — callers cannot detect partial failure |
| **Atomicity guarantee scope** | Lines 22-23 (`.write` JSDoc) | Existing comment says "writes atomically (via .tmp + rename)" — clarify this is single-process only |
| **`tokenUsage` of `value: unknown`** | Line 9 | No size limits documented — callers might write multi-MB payloads (unintended) |
| **Cross-link to ADR-040** | Module header | This is part of the nervous-system inter-agent bus; reference ADR-040 for the broader architecture |

The TSDoc that exists today (lines 20-23, 41-44, 50-52, 56-58, 70-72, 80-82, 88-90) is **terse and accurate but minimal** — it documents *what* without covering *failure modes*, *concurrency*, or *contracts*.

---

## 6. ADR Compliance Check

| ADR | Constraint | Status | Evidence |
|-----|------------|--------|----------|
| **ADR-001** (TypeScript + ESM) | Project uses TS ESM | ✅ COMPLIANT | File is `.ts`, uses `import`/`export` syntax, no CJS interop |
| **ADR-002** (Node16 Module Resolution) | Relative imports must carry `.js` extension | ✅ COMPLIANT | `import { ErrorRegistry } from '../core/errors.js'` (line 5) |
| **ADR-004** (3-Layer Config Merge) | n/a — not a config consumer | ✅ N/A | Receives `projectRoot` injected; no config touch |
| **ADR-005** (Synchronous I/O — **deprecated**) | Prefer async I/O for new code | ⚠️  TOLERATED LEGACY | All fs calls are `*Sync`; predates deprecation. Worker hot-path is single-threaded so latency is bounded; flagged as low-priority refactor (§7) |
| **ADR-006** (spawnSync Security Pattern) | n/a — no child_process | ✅ N/A | Pure fs I/O |
| **ADR-008** (Brain Merkezi Import — One-way dependency) | agents → core only; orchestra → agents allowed | ✅ COMPLIANT | Imports from `../core/errors.js` only; `multi-agent.ts` (orchestra) imports downward via `import type` |
| **ADR-009** (DEBT.md Markdown Tablo Formatı) | n/a — not a docs file | ✅ N/A | |
| **ADR-010** (Single runtime dep — commander) | No additional runtime deps | ✅ COMPLIANT | Only `node:fs`, `node:path`, internal `errors.js` |
| **ADR-035** (Verification Protocol Standard) | Use channel codes for inter-agent signaling | ⚠️  PARTIAL | `agentId` field carries identity, but no channel-code envelope on `value` |
| **ADR-037** (Authority Matrix RBAC) | Audit-trail writers; advisory enforcement V1.0 | ✅ COMPLIANT | `agentId` is required + `timestamp` is mandated — sufficient for audit-trail forensics |
| **ADR-040** (Nervous System Architecture) | Inter-agent state must be observable | ⚠️  PARTIAL | State is observable via file read, but no event-stream emission on write |
| **ADR-046** (Brain Self-Update Hook Architecture) | n/a — runtime data store, not config | ✅ N/A | |
| **ADR-053** (TaskType Taxonomy) | n/a | ✅ N/A | |

**Net:** no hard violations. One deprecated-pattern continuation (ADR-005 sync I/O), two partial-alignments with ADR-035 / ADR-040 (channel codes, event emission).

---

## 7. Refactor Recommendations

Listed in order of estimated leverage (impact ÷ effort):

1. **Add `.locks/` integration to `.write()`** (HIGH leverage)
   Wrap the read-modify-write in a file-lock acquire/release using the same lock pattern as workers (`.locks/shared-context.json.lock`). Eliminates the multi-process race in §3.1. ~30 LoC.

2. **Distinguish missing-vs-corrupted in `_readAll()`** (HIGH leverage)
   Replace the blanket `try { … } catch { return {} }` with explicit handling: return `{}` only on `ENOENT`; for JSON parse / permission errors, log via `debugLog` and rethrow or emit a structured warning. ~10 LoC.

3. **Document concurrency contract in class JSDoc** (LOW effort, MEDIUM impact)
   Explicit statement that this is **not** multi-process safe without an external lock. Until §7.1 lands, this is the bare-minimum honesty fix. ~5 LoC.

4. **Tag dead read-side methods** (LOW effort)
   If `.read` / `.readAll` / `.clear` / `.remove` / `.size` / `.has` are reserved future API (per `docs/directives/sprint-029.md`), annotate with `/** @public — reserved for downstream agent consumers; no production callers yet */`. If they are genuine dead code, remove + cascade to tests. Decision belongs to Brain.

5. **Emit event-stream signal on write** (MEDIUM impact)
   Per ADR-040, every state mutation should be observable. After `_writeAtomic()`, emit a structured event (`shared_context.write` with `{ agentId, key, ts }`) into the event stream. ~5 LoC + import.

6. **Bound payload size** (LOW impact, defensive)
   Reject `value` whose JSON-stringified size exceeds N KB (e.g. 64 KB) with a new `DECKENT_E064` "shared context payload too large". Prevents accidental megabyte-class writes. ~10 LoC + error registry.

7. **Sprint-scope partition** (MEDIUM impact, requires planning)
   Persist as `.tasks/shared-context-{sprintId}.json` so that stale entries from previous sprints do not leak. Requires Brain-side cleanup integration. ~20 LoC + orchestra wire-up.

8. **Async I/O migration** (LOW priority — ADR-005 deprecated)
   Replace `*Sync` calls with `node:fs/promises`. Useful only if a future API server (`src/api/`) consumes this directly. Defer until ADR-005 hard-flip.

---

## 8. Sprint 188 Follow-up Items

These are concrete, actionable units the next sprint (188) should pick up:

| ID | Item | Owner suggestion | Effort | Priority |
|----|------|------------------|--------|----------|
| **FU-188-A** | Decide read-side API disposition: kept-as-reserved vs removed (§4) | Brain (architectural decision) | Decision | HIGH |
| **FU-188-B** | Wire `.write()` to `.locks/shared-context.json.lock` (§7.1) | bug-fixer + typescript-expert | normal | HIGH |
| **FU-188-C** | Disambiguate ENOENT vs corruption in `_readAll()` (§7.2) | refactorer + security-specialist | low | MEDIUM |
| **FU-188-D** | Expand class JSDoc to cover concurrency + failure modes (§5, §7.3) | doc-writer | low | MEDIUM |
| **FU-188-E** | Add concurrent-writer integration test (real fs, no mocks) (§3) | ci-testing + typescript-expert | normal | MEDIUM |
| **FU-188-F** | Emit `shared_context.write` event for ADR-040 observability (§7.5) | architecture-planner | low | LOW |
| **FU-188-G** | Cross-link this audit into `docs/audits/sprint-171/01-modul-derin/07-agents.md` (Sprint 171 references this file but pre-dates this audit) | doc-writer | low | LOW |
| **FU-188-H** | Evaluate sprint-scoped partitioning vs append-only journal (§7.7) | architect | high | LOW |

---

## 9. Summary

`src/agents/shared-context.ts` is a **small, focused, single-purpose persistence helper** (~120 LoC, single class, 7 public methods + 1 interface). It implements a JSON file-backed key-value bus that the multi-agent pipeline (`src/orchestra/multi-agent.ts`) uses to publish each step's output for downstream agents.

**Strengths**
- Clean separation: agents-layer module with one orchestra consumer (ADR-008 compliant)
- Atomic single-process writes via temp+rename
- Typed error contract through `ErrorRegistry` (`DECKENT_E062` / `DECKENT_E063`)
- Dedicated unit test file with 186 LoC of mocked coverage
- No external runtime dependencies (ADR-010 compliant)

**Concerns**
- **Multi-process race** — the read-modify-write in `.write()` is not coordinated through `.locks/` and can lose updates when docker/subprocess backends run workers in parallel
- **Silent error masking** — `_readAll()` returns `{}` for *every* failure mode, indistinguishable from a fresh sprint
- **Dead read-side surface** — `.read` / `.readAll` / `.clear` / `.remove` / `.size` / `.has` have **zero production callers**; only their own unit tests exercise them
- **ADR-005 (deprecated) synchronous I/O** still in use; tolerable but earmarked
- **JSDoc minimal** — atomicity claim is present but concurrency caveats and failure modes are undocumented

**Net disposition**: KEEP — production-critical (`multi-agent.ts` depends on `.write`). Modernization opportunities identified but no blocking risk for Sprint 186 deliverables. Promote FU-188-A (read-side API decision) and FU-188-B (lock integration) to Sprint 188 prioritised backlog.

**Audit completeness:** all 9 sections delivered, every claim traceable to source line numbers or grep evidence.
