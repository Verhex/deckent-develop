# Tool-surface runtime authority — owner decision packet

**Date:** 2026-07-25
**Altitude:** design
**Scope:** non-Desktop worker tool-schema/context reduction, permission
authority separation, multi-provider capability truth and dynamic escalation
**MASTER-PLAN:** row 559 / `TOOL-ALLOWLIST`

## Outcome

Row 559 is not complete. The repository has a deterministic task-based selector
and, when `tools.allowlist_enabled=true`, renders its result into the worker
prompt. That is useful code-present/prompt-wired functionality, but it does not
reduce the ordinary worker's provider-visible tool schema.

The current prompt says the surface is “narrowed” and “reduced”, while the
ordinary dispatch paths do not pass `SpawnBackendOptions.availableTools`.
`availableTools` is currently supplied only by xverify (`Bash`) and only the
Claude provider command specification declares a schema-filtering flag
(`--tools`). Codex and Gemini declare no equivalent capability. The
well-formedness evaluator for a dynamic escalation request has no production
consumer. The feature remains default-off, which contains the production
impact, but does not make the completion claim true.

No runtime behavior, ADR byte, feature default or provider call was changed by
this reconciliation.

## Negative space

- Do not equate a prompt instruction with provider-enforced schema reduction.
- Do not merge `allowedTools` permission/file authority with `availableTools`
  schema/context authority.
- Do not use the 20-entry reference/test catalog as the live native +
  connector + MCP tool universe.
- Do not silently claim narrowing on a provider/backend that cannot enforce it.
- Do not mutate a running attempt's approved tool surface in place.
- Do not make a worker-written `.result` line an escalation grant.
- Do not flip `tools.allowlist_enabled`, run a paid canary, change immutable ADR
  bytes, commit, push or publish under this packet.

A concrete violation is computing ten tool names from the reference catalog,
printing “surface reduced to ten”, and then spawning a Codex worker with the
full runtime schema because its provider spec has no schema-filter capability.

The obstacle blocks the current prompt-only completion approach, not the
product goal. The smallest durable route is one immutable resolved tool-surface
contract consumed by both prompt and dispatch, with explicit per-provider
capability truth and a receipt-bound escalation continuation.

## Disk truth

| Layer | Current truth | Evidence status |
|---|---|---|
| Selection policy | `computeToolAllowlist()` deterministically maps task kind, writable scope and agent denials to allowed/escalatable sets. | code-present; hermetic-proven |
| Tool universe | Default input is `DEFAULT_WORKER_TOOL_CATALOG`, a 20-entry reference/test baseline explicitly documented as non-authoritative. Ordinary task building does not inject a live universe. | reference-only; live producer absent |
| Prompt | `buildWorkerPrompt()` computes the selector only when `tools.allowlist_enabled=true`; `buildToolAllowlistBlock()` says the surface is narrowed. | prompt-wired; default-off |
| Permission authority | `allowedTools` is independently re-derived from task file/write scope before Claude dispatch. | existing authority; must remain separate |
| Schema/context authority | `SpawnBackendOptions.availableTools` reaches the provider command. Ordinary worker callers do not provide it; xverify provides `Bash`. | mechanism code-present; ordinary worker unwired |
| Provider capability | Claude declares `availableToolsFlag='--tools'`; Codex and Gemini declare `null`. | explicit partial matrix; no cross-provider parity |
| Escalation | `evaluateEscalationRequest()` validates shape only. It cannot grant and has no production caller. | contract-only; no authority consumer |
| Rollout | Config is opt-in/default-off. | contained; not enabled/live-proven |

## Verification

The bounded command below passed 6 files / 70 tests:

```text
npx vitest run \
  tests/core/tool-allowlist.test.ts \
  tests/orchestra/tool-allowlist-wire.test.ts \
  tests/orchestra/allowlist-flag-wire.test.ts \
  tests/orchestra/prompt-blocks-e2e.test.ts \
  tests/core/provider-command-spec.test.ts \
  tests/orchestra/docker-provider-cli.test.ts --reporter=dot
```

These tests prove selector behavior, flag-off prompt compatibility, flag-on
prompt rendering and provider-command mechanics. They do not prove ordinary
worker schema reduction, a live tool-universe producer, escalation authority or
multi-provider enforcement. Green tests therefore cannot close row 559.

## Required architecture

### H1 — Immutable `ResolvedToolSurface`

Resolve one immutable contract per execution attempt. At minimum it binds:

- tenant, project, run, task and attempt identities;
- provider, API model and backend;
- live catalog reference, catalog digest and capability-evidence reference;
- allowed, escalatable and permission-denied tool identities;
- task-kind, agent, scope and policy input digests;
- resolution time, expiry/revision and contract digest.

The contract is provider/backend-specific. A fallback or reroute requires a new
attempt resolution; it never inherits another provider's claimed enforcement.

### H2 — Produce once, consume everywhere

Build the contract only after resolving the actual provider, backend and
runtime-native/connector/MCP registries. Bind the same contract digest to:

1. the prompt projection;
2. the provider/backend spawn command;
3. the attempt and InvocationReceipt;
4. settlement/evaluation evidence.

No prompt compiler, spawn backend or provider adapter may recompute the policy.
This removes the current reference-catalog and surface-local second authorities.

### H3 — Permission and schema capabilities stay orthogonal

`allowedTools` continues to express tool permission/file authority under
ADR-G-014 and ADR-G-020. `availableTools` expresses which tool schemas enter the
model context under ADR-G-027. A provider capability matrix decides whether the
resolved schema contract is enforceable:

| Provider/backend | Current schema capability | Required behavior when enforcement is requested |
|---|---|---|
| Claude CLI with verified `--tools` semantics | declared | bind exact resolved set and verify the emitted command/receipt |
| Codex CLI | unsupported/unknown | explicit HOLD; never label the prompt as narrowed |
| Gemini CLI | unsupported/unknown | explicit HOLD; never label the prompt as narrowed |
| Future provider/backend | adapter-declared plus live-proven | enable only for the exact proven capability revision |

Unsupported does not mean unavailable for all deckent work. It means the
specific enforced schema-reduction mode cannot be claimed on that route.

### H4 — Escalation is a new bounded continuation

An admissible `toolEscalation` request is evidence, not authority. It routes
through the runtime-wide ApprovalBroker and policy engine. If approved, deckent
persists a new `ResolvedToolSurface` revision and resumes/re-dispatches through
the exact-continuation contract, conserving:

- original run/task lineage and owner budget;
- new attempt identity and explicit delta;
- approval request/decision receipt;
- provider/model/backend capability evidence;
- old/new surface digests and settlement linkage.

No in-place schema mutation and no automatic full rerun are allowed. This
depends on the separately proposed exact-continuation work (E1–E5); row 559
must not invent a second continuation authority.

### H5 — Evidence-gated rollout

1. ADR amendment/decision accepted by the owner.
2. Contract + live catalog producer + capability matrix implemented default-off.
3. Ordinary worker dispatch consumes the same contract or returns typed HOLD.
4. Provider-free compiled command/receipt/restart tests pass.
5. Separately owner-approved single-worker paid canary proves prompt/schema,
   receipt, token/cache and outcome evidence.
6. Default flip remains a separate owner decision after cross-provider truth is
   explicit; unsupported routes continue to fail honestly.

## ADR boundary

This design crosses three accepted immutable contracts:

- ADR-G-014 owns backend options and cross-backend spawn semantics.
- ADR-G-020 owns authority, RBAC and approval.
- ADR-G-027 owns prompt lifecycle and context reduction.

Their current bytes are unchanged. Implementing H1–H5 requires an
owner-authorized amendment/cross-reference proposal before code changes. The
proposal must preserve existing `allowedTools` scope authority and make
schema/context reduction an orthogonal, receipt-bound capability.

## Owner decision requested

Approve or revise H1–H5 and authorize an ADR amendment proposal as the next
design artifact. Approval does **not** authorize key work, a paid canary,
default flips, commit/push, publish or Desktop implementation.
