# Deckent SDK — Design Spec (DRAFT, not-yet-implemented)

- **Date:** 2026-06-16
- **Status:** DRAFT design / future work — **documentation only, no implementation in this cycle**
- **Author:** Alperen + Claude (brainstorming session)
- **Scope:** A first-party, embeddable TypeScript SDK for driving the deckent orchestration
  engine from a developer's own application — deckent's *own idiom*, not a clone of any
  provider's SDK.
- **Decision driver:** deckent is positioned as a **product, not SaaS** today, but will also
  offer hosted **SaaS** services later. The SDK must serve the product (local embed) now and
  be the natural seam for the SaaS client (network) later — one surface, two transports.

> This spec is intentionally implementation-ready but **deferred**. When implementation
> begins, it transitions to the `writing-plans` step. Until then it is the canonical reference.

---

## 0. Decisions log (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Hero scenario / primary consumer | **Embed-engine** — a developer embeds deckent as the orchestration engine inside their own app (CI bot, SaaS backend, custom IDE). SaaS-client is later the network twin of this. |
| D2 | Execution model | **Layered** — low-level in-process core (power users) + high-level managed runtime (default, non-blocking, out-of-process). Same client surface across modes. |
| D3 | v1 scope boundary | **Widest** — orchestration + observation + result + control + memory (read & write) + config/directives + **extensibility (register custom provider/agent/skill/tool)**. No MVP. |
| D4 | Build approach | **① Dedicated SDK layer + transport-swappable client** (`src/sdk/`), reusing the existing engine. Rejected: ② thin facade over current exports (own-idiom too weak, internals leak); ③ protocol-first daemon (largest rearchitecture, separate future arc). |
| D5 | Claude Agent SDK | **Deferred, config-gated.** Shipped later as one optional `defineProvider` impl behind `providers.claude_sdk.enabled`; the extensibility seam stays open in v1 but is not built. The Agent SDK is itself a wrapper over the `claude` CLI → adopting it does **not** change billing/subscription; its value is integration quality (kills brittle `claude -p` stdout parsing), not cost. |

Context note (billing): Anthropic's announced "Agent SDK / `claude -p` third-party usage →
monthly credit system" change was **postponed** (2026-06-16 email); subscription `claude -p`
still works as before. The SDK design is independent of this, but the provider-adapter seam
(D5) is the future hedge: it lets deckent swap the Claude execution path without touching the
public SDK surface. See memory `project_anthropic_subscription_credit_postponed`.

---

## 1. Architecture & module layout

New module `src/sdk/` is the **only public SDK surface**. It reuses the existing engine
(`runSprint`, agent/skill/provider registries, `event-stream.ts`, `deckent serve`) — it does
not reimplement it.

```
src/sdk/
  index.ts             → "deckent/sdk" entry: Deckent, define*, types, errors
  client.ts            → Deckent client class (high-level, managed, DEFAULT)
  core.ts              → "deckent/sdk/core" entry: low-level in-process (runSprint passthrough)
  transport/
    transport.ts       → Transport interface (start/invoke/stream/stop)
    in-process-transport.ts → calls engine directly in caller's process (blocking-aware)
    local-transport.ts → spawns/controls a detached deckent runner via the SAME protocol as HTTP
    http-transport.ts  → (v-next SaaS twin — v1: seam/stub only)
  extension/
    define.ts          → defineProvider/defineAgent/defineSkill/defineTool (deckent idiom)
    registry-bridge.ts → maps definitions onto agent-pool / skill-registry / provider registry
  events.ts            → typed SDK event model (engine events → stable DeckentEvent union)
  types.ts             → stable public types (curated from core, frozen surface)
  errors.ts            → SDK error taxonomy (stable codes)
  runner.ts            → headless entry the managed transport spawns (or reuse `deckent serve`)
```

**package.json `exports` (additive, non-breaking):**
```jsonc
"./sdk":      { "import": "./dist/sdk/index.js", "types": "./dist/sdk/index.d.ts" }, // STABLE contract
"./sdk/core": { "import": "./dist/sdk/core.js",  "types": "./dist/sdk/core.d.ts"  }  // low-level
// existing "." is kept but documented as INTERNAL / UNSTABLE
```

**Layering & import direction (ADR-008 safe):**
`src/sdk/` imports from `core/`, `orchestra/`, `agents/`, `monitor/` — one-way, downward.
The engine never imports from `sdk/`. The SDK sits *above* Brain as an embedding/adapter
layer, preserving "Brain is central, one-way dependency."

**Two layers, one client:**
`new Deckent(opts)` defaults to `mode:'managed'` (LocalTransport spawns a runner; non-blocking;
events over the local protocol). `mode:'in-process'` runs the engine in the caller's process
(blocking-aware, power users). Same `Deckent` methods regardless of mode — only the transport
differs. SaaS later = `mode:'remote', url` (HttpTransport), identical surface.

**ADR-010 compliance:** the SDK adds **no new runtime dependency** (no zod; hand-written
validation + TS types).

---

## 2. Client surface & deckent idiom

**Idiom principles** (deckent's own language, not a clone of Anthropic's SDK):
1. **Verb-first methods mirroring the CLI:** `dk.sprint()`, `dk.task()`, `dk.plan()` — same
   mental model as `deckent start/plan`.
2. **A Run is a live handle:** `await` it for the result, *iterate* it for events, control it
   with methods — one object unifies start + observe + control.
3. **Namespaced sub-APIs:** `dk.memory.*`, `dk.config.*` for cohesion.
4. **`define*` factories** for extensibility — declarative, typed (detail in §3).
5. **Same surface across modes/transports** (managed / in-process / remote).

```typescript
import { Deckent, defineProvider, defineAgent, defineSkill, defineTool } from 'deckent/sdk';

const dk = new Deckent({
  root?: string,                              // project dir (default: cwd)
  mode?: 'managed' | 'in-process',            // default 'managed' (non-blocking)
  config?: ConfigOverrides,                   // merged atop layered config
  register?: Array<ProviderDef|AgentDef|SkillDef|ToolDef>,  // ctor-time registration
  transport?: TransportOptions,               // managed: { backend?, runnerPath?, ... }
});
```

**Orchestration** (Run handle for long ops; `plan` is short → plain Promise):
```typescript
const run = dk.sprint({                       // → SprintRun
  directives?: string,                        // DIRECTIVES.md content
  directivesPath?: string,                    // …or a path
  tasks?: TaskSpec[],                          // …or structured tasks (skip directive parse)
  planning?: 'ai' | 'structured' | 'auto',
  backend?: 'docker' | 'tmux' | 'subprocess',
  provider?: string,
});
dk.task(input: TaskInput): TaskRun;
dk.plan(input: PlanInput): Promise<PlanResult>;

interface SprintRun extends PromiseLike<SprintResult> {        // await run → result
  readonly id: string;
  events(opts?: { since?: number }): AsyncIterable<DeckentEvent>;  // for await
  status(): Promise<SprintStatus>;
  result(): Promise<SprintResult>;
  kill(): Promise<void>;
}
// TaskRun: analogous shape for single-task mode.
```

**Observation / control (global, not tied to one run):**
```typescript
dk.status(opts?: { sprintId?: string }): Promise<SprintStatus>;
dk.events(opts?: { since?: number }): AsyncIterable<DeckentEvent>;
dk.kill(target?: KillTarget): Promise<void>;
dk.cleanup(opts?: { sprintId?: string }): Promise<void>;
```

**Memory, config, directives:**
```typescript
dk.memory.recall(query: string, opts?: RecallOptions): Promise<MemoryHit[]>;
dk.memory.remember(note: string, opts?: RememberOptions): Promise<void>;
dk.memory.history(opts?: HistoryOptions): Promise<SprintSummary[]>;
dk.memory.retro(sprintId?: string): Promise<Retro>;
dk.config.get(): Promise<ResolvedConfig>;
dk.config.set(patch: ConfigPatch): Promise<void>;
dk.setDirectives(content: string): Promise<void>;
```

**Extensibility + lifecycle:**
```typescript
dk.register(def): this;        // same as ctor `register:[...]`; chainable
await dk.close();              // tears down managed runner/transport
```

**Typical usage:**
```typescript
const dk = new Deckent({ register: [myProvider] });
const run = dk.sprint({ directives, backend: 'docker' });
for await (const ev of run.events()) log(ev);   // live observe
const result = await run;                         // get result (thenable)
```

---

## 3. Extensibility contract

The four `define*` factories produce typed, declarative **definitions**; `registry-bridge.ts`
maps them onto deckent's existing internal registries. The `define*` shapes are **stable
deckent idiom** — internal registry churn does not change the SDK surface.

**`defineProvider`** (the critical one; the Claude Agent SDK adapter plugs in here later):
```typescript
const p = defineProvider({
  name: string,                       // unique provider id
  models?: ModelDef[],                // id, tier, apiId
  detect?(): Promise<ProviderHealth>, // availability probe
  spawn?(ctx: WorkerSpawnContext): Promise<WorkerHandle>,        // agentic worker exec
  complete?(req: CompletionRequest): Promise<CompletionResult>,  // single-shot LLM
  capabilities?: { toolUse?: boolean; streaming?: boolean; effort?: EffortLevel[] },
});
// → bridged onto ProviderAdapter (core/provider.ts) + model-registry.
```

**`defineAgent` / `defineSkill`:**
```typescript
const a = defineAgent({ id, systemPrompt, activation?: ActivationRule, skills?: string[], model?: ModelTier });
const s = defineSkill({ id, prompt, activation?: ActivationRule });   // v1: prompt-only
// → AgentPoolManager (.deckent/agents/*/agent.json shape) and skill-registry.
// AST-sandbox code-skills remain file-based in v1; SDK v1 is prompt-only.
```

**`defineTool`** (native-agent / tool-use path):
```typescript
const t = defineTool({
  name, description,
  schema: JsonSchema,                 // HAND-WRITTEN JSON Schema — NO zod (ADR-010)
  handler(args): Promise<ToolResult>,
});
// Deliberate deviation from Anthropic's tool() (which uses zod): deckent uses hand-written
// JSON Schema to avoid a new runtime dependency. This is the concrete "own idiom" point.
```

**`registry-bridge.ts`** — the single translation point (SDK definition → internal registry).
Validation is hand-written, returns the first violation (the `validateBacklogEntry` pattern,
ADR-010).

**Registration & precedence:**
- `dk.register(def)` or ctor `register:[...]`; scoped to the client instance runtime (the
  managed runner receives them over the transport; in-process registers directly).
- Built-ins remain; custom definitions **override by id only with an explicit `override:true`
  flag** (no silent shadowing).

**Claude Agent SDK seam (deferred, documented):**
An optional first-party `claudeAgentSdkProvider()` — itself a `defineProvider` example —
sits behind config flag `providers.claude_sdk.enabled`. When off (default),
`@anthropic-ai/claude-agent-sdk` is **never loaded** → ADR-010 preserved; an opt-in user
installs the peer dep themselves. It is documented as the canonical example of the
extensibility contract.

---

## 4. Transport & data flow

The transport abstraction is what lets managed / in-process / remote share one client surface.

```typescript
interface Transport {
  start(): Promise<void>;
  invoke<T>(op: SdkOp, params: unknown): Promise<T>;                    // req/resp: plan, status, config, memory, kill
  stream(op: SdkStreamOp, params: unknown): AsyncIterable<DeckentEvent>; // long: sprint/task events
  stop(): Promise<void>;
}
```

Three implementations (v1 builds InProcess + Local; Http is seam/stub):

1. **InProcessTransport** — calls engine functions (`runSprint`, `searchMemory`, `loadConfig`)
   directly in the caller's process; events from the existing event-stream emitter.
   Blocking-aware (documented).
2. **LocalTransport** (default / managed) — spawns a detached **deckent runner** and talks to
   it over the **same protocol shape as HttpTransport** (request/response + SSE), just on
   localhost → the SaaS twin is nearly free. Events tail SSE / `.deckent/sprint-*-events.jsonl`.
3. **HttpTransport** (deferred / seam) — connects to a remote `deckent serve` over HTTPS +
   bearer auth (the existing auth-gate, OIDC/static token — see `docs/reference/api-surface.md`).
   Same ops, same SSE stream. v1: interface + stub only.

**Data flow (managed sprint):**
```
dk.sprint(input) → client builds SprintRun → transport.stream('sprint', input)
  → LocalTransport ensures runner up → runner runs runSprint()
  → engine events → event-stream.ts → SSE / jsonl
  → transport normalizes & yields → run.events()
  → terminal event → run.result() resolves  →  await run → SprintResult
```

**Event normalization (`events.ts`):** internal engine events map to a **stable, versioned
`DeckentEvent`** union, so internal churn never breaks consumers:
```typescript
type DeckentEvent =
  | { type:'phase';  phase: SprintPhase; sprintId: string }
  | { type:'task';   taskId: string; status: TaskStatus }
  | { type:'worker'; workerId: string; taskId: string; state: string }
  | { type:'log';    level: 'info'|'warn'|'error'; message: string }
  | { type:'result'; result: SprintResult }
  | { type:'error';  error: DeckentErrorShape };
```

**State source of truth:** managed mode reads status/events from the runner's live state
(`sprint-state.json` / status endpoint per **ADR-044** Sprint State Observability Contract).
The SDK keeps no duplicated state.

---

## 5. Error handling

**Stable error taxonomy (`errors.ts`)** — every SDK error carries a stable `code`:
```typescript
class DeckentError extends Error {
  code: DeckentErrorCode;
  cause?: unknown;
  details?: Record<string, unknown>;
}
type DeckentErrorCode =
  | 'CONFIG_INVALID' | 'AUTH_REQUIRED' | 'PROVIDER_UNAVAILABLE'
  | 'TRANSPORT_FAILED' | 'RUNNER_CRASHED' | 'SPRINT_FAILED'
  | 'TASK_NO_GO' | 'SCOPE_VIOLATION' | 'KILLED' | 'TIMEOUT'
  | 'REGISTRATION_CONFLICT' | 'NOT_SUPPORTED';
```

Principles:
- **Fail-closed:** transport/runner failures reject (`TRANSPORT_FAILED` / `RUNNER_CRASHED`),
  never silent.
- **NO_GO ≠ throw:** a sprint that *completes* with NO_GO tasks resolves normally; the
  `SprintResult` carries per-task NO_GO status. Only *inability to run* (infra/contract)
  throws. "Ran and decided NO_GO" ≠ "couldn't run."
- **Events carry errors too:** `{type:'error'}` streams non-fatal issues (warnings, ADR-037
  soft boundary advisories) without aborting; fatal ones reject the run.
- **Recovery on crash:** managed runner crash → `RUNNER_CRASHED` + `dk.cleanup()` /
  `deckent recover` parity.
- **In-process blocking guard:** in-process mode documents the event-loop risk and offers an
  explicit `await` model; no hidden threads.

---

## 6. Testing & constraints / ADR impact

**Testing (hermetic — ADR-087 + the Test Hermeticity rule):**
- **Unit:** `define*` / registry-bridge mapping, event normalization, error taxonomy — pure,
  no I/O.
- **InProcessTransport:** drive an injected fake engine → assert client contracts (thenable
  result, event ordering, error mapping).
- **LocalTransport:** spawn a **real runner** against a tmpdir fixture project (async `spawn`,
  **no `spawnSync`**); assert non-blocking + event stream + kill/cleanup. Real-behavior, not
  mock-only (per the proof-of-function lesson).
- **Type/contract:** the doc's usage snippets compile under `tsc`. A **shared protocol test
  suite** runs against both LocalTransport and HttpTransport → guarantees SaaS twin parity.

**Constraints / ADR impact:**
- **ADR-010** (single runtime dep): SDK adds none; zod-free, hand-written JSON Schema. Claude
  SDK is an opt-in peer dep.
- **ADR-008** (one-way import): `sdk/` imports the engine, never the reverse. **New ADR
  proposed: "Deckent SDK Contract"** — the stable public surface, transport abstraction, and
  extensibility model become a governed decision.
- **ADR-066** (provider independence): extensibility is provider-agnostic; Claude SDK is just
  one registered provider.
- **ADR-044** (sprint-state observability): managed status/events read the existing contract.
- **i18n:** SDK identifiers are an English API surface (not user-facing copy); any
  human-facing strings still go through `getMessage(en/tr)`. API names are not translated.
- **Versioning:** SDK semver with an independent compatibility promise; `"./sdk"` is stable,
  `"."` is marked internal. Curate/supersede the current `docs/reference/api.md` (which dumps
  internals) with a stable SDK reference.
- **Packaging:** additive `exports` (`./sdk`, `./sdk/core`); no breaking change to the
  `deckent` / `deckent-mcp` bins.

---

## 7. Out of scope for v1 (deferred)

- **HttpTransport / SaaS client** — interface + stub only; full remote build is a later arc
  (same surface, swap transport + add bearer auth).
- **Claude Agent SDK provider** — config-gated, opt-in peer dep; documented seam only.
- **Protocol-first daemon unification** (approach ③) — a separate, larger future initiative.
- **AST-sandbox code-skills via SDK** — file-based for now; SDK v1 skills are prompt-only.

---

## 8. Open questions (resolve before implementation plan)

1. **Runner shape:** does `runner.ts` reuse `deckent serve` (HTTP+SSE already exists) or a
   dedicated thin headless entry? Reusing `serve` maximizes the SaaS-twin overlap; a dedicated
   runner is lighter. (Lean: reuse `serve` as the managed runner.)
2. **In-process registration vs managed runner registration:** how do `define*` definitions
   cross the process boundary to a spawned runner — serialize declarative parts + load a
   module path? (Handlers/functions can't serialize over IPC; likely require a module path the
   runner imports.)
3. **Auth for LocalTransport:** does localhost runner require a bearer token too (uniformity
   with HttpTransport) or trust the local socket? (Lean: token even locally, for twin parity.)
4. **Versioning cadence:** SDK semver coupled to `deckent` package version, or independent?

---

## 9. Next step

When implementation is greenlit, transition to the `writing-plans` skill to produce a phased
implementation plan from this spec. Until then, this document is the canonical Deckent SDK
reference.
