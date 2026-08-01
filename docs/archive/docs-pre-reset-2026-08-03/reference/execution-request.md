# ExecutionRequest Contract Reference

The `ExecutionRequest` is the **canonical input contract** for all single-task execution in
deckent. Every path that runs one task — the CLI `deckent run`, the MCP `deckent_run` tool,
and the autonomous task-mode runner — builds an `ExecutionRequest` first and converts it to a
`Task` via the same two pure helpers. This is the WM-1 unification.

**Source files:**
- `src/core/work-model.ts` — interface + types + `resolveRiskClass`
- `src/orchestra/execution-request-builder.ts` — `buildExecutionRequest` + `resolveToTask`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Fields](#2-core-fields)
3. [Envelope Fields (Optional)](#3-envelope-fields-optional)
4. [Supporting Types](#4-supporting-types)
5. [buildExecutionRequest()](#5-buildexecutionrequest)
6. [resolveToTask()](#6-resolvetotask)
7. [Three-Path Unification](#7-three-path-unification)
8. [resolveRiskClass()](#8-resolveriskclass)

---

## 1. Overview

Before WM-1 (`deckent run`, MCP `deckent_run`, and the autonomous path each built a `Task`
directly from their own ad-hoc fields. The three code paths diverged silently — different
defaults, different kind inference, different provider resolution.

WM-1 introduces a single input contract:

```
caller inputs
     │
     ▼
buildExecutionRequest(input)   ← infers kind, environment, requirements
     │
     ▼
ExecutionRequest               ← canonical contract (SSOT)
     │
     ▼
resolveToTask(req, taskId)     ← converts to Task ready to write + spawn
```

Every single-task run now goes through this pipeline. The canonical `task.type` (the
`TaskKind`) is set on every run; no path leaves it undefined.

---

## 2. Core Fields

These fields are **required** (or always populated by `buildExecutionRequest`).

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Human-readable description of the work. Truncated to 80 chars for the task title. |
| `kind` | `TaskKind` | The fundamental nature of the work. Inferred from scope via `detectTaskType` + `rubricTypeToKind`. |
| `environment` | `EnvironmentType` | Where the work runs: `domain` × `context`. Derived from the configured spawn backend. |
| `requirements` | `RequirementProfile` | Capabilities and resources the work needs. Inferred from scope (see §4). |
| `scope` | `TaskScope` | File-system scope: `directories`, `filesRead`, `filesWrite`. Defaults to `['./']` if not specified. |
| `projectRoot` | `string` | Absolute path to the project root. Passed through verbatim. |

---

## 3. Envelope Fields (Optional)

Envelope fields are **optional**. Each is consumed by the feature that owns it and ignored
by subsystems that don't. Adding a new feature never requires changing the core fields.

| Field | Type | Owning Feature | Description |
|-------|------|----------------|-------------|
| `goNogo` | `GoNoGoCriteria` | Evaluation | GO/NO-GO criteria for this task. Falls back to `DEFAULT_GONOGO` in `resolveToTask`. |
| `effort` | `TaskEffort` | Scheduling | Work-size estimate (`low` / `normal` / `high`). Defaults to `normal`. |
| `priority` | `TaskPriority` | Scheduling | `CRITICAL` / `HIGH` / `NORMAL` / `LOW`. Defaults to `NORMAL`. |
| `provider` | `ProviderName` | Provider routing | Explicit provider (`claude` / `codex` / `gemini`). If absent, resolved from config or left undefined for spawn to resolve from the model. |
| `model` | `ModelType` | Provider routing | Model identifier. Falls back to `sonnet` in `resolveToTask` only as a last resort. |
| `modelEffort` | `string` | F1-RE | Native model reasoning depth (`low` / `medium` / `high` / `xhigh` / `max` for Claude; `minimal`–`high` for Codex). Distinct from work-size `effort`. |
| `authMode` | `'subscription' \| 'api'` | Auth | Per-request auth mode. `api` skips `~/.claude` mount and requires `ANTHROPIC_API_KEY`. |
| `agentId` | `string` | Routing | Agent override. Becomes `task.assignedAgent`; defaults to `'generic'`. |
| `skillIds` | `string[]` | Routing | Skill overrides. Becomes `task.assignedSkills`. |
| `autoApprove` | `boolean` | Spawn | Whether to auto-approve checkpoints. CLI defaults `true`; autonomous defaults `false`. |
| `timeoutMs` | `number` | Spawn | Per-task timeout in milliseconds. |
| `capabilityTarget` | `CapabilityTarget` | F8 broker | Non-code work target (mail / calendar / ERP / DB). Used alongside or instead of `scope` for capability-broker tasks. |
| `mode` | `InteractionMode` | Chat / stream | `batch` / `interactive` / `streaming`. Governs the interaction shape. |
| `actor` | `ActorContext` | TEAM-1 / ENT | Identity of the requestor: `id`, `role`, `tenantId`. |
| `origin` | `RequestOrigin` | Audit | Provenance: `cli` / `mcp` / `autonomous` / `chat` / `webhook` / `scheduled` / `api` / `ide`. |
| `correlationId` | `string` | ENT-3 audit | Groups related requests for audit trail. |
| `causationId` | `string` | ENT-3 audit | The request that caused this one (lineage). |
| `budget` | `ExecutionBudget` | Cost control | `maxUsd` and/or `maxTokens` ceiling. Enterprise cost-gate. |

---

## 4. Supporting Types

### `TaskKind`

The fundamental nature of a unit of work. One taxonomy; all subsystems map from it.

```typescript
type TaskKind =
  | 'code-development'
  | 'test'
  | 'documentation'
  | 'audit'
  | 'security'
  | 'refactor'
  | 'devops'
  | 'config'
  | 'design'
  | 'data'
  | 'generic';
```

`buildExecutionRequest` infers `kind` from the task scope using `detectTaskType` (which
inspects scope directories and file extensions) followed by `rubricTypeToKind`. The kind
is then set as `task.type` in `resolveToTask`, closing the gap where single-task paths
previously left `task.type` undefined.

### `EnvironmentType`

A two-axis descriptor of where the work runs.

```typescript
interface EnvironmentType {
  domain: WorkDomain;       // 'code-repo' | 'erp' | 'messaging' | 'web' | 'data-pipeline' | 'generic'
  context: ExecutionContext; // 'local-dev' | 'ci' | 'docker' | 'air-gapped' | 'production-tenant'
}
```

`buildExecutionRequest` sets `domain` to `'code-repo'` for all current single-task paths and
derives `context` from the configured spawn backend: `'docker'` when
`config.spawn_backend === 'docker'`, otherwise `'local-dev'`.

### `RequirementProfile`

What the work needs to run. Drives policy, routing, and governance gating.

```typescript
interface RequirementProfile {
  capabilities: Capability[];   // what the work may do
  resources: ResourceNeed[];    // what it needs to run
}
```

`buildExecutionRequest` infers this from scope:
- `'fs-read'` is always included.
- `'fs-write'` is added when `scope.filesWrite` is non-empty or `scope.directories` is non-empty.

### `Capability`

```typescript
type Capability =
  | 'fs-read' | 'fs-write'
  | 'network'
  | 'db-query' | 'db-write'
  | 'erp-read' | 'erp-write'
  | 'shell'
  | 'approval'
  | 'provider-pin'
  | 'gpu'
  | 'tenant-scope'
  | 'mcp-tool';
```

### `CapabilityTarget`

For non-code work (F8 broker) that targets a connector rather than the file system.

```typescript
interface CapabilityTarget {
  capability: string;               // dotted verb, e.g. 'mail.send' | 'erp.read' | 'db.query'
  args?: Record<string, unknown>;   // verb arguments
  connector?: string;               // backend: 'imap' | 'graph' | 'odoo' | 'postgres' | ...
}
```

### `ActorContext`

Identity of the requestor for RBAC and multi-tenant isolation.

```typescript
interface ActorContext {
  id: string;
  role?: string;
  tenantId?: string;
}
```

### `RequestOrigin`

How the work entered the system. Used for provenance, routing, and audit.

```typescript
type RequestOrigin =
  | 'cli' | 'mcp' | 'chat'
  | 'autonomous' | 'webhook' | 'scheduled' | 'api' | 'ide';
```

### `ExecutionBudget`

Enterprise cost ceiling. Checked by the cost-gate feature before spawning.

```typescript
interface ExecutionBudget {
  maxUsd?: number;
  maxTokens?: number;
}
```

### `RiskClass`

Derived — never stored on the request. See [§8](#8-resolveriskclass).

```typescript
type RiskClass = 'low' | 'medium' | 'high';
```

---

## 5. `buildExecutionRequest()`

**Source:** `src/orchestra/execution-request-builder.ts`

A **pure** builder. Accepts a minimal `ExecutionRequestInput` and produces a fully populated
`ExecutionRequest`. No I/O; no side effects.

### Signature

```typescript
function buildExecutionRequest(input: ExecutionRequestInput): ExecutionRequest
```

### `ExecutionRequestInput` fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | Work description. |
| `projectRoot` | Yes | Absolute path to the project root. |
| `scope` | No | `{ directories?, filesRead?, filesWrite? }`. Defaults to `{ directories: ['./'] }`. |
| `model` | No | Explicit model. |
| `modelEffort` | No | Native reasoning depth. |
| `provider` | No | Explicit provider. Resolved: input → `config.worker_provider` → `config.brain_provider` → `undefined`. |
| `config` | No | `ResolvedConfig` for provider and backend resolution. |
| `goNogo` | No | GO/NO-GO criteria. |
| `effort` | No | Work-size. Defaults to `'normal'`. |
| `priority` | No | Task priority. Defaults to `'NORMAL'`. |
| `authMode` | No | Auth mode override. |
| `agentId` | No | Agent override. |
| `skillIds` | No | Skill overrides. |
| `autoApprove` | No | Auto-approve flag. Defaults to `true`. |
| `timeoutMs` | No | Timeout in milliseconds. |
| `capabilityTarget` | No | Non-code capability target (F8). |
| `mode` | No | Interaction mode. |
| `actor` | No | Requestor identity. |
| `origin` | No | Request provenance. |
| `correlationId` | No | Audit group ID. |
| `causationId` | No | Audit lineage ID. |
| `budget` | No | Cost ceiling. |

### Inference rules

1. **`kind`** — inferred via `detectTaskType({ scope }) → rubricTypeToKind()`.
2. **`environment.context`** — `'docker'` if `config.spawn_backend === 'docker'`, else `'local-dev'`.
3. **`environment.domain`** — always `'code-repo'` for single-task paths.
4. **`requirements`** — `'fs-read'` always; `'fs-write'` when files or directories are in scope.
5. **`provider`** — resolved from `input.provider` → `config.worker_provider` → `config.brain_provider` → `undefined`.

### Example

```typescript
import { buildExecutionRequest } from './src/orchestra/execution-request-builder.js';

const req = buildExecutionRequest({
  description: 'Add pagination to the users endpoint',
  scope: { directories: ['src/api/'], filesWrite: ['src/api/users.ts'] },
  projectRoot: '/home/user/my-project',
  config: loadedConfig,
  origin: 'cli',
  effort: 'normal',
});

// req.kind       → 'code-development'  (inferred from scope)
// req.provider   → 'claude'            (from config.worker_provider)
// req.origin     → 'cli'
```

---

## 6. `resolveToTask()`

**Source:** `src/orchestra/execution-request-builder.ts`

Converts an `ExecutionRequest` into a `Task` ready to write to `.tasks/` and spawn. Also
pure; the caller supplies the task ID (preserving the `run-*` ID contract).

### Signature

```typescript
function resolveToTask(req: ExecutionRequest, taskId: string): Task
```

### Mapping from `ExecutionRequest` → `Task`

| `Task` field | Source |
|--------------|--------|
| `id` | `taskId` (caller-supplied) |
| `title` | `req.description.slice(0, 80)` |
| `description` | `req.description` |
| `model` | `req.model ?? 'sonnet'` ← last-resort default |
| `effort` | `req.effort ?? 'normal'` |
| `priority` | `req.priority ?? 'NORMAL'` |
| `type` | `req.kind` ← **canonical kind, set on every single-task run** |
| `scope` | `req.scope` |
| `goNogo` | `req.goNogo ?? DEFAULT_GONOGO` |
| `provider` | `req.provider` (may be `undefined` — spawn resolves from model) |
| `modelEffort` | `req.modelEffort` |
| `authMode` | `req.authMode` |
| `assignedAgent` | `req.agentId ?? 'generic'` |
| `assignedSkills` | `req.skillIds ?? []` |
| `status` | `TaskStatus.PENDING` |
| `createdAt` | `new Date().toISOString()` |
| `reason` | `'One-shot run command'` |
| `dependencies` | `[]` |

### Example

```typescript
const task = resolveToTask(req, 'run-1749123456789');

// task.type     → 'code-development'
// task.model    → 'sonnet'   (last-resort fallback if req.model was undefined)
// task.provider → 'claude'   (from req.provider; spawn keeps it as-is)
```

---

## 7. Three-Path Unification

All three single-task execution paths call `buildExecutionRequest` → `resolveToTask`.
The only differences are the `origin` tag and the default for `autoApprove`.

### CLI — `deckent run` (`src/cli/commands/run.ts`)

```typescript
const req = buildExecutionRequest({
  description,
  model: model as ModelType,
  scope: { directories: [scopeDir] },
  projectRoot: root,
  config: cfg,
  autoApprove,          // from --auto-approve flag
  origin: 'cli',
  timeoutMs,
});
const task = resolveToTask(req, taskId);
```

### MCP — `deckent_run` tool (`src/mcp/tools/run.ts`)

```typescript
const req = buildExecutionRequest({
  description,
  model: model as ModelType,
  scope: {
    directories: scope
      ? scope.split(',').map(s => s.trim())
      : ['src/'],
  },
  projectRoot: root,
  config: cfg,
  autoApprove,
  origin: 'mcp',
});
const task = resolveToTask(req, taskId);
```

### Autonomous — `runTaskMode` (`src/orchestra/task-mode-runner.ts`)

```typescript
const req = buildExecutionRequest({
  description: ctx.description,
  model,
  provider: ctx.provider as ProviderName | undefined,
  scope: { directories: [scopeDir] },
  projectRoot,
  config,
  autoApprove: ctx.autoApprove ?? false,   // conservative default
  origin: 'autonomous',
});
const task = resolveToTask(req, taskId);
```

### What unification means in practice

| Concern | Before WM-1 | After WM-1 |
|---------|-------------|------------|
| `task.type` (kind) | Undefined on single-task paths | Always set — inferred from scope |
| Provider resolution | Each path had its own fallback chain | Single chain: input → config → undefined |
| Environment | Not present | Derived from spawn backend |
| Governance fields | Not present | `actor`, `origin`, `correlationId`, `causationId`, `budget` carried through |
| Risk derivation | Not possible | `resolveRiskClass(req)` available at any point |

---

## 8. `resolveRiskClass()`

**Source:** `src/core/work-model.ts`

Derives the `RiskClass` of a request from its declared capabilities and
`capabilityTarget` verb. The result is **pure** — it is never stored on the
request; call it when needed (e.g., at a governance gate).

### Signature

```typescript
function resolveRiskClass(
  req: Pick<ExecutionRequest, 'requirements' | 'capabilityTarget'>,
): RiskClass
```

### Risk derivation rules (in precedence order)

| Risk | Condition |
|------|-----------|
| `'high'` | Any capability in `{ 'erp-write', 'db-write', 'shell' }` |
| `'high'` | `capabilityTarget.capability` matches `/\.(send\|write\|create\|delete\|update\|exec\|drop)\b/i` |
| `'medium'` | Any capability in `{ 'network', 'fs-write', 'erp-read', 'db-query', 'approval', 'provider-pin', 'tenant-scope', 'mcp-tool' }` |
| `'low'` | All other cases |

### Capability risk table

| Capability | Risk |
|------------|------|
| `erp-write` | high |
| `db-write` | high |
| `shell` | high |
| `network` | medium |
| `fs-write` | medium |
| `erp-read` | medium |
| `db-query` | medium |
| `approval` | medium |
| `provider-pin` | medium |
| `tenant-scope` | medium |
| `mcp-tool` | medium |
| `fs-read` | low |
| `gpu` | low |

### Example

```typescript
import { resolveRiskClass } from './src/core/work-model.js';

const risk = resolveRiskClass(req);
// req has capabilities ['fs-read', 'fs-write'] → 'medium'

const risk2 = resolveRiskClass({
  requirements: { capabilities: ['shell'], resources: [] },
});
// → 'high'

const risk3 = resolveRiskClass({
  requirements: { capabilities: ['fs-read'], resources: [] },
  capabilityTarget: { capability: 'mail.send' },
});
// → 'high'  (verb 'send' matches high-risk pattern)
```

`resolveRiskClass` accepts any object with `requirements` and `capabilityTarget`,
so it can be called on a partial request before the full `ExecutionRequest` is assembled.
