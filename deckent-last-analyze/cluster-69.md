# mcp#4 — mcp code-audit (kill, memory-query, models, nervous, plan, process, recover, retro, review, run)

> Read-only structural audit. 10 source files read in full:
> `src/mcp/tools/{kill,memory-query,models,nervous,plan,process,recover,retro,review,run}.ts`.
> Test/cross-module claims grep-verified across `src/` + `tests/` (def + self excluded).
> Every finding carries `file:line` + proving snippet. Source NOT modified.
> Categories: unwired | dormant | inconsistent | dead-test | root-cause.

## Findings

### unwired (zero production callers — grep-verified)

- [unwired|info] No zero-caller export found in this cluster. All `register*Tool` functions are
  barrel-wired (`registerNervousTools` → server registration); the exported pure handlers
  `handleNervousAccept` / `handleNervousReject` (`src/mcp/tools/nervous.ts:106,156`) are consumed
  internally by their register functions (`:298`, `:330`) and `handleNervousAccept` is additionally
  exercised by a test (`tests/nervous/ipc-queue.test.ts:139`). Reported as a negative result for
  completeness — the substantive "defined-but-inert" cases are in **dormant** below.

### dormant (defined-but-unread / no-op gate in production)

- [dormant|medium] `deckent_plan` declares a `dryRun` input that the handler never reads —
  `src/mcp/tools/plan.ts:47` —
  ```ts
  dryRun: z.boolean().optional().default(true).describe('Always dry-run for plan tool — tasks are never written to disk'),
  ```
  The async handler signature accepts it (`async (input: { dryRun?: boolean; mode?: ... })`, `:51`)
  but the body references only `input.mode` (`:73`). `grep "dryRun" plan.ts` → 2 hits (declaration +
  signature type), zero reads. The flag is a permanently dormant input — it can be set by a caller but
  changes nothing; the "always dry-run" guarantee is implicit (the tool simply never persists), not
  enforced by this parameter.

- [dormant|medium] `subscribers` Set in `nervous.ts` is collected but never delivered to —
  `src/mcp/tools/nervous.ts:55,217,391` —
  ```ts
  const subscribers: Set<string> = new Set();   // :55
  subscribers.add(subId);                        // :217  (deckent_nervous_subscribe)
  subscribers: subscribers.size,                 // :391  (deckent_nervous_status — only read site)
  ```
  `grep "subscribers" src/mcp/tools/nervous.ts` → add@217 + size@391 only. No code path ever iterates
  the set to push a notification, and there is no unsubscribe (entries are never removed). The
  `deckent_nervous_subscribe` description claims "Registers this MCP client for push notifications"
  (`:205-207`), but the registration has no wired delivery consumer — its sole observable effect is
  the monotonically-growing count surfaced by `deckent_nervous_status`.

- [dormant|low] `force` / `userExplicit` on `deckent_kill` only flip an audit breadcrumb, never gate —
  `src/mcp/tools/kill.ts:90-91,103-119` —
  ```ts
  const bypassRequested = force === true && userExplicit === true;
  if (bypassRequested) { debugLog('mcp:kill:panic-bypass', {...}); }
  else if (force === true || userExplicit === true) { debugLog('mcp:kill:panic-bypass-partial', {...}); }
  ```
  `bypassRequested` is computed and threaded into `enrichResponse` (`:131,138`) but never branches the
  kill itself — the kill proceeds identically with or without the flags. This is **documented-intentional**
  (description + feedback_sprint_kill_always_ask_user: "bypass is logged, never silent"), so it is a
  by-design no-op gate rather than a defect, but the two inputs are functionally inert toward the action.

### inconsistent (conflicting default / duplicate / divergent)

- [inconsistent|medium] `models.ts` imports `zod` while every other file in the cluster imports `zod/v4` —
  `src/mcp/tools/models.ts:5` `import { z } from 'zod';` — The other 9 cluster files use
  `import { z } from 'zod/v4'` (kill:3, memory-query:4, nervous:7, plan:1, process:11, recover:3,
  retro:3, review:3, run:3). `grep "from 'zod'" src/mcp/tools` → only `models.ts` + `feature-query.ts`
  diverge. Mixing the `zod` and `zod/v4` entrypoints in the same MCP server risks two Zod runtimes /
  divergent schema-parse semantics for tool inputs; the cluster otherwise standardizes on `zod/v4`.

- [inconsistent|medium] `deckent_process` swallows errors into a success-shaped response (no `isError`) —
  `src/mcp/tools/process.ts:94-96,105-107` —
  ```ts
  if (!entry) { return jsonText(enrichResponse('process', { action, executionId, found: false })); }
  ...
  } catch (err) {
    return jsonText(enrichResponse('process', { action, error: err instanceof Error ? err.message : String(err) }));
  }
  ```
  `grep "isError: true" process.ts` → **0 hits**. Every sibling tool sets `isError: true` on the error
  branch (kill:125/146, models:93/176, memory implicit-ok, plan:116, recover:121, retro:86, review:127,
  run:179). A process-mode failure therefore reaches the MCP client as a normal (non-error) result with
  an `error` field buried in JSON — clients that branch on `isError` will treat the failure as success.

- [inconsistent|low] `deckent_process` is the only cluster tool that passes `.shape` to `inputSchema` —
  `src/mcp/tools/process.ts:54` `}).shape,` — `grep "}).shape" src/mcp/tools` → only `process.ts`.
  All siblings pass the `z.object({...})` instance directly (e.g. kill:87, run:33). The `.shape`
  (raw `ZodRawShape`) vs `ZodObject` divergence is a stylistic inconsistency in how the same SDK
  `registerTool` API is fed across the cluster.

- [inconsistent|low] `deckent_run` produces a double-prefixed taskId —
  `src/mcp/tools/run.ts:22-23,47-48` —
  ```ts
  function generateJobId(): string { return `run-${Date.now().toString(36)}`; }   // :22-24
  const jobId = generateJobId();          // → "run-xxxx"
  const taskId = `run-${jobId}`;          // → "run-run-xxxx"   (:48)
  ```
  Every task file, heartbeat and result for a one-off run is named `task-run-run-<base36>.*`. Cosmetic
  but a real naming inconsistency vs the single `run-` convention implied by `generateJobId`.

- [inconsistent|low] `deckent_memory_query` exposes only `sprint_min`, not the full range —
  `src/mcp/tools/memory-query.ts:28,50` — `sprint_min: z.number().optional()` is mapped to
  `sprint_range: { min: sprint_min }` (`:50`). The underlying `searchMemory` `sprint_range` contract
  supports `{ min, max }`; the MCP surface silently drops the upper bound, so a windowed query
  (e.g. sprints 200-210) is not expressible via this tool though the core supports it.

### dead-test (skip / tautological / mock-only / coverage gap)

- [dead-test|low] Asymmetric handler coverage: `handleNervousAccept` is tested both enabled+disabled,
  `handleNervousReject` (its mirror) has no test — `tests/nervous/ipc-queue.test.ts:139,161` exercise
  `handleNervousAccept` (`config.enabled` false→stub, true→IPC write). `grep "handleNervousReject"
  tests/` → 0 hits, although `nervous.ts:156-196` `handleNervousReject` is a structural mirror that
  also branches on `config.enabled` and writes the IPC queue with `decision:'rejected'`. The reject
  IPC-write path (`:181-186`) is therefore unverified. (Note: source files were the read-scope; test
  inspection here is grep-sampled, not full-file.)

### root-cause (advisory-soft / trust-without-verify / silent-fallback / hardcoded metric)

- [root-cause|high] `deckent_kill` never terminates the worker process — it only edits the task file —
  `src/mcp/tools/kill.ts:15-56` —
  ```ts
  function killTaskById(root: string, taskId: string): boolean {
    ...
    data.status = 'PAUSED';                          // :28  — flips JSON status
    writeFileSync(taskPath, JSON.stringify(data, null, 2) + '\n');
    ...
    if (existsSync(hbPath)) { try { unlinkSync(hbPath); } ... }   // :37-39 — deletes heartbeat
    ... // removes locks owned by task  :42-53
    return true;
  }
  ```
  There is **no** `killWorker` / `process.kill` / SIGTERM / tmux / docker call anywhere in the file
  (`grep "killWorker\|process.kill\|SIGTERM" kill.ts` → 0). Compare the CLI counterpart
  `src/cli/commands/kill.ts:137` `killWorker(taskId);` plus `process.kill(pid, signal)` SIGTERM→SIGKILL
  for both workers and the controller (`:209,256,305,320`). The MCP tool — described as "Stop one or
  all running workers" (`:85`) and flagged `destructiveHint: true` — does NOT stop the OS process: the
  worker keeps executing while its task is marked `PAUSED` and its heartbeat is deleted. Deleting the
  `.hb` actively makes the still-running worker look "stale" to the Auditor (stale_heartbeat — the most
  common violation pattern in summary.md). Trust-without-verify: the tool's contract (stop the worker)
  is not enforced by its implementation.

- [root-cause|medium] `deckent_recover` dryRun preview over-reports orphan IPC dirs vs what is removed —
  `src/mcp/tools/recover.ts:46-48` vs `:87` —
  ```ts
  // preview (dryRun): counts ALL matching dirs, no liveness check
  const orphanIpcCount = existsSync(deckentDir)
    ? readdirSync(deckentDir).filter(e => /^sprint-\d+-ipc$/.test(e)).length : 0;   // :46-48
  // actual: skips dirs whose pid is still alive
  orphanIpcDirs = cleanOrphanIpcDirs(root, { checkLivePid: true });                  // :87
  ```
  `cleanOrphanIpcDirs` with `checkLivePid:true` skips live-PID dirs (`src/core/orphan-cleaner.ts:393`
  `if (opts.checkLivePid) { ...skip if alive }`), and the tool description explicitly says "dead PIDs
  only" (`:19`). The preview counts every `sprint-*-ipc` dir regardless of liveness, so dryRun
  overstates the cleanup — a user previews N and a live run removes fewer. The preview and the action
  use two different counting rules.

- [root-cause|medium] `deckent_recover` reports `success: true` even when cleanup steps throw —
  `src/mcp/tools/recover.ts:84-117` — each step is wrapped in `try { } catch { /* best-effort */ }`
  (`:86-88`, `:92-94`, `:99-103`) and then the handler returns:
  ```ts
  const enriched = enrichResponse('recover', { success: true, sprintId, auditGate, ... });   // :105-106
  ```
  unconditionally. If `cleanOrphanIpcDirs`, `clearStaleLocks`, or `postFinalizeCleanup` throws, the
  corresponding count silently stays 0 while the response still claims `success: true`. There is no
  partial-failure signal — trust-without-verify: a recover that cleaned nothing is indistinguishable
  from a full success.

- [root-cause|medium] `deckent_recover` collapses a crashed audit into the same `SKIPPED` as opt-out —
  `src/mcp/tools/recover.ts:33-40` —
  ```ts
  if (!skipAudit) {
    try { const auditResult = await runSelfAuditGate(sprintId, root); auditGate = auditResult.overallGate; }
    catch { auditGate = 'SKIPPED'; }     // :37-39
  }
  ```
  An audit that throws is reported as `auditGate: 'SKIPPED'` — identical to the user explicitly passing
  `skipAudit:true`. A genuine audit failure (the signal recovery most needs) is silently masked as a
  benign skip; there is no `GATE_FAILURE`/error distinction on the crash path.

- [root-cause|medium] `deckent_plan` hardcodes "No usage constraints" instead of checking usage —
  `src/mcp/tools/plan.ts:66-71` —
  ```ts
  const recommendation: SprintSizeRecommendation = {
    size: 'full',
    maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
    modelConstraint: null,
    reason: 'No usage constraints',
  };
  ```
  The brain operating rule is "Always check usage before planning" (`.claude/rules/brain.md`), but the
  MCP plan tool statically assumes `size:'full'`, `modelConstraint:null`, `reason:'No usage constraints'`
  — no usage/budget query feeds the recommendation. The risk/wave breakdown downstream (`:83-85`) is
  therefore computed against an always-`full` assumption, a hardcoded planning metric.

- [root-cause|low] `deckent_run` routing fallback comment over-claims vs the catch body —
  `src/mcp/tools/run.ts:80,115-117` — the comment promises "fail-safe: any error keeps 'generic'"
  (`:80`), but the catch only logs:
  ```ts
  } catch (routingErr) {
    debugLog('run:mcp:routing', `V2 routing failed, using generic fallback: ${routingErr}`);
  }   // :115-117 — does NOT assign task.assignedAgent = 'generic'
  ```
  The "keeps generic" guarantee relies entirely on `resolveToTask` having pre-populated a generic
  default; the catch does not enforce it. If routing throws after partially mutating `task`
  (`:112-113` assigns `assignedAgent`/`assignedSkills`), the recovery is whatever was left, not an
  asserted generic — a trust-without-verify gap between the documented and the actual fallback.

- [root-cause|low] Cross-layer leak: MCP tools import business logic from `cli/` (ADR-008 family) —
  `src/mcp/tools/nervous.ts:14-17` (`acceptPanicGuard`, `listPendingPanicEvents` from
  `../../cli/commands/nervous.js`), `src/mcp/tools/process.ts:15` (`buildProcessController` from
  `../../cli/helpers/process-runtime.js`), `src/mcp/tools/run.ts:11` (`spawnWorkerMultiProvider` from
  `../../cli/commands/spawn.js`) + lazy `../../cli/commands/run.js` (`:151`). Per the ADR-008 Sprint-281
  amendment, "iş-mantığı core/orchestra'da yaşar; cli/api/mcp thin yüzeydir" — `mcp/` consuming `cli/`
  internals inverts that direction (mirrors the tracked systemic API-W1/ORCH-W1: 302-LoC
  `spawnWorkerMultiProvider` living in `cli/` and imported by the orchestration surface). Advisory/soft
  under ADR-037 V1.0, so it persists; flagged as the root cause of the surface↔cli coupling.

- [root-cause|low] `deckent_models` provider filter is case-fragile / silent-empty —
  `src/mcp/tools/models.ts:136-139` —
  ```ts
  const providerFilter = provider.toLowerCase().trim();
  models = models.filter((m) => (m.provider as string) === providerFilter);
  ```
  The user input is lowercased but `m.provider` is compared as-is. If catalog providers are ever stored
  non-lowercase, the filter silently yields `modelCount: 0` rather than an "unknown provider" signal —
  a silent-empty fallback indistinguishable from "provider genuinely has no models".

## Summary

10 mcp cluster files audited (kill 152, memory-query 73, models 182, nervous 509, plan 122, process 111,
recover 128, retro 93, review 134, run 186 LoC); **zero source changes**. **17 findings** across 5 categories:

- **unwired (0 substantive):** grep-verified all `register*Tool` + exported pure handlers are wired
  (negative result reported for completeness).
- **dormant (3):** `plan.dryRun` input never read (no-op flag); `nervous.subscribers` Set collected but
  never delivered to (push-notification path has no consumer); `kill.force/userExplicit` flip only an
  audit breadcrumb (by-design no-op gate).
- **inconsistent (5):** `models.ts` imports `zod` vs cluster-wide `zod/v4`; `process` returns errors with
  no `isError:true` (clients see failures as success); `process` uniquely uses `.shape` on inputSchema;
  `run` double-prefixes taskId (`run-run-*`); `memory-query` exposes only `sprint_min`, dropping `max`.
- **dead-test (1):** `handleNervousReject` IPC-write path untested while its `handleNervousAccept` mirror
  is (asymmetric coverage; grep-sampled).
- **root-cause (8):** **`deckent_kill` never terminates the worker process** (only flips status to PAUSED
  + deletes the heartbeat → still-running worker looks stale to the Auditor) — highest severity;
  `recover` dryRun over-counts orphan IPC vs the `checkLivePid` actual; `recover` reports `success:true`
  through best-effort try/catch even when steps throw; `recover` masks a crashed audit as `SKIPPED`;
  `plan` hardcodes "No usage constraints" (no usage check despite the brain rule); `run` routing-fallback
  comment over-claims vs the catch body; MCP→CLI business-logic import leak (nervous/process/run, ADR-008
  family); `models` provider filter is case-fragile / silent-empty.

**Highest-severity:** `deckent_kill` (`kill.ts:15-56`) is a contract violation — the tool advertised as
"Stop running workers" with `destructiveHint:true` only edits the task JSON and deletes the heartbeat,
never sending a signal or calling `killWorker` (vs CLI `kill.ts:137`), so the worker keeps running and
the heartbeat deletion makes it register as a `stale_heartbeat` violation in the Auditor.
