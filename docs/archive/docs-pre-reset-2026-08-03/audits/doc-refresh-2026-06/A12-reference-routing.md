# A12 — Reference: Routing, Execution & Dependencies

**Audit Date:** 2026-06-28
**Task:** 345-012
**Auditor:** doc-writer agent (Sonnet)
**Scope:** `docs/reference/stack-aware-routing.md`, `multi-provider.md`, `execution-request.md`, `event-channels.md`, `dependencies.md`, `provider-free.md`
**Source baseline:** `src/core/routing-engine.ts`, `src/core/routing-types.ts`, `src/orchestra/task-router.ts`, `src/orchestra/execution-request-builder.ts`, `src/core/work-model.ts`, `src/core/event-stream.ts`, `package.json`

---

## Summary

| Doc | Status | Finding severity |
|-----|--------|-----------------|
| `stack-aware-routing.md` | ⚠️ INACCURATE | Medium — `RoutingDecision` interface wrong |
| `dependencies.md` | 🔴 CRITICAL | Critical — `telegraf` listed, `grammy` is actual dep |
| `execution-request.md` | ✅ ACCURATE | Minor — source file confirmed |
| `event-channels.md` | ⚠️ INCOMPLETE | Minor — 3 undocumented channels |
| `multi-provider.md` | ✅ ACCURATE | No discrepancies |
| `provider-free.md` | ✅ ACCURATE | No discrepancies |

---

## A12.1 — `stack-aware-routing.md`

### Claims verified against `src/core/routing-engine.ts`

| Claim | Evidence | Status |
|-------|----------|--------|
| `routeTaskV2` is the main 3-layer engine | `routing-engine.ts:324` — function `routeTaskV2` | ✅ |
| Layer 1: Intent Classifier (`src/core/intent-classifier.ts`) | `routing-engine.ts:28` — `import { classifyIntent } from './intent-classifier.js'` | ✅ |
| Layer 2: Activation Engine (`src/core/activation-engine.ts`) | `routing-engine.ts:29` — `import { evaluateActivation … } from './activation-engine.js'` | ✅ |
| Layer 3: Routing Engine (`src/core/routing-engine.ts`) | Confirmed — `routeTaskV2` at `routing-engine.ts:324` | ✅ |
| `DOMAIN_MATCH_BONUS = 3` | `routing-engine.ts:100` — `export const DOMAIN_MATCH_BONUS = 3` | ✅ |
| `USER_SURFACE_BONUS = 8` | `routing-engine.ts:216` — `export const USER_SURFACE_BONUS = 8` | ✅ |
| `LANGUAGE_MISMATCH_PENALTY = 6` | `routing-engine.ts:109` — `export const LANGUAGE_MISMATCH_PENALTY = 6` | ✅ |
| Fallback chain: `documentation → ['doc-writer']` | `routing-engine.ts:53` — `'documentation': ['doc-writer']` | ✅ |
| Fallback chain: `security → ['security-auditor']` | `routing-engine.ts:55` — `'security': ['security-auditor']` | ✅ |
| Skill-first ordering (skills selected before agent) | `routing-engine.ts:363–391` (Step 4 before Step 5) | ✅ |

### `RoutingDecision` interface discrepancy

The doc (`§1`, Layer 3) shows this interface:

```typescript
interface RoutingDecision {
  agentId: string | null;
  skillIds: string[];
  confidence: ConfidenceLevel;   // WRONG
  reasoning: string[];
  taskDNA: TaskDNA;
  overrideSource: OverrideSource;
  overrideWarnings: string[];
  skillBudget: SkillBudget;      // WRONG — field not in type
}
```

**Actual interface** (`src/core/routing-types.ts:118–139`):

```typescript
interface RoutingDecision {
  agentId: string | null;
  agentScore: number;               // missing from doc
  agentConfidence: ConfidenceLevel; // doc shows single 'confidence'
  skillIds: string[];
  skillScores: Map<string, number>; // missing from doc
  skillConfidence: ConfidenceLevel; // missing from doc
  overrideSource: OverrideSource;
  taskDNA: TaskDNA;
  reasoning: string[];
  contextFit?: 'ok' | 'tight' | 'overflow'; // missing from doc
  routingVersion: 'v2' | 'v3';              // missing from doc
  overrideWarnings?: string[];
  // NOTE: skillBudget is NOT a field — computed internally but not returned
}
```

**Errors in doc:**
1. `confidence: ConfidenceLevel` (singular) → actual is TWO fields: `agentConfidence` and `skillConfidence`
2. `skillBudget: SkillBudget` → field does NOT exist in `RoutingDecision`; budget is computed as a local variable but not included in the returned object
3. Missing fields: `agentScore`, `skillScores`, `contextFit`, `routingVersion`

**Recommendation:** Update `§1` interface block to match `routing-types.ts:118`.

---

## A12.2 — `dependencies.md`

### Critical: `telegraf` vs `grammy`

**Doc lists:**
```
| `telegraf` | `^4.16.0` | Telegram connector | ADR-016 |
```

**`package.json` (actual):**
```json
"grammy": "^1.44.0"
```

`telegraf` is **not present** in `package.json` at all (runtime, optional, or dev). `grammy` is the actual Telegram bot framework used (`src/connectors/telegram.ts` imports from `grammy`). The governing ADR reference (ADR-016) remains correct, but the package name and version are wrong.

### Missing optional dependencies

`package.json` declares three optional dependencies; the doc lists only one:

| Package | Version | In doc? |
|---------|---------|---------|
| `discord.js` | `^14.26.3` | ✅ listed |
| `nodemailer` | `^6.9.14` | ❌ not listed |
| `openai` | `^4.103.0` | ❌ not listed |

### All other runtime deps verified

All 13 runtime entries in the doc table match `package.json` by name and version:

| Package | Doc version | package.json | Match |
|---------|-------------|--------------|-------|
| `commander` | `^13.0.0` | `^13.0.0` | ✅ |
| `@modelcontextprotocol/sdk` | `^1.27.1` | `^1.27.1` | ✅ |
| `better-sqlite3` | `^12.10.0` | `^12.10.0` | ✅ |
| `@lydell/node-pty` | `^1.2.0-beta.12` | `^1.2.0-beta.12` | ✅ |
| `ws` | `^8.18.0` | `^8.18.0` | ✅ |
| `ink` | `^7.0.5` | `^7.0.5` | ✅ |
| `react` | `^19.2.7` | `^19.2.7` | ✅ |
| `react-dom` | `^19.2.7` | `^19.2.7` | ✅ |
| `cli-highlight` | `^2.1.11` | `^2.1.11` | ✅ |
| `zod` | `^3.25.0` | `^3.25.0` | ✅ |
| `@noble/ed25519` | `^2.3.0` | `^2.3.0` | ✅ |
| `@noble/hashes` | `^1.8.0` | `^1.8.0` | ✅ |
| `telegraf` | `^4.16.0` | **NOT PRESENT** — `grammy ^1.44.0` is the actual dep | 🔴 |

### ADR-010 cross-check

The "minimal + ADR-justified" principle in ADR-010 is correctly stated. All listed ADR references are accurate. The Governing ADR column lists `zod → ADR-004` in the doc but ADR-010 (Amendment 2) itself records `zod → ADR-010`; this is a minor inconsistency between the doc table and the ADR body, but does not affect correctness.

**Recommendation:** Replace `telegraf` row with `grammy ^1.44.0 | Telegram connector | ADR-016`. Add `nodemailer` and `openai` to the optional deps table.

---

## A12.3 — `execution-request.md`

### Source file existence

| Claimed file | Exists? |
|-------------|---------|
| `src/core/work-model.ts` (interface + `resolveRiskClass`) | ✅ — `work-model.ts:196` exports `resolveRiskClass` |
| `src/orchestra/execution-request-builder.ts` (`buildExecutionRequest` + `resolveToTask`) | ✅ — file confirmed |

### `TaskKind` union values

Doc lists: `code-development, test, documentation, audit, security, refactor, devops, config, design, data, generic`

Source (`src/core/work-model.ts:28–39`): identical union — ✅

### `EnvironmentType`, `RequirementProfile`, `Capability`, `ActorContext`, `RequestOrigin`, `ExecutionBudget`

All interface shapes in the doc match `src/core/work-model.ts` exactly. ✅

### `buildExecutionRequest` inference rules

The five inference rules in the doc (§5) all match the builder implementation:
1. `kind` inferred via `detectTaskType → rubricTypeToKind` — the builder imports `detectTaskType` from `'./rubric-registry.js'` (not from `task-router`; both exist but the builder uses its own rubric-aware version). ✅
2. `environment.context` set to `'docker'` when `config.spawn_backend === 'docker'`, else `'local-dev'`. ✅
3. `environment.domain` always `'code-repo'` for single-task paths. ✅
4. `requirements` — `'fs-read'` always; `'fs-write'` when files/dirs in scope. ✅
5. Provider resolution chain: `input.provider → config.worker_provider → config.brain_provider → undefined`. ✅

### `resolveToTask` mapping table

All 16 `Task` field mappings in the doc (§6) are consistent with the builder source. The last-resort model fallback (`req.model ?? 'sonnet'`) is confirmed. ✅

### Three-path unification (§7)

The CLI, MCP, and autonomous-mode code snippets in the doc match the actual call signatures in `src/cli/commands/run.ts`, `src/mcp/tools/run.ts`, and `src/orchestra/task-mode-runner.ts`. ✅

### `resolveRiskClass` (§8)

Risk derivation rules and capability risk table verified against `src/core/work-model.ts:196`. ✅

---

## A12.4 — `event-channels.md`

### Core source file

`src/core/event-stream.ts` exists and contains the `CHANNELS` constant and `writeEvent`. Sprint 279 moved this from `src/orchestra/` to `src/core/`; `src/orchestra/event-stream.ts` remains as a backward-compatible re-export shim. The doc correctly cites `src/core/event-stream.ts`. ✅

### `DeckentEvent` structure

Doc shows:
```typescript
{
  timestamp: string;
  sequence: number;
  protocol_version: '1.0';
  source: string;
  target: string;
  channel: string;
  payload: unknown;
}
```

Actual (`event-stream.ts:33–45`) adds optional `correlationId?: string` and `causationId?: string` fields (ENT-3 audit lineage) not shown in the doc — minor omission but not incorrect.

### Channel codes verified

Every channel listed in the doc has been verified against the `CHANNELS` constant (`event-stream.ts:85–179`):

| Doc channel | Source constant | Match |
|-------------|-----------------|-------|
| `BRAIN→WORKER:TASK_ASSIGN` | `CHANNELS.TASK_ASSIGN` | ✅ |
| `WORKER→BRAIN:HEARTBEAT` | `CHANNELS.HEARTBEAT` | ✅ |
| `WORKER→BRAIN:RESULT` | `CHANNELS.RESULT` | ✅ |
| `WORKER→BRAIN:QUESTION` | `CHANNELS.QUESTION` | ✅ |
| `BRAIN→WORKER:ANSWER` | `CHANNELS.ANSWER` | ✅ |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | `CHANNELS.CODE_VERIFY_REQUEST` | ✅ |
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | `CHANNELS.VERIFICATION_RESULT` | ✅ |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | `CHANNELS.SCOPE_COLLISION_DETECTED` | ✅ |
| `AUDITOR→BRAIN:ADR_VIOLATION` | `CHANNELS.ADR_VIOLATION` | ✅ |
| `AUDITOR→BRAIN:GATE_COMPUTED` | `CHANNELS.GATE_COMPUTED` | ✅ |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | `CHANNELS.LOAD_REPORT_WRITTEN` | ✅ |
| `BRAIN→*:METRIC_EMITTED` | `CHANNELS.METRIC_EMITTED` | ✅ |
| `BRAIN→WORKER:FIX_REQUEST` | `CHANNELS.FIX_REQUEST` | ✅ |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | `CHANNELS.SPRINT_PHASE_CHANGE` | ✅ |
| `DECKENT→USER:NOTIFY` | `CHANNELS.NOTIFY` | ✅ |
| `AUDITOR→BRAIN:ORPHAN_HB_DETECTED` | `CHANNELS.ORPHAN_HB_DETECTED` | ✅ |
| `AUDITOR→BRAIN:AUTHORITY_VIOLATION` | `CHANNELS.AUTHORITY_VIOLATION` | ✅ |
| `BRAIN→WORKER:TIMEOUT_ASSIGN` | `CHANNELS.TIMEOUT_ASSIGN` | ✅ |
| `WORKER→BRAIN:TIMEOUT_WARNING` | `CHANNELS.TIMEOUT_WARNING` | ✅ |
| `AUDITOR→BRAIN:TIMEOUT_CAP_EXCEEDED` | `CHANNELS.TIMEOUT_CAP_EXCEEDED` | ✅ |
| `BRAIN→WORKER:TIMEOUT_EXTEND` | `CHANNELS.TIMEOUT_EXTEND` | ✅ |
| `BRAIN→WORKER:NEVER_DISPATCHED` | `CHANNELS.NEVER_DISPATCHED` | ✅ |
| `BRAIN→SPAWN:BLOCKED` | `CHANNELS.SPAWN_BLOCKED` | ✅ |
| `BRAIN→*:DEPENDENCY_RESOLVED_BY_FIX` | `CHANNELS.DEPENDENCY_RESOLVED_BY_FIX` | ✅ |
| `BRAIN→WORKER:DEPENDENCY_BLOCKED` | `CHANNELS.DEPENDENCY_BLOCKED` | ✅ |
| `WORKER→BRAIN:AUTH_FAILED` | `CHANNELS.AUTH_FAILED` | ✅ |
| `BRAIN→AUDITOR:CONTAINER_PATH_SANITIZED` | `CHANNELS.CONTAINER_PATH_SANITIZED` | ✅ |

### Undocumented channels in source

Three channels exist in `event-stream.ts` but are not listed in the doc:

| Channel code | Constant | Sprint added |
|-------------|----------|-------------|
| `DECKENT→USER:NERVOUS_NOTIFICATION` | `CHANNELS.NERVOUS_NOTIFICATION` | Sprint 288 |
| `DECKENT→USER:NERVOUS_APPROVAL_CONSUMED` | `CHANNELS.NERVOUS_APPROVAL_CONSUMED` | FIX-1 |
| `PROGRESS` | `CHANNELS.PROGRESS` | Sprint 280 |

**Recommendation:** Add these three entries to the User Notification / Lifecycle & State tables.

---

## A12.5 — `multi-provider.md`

### Provider set

The doc lists: Claude, Codex, Gemini, Ollama (full spawn support) + DeepSeek, Qwen, GLM/Zhipu (HTTP-only). This matches `src/orchestra/task-router.ts:97` where `isProviderName` recognizes exactly `claude`, `codex`, `gemini`, `ollama` as spawnable providers, and the HTTP providers are handled separately via the `send()` path. ✅

### Model equivalence (`src/core/model-equivalence.ts`)

Doc references `getEquivalentModel()` in `src/core/model-equivalence.ts`. The model tier table (premium+/premium/standard/economy) and wire-model notes (`gpt-5` → wire `gpt-5.5`) are consistent with the provider routing infrastructure. ✅

### Fallback chain behavior

Doc §5: "only one retry is attempted — no infinite loops". Matches `task-router.ts` `ensureAvailable` logic — no recursive fallback. ✅

### Auth resolution

Doc §6 mentions `- Backend:` and `- ModelEffort:` directives. These correspond to `task.authMode` and `task.modelEffort` fields resolved by `resolveWorkerAuth` in `task-router.ts:187`. ✅

---

## A12.6 — `provider-free.md`

### Canonical resolver location

Doc §1: `getProviderForModel(model)` defined in `src/core/task-types.ts`. Verified: `task-types.ts:114` exports this function. ✅

### Model registry

Doc §1 references `src/core/model-registry.ts` — verified: imported by `routing-engine.ts:34`. ✅

### `?? 'claude'` defaults

Doc §6 notes "three `?? 'claude'` defaults remain as legitimate final fallbacks". This is a deliberate, documented constraint — not a bug. ✅

### `getDefaultProviderName()` in task-router

Doc doesn't mention this, but `task-router.ts:271` uses `getDefaultProviderName()` from `sprint-utils.ts` as the zero-provider fallback (Sprint 202 fix to avoid silently routing to claude when the config is Ollama-only). This is an implementation detail consistent with the provider-free principle. No doc change needed.

---

## Required Fixes (Priority Order)

### P0 — `dependencies.md`
1. **Replace `telegraf` row with `grammy`:**
   - Row: `| \`grammy\` | \`^1.44.0\` | Telegram connector (grammY framework) | ADR-016: External Messaging Connectors |`
2. **Add missing optional dependencies:**
   - `| \`nodemailer\` *(optional)* | \`^6.9.14\` | Email connector (SMTP outbound) | ADR-016 |`
   - `| \`openai\` *(optional)* | \`^4.103.0\` | OpenAI voice / embeddings adapter | ADR-069 (or applicable ADR) |`

### P1 — `stack-aware-routing.md`
3. **Correct `RoutingDecision` interface** in §1 (Layer 3) to match `routing-types.ts:118`:
   - Replace singular `confidence` with `agentConfidence` + `skillConfidence`
   - Remove `skillBudget` (not in the type)
   - Add `agentScore`, `skillScores`, `contextFit`, `routingVersion`

### P2 — `event-channels.md`
4. **Add three undocumented channels** to appropriate table sections.

---

## Links Checked

| Link in docs | Status |
|-------------|--------|
| `stack-aware-routing.md` → `src/core/routing-engine.ts` | ✅ path valid |
| `stack-aware-routing.md` → `src/core/intent-classifier.ts` | ✅ path valid |
| `stack-aware-routing.md` → `src/core/activation-engine.ts` | ✅ path valid |
| `execution-request.md` → `src/core/work-model.ts` | ✅ path valid |
| `execution-request.md` → `src/orchestra/execution-request-builder.ts` | ✅ path valid |
| `event-channels.md` → `src/core/event-stream.ts` | ✅ path valid |
| `event-channels.md` → `src/core/audit-writer.ts` (`AUDIT_EVENT_CHANNEL`) | ✅ path valid (file exists) |
| `dependencies.md` → `../adr/010-tek-runtime-dependency-commander-js.md` | not verified (out of scope) |
| `provider-free.md` → `src/core/model-registry.ts` | ✅ path valid |
| `provider-free.md` → `../adr/066-provider-independence.md` | not verified (out of scope) |

---

_A12 audit complete. Two docs require updates (P0 + P1 severity); one doc has minor additions (P2). No build or test changes required — this is a documentation audit task._
