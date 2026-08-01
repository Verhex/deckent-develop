# Xverify Production Ingress Authority — Owner Decision Proposal

Status: owner decision required; no production dispatch has been enabled.

Date: 2026-07-25
Decision owner: Alperen
Altitude: design

## Verified current state

The mandatory runner and strict Docker authority now consume an exact injected
composition, but no production surface authors that composition.

The current production provider-authority bootstrap registers one Claude
subscription source scope:

```text
provider=claude
auth=subscription
transport=cli
executionBackend=host-subprocess
```

It intentionally does not project that evidence onto Docker. The strict xverify
launcher requires:

```text
provider=claude
transport=cli
executionBackend=docker
```

There is a second, independent incompatibility. Claude subscription `/usage`
is stored as advisory `percent` windows because it does not prove per-call
account-bound quota burn. `CrossVerifyDockerProviderUsageAuthority` can settle
only exact `tokens`, `usd` and `requests` reservation units from host-observed
provider billing/runtime receipts. It correctly HOLDs `percent` and `credits`.

Therefore adding a Docker reachability probe alone cannot make mandatory
subscription xverify dispatchable.

Concrete violation: copy the host-subprocess account/reachability evidence into
a Docker candidate and convert a 73% subscription display into an exact token
reservation. The system would claim both backend reachability and per-call
capacity without provider evidence for either.

This blocks a fabricated ALLOW path, not the non-Desktop readiness Goal.

## Proposed decision F

### F1 — Backend-scoped source authority remains exact

Account identity, reachability and provider-limit evidence are registered and
queried for one exact:

```text
tenant/project/provider/model/auth/account/
transport/executionBackend/endpoint/executionProfile/quotaScope
```

scope. Host-subprocess, Docker, API, tmux and local-runtime evidence are never
projected onto one another. A backend without a complete source bundle returns
durable HOLD before attempt claim, reservation or provider work.

### F2 — The authored provider-limit policy selects the query

Production ingress must not enumerate stores or invent account/quota hashes.
For one configured canonical verifier provider and API model, the composition
root reads the separately authored `provider_limit_authority` envelope and
requires exactly one matching effective selector for the runtime tenant,
auth/transport/backend/endpoint and provider.

- zero matches → `xverify_provider_scope_unavailable`;
- multiple matches → `xverify_provider_scope_ambiguous`;
- model/provider mismatch → `xverify_model_scope_mismatch`;
- missing or stale exact truth → existing candidate HOLD;
- no registry-order, catalog-order or login-based fallback.

The selector supplies `accountRefHash`, `quotaScopeRefHash`, required windows
and source authority. Canonical model resolution supplies the versioned API
model and execution profile. These values are then frozen into the existing
candidate, receipt, reservation and attempt contract.

### F3 — Production composition owns one exact attempt claim

After exact source selection and fresh candidate projection, the process-scoped
composition root:

1. creates one host-private task-result settlement attempt;
2. wins/adopts its first-writer claim;
3. derives the fence digest from that immutable claim;
4. projects the auditor InvocationReceipt;
5. compiles the finite prompt and exact attempt contract;
6. builds the reservation from the same selector/contract;
7. injects the existing coordinator, strict Docker launcher and host observer
   as `mandatoryInvocation`.

CLI `xverify`, sprint evaluation and future MCP/API entrypoints consume this
same composition service. Surfaces do not construct candidates, claims,
receipts, reservations or launchers. Restart reconciles an existing claim
before opening a new one.

Default-off remains ahead of composition: when cross-verify enforcement is not
enabled, no source refresh, attempt claim or provider work occurs.

### F4 — Subscription and API share the truth contract, not fake units

The common contract remains:

- exact provider/account/backend identity;
- source authority and freshness;
- typed limit windows;
- immutable reservation and dispatch claim;
- host-observed actual usage;
- provider-specific terminal mapping;
- receipt and termination provenance.

The units and evidence producers remain provider-specific.

For Claude subscription:

- host-auth status can identify the organization;
- an isolated Docker credential-bundle digest can bind the mounted credential
  generation;
- a Docker model probe can prove reachability only when separately authorized;
- current `/usage` percentage remains advisory and cannot produce a strict
  reservation or terminal per-call settlement.

For API providers:

- key custody and account identity need provider-specific authority;
- provider response/request IDs, rate-limit headers and billing usage can
  produce exact `tokens|requests|usd` windows when the adapter proves them;
- a provider without those facts remains HOLD.

No generic `cloud` backend is introduced. OpenRouter remains
`provider=openrouter · transport=api · executionBackend=api`.

### F5 — Rollout choice

Approve the following staged production path:

1. implement the default-off ingress composition and exact selector/claim
   authoring with provider-free hermetic/binary HOLD proofs;
2. implement Docker-scoped Claude account credential-generation binding and
   reachability source without calling it;
3. keep Claude subscription strict provider-capacity admission HOLD while its
   only limit source is advisory percent;
4. make the first ALLOW profile an API-scoped adapter only after separate key
   custody, authoritative account/limit source, immutable termination adapter
   and paid-canary approvals;
5. enable no defaults until a real provider canary proves the complete
   request→receipt→reservation→dispatch→usage→termination chain.

This leaves current manual/advisory Fable xverify available under its existing
owner hard budget, but it cannot satisfy mandatory strict verification.

## Rejected alternatives

1. **Host reachability projected to Docker:** wrong backend authority.
2. **Subscription percent converted to tokens/USD:** invented unit conversion.
3. **Use successful login as reachability:** catalog/auth is not model-call
   evidence.
4. **Let each surface construct exact queries:** creates multiple routing and
   identity authorities.
5. **Open a reservation from mutable task JSON:** worker-writable state is not
   owner policy.
6. **Call the provider during ordinary composition:** a source refresh is a paid
   side effect and remains separately gated.
7. **Mark strict verification available while every production scope HOLDs:**
   code presence is not enabled/live-proven delivery.

## Acceptance gates after approval

### Provider-free ingress slice

1. Exact single selector produces one immutable candidate query.
2. Missing/ambiguous/mismatched selector returns typed HOLD with zero attempt,
   reservation, provider and Docker side effects.
3. Exact fresh stored evidence produces one attempt claim and one
   `mandatoryInvocation` composition.
4. Restart adopts the same claim; concurrent composition has one winner.
5. Default-off touches neither provider authority nor attempt state.
6. CLI/sprint use the same process-scoped composition service.
7. Targeted tests, lint, `build:all`, compiled provider-free canary and one
   finite Fable-5 verdict pass.

### Later live profile

1. Provider-specific account identity and credential generation are exact.
2. Reachability is proven on the same backend/model/account.
3. Limit evidence is authoritative and reservation units are terminally
   mappable.
4. D3 termination adapter is available for the same backend.
5. A separately approved paid canary proves the complete chain.

## Authority that remains separately gated

This proposal does not authorize:

- source refresh or a model reachability probe;
- key provisioning, import, rotation or migration;
- a paid strict xverify or worker canary;
- default flips;
- commit, push, publish, tag or repo migration;
- Desktop implementation.

## Owner decision

- [ ] Approve F1–F5.
- [ ] Request changes.

## Independent finite review

Deckent `xverify` ran one bounded Fable-5 adjudication against the written
premises. `xv-1784947283205` returned `CONFIRMED`: the current source scope is
host-subprocess-only, subscription limits are advisory percent while strict
settlement requires exact mappable units, no production caller supplies
`mandatoryInvocation`, and F1–F5 retains one default-off authority.

This verdict does not grant implementation or paid-probe authority and was not
re-verified. Provider envelope: `$0.105741` (evidence, not an invoice); Fable
usage: input 4, output 1,963, cache-read 24,347, cache-create 6,702. Helper
Haiku: input 2,510, output 15.
