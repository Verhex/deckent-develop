# API Design

## Schema-First Contracts
- Define every request/response as a `z.object({...}).strict()` envelope before writing the
  handler — `.strict()` rejects unexpected keys instead of silently dropping them, turning a
  client typo into a validation error at the boundary instead of a no-op deep inside a handler.
- Use a discriminated union (`kind`/`type` literal field) for any response that can legitimately
  take more than one shape (success vs error, sync vs queued). Two unchecked optionals
  (`result?`, `error?`) let a handler return both or neither; a discriminant makes the invalid
  state unrepresentable at the type level, not just unlikely at runtime.
- Keep the envelope's `params`/`result` typed `z.unknown()` at the top level; let each
  endpoint's own schema narrow them. The envelope validates shape, endpoints validate content —
  conflating the two makes the envelope grow a special case per endpoint.

## Idempotency by Design
- Any endpoint that can be safely retried (POST that creates a resource, a worker/job submit)
  MUST accept a client-supplied idempotency key and de-dupe on it server-side — a retry after a
  timeout must never double-create. This project's own worker task prompts carry an
  `Idempotency Key` for exactly this reason: retries of the same logical operation must resolve
  to the same result, not a second one.
- Store the key alongside the operation's outcome (not just a boolean "seen"), so a retry
  returns the ORIGINAL response, not a fresh 200 with different data.
- Scope idempotency keys per-client — a global namespace lets one caller's retry collide with
  an unrelated caller's identical key.

## Additive, Never-Mutating Evolution
- Adding a field to a response is safe; changing a field's meaning or type is not. Treat
  "repurposing an existing field" as a breaking change even when the wire type happens to still
  parse — a consumer reading the old semantics silently misinterprets the new value.
- New required input fields are breaking. Add as optional-with-default first; only tighten to
  required after every known consumer has migrated.
- Removing a field or endpoint follows a deprecate → dual-write/dual-read → remove sequence,
  never a direct delete in one change.

## Cursor Pagination, Not Offset
- Paginate with an opaque cursor derived from the last row's sort key, not a numeric offset —
  offset pagination skips or repeats rows when the underlying set mutates between pages.
- Encode the cursor (base64/signed) so it stays opaque — callers must not forge or reason
  about cursor internals.

## Error Taxonomy as Part of the Contract
- Machine-readable error codes (`VALIDATION_ERROR`, `IDEMPOTENCY_CONFLICT`, `UNKNOWN_METHOD`)
  are as much a contract as the success shape — document and version them, don't leave callers
  to string-match a `message` field.
- Distinguish "malformed request" from "semantically invalid" from "valid but not found" —
  one generic error code forces every caller to re-derive the distinction from message text.

## Anti-Patterns
- Two unchecked optional fields (`result?`/`error?`) instead of a discriminated union.
- Accepting a retryable POST with no idempotency key, or keying de-dupe on a global (not
  per-client) namespace.
- Repurposing an existing field's meaning because the wire type still happens to validate.
- Offset-based pagination on a set that can mutate between page fetches.
- A single generic error code covering validation, conflict, and not-found alike.

## Karpathy Notes
- **Simplicity first:** One envelope, one discriminant field, one error-code enum — don't build
  a generic "response builder" abstraction until a second, genuinely different envelope shape
  exists.
- **Surgical:** A contract change touches the schema and its consumers — resist "cleaning up"
  unrelated endpoints in the same change.
- **Goal-driven:** DONE means the new/changed endpoint round-trips through a real consumer with
  the new schema, including the retry/idempotency path — not that it merely compiles.
