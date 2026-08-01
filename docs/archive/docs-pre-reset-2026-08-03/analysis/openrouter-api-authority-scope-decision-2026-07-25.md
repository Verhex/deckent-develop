# OpenRouter API Authority Scope Decision

Status: `READY_FOR_OWNER_DECISION`
Altitude: `design`
Task: `M4-064`

## Outcome first

Registering an OpenRouter `provider=openrouter · auth=api · transport=api ·
executionBackend=api` source today would be structurally unsafe. The API reports
stable provider-user identity and API-key-specific capacity in the same
current-key response, while Deckent's canonical quota scope binds the former but
not credential generation. Two keys owned by one user can therefore carry
different limits yet collide in one quota scope.

This blocks the current account-only approach, not OpenRouter support.

## Bounded evidence

The official current-key endpoint returns provider user identity
(`creator_user_id`) together with key-specific `limit`, `limit_remaining`,
`limit_reset`, usage counters and expiry:

- <https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key>

The generation metadata endpoint can settle usage/cost only when a generation
ID is already known:

- <https://openrouter.ai/docs/api/api-reference/generations/get-generation>

The bounded official API references inspected for this decision do not provide
a proven cancellation or client-idempotency contract covering a coordinator
crash before the generation ID reaches durable host state. Documentation
absence is not proof that the capability can never exist; it is sufficient to
keep the current runtime fail-closed until such a contract is evidenced.

Deckent code currently:

1. correctly rejects `credential-only` evidence as account authority;
2. derives quota scope from tenant, provider, stable account, auth and backend,
   but not credential generation;
3. requires exact policy/source selectors;
4. exposes no immutable API termination adapter, so `api` correctly returns
   `termination_adapter_unsupported`.

## Proposed owner decisions

### D1 — Separate credential quota dimension

Approve a canonical `credentialScopeRefHash` dimension in provider-limit
observation, policy selector, store query/reservation and quota-scope digest.
It is a host-keyring pseudonym of provider + auth mode + credential generation
evidence, never the plaintext key and never the stable account hash.

Benefit: independently limited or rotated credentials cannot share capacity,
reservation or replay state.

Cost: provider-limit schema/store migration, config normalization and all
producer/admission fixtures must be updated atomically. Historical rows remain
readable under their schema; no silent rewrite.

### D2 — Preserve stable provider-account semantics

Approve `creator_user_id` as the OpenRouter `provider-account` subject only
after a successful authenticated current-key response. Derive credential scope
separately from the local credential generation and bind both to the same
response evidence.

Benefit: account identity survives key rotation while quota identity changes
when the independently limited credential changes.

Cost: a response without `creator_user_id` is `account_authority_hold`; key
label, prefix or local secret hash may not substitute for account identity.

### D3 — Exact current-key capacity mapping

Approve an authoritative OpenRouter limit source for explicit USD
`limit/usage/limit_remaining` windows only:

- finite limit + finite remaining + supported reset → `known`;
- absent/null limit or inconsistent counters → `unknown`, never infinity/zero;
- deprecated `rate_limit` metadata is ignored as admission authority;
- response expiry is bounded by the common provider evidence TTL;
- source is exact `openrouter/api/api` and cannot satisfy HTTP/local scopes.

Benefit: paid/free-key spend truth becomes provider-reported rather than locally
estimated.

Cost: policy authors must explicitly select the required windows; an absent
parent policy remains HOLD.

### D4 — API termination remains fail-closed

Keep `api` termination as `termination_adapter_unsupported` for unattended
dispatch. A returned generation ID and metadata may reconcile a completed call,
but they do not prove containment for crash-before-response. The existing exact
attended hard-stop exception may be used only through its immutable
ApprovalBroker receipt and separately approved canary; it does not upgrade API
termination capability.

Benefit: no silent duplicate spend or fabricated capacity release.

Cost: unattended OpenRouter ALLOW remains blocked until OpenRouter exposes, and
Deckent proves, a crash-safe idempotency/cancel/reconciliation contract.

## Recommended bundle

Approve D1–D4 together. Implement D1 schema/migration first, then D2/D3 lazy
provider-free sources and exact registration. Keep D4 HOLD. After hermetic,
compiled and finite Fable verification, request separate approval for key
provisioning and one bounded paid canary.

## Gates preserved

This decision does not authorize key custody changes, key rotation, network
calls, paid canaries, default flips, commit/push, publish/tag or repo migration.
