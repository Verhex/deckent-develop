# RPC Protocol

## Zod-First Envelope
- Define the request/response envelope as `z.object({...}).strict()` — rejects unexpected keys
  instead of silently dropping them, turning a client typo into a validation error, not a no-op.
- Stamp `version` as a **plain required string**, never `z.literal(CURRENT_VERSION)`. A literal
  fails schema *parsing* on mismatch (an exception); a plain string lets it parse into a
  well-formed request the dispatcher rejects with a structured `VERSION_MISMATCH` error —
  shape validation stays independent of version negotiation.
- Encode "exactly one of result/error" with `.superRefine()`, not two unchecked optionals — an
  unchecked pair lets a handler return both or neither and the bug surfaces at the client, not
  the contract boundary.
- Keep `params`/`result` typed `z.unknown()` at the envelope level; each method's schema (below)
  narrows them. The envelope validates shape, not business content.

## Method Catalog as Source of Truth
- Declare the method union as a `const` string-literal array, then type the per-method schema map
  as `Record<Method, {params, result}>`. TypeScript forces a compile error the moment a method is
  added to the union without a matching schema pair — catalog drift is a build failure, not a
  runtime surprise.
- Keep a method's params/result schemas paired together, not in two separately-indexed maps.

## Unknown-Method Honesty
- Distinguish `UNKNOWN_METHOD` (not in the catalog) from `METHOD_NOT_IMPLEMENTED` (a valid catalog
  method with no handler yet). Collapsing these hides information from callers and from tests
  written against partial rollouts.
- A partially-wired handler map (some methods wired, some not) is a valid, honest runtime state
  during incremental rollout — not a bug to paper over with stub handlers that throw.

## Never-Throw Dispatch
- Every failure mode — version mismatch, unknown method, invalid params, missing handler, handler
  exception — becomes a structured `RpcResponse.error`, never a thrown exception. A transport
  adapter (HTTP/WS/stdio) can then always serialize a response, with no catch-all 500 path needed.
- Wrap the handler call in try/catch and map any thrown error to `INTERNAL_ERROR` — a handler bug
  degrades to a normal error response, not a crashed transport.

## Dual-Consumer Testing
- When one contract module backs more than one transport (e.g. an HTTP route AND a REPL/CLI
  client), write the per-method round-trip test against BOTH consumers, not the contract module
  in isolation. Drift between what the wire sends and what the client expects is exactly the bug
  class a single-consumer test cannot see.
- Prefer hermetic fixtures per consumer (fake spawn, fake backend, fake broker) over a real
  subprocess/PTY — the dual-consumer test proves protocol correctness, not infra availability.

## Transport-Agnostic Serialize/Parse
- Keep `serialize*`/`parse*` pure — zero I/O. Any transport (WS, HTTP, stdio, IPC) reuses the
  same pair; a transport-specific bug can never masquerade as a protocol bug.
- `parse*` must never throw on malformed input — return `{ok:false, errors}`. JSON.parse failures
  and schema failures fold into the same error shape.

## Anti-Patterns
- A generic `catch { return {error:'failed'} }` that swallows real Zod issues — surface
  `error.issues` mapped to path+message strings.
- Adding a method to the handler map before the catalog union — catalog is upstream of map.
- Testing only the contract module when two-plus real consumers exist — dual-consumer coverage
  is not optional once a second transport lands.

## Karpathy Notes
- **Surgical:** A version bump touches the envelope and the catalog — nothing else. Resist
  "cleaning up" unrelated methods in the same change.
- **Simplicity first:** One handler map, one dispatcher, one error taxonomy. Don't build a
  plugin/middleware system until a third transport genuinely needs one.
- **Goal-driven:** DONE means the new method round-trips through every real consumer's test, not
  just a unit test against the schema.
