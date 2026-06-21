# api#5 — api code-audit (watcher, worker-logs)

> Read-only structural audit. 2 files read in full (`src/api/watcher.ts`, `src/api/worker-logs.ts`), plus
> their test files (`tests/api/watcher.test.ts`, `tests/api/worker-logs.test.ts`) for dead-test analysis.
> Every finding carries `file:line` + proving snippet.
> Zero-caller/dormant claims grep-verified across `src/` (def + test excluded).
> Categories: unwired | dormant | inconsistent | dead-test | root-cause.

## Findings

### unwired (zero production callers — grep-verified)

- [unwired|medium] `startWorkerLogTail` exported but has zero external callers — `src/api/worker-logs.ts:95` —
  `export function startWorkerLogTail(opts: WorkerLogTailOptions): WorkerLogTail` — Only called internally at
  line 241 by `handleWorkerLogStream` within the same module. `grep -r "startWorkerLogTail" src/ tests/` returns
  no hit outside `worker-logs.ts`. The export widens the public API surface with no consumer, and since the sole
  real caller (`handleWorkerLogStream`) is the entry-point used in production (server.ts:760), the exported
  primitive is effectively internal-only.

- [unwired|low] `WorkerLogTail` and `WorkerLogTailOptions` exported interfaces have zero callers — `src/api/worker-logs.ts:40,44` —
  ```ts
  export interface WorkerLogTail { close(): void; }           // :40
  export interface WorkerLogTailOptions { projectRoot: string; taskId: string; ... } // :44
  ```
  `grep -r "WorkerLogTail\|WorkerLogTailOptions" src/ tests/ --include="*.ts"` → 0 hits outside
  `worker-logs.ts` itself (tests only import `matchWorkerLogStream`, `isValidTaskId`, `formatWorkerLogFrame`).
  These are companion types for the unwired `startWorkerLogTail`; orphaned by the same unwired export.

### dormant (defined-but-unread / no-op gate in production)

- [dormant|medium] `debounceMs` option in `WorkerLogTailOptions` is never set by the sole production caller —
  `src/api/worker-logs.ts:51` — `debounceMs?: number;` — `handleWorkerLogStream` is the only path that
  constructs a `WorkerLogTailOptions` (line 241–251), and it never passes `debounceMs`:
  ```ts
  const tail = startWorkerLogTail({
    projectRoot,
    taskId,
    onEvent: (ev) => { ... },
    // debounceMs omitted — always resolves to DEFAULT_DEBOUNCE_MS = 100
  });
  ```
  The option exists with a default-fallback (`opts.debounceMs ?? DEFAULT_DEBOUNCE_MS` at line 97), but since
  `startWorkerLogTail` has zero external callers, the field is permanently dormant — it is defined and guarded
  but can never be set in a running system.

### inconsistent (duplicate / divergent / conflicting definitions)

- [inconsistent|low] Two independent debounce constants for identical FS-watch patterns in the same directory —
  `src/api/watcher.ts:12` `const DEBOUNCE_MS = 500;` vs `src/api/worker-logs.ts:54`
  `const DEFAULT_DEBOUNCE_MS = 100;` — Both modules debounce `fs.watch` filesystem events in `src/api/`; neither
  imports from the other. The naming convention diverges (`DEBOUNCE_MS` vs `DEFAULT_DEBOUNCE_MS`), the magnitudes
  differ 5×, and there is no shared constant. While the two use-cases (dashboard file refresh vs log stream tail)
  may tolerate different windows, the independent definitions create a coordination risk if either value needs
  tuning: callers have no way to discover the other module's constant exists.

### dead-test (mock-only / stale / tests over dead production code)

- [dead-test|medium] `watcher.test.ts` is entirely mock-based — the real `fs.watch` is never exercised —
  `tests/api/watcher.test.ts:4-6` —
  ```ts
  vi.mock('node:fs', () => ({
    watch: vi.fn(() => ({ close: vi.fn() })),
  }));
  ```
  Every assertion runs against a synthetic `FSWatcher` stub. Critically, the FSWatcher `'error'` event path
  is never exercised — meaning the missing error-handler bug (see root-cause below) is invisible to this suite.
  The debounce behaviour IS tested via `vi.useFakeTimers()`, which tests real module logic, but all filesystem
  interactions are simulated. A test in which `fs.watch` is a `vi.fn()` stub cannot detect crashes caused by
  unhandled `FSWatcher` error events.

### root-cause (advisory-soft / trust-without-verify / silent-fallback / hardcoded-0-metric)

- [root-cause|high] No error handler on the `FSWatcher` in `watcher.ts` — `src/api/watcher.ts:14` —
  ```ts
  const watcher: FSWatcher = watch(filePath, () => {
    // ... debounce logic
  });
  ```
  No `.on('error', ...)` is attached. In Node.js, an unhandled `'error'` event on an `EventEmitter` throws an
  uncaught exception and crashes the process. `fs.watch` can emit `'error'` in multiple real-world conditions:
  EPERM (permission withdrawn), inotify limit exhausted, or underlying path removed (Linux). Compare:
  `src/api/worker-logs.ts:192` correctly registers `watcher.on('error', (err) => { debugLog(...) })`. The
  watcher.ts omission is a silent crash risk in the `serve` process; its test suite cannot detect it (mock-only,
  see dead-test above).

- [root-cause|high] Silent fallback on mid-stream log-read failure — `src/api/worker-logs.ts:127-130` —
  ```ts
  try {
    content = readFileSync(logFile, 'utf-8');
  } catch (err) {
    debugLog('worker-logs:read', err);
    return;  // ← silent stop; no SSE notification to client
  }
  ```
  Inside `drainFresh()`: if `readFileSync` throws mid-stream (EPERM, I/O error, file deleted), the drain
  silently returns. The client's SSE stream stops receiving lines with no notification — the dashboard cannot
  distinguish "worker is idle" from "log became unreadable". The `log_unavailable` event at line 177 is
  emitted only at connect-time init; there is no mid-stream failure signal. A trust-without-verify pattern:
  the log file's continued readability is assumed for the entire session.

- [root-cause|medium] Silent degrade when `.tasks/` directory is absent at connect time —
  `src/api/worker-logs.ts:186-195` —
  ```ts
  if (existsSync(tasksDir)) {
    watcher = watch(tasksDir, (_event, filename) => { ... });
    // ...
  }
  // else: watcher stays null — no filesystem events ever watched
  ```
  If `.tasks/` does not exist when the SSE connection is established, `watcher` remains `null` permanently. A
  log file written later (after `.tasks/` is created by the first worker spawn) is never picked up. The client
  remains stuck on the initial `log_unavailable` event with no recovery path — the backfill also returned no
  lines since `existsSync(logFile)` was false at init. The comment at line 197–198 acknowledges "degrade to
  backfill-only rather than crash serve", but since backfill also found nothing, the degrade is total: the
  stream emits exactly one `log_unavailable` and then produces nothing forever.

## Summary

2 api cluster files audited (`watcher.ts` 28 LoC, `worker-logs.ts` 254 LoC); zero source changes.
**8 findings** across the 5 categories:

- **unwired (2):** `startWorkerLogTail` exported with zero external callers; `WorkerLogTail`/`WorkerLogTailOptions` companion interfaces similarly orphaned.
- **dormant (1):** `debounceMs` option in `WorkerLogTailOptions` permanently dead — sole caller (`handleWorkerLogStream`) never sets it.
- **inconsistent (1):** `DEBOUNCE_MS = 500` (watcher.ts) vs `DEFAULT_DEBOUNCE_MS = 100` (worker-logs.ts) — two independent debounce constants for the same FS-watch pattern, divergent names and 5× magnitude difference.
- **dead-test (1):** `watcher.test.ts` mock-only (`vi.mock('node:fs')`); FSWatcher error-event path untestable, hiding the root-cause crash risk below.
- **root-cause (3):** Missing FSWatcher error handler in `watcher.ts` (crash risk); silent fallback on mid-stream `readFileSync` failure (client sees no notification); silent total degrade when `.tasks/` is absent at connect time (watcher never created, stream produces nothing after `log_unavailable`).

Highest-severity: the missing FSWatcher error handler (`watcher.ts:14`) is a silent crash risk in the `serve` process; the mid-stream read-failure silent-fallback (`worker-logs.ts:128-130`) makes the live log panel indistinguishable from "worker idle" on I/O error.
