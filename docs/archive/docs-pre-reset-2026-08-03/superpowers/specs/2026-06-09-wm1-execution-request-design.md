# WM-1 — Canonical ExecutionRequest Unification — Design Spec (2026-06-09)

> **Goal:** Unify the 3 divergent single-task execution paths (`deckent run` CLI,
> `deckent_run` MCP, autonomous `runTaskMode`) behind ONE input contract +
> builder so they construct + spawn a task identically — closing the
> "3 divergent execution paths with no shared input contract" gap from the
> 2026-06-08 canonical-work-model spec (step 4 of its migration sequence).
>
> **Scope decision (Alperen, 2026-06-09):** **pure unification, spec-faithful** —
> NO new single-task routing this round (agentId/skillIds stay optional hints;
> single-task stays `generic`). Single-task routing = a separate follow-up (WM-1b).
>
> **Builds on:** WM-2a (`work-model.ts` SSOT — `ExecutionRequest` interface
> ALREADY exists, lines 83-100) + WM-2b (`Task.type?: TaskKind`, set by
> `createTask`). **Velocity window:** additive + no-new-test-suites + keep
> existing suite green + tsc clean (mark deferred tests as TECH DEBT).

## 1. The problem (code-verified, 2026-06-09)

Three single-task paths build + spawn a task DIFFERENTLY:

| Aspect | CLI `run.ts:226` | MCP `run.ts:19` | Autonomous `task-mode-runner.ts:87` |
|---|---|---|---|
| Task builder | `buildRunTask` (ad-hoc) | manual object literal | `buildRunTask` (ad-hoc) |
| `task.type` (TaskKind) | NOT set | NOT set | NOT set |
| Provider source | implicit (`getProviderForModel` inside spawn) | config (`worker_provider`/`brain_provider`) | `ctx.provider` (forwarded) |
| Provider passed to spawn? | NO | n/a (SpawnBackendFactory) | YES (`opts.provider`) |
| Spawn primitive | `spawnWorkerMultiProvider` | **`SpawnBackendFactory` directly** | `spawnWorkerMultiProvider` |
| Scope | single dir | comma-split dirs | single dir |
| goNogo | hardcoded generic | hardcoded generic | hardcoded generic |

Consequences: `task.type` never set on single-task paths (WM-2b gap); MCP uses a
different spawn primitive (provider/ollama-registration drift); provider handling
inconsistent (CLI doesn't pass it → no ollama pre-registration on CLI run).

## 2. The contract (already exists — `work-model.ts:83-100`)

`ExecutionRequest { description, kind, environment, requirements, scope,
projectRoot, goNogo?, effort?, priority?, provider?, model?, authMode?, agentId?,
skillIds?, autoApprove?, timeoutMs? }`. No code change needed to the type.

## 3. New module — `src/orchestra/execution-request-builder.ts`

```ts
// PURE — infers the canonical request from minimal path inputs. No 'claude'
// assumption: provider is explicit, else config-resolved, else left undefined
// (spawn resolves from model).
export function buildExecutionRequest(input: {
  description: string;
  scope?: { directories?: string[]; filesRead?: string[]; filesWrite?: string[] };
  model?: ModelType;
  provider?: ProviderName;
  projectRoot: string;
  config?: ResolvedConfig;
  effort?: TaskEffort;
  priority?: TaskPriority;
  authMode?: 'subscription' | 'api';
  agentId?: string;
  skillIds?: string[];
  autoApprove?: boolean;
  timeoutMs?: number;
}): ExecutionRequest;

// resolveToTask: ExecutionRequest → Task ready for spawn. Uses the EXISTING
// buildRunTask (preserves the `run-*` task-id contract that single-task cleanup /
// result-reading depends on) and ENRICHES it with the canonical fields —
// crucially `task.type = req.kind` (closes the WM-2b single-task gap) + provider
// + scope + goNogo + effort + priority + authMode.
export function resolveToTask(req: ExecutionRequest, taskId: string): Task;
```

- `inferTaskKind(scope, description)` → reuse `detectTaskType(scope)` + `rubricTypeToKind` (the same derivation `createTask` uses); description-keyword refinement optional.
- `inferEnvironment(scope, config)` → `{ domain: 'code-repo', context: <docker|local-dev from config.spawn_backend> }`. Conservative defaults; never throws.
- `inferRequirements(scope)` → `fs-read` always; `fs-write` when `filesWrite`/`directories` present. Minimal, extensible.
- Provider resolution: `input.provider ?? config.worker_provider ?? config.brain_provider ?? undefined` (undefined → spawn's `getProviderForModel`).

**Why enrich `buildRunTask` instead of switching to `createTask`:** `createTask`
generates a sprint-style id (`NNN-NNN`) from `sprintId+sequence`; the single-task
paths use `createRunTaskId()` (`run-*`) and downstream cleanup/result-reading keys
on it. Swapping to `createTask` would change the id scheme (risk). Full
`createTask` unification (one Task builder for sprint + single-task) is a tracked
follow-up; here we keep `run-*` ids and just set the canonical fields.

## 4. The unified flow (all 3 paths)

```
buildExecutionRequest(minimal input) → resolveToTask(req, runTaskId)
  → write task-${id}.json → resolveAgentPrompt + resolveSkillPrompts
  → buildWorkerPrompt → spawnWorkerMultiProvider(id, model, prompt, root,
      { autoApprove, spawnBackend, provider: req.provider, dockerImage, dockerTimeout })
```

- **CLI `run.ts`:** replace `buildRunTask` call with `buildExecutionRequest`→`resolveToTask`; pass `provider: req.provider` to `spawnWorkerMultiProvider` (NEW — gives CLI ollama pre-registration parity).
- **MCP `run.ts`:** replace the manual object + `SpawnBackendFactory.create()/spawn()` with the unified flow → `spawnWorkerMultiProvider` (consolidates to ONE spawn primitive; keeps config-sourced provider via `buildExecutionRequest`).
- **Autonomous `task-mode-runner.ts`:** replace `buildRunTask` with the unified flow; `ctx.provider` flows through `buildExecutionRequest`. Env defaults to `local-dev` (autonomous has no docker context) — safe.

## 5. Migration order + verification (additive, core-first)

1. Add `execution-request-builder.ts` (pure) — additive, zero callsite change. tsc + (deferred) hermetic unit (TECH DEBT under the velocity window).
2. Migrate CLI `run` → orchestration-smoke: `node dist/cli/entry.js run "echo test" --scope docs/` plans+spawns; task json has `type` set + `run-*` id.
3. Migrate MCP `run` (drop SpawnBackendFactory) → smoke via the MCP run path.
4. Migrate autonomous `runTaskMode` → autonomous task-mode smoke.
5. After EACH: tsc clean + the touched path's existing tests green + a trivial run-verify (the spec's "tsc-green ≠ deckent-still-runs" rule).

## 6. Out of scope (tracked follow-ups)

- **WM-1b:** single-task routing (run `routeTaskV2` in `resolveToTask` so `deckent run "fix Go bug"` → bug-fixer + go-prime, leveraging WM-7 stack-aware routing).
- **Full `createTask` unification** (one Task builder for sprint + single-task, drop `buildRunTask`).
- **WM-5/WM-6** (provider-free hard-enforce; EffectClass→policy-gate) — later steps.

## 7. ADR

Folds into the deferred ADR-087 ("Canonical Work-Model — ExecutionRequest +
TaskKind SSOT + two-axis Environment + RequirementProfile") from the 2026-06-08
spec — write at the memory-export cycle, not mid-run.

## 8. Risks

- **Riskiest path = autonomous** (no agent/skill, no env context). Mitigation:
  optional agentId/skillIds + `local-dev` env default → forward-compatible.
- **task-id scheme:** preserved (`run-*` via `buildRunTask`) — no downstream break.
- **MCP spawn-primitive swap:** `spawnWorkerMultiProvider` must honor the
  config-sourced provider; `buildExecutionRequest` resolves it so behavior is
  preserved (now WITH ollama pre-registration parity).
