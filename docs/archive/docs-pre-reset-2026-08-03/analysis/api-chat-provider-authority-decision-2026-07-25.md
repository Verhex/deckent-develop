# API Chat Provider Authority — Owner Decision Packet

**Date:** 2026-07-25
**Altitude:** design
**Scope:** non-Desktop `POST /api/chat` and `GET /api/chat/stream` provider
invocations
**Status:** owner decision required; no runtime behavior enabled

## Executive decision

The provider-backed API chat paths are currently outside the common provider
authority. Provider-free commands are safe to preserve, but natural-language
turns call an opaque `ChatProviderAdapter` without an exact canonical API model,
account/backend scope, owner budget, fallback provenance, InvocationReceipt or
terminal usage settlement.

The recommended repair keeps Deckent's three invocation roles:

- a conversational provider turn is `role=brain`,
  `purpose=interactive-chat`;
- a tool or orchestration action requested during chat is a separate invocation
  under its actual Brain/Worker/Auditor purpose and never inherits the chat
  turn's authority;
- provider-free commands do not enter provider admission.

Implementation is not authorized by this packet. It requires the decisions
below, followed by a default-off, provider-free slice. Key provisioning,
source refresh, paid calls, default flips, commit/push and publish remain
separate gates.

## Negative space

- Do not classify every `/api/chat*` request as a provider call.
- Do not treat HTTP authentication, loopback, a dashboard session or SSE
  connectivity as provider execution authority.
- Do not infer the called model from a provider CLI's current default.
- Do not map an unknown `chat_provider` to Claude silently.
- Do not reuse a chat receipt for a tool, plan, worker or verifier invocation.
- Do not let client disconnect turn into an unobserved, unbounded provider call.
- Do not construct candidates, receipts or fallback decisions inside the HTTP
  route or `ChatProviderAdapter`.
- Do not project host-subprocess evidence onto HTTP, API, Docker or local
  runtime backends.

A concrete violation is accepting `resolveChatProvider()` returning `claude`
plus non-empty `adapter.send()` text as proof that Claude was configured,
requested, resolved and called with a known API model and usable quota.

The obstacle blocks the current opaque-adapter approach, not the Goal.

## Verified current call graph

### Provider-free paths

`resolveChatReply()` handles these without a provider:

- empty input;
- `status`, `help` and localized keyword variants;
- `/status`, `/recall` and `/plan` informational responses.

These paths must remain available even when provider authority is unavailable.
They are read-only responses and produce no model call.

### Provider-backed paths

`POST /api/chat`:

1. parses `{ message }`;
2. selects the seam adapter or server-configured adapter;
3. calls `resolveChatReply()`;
4. natural language reaches `adapter.send()`.

`GET /api/chat/stream`:

1. reads `message` from the query;
2. writes `200 text/event-stream`;
3. selects the same adapter family;
4. calls `adapter.stream()` or `adapter.send()`.

Neither route consumes the injected `ProviderAuthorityRuntimeServiceOpenResult`.
The streaming path sends HTTP 200 before any provider admission decision.

### Adapter composition

Server startup reads raw project config and resolves a fixed adapter:

```text
resolveChatProvider(rawConfig) → resolveChatAdapter(provider)
```

The current projection is insufficient as execution authority:

- top-level `chat_provider` chooses only a provider, not a canonical API model;
- the nested `chat.provider` schema is not the value consumed by this server
  composition;
- invalid/unknown `chat_provider` silently becomes `claude`;
- CLI adapters invoke provider binaries without an exact model argument, so the
  CLI's moving default becomes a second model-selection authority;
- `resolveChatAdapter` supports an `openai-compatible` transport label but not
  Deckent's canonical first-class `provider=openrouter`;
- adapter success/failure does not declare or settle an InvocationReceipt;
- adapter responses do not expose exact called-model, request, account, usage,
  billing or termination evidence;
- stream disconnect only stops response writes. It does not provide a common
  cancellation, termination or settlement contract for the provider call.

## Decision Q1 — Role and purpose

**Recommended:** retain the three-role constitution. Model-backed conversation
uses:

```text
role=brain
purpose=interactive-chat
```

Add `interactive-chat` as a canonical `InvocationPurpose`; do not add an
`assistant` role. The Brain budget/fallback authority applies to the
conversation call, while the purpose keeps chat receipts distinguishable from
sprint planning and goal authoring.

Any tool call creates its own exact invocation:

- planning/authoring → Brain with the relevant existing purpose;
- code or task execution → Worker;
- evaluation/challenge → Auditor.

The conversational receipt cannot authorize downstream execution.

**Rejected alternative:** add a fourth `assistant` role. That would require a
fourth budget hierarchy, fallback policy, admission role, reporting dimension
and migration. It adds a policy authority without a distinct execution
responsibility.

## Decision Q2 — Exact model authorship

**Recommended:** canonicalize chat selection in the nested `chat` block:

```json
{
  "chat": {
    "provider": "claude",
    "model": "claude-fable-5"
  }
}
```

Rules:

1. `chat.model` is a canonical API ID and must match `chat.provider`.
2. When provider authority is configured, missing/unknown/mismatched model
   returns HOLD before adapter construction or provider work.
3. No CLI moving default is an execution identity.
4. Existing top-level `chat_provider` becomes migration/compatibility input,
   not a parallel runtime authority.
5. Unknown values fail loudly; they never become Claude.
6. Future versioned API IDs remain data-driven through the canonical registry.

Provider/model defaults for users who did not author `chat.model` must be an
explicit later rollout decision. This packet does not select one.

## Decision Q3 — Fallback contract

**Recommended:** because chat is a Brain invocation, use the common
Brain-role provider order with the authored chat candidate as the requested
primary. Each fallback requires its own exact canonical API model and
backend/account/limit evidence.

The immutable receipt preserves:

- configured chat provider/model;
- requested identity;
- each resolved fallback transition and reason;
- exact called provider/model;
- auth, account, transport and execution backend;
- reachability and limit evidence.

A missing fallback model or candidate is a terminal chain HOLD, not a registry-
order or CLI-default substitution. `chat.local_fallback=ollama` remains only a
candidate preference until exact local-runtime evidence proves it.

## Decision Q4 — Tenant, session and turn identity

**Recommended:** bind every provider-backed chat turn to:

```text
tenantId/projectId/chatSessionId/turnId/callId
```

- API/OIDC deployments use the verified tenant boundary.
- Solo local operation uses the explicit canonical local tenant owned by the
  process-scoped authority.
- Header, query or message text cannot author tenant identity.
- A replay of the same turn adopts/reconciles its receipt; changed prompt,
  history, provider, model, budget or policy is a new turn.
- Prompt and bounded history digests are immutable receipt-adjacent evidence;
  raw conversation content is not written into provider authority ledgers.

Enterprise tenant injection remains a prerequisite for remote multi-tenant
enablement.

## Decision Q5 — Streaming cancellation and settlement

**Recommended:** both JSON and SSE paths consume one
`ChatInvocationCoordinator`.

For SSE, admission occurs before HTTP 200. The coordinator owns:

1. exact candidate projection and reservation;
2. receipt declaration and `dispatch_started`;
3. an abort/cancel handle supported by the selected adapter/backend;
4. terminal transport and consumer settlement;
5. host-observed usage and reservation settlement;
6. disconnect reconciliation.

If the backend cannot prove cancellation/termination, disconnect produces
`reconciliation-required` and does not release reserved capacity. No silent
background spend is classified as success.

## Recommended implementation order

### Slice 1 — Contract and fail-closed resolver

- add `interactive-chat` purpose;
- define immutable resolved chat invocation identity;
- canonical `chat.provider + chat.model` validation and migration boundary;
- eliminate silent unknown→Claude on the authority-configured path;
- provider-free commands remain byte-compatible.

### Slice 2 — Common coordinator

- process-scoped coordinator consumes the existing provider authority;
- one exact candidate/reservation/receipt/claim per turn;
- JSON and SSE routes receive the same injected service;
- adapter construction follows an admitted exact identity.

### Slice 3 — Stream lifecycle

- pre-header admission;
- cancellation capability negotiation;
- disconnect/timeout/empty/nonzero/provider-error terminal settlement;
- no release without immutable termination evidence.

### Slice 4 — Surface parity

- terminal native chat and API chat use the same invocation coordinator;
- tool actions create separate invocation authorities;
- OpenRouter remains `provider=openrouter · transport=api ·
  executionBackend=api`, never `cloud` or subprocess.

### Slice 5 — Enablement

- provider-free hermetic and rebuilt-binary HOLD/replay proof;
- separately approved key/source setup;
- separately approved single-turn paid canary;
- only then consider a default flip.

## Acceptance gates after owner approval

1. Provider-free commands make zero admission, receipt and provider calls.
2. Natural-language JSON and SSE turns cannot reach an adapter without exact
   canonical provider/model and common Brain admission.
3. Unknown/missing/mismatched identity, reachability, quota, tenant or backend
   returns typed localized HOLD before SSE headers and provider work.
4. One turn produces one immutable InvocationReceipt with configured,
   requested, resolved and called identity plus fallback reasons.
5. Tool execution cannot reuse the chat receipt.
6. Disconnect, timeout and process restart converge to a terminal settlement or
   explicit reconciliation-required state; no unproven capacity release.
7. Same-turn replay cannot duplicate a provider call.
8. CLI/terminal and HTTP do not construct surface-local candidate, fallback,
   receipt or settlement authorities.
9. Targeted hermetic tests, lint, `build:all`, rebuilt provider-free binary
   proof and one finite Fable verdict pass.

## Owner decisions requested

- [ ] Approve Q1: `brain / interactive-chat`, no fourth role.
- [ ] Approve Q2: canonical nested `chat.provider + chat.model`; no moving
  provider CLI default under authority.
- [ ] Approve Q3: common Brain fallback chain with exact model per candidate.
- [ ] Approve Q4: exact tenant/project/session/turn identity.
- [ ] Approve Q5: common coordinator with pre-header stream admission and
  cancellation/settlement authority.

This approval would authorize only provider-free implementation slices.
Production key/source operations, paid calls, default flips, commit/push,
publish and Desktop implementation remain separately gated.
