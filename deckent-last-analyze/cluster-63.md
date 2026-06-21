# api#3 — api (process/reactive/server/rate-limit/sprint-job/status-reconcile/terminal-audit)

Code-only audit. Each finding carries `file:line` + proving snippet. Caller-claims grep-verified
(test+def excluded). Files read in full: `src/api/process-endpoint.ts`, `src/api/rate-limiter.ts`,
`src/api/reactive-endpoint.ts`, `src/api/server.ts`, `src/api/sprint-job-runner.ts`,
`src/api/status-reconcile.ts`, `src/api/terminal/audit-integrity.ts`, `src/api/terminal/audit.ts`.

## Findings

- [unwired|high] Entire `src/api/rate-limiter.ts` module is dead — zero `src/` importer — `src/api/rate-limiter.ts:28` — `export class RateLimiter { ... check(ip): RateLimitResult ... }`. Grep `api/rate-limiter` over `src/**` → **no matches**; the only importer is `tests/api/rate-limiter.test.ts:2`. The live server uses its **own inline** `RateLimiter` (`src/api/server.ts:83`, constructed `src/api/server.ts:1308`). This token-bucket implementation (`Bucket{count,windowStart}`, `retryAfter`, `destroy()`, `unref` cleanup timer) is never wired into any route — purely a test-fixture module.

- [inconsistent|high] Two divergent `RateLimiter` classes with the same name + a third in `core/` — `src/api/server.ts:83` vs `src/api/rate-limiter.ts:28` — server.ts: `class RateLimiter { check(ip): boolean ... resetAt ... exemptLoopback ... snapshot() }` (fixed-window counter, boolean check, loopback-exempt, `snapshot()` for `/api/enterprise/rate`); rate-limiter.ts: `class RateLimiter { check(ip): RateLimitResult ... windowStart ... }` (token-bucket, structured result, no exempt, no snapshot). `tests/core/rate-limiter.test.ts:2` shows a **third** `src/core/rate-limiter.js`. Three same-named, behaviorally-divergent limiters — an importer can trivially wire the wrong contract (`boolean` vs `{allowed,remaining,retryAfter}`).

- [root-cause|high] Production terminal audit sink is a silent no-op despite the comment claiming MemoryStore — `src/api/server.ts:1457` — `const auditSink: AuditSink = { insert: () => { /* no-op default */ } };` then `terminalAudit = new TerminalAudit(auditSink);` (`:1459`). The inline comment says *"Tests pass a no-op sink; production wires MemoryStore"* but the code **always** uses the no-op. Every terminal lifecycle event — `auth.deny` (`server.ts:1525`), `session.create` (`:1548`), `session.kill` (`:1575`) — is dropped on the floor. No `AuditIntegrityConfig` is passed either, so the HMAC chain is also off. Corroborated by `deckent-last-standing.md:736` and `docs/audits/dynamic-split/integration-audit.md:300` (R4).

- [dormant|high] HMAC chain-aware path in `TerminalAudit.record()` is unreachable in production — `src/api/terminal/audit.ts:74` — `if (this.integrity && isChainedSink(this.store)) { ... insertAuditWithHmac(...) }`. Production constructs `new TerminalAudit(auditSink)` with **no** `integrity` arg and a **no-op** sink (`server.ts:1459`), so `this.integrity` is `undefined` AND `isChainedSink` is false. The entire chain branch (`audit.ts:74-97`) is dead; only the legacy `store.insert(...)` path (`audit.ts:101-107`) is reachable, and that hits the no-op insert. `insertAuditWithHmac`/`getLastAuditHmac` are implemented on `MemoryStore` (`src/core/memory-store.ts:1002,1069`) but `insertAuditWithHmac` has **zero non-test callers other than `audit.ts:84`** — i.e. the only producer of chained audit rows is this dead path.

- [root-cause|medium] `verifyAuditChain` reports `ok:true` over a chain it never actually verifies (vacuous pass) — `src/api/terminal/audit-integrity.ts:113` — `if (row.audit_hmac === null) { continue; }`. Rows lacking a stored hmac are skipped; a table of all-null rows yields `{ ok:true, rowsVerified:0 }` (or `note:'no audit rows'` at `:108`). Because the sole chained-row producer is dead in production (see above), `deckent audit-verify` (`src/cli/commands/audit-verify.ts:38`) always walks **zero** rows → the I4 "tamper-evident" guarantee is operationally vacuous, yet exits 0 ("Audit chain OK").

- [root-cause|medium] `startSprintDetached` swallows only synchronous spawn throws — async ENOENT `'error'` event is unhandled → process crash — `src/api/sprint-job-runner.ts:28` — `const child = spawn('deckent', args, {detached:true, stdio:'ignore', cwd}); if (onExit) child.on('exit', onExit); child.unref();`. The `try/catch` (`:27,37`) only catches sync failures; `spawn` of a missing `deckent` binary does **not** throw — it emits an async `'error'` event. No `child.on('error', ...)` listener is registered, so an unrouted `'error'` becomes an uncaught exception. The comment *"serve loop must not crash on spawn failure"* (`:38`) is only half-true.

- [dormant|medium] `POST /api/plan` accepts a `directive` field that is parsed then discarded — `src/api/server.ts:906` — `void b.directive; // reserved for future use`. `PlanSchema` (`server.ts:154`) validates `directive: z.string().optional()`, so a caller can submit a directive over the dashboard plan endpoint and it is silently ignored (planning proceeds from on-disk `DIRECTIVES.md` only). Defined-but-unread input → no-op knob.

- [root-cause|medium] `POST /api/config` writes UNVALIDATED config when validation throws a non-`ConfigValidationError` — `src/api/server.ts:1068` — `// Non-validation errors (e.g. missing function) are ignored — write proceeds`. The inner `catch` (`:1063`) only short-circuits (422) for `ConfigValidationError`; any other throw from `validatePartialConfig` falls through and `writeFileSync(configPath, ...)` (`:1070`) persists the merged config without validation. Silent-fallback that defeats the validation gate it sits behind.

- [inconsistent|low] `status-reconcile` terminal-set duplicates enum members as raw strings and treats `CLEANUP` as terminal — `src/api/status-reconcile.ts:48` — `TERMINAL_STATUSES = new Set([SprintStatus.COMPLETE, SprintStatus.ABORTED, 'COMPLETE','ABORTED','COMPLETED'])` and `TERMINAL_PHASES = new Set([SprintPhase.COMPLETE,'COMPLETE','COMPLETED','CLEANUP'])` (`:56`). `'COMPLETED'` has no matching `SprintStatus`/`SprintPhase` member (defensive against a label that does not exist), and `CLEANUP` — a *live* pre-COMPLETE phase — is classified terminal, so a sprint still in CLEANUP reports `idle:true` to `/api/status`. Defensive but divergent from the canonical enum.

- [inconsistent|low] Route-registration family mixes async and sync signatures — `src/api/process-endpoint.ts:34` (`export async function registerProcessRoutes(...): Promise<boolean>`) vs `src/api/reactive-endpoint.ts:25` (`export function registerReactiveRoutes(...): boolean`). The dispatcher must `await` one (`server.ts:822,862`) and not the other (`server.ts:863`); the GET dispatch even passes `body=undefined` positionally (`server.ts:822`) to satisfy the async signature. Divergent contracts across sibling `register*Routes` helpers invite a missing-`await` bug.

- [dead-test|medium] HMAC chain + production wiring covered only by fake sinks — no test exercises the real `server.ts` audit wire — `tests/api/terminal/audit-integrity.test.ts:64` — `verifyAuditChain({ store: { queryAuditChain: () => rows }, secret })` (hand-built rows, inline fake store). `insertAuditWithHmac` has **zero** test callers (grep: only `src/core/memory-store.ts:1002` def + `src/api/terminal/audit.ts:84` caller). So the chain machinery is unit-tested in isolation while the production no-op-sink gap (`server.ts:1459`) is untested — the regression passes CI because nothing asserts the served terminal persists an audit row.

## Summary
11 findings. The dominant theme is the **terminal-audit I4 invariant being dead end-to-end in
production**: `server.ts:1459` wires a no-op `insert` sink with no `AuditIntegrityConfig`
(root-cause), which makes the chain-aware `record()` branch (`audit.ts:74`) dormant, makes
`verifyAuditChain` vacuous (`audit-integrity.ts:113` null-skip → `ok:true, rowsVerified:0`), and is
masked by fake-sink-only tests (dead-test). Second theme is **duplicate/divergent `RateLimiter`**:
`src/api/rate-limiter.ts` is an entirely unwired module (zero `src/` importer) shadowing the live
inline class in `server.ts:83` (and a third in `core/`). Lower-severity items: `sprint-job-runner.ts:28`
misses a `child.on('error')` listener (async-ENOENT crash path), `POST /api/plan` discards its
`directive` input (`server.ts:906`), and `POST /api/config` writes unvalidated config on a
non-validation throw (`server.ts:1068`). `process-endpoint.ts`, `reactive-endpoint.ts`, and
`status-reconcile.ts` are otherwise correctly wired (`server.ts:822/862/863/493`).
