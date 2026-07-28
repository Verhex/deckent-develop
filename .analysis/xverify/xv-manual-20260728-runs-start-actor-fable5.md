# XVerify — CLI exact-start approval actor binding

- Date: 2026-07-28
- Producer: Codex / GPT-5.6 Sol
- Verifier: Claude / Fable 5
- Mode: read-only adversarial cross-provider verification
- Scope:
  - `src/cli/commands/runs.ts`
  - `tests/cli/commands/runs.test.ts`
  - shared exact-start authorization and Terminal-controller comparison paths

## Claim

The CLI exact-start adapter must preserve the durable approving principal in start
lineage instead of replacing it with the surface-local `cli-operator` label. When no
approved snapshot exists, the shared start service must still reject the request before
process birth; digest, approval, start-attempt CAS and settlement authority must remain
unchanged.

## Evidence reviewed

- The failed real-binary Sprint-461 start stopped before provider dispatch, task
  migration and start-attempt publication with:
  `exact-plan-start: start actor is neither the approving actor nor delegated`.
- `resolveStartLineageActor()` returns `approvedSnapshot.approvedBy` when present and
  otherwise returns only the supplied surface actor.
- Both CLI start entry points use the helper; approve and reject still use the
  surface-local operator actor.
- The Terminal controller already supplies `approvedSnapshot.approvedBy`, establishing
  the existing cross-surface contract.
- The shared exact-start service remains the authority for missing approval, actor
  authorization, digest validation, process birth and attempt CAS.
- TypeScript is green and the focused CLI/controller/start-service suites pass 63/63.

## Independent verdict

Fable 5 found that the repair matches the Terminal controller and derives identity only
from the durable approval snapshot. It found no privilege bypass, identity forgery,
digest weakening, attempt-CAS weakening or altered settlement behavior. The missing
snapshot fallback cannot authorize process birth because the shared service rejects the
unapproved state first. A duplicate flow read was classified as cosmetic and outside
the claim.

CONFIRMED
