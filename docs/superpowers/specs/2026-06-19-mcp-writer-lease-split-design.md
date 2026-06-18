# MCP Writer-Lease Split (MCP-W1) — Design Spec

- **Date:** 2026-06-19
- **Status:** approved (brainstorm → spec)
- **Owner:** Alperen
- **Cross-ref:** memory `project_mcp_writer_lease_split`; MASTER-PLAN §10 SONRAKİ-OTURUM kuyruğu (MCP-W1); resource-arbiter spec (MASTER-PLAN §4I — same lease mechanism family); ADR-038 (dead-code disposition).

## Problem

deckent's MCP server is a **whole-server singleton**. `src/mcp/server.ts:main()` calls
`bootSingletonGuard(process.cwd())`, which `acquireSingletonLock()` (O_EXCL on
`.deckent/mcp-server.pid`, `src/mcp/server-singleton-lock.ts`). When a second IDE window
(or a CLI + IDE pair) starts its own `npx deckent-mcp` against the same project, the boot
hits `SingletonLockError` → `process.exit(2)` → the MCP client sees a connection failure
and surfaces **`-32000`**. Only one window has a working deckent MCP at a time.

The singleton was added (Sprint 161 T-006) to prevent a double-sprint-start race. But it is
the wrong layer: it locks the *entire* tool surface — including pure read tools (status,
memory_query, history, usage, watch, …) — when the only thing that actually needs
serialization is **mutating** operations. The double-start race is already guarded one layer
deeper by the sprint lock (`src/core/multi-ide.ts` `isSprintLocked`, enforced in
`deckent_start`). So the server-level singleton is both too broad (kills reads) and
redundant (the deep lock is the real guard).

## Goal

- Every IDE window boots its own MCP server. **Read tools work in every window.**
- **Write (mutating) tools are serialized** to a single window via a project-scoped
  **writer-lease**.
- The lease **auto-transfers** when the owning window exits (dead pid) or goes stale
  (no heartbeat past TTL). No manual step, no new tool.
- A non-owner window calling a write tool gets a **friendly, i18n'd, non-fatal** denial — never
  a `-32000` transport crash.

Non-goals (v1): an explicit `deckent_mcp claim/release` management tool (auto-handover only);
a background heartbeat timer (lazy heartbeat-on-write is sufficient — see Error Handling).

## Decisions (locked during brainstorm)

1. **Per-action precision.** `readOnlyHint:false` tools are lease-gated. The four *mixed*
   tools (one tool, both read and write actions) get a small `isWriteAction(args)` predicate so
   their **read actions still run in every window**. `deckent_plan` is reclassified to
   `readOnlyHint:false` and `deckent_process` gets the missing annotation (both genuinely
   mutate — this also fixes a latent classification bug and makes `readOnlyHint` a truthful
   single source of write/read truth).
2. **Auto-handover only.** On owner death (dead pid) or stale heartbeat (> TTL), the next
   write call in any other window auto-claims the lease. No new tool surface (35 tools stay 35).
3. **Mechanism = Approach A** (annotation-derived central gate). Rejected: B (explicit
   `WRITE_TOOLS` list → duplicates `readOnlyHint`, DRY violation, 13-file churn); C
   (low-level `CallToolRequest` interceptor → couples to SDK internals, fragile, still needs a
   static classification map).

## Architecture

```
                       ┌─────────────────────────────────────────┐
  IDE window A ── stdio ┤ MCP server A (own process)              │
                       │   registerTools(server, ctx)            │
                       │     └─ gate: readOnlyHint:false handlers │
                       │          wrapped with writer-lease check │
                       └───────────────┬─────────────────────────┘
                                       │ write call → acquireOrCheckWriterLease(root)
  IDE window B ── stdio ── MCP server B │                         ▼
                                       │            .deckent/mcp-writer.lease
                                       │            { pid, acquiredAt, heartbeatAt, ttlMs }
                                       │   read call → handler runs directly (never gated)
```

The server-level singleton is removed entirely. Serialization moves from *boot* to *write-call*,
and from *whole-server* to *per-mutation*.

## Components

### A. `src/mcp/writer-lease.ts` (new)

The lease primitive. Mirrors the existing O_EXCL + pid-liveness pattern in
`file-lock.ts` / `server-singleton-lock.ts`.

Lease file `.deckent/mcp-writer.lease` (JSON):

```json
{ "pid": 12345, "acquiredAt": "ISO8601", "heartbeatAt": "ISO8601", "ttlMs": 120000 }
```

Surface:

- `acquireOrCheckWriterLease(projectRoot, opts?) → LeaseResult`
  - `opts`: `{ ttlMs?: number, isAlive?: (pid:number)=>boolean, now?: () => number }`
    (`isAlive`/`now` are dependency-injected for deterministic tests; default to the real
    `isProcessAlive` / `Date.now`).
  - `LeaseResult`: `{ ok: true, ownerPid: number, stolen: boolean } | { ok: false, ownerPid: number }`.
  - Logic:
    - **No lease file** → write `{pid: process.pid, …}` via O_EXCL → `{ok:true, stolen:false}`.
    - **Owned by self** (`pid === process.pid`) → refresh `heartbeatAt` → `{ok:true, stolen:false}`.
    - **Owned by other, alive, fresh** (`isAlive(pid) && now - heartbeatAt <= ttlMs`)
      → `{ok:false, ownerPid}`.
    - **Owned by other, dead OR stale** → steal: unlink + O_EXCL re-create with this pid
      → `{ok:true, stolen:true}`. On steal-race EEXIST, re-read; if the new owner is live+fresh,
      return `{ok:false, ownerPid}`.
    - **Corrupt/unparseable lease** → treat as free, acquire (file-lock.ts precedent).
- `releaseWriterLease(projectRoot)` — unlink iff this pid owns it (best-effort, never throws).
- `readWriterLease(projectRoot) → LeaseInfo | null` — diagnostics / tests.
- `isProcessAlive(pid)` — migrated from `server-singleton-lock.ts` (`process.kill(pid,0)`,
  `EPERM` → alive).

### B. Gate — `src/mcp/tools/index.ts` (modified)

`registerTools(server, ctx?)` gains an optional context
`ctx = { projectRoot?: string; lang?: 'en'|'tr'; ttlMs?: number }`
(defaults: `process.cwd()`, `'en'`, `120000`). It installs a single interception point over
`server.registerTool` so that **every** tool registered with `readOnlyHint === false` has its
handler wrapped with the lease gate. `readOnlyHint:true` tools are registered untouched.

Per-action predicates (only the four mixed tools; everything else defaults to
"always a write"):

```
WRITE_ACTION_PREDICATES = {
  deckent_config:         a => a.action === 'set',
  deckent_docs:           a => ['add','remove','update','run','track-scan'].includes(a.action),
  deckent_autonomous:     a => ['start','stop','backlog_add','backlog_remove','approve','reject'].includes(a.action),
  deckent_nervous_config: a => ['set_preset','set_override','reset'].includes(a.action),
}
```

(Exact action strings to be re-verified against each tool's `inputSchema` enum during
implementation; the list above is taken from the current enums.)

Gated handler:

```
gatedHandler(args, extra):
  const isWrite = (WRITE_ACTION_PREDICATES[name] ?? (() => true))(args)
  if (!isWrite) return originalHandler(args, extra)            // read action → never gated
  const lease = acquireOrCheckWriterLease(projectRoot, { ttlMs })
  if (!lease.ok) return leaseDenialResponse(name, lease.ownerPid, lang)
  return originalHandler(args, extra)
```

The interception lives in one well-commented place in `registerTools`. Individual tool files
are **not** touched for gating (only the two annotation fixes in C).

### C. Annotation fixes

- `src/mcp/tools/plan.ts`: `readOnlyHint: true → false` (plan writes `.tasks/task-*.json`;
  it mutates and belongs in the write set — matches the canonical write list in the
  `project_mcp_writer_lease_split` memory).
- `src/mcp/tools/process.ts`: add `annotations: { readOnlyHint: false, destructiveHint: false,
  idempotentHint: false }` (submitting an ExecutionRequest mutates).
- `src/mcp/tools/nervous.ts`: audit per-sub-tool annotations —
  `deckent_nervous_subscribe`/`deckent_nervous_status` → `readOnlyHint:true`;
  `deckent_nervous_accept`/`deckent_nervous_reject` → `readOnlyHint:false` (pure write,
  no predicate); `deckent_nervous_config` → `readOnlyHint:false` (+ predicate in B).

### D. `src/mcp/server.ts` (modified)

- Remove the `bootSingletonGuard(process.cwd())` call from `main()`, plus the
  `bootSingletonGuard` and `installSingletonReleaseHooks` functions and the singleton imports.
- `createServer()` / `main()` resolve the lease context (`projectRoot`, `lang` from config when
  available else `'en'`, `ttlMs` from config else default) and pass it to `registerTools`.
- Install writer-lease release hooks: `process.on('exit'|'SIGTERM'|'SIGINT')` →
  `releaseWriterLease(projectRoot)` (best-effort; mirrors the previous release-hook shape).

### E. Deletions (ADR-038 — no dead code)

- `src/mcp/server-singleton-lock.ts` (singleton concept retired; `isProcessAlive` moves to
  `writer-lease.ts`).
- `tests/mcp/server-singleton.test.ts`.
- `tests/orchestra/brain-crash-injection.test.ts` — update the `isProcessAlive` import to the
  new `writer-lease.ts` location (if it imports from singleton-lock; verify during impl).

### F. i18n — `src/cli/helpers/messages.ts`

New key `mcpWriterLeaseDenied` (en + tr). The mechanism module stays string-free; the gate
calls `getMessage('mcpWriterLeaseDenied', lang)` and fills `{tool}`/`{pid}`.

- en: `Write tool '{tool}' is held by another deckent window (pid {pid}). Read tools work here; mutations run in that window — the lease transfers automatically when it exits.`
- tr: `'{tool}' yazma aracı başka bir deckent penceresinde (pid {pid}) kilitli. Okuma araçları burada çalışır; değişiklikler o pencerede yürür — pencere kapanınca yetki otomatik devrolur.`

### G. Config (additive) — `src/core/config.ts`

Optional `mcp.writer_lease_ttl_ms` (default `120000`). Absent config → default. Purely additive;
no behavior change when unset.

## Data Flow

1. Window A boots → MCP server A up. Window B boots → MCP server B up. Both serve read tools.
2. A calls `deckent_start` (write) → gate → no lease → acquire (pidA) → handler runs.
3. B calls `deckent_status` (read) → not gated → runs. ✓
4. B calls `deckent_start` (write) → gate → lease owned by pidA, alive + fresh → **deny**
   (i18n message naming pidA). No crash.
5. A exits → release hook unlinks the lease (or pidA dies → lease is dead-pid/stale).
6. B calls `deckent_start` again → gate → lease free / dead-pid → steal → acquire (pidB) → runs.
   **Auto-handover complete.**

Mixed-tool example: B calls `deckent_config {action:'read'}` → predicate false → runs in B. ✓
B calls `deckent_config {action:'set'}` while A owns the lease → denied. ✓

## Error Handling / Fail-Safe

- **Corrupt lease file** → treated as free; the caller acquires (file-lock.ts precedent).
- **Filesystem error during acquire** → **fail-open** (allow the write) + a stderr warn. The only
  genuinely dangerous mutation (`deckent_start`) is still backstopped by the deep sprint lock
  (`isSprintLocked`), so a transient lease-fs failure can never brick the entire write surface.
- **Denial shape** → a normal tool result, never a thrown transport error:
  `{ isError: true, code: 'WRITER_LEASE_DENIED', ownerPid, message }`, wrapped via the existing
  `formatErrorResponse` / `wrapResponse` helpers. **No `-32000` is ever produced by the gate.**
- **Lease churn during a long sprint:** if the owner window is idle (no write calls) past the
  TTL, another window may steal the lease. This is harmless: a second `deckent_start` is still
  refused by `isSprintLocked`. TTL defaults to 120s to keep churn rare; the dead-pid path makes a
  crashed owner hand over immediately regardless of TTL.

## Testing (hermetic — tmpdir, async only, DI clock/isAlive)

1. **writer-lease unit** (`tests/mcp/writer-lease.test.ts`): acquire-when-free writes pid;
   self re-acquire refreshes heartbeat; other-alive-fresh → deny; dead-pid → steal; stale
   (alive but `now - heartbeatAt > ttl`) → steal; corrupt file → acquire. `isAlive`/`now`
   injected — no real foreign pids, fully deterministic.
2. **gate integration** (`tests/mcp/writer-lease-gate.test.ts`): register a fake read tool and a
   fake write tool on a stub/minimal server; assert the read handler always runs; the write
   handler is denied when the lease is held by another (simulated) owner and runs after handover;
   assert the mixed-tool predicate (config `read` passes, config `set` is gated).
3. **annotation** (`tests/mcp/tool-annotations.test.ts` or extend existing): assert
   `deckent_plan` and `deckent_process` now register with `readOnlyHint:false` (and are
   therefore in the gated set); nervous sub-tools carry the corrected hints.
4. **no-`-32000`** : two boot paths (`createServer` twice / two `acquireOrCheckWriterLease`
   from distinct simulated pids) never throw a singleton error — boot is idempotent now.
5. **i18n**: `getMessage('mcpWriterLeaseDenied','en')` and `'tr'` are non-empty and contain the
   filled `{tool}`/`{pid}` placeholders.

All tests use `os.tmpdir()` fixtures and tear down in `afterEach`; no gitignored local state,
no `spawnSync`. `tsc --noEmit` clean; the affected suites stay green (lossless).

## File Scope

- **New:** `src/mcp/writer-lease.ts`; `tests/mcp/writer-lease.test.ts`;
  `tests/mcp/writer-lease-gate.test.ts`; annotation + i18n tests.
- **Modified:** `src/mcp/tools/index.ts`, `src/mcp/server.ts`, `src/mcp/tools/plan.ts`,
  `src/mcp/tools/process.ts`, `src/mcp/tools/nervous.ts`, `src/cli/helpers/messages.ts`,
  `src/core/config.ts`, `tests/orchestra/brain-crash-injection.test.ts`.
- **Deleted:** `src/mcp/server-singleton-lock.ts`, `tests/mcp/server-singleton.test.ts`.

## Out of Scope / Future

- Explicit `deckent_mcp` management tool (claim/status/release) — deferred (auto-handover covers
  the real case; revisit if forced takeover is ever needed).
- Convergence with the resource-arbiter (MASTER-PLAN §4I): the writer-lease is the same
  permission-before-action lease family and is a candidate first in-process consumer of the
  arbiter once that lands. Not coupled here.
- Multi-session `deckent_watch` is unaffected by design (read tools are never gated; each
  window's logging-notification stream is independent per transport).
