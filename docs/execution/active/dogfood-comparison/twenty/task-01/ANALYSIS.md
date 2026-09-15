# MASTER3178 startup authority boundaries — task 766-001

**Status:** HOLD / NO_GO for acceptance. This document is the bounded contribution for
startup authority inventory; it does not claim product or dogfood completion.

## Input and evidence boundary

**Measured fact.** The assigned predecessor directory
`docs/execution/active/dogfood-comparison/twenty/task-01/` was absent at inspection and
contained no predecessor report to read. Therefore no accepted predecessor content
 digest is available. This is a dependency hold, not an inference.

The four declared source inputs were read at the checkout state and hashed:

- `src/core/run-status-read-model.ts` — SHA256
  `088feb014d05d83b3f08d241d347e208ca42518e703ec3149fa793eb8e31844e`
- `src/orchestra/scheduler-effects.ts` — SHA256
  `f8af9b62c27263186e96d0fda7ddf9cee532093382033cc16485f21b1eeb24d0`
- `src/orchestra/spawn-backend-docker.ts` — SHA256
  `3ed921457730e26c60c9e435f8bea7ff565ad22cf64ded03790dd3d8606e8abd`
- `src/orchestra/sprint-controller.ts` — SHA256
  `62c93ba54cdf720c8a5d330e7ae5df6acd8a45a02eb1d4f28381fc67bb2f4601`

## Measured authority boundaries

1. **Persisted run-status is a read-model boundary, not a free-standing truth source.**
   The model rejects malformed schema/revision/digest state
   (`src/core/run-status-read-model.ts:391-409`). A model must match canonical run
   authority and, for an active run, a non-null current generation
   (`src/core/run-status-read-model.ts:412-429`). Readiness otherwise resolves to
   `HOLD`, except for explicitly reconciled pause, proven active liveness, or quiescent
   lifecycle states (`src/core/run-status-read-model.ts:432-466`).

2. **Coordinator publication is fenced by persisted authority and generation.**
   Publication chooses canonical authority, reads the run generation, and validates a
   coordinator snapshot before projecting tasks and provider concurrency
   (`src/core/run-status-read-model.ts:539-571`). This makes the status surface a
   projection boundary for operators; it does not authorize dispatch.

3. **Scheduler ingress is the worker-dispatch authority boundary.**
   The shared provider-authority check is specified to run before prompt construction,
   provider bootstrap, assignment, or backend dispatch; absent configured authority is
   allowed as the legacy path, while an unavailable config produces a typed provider
   authority hold and an auditor event
   (`src/orchestra/scheduler-effects.ts:1732-1776`). Collision checks and repair
   no-mint decisions can hold or prevent dispatch before execution
   (`src/orchestra/scheduler-effects.ts:1832-1881`).

4. **Exact Docker execution cannot mint accepted results from the scheduler.**
   The exact registry is a run-scoped bridge: it stores no paths/capabilities and
   cannot mint an accepted result; backend-owned readers populate it
   (`src/orchestra/scheduler-effects.ts:423-466`). Exact provider start authorization
   requires a strict key set plus matching admission, task snapshot, provider
   invocation, authority-label, and nonce digests, as well as receipt/projection
   fences (`src/orchestra/spawn-backend-docker.ts:475-531`).

5. **Provider-observation authority is host-ingested and attempt-bound.**
   The container emits immutable start/end observations; the host copies only those
   observations, leaves a missing end open, does not synthesize a missing start, and
   binds each record to the exact attempt identity
   (`src/orchestra/spawn-backend-docker.ts:10328-10370`). Heartbeat wrapper generation
   is an inert compatibility seam; host authority owns sequence and timestamp
   (`src/orchestra/spawn-backend-docker.ts:10229-10245`).

6. **Startup leadership and safety gates precede execution.**
   `RunSprintOptions` exposes shared attended-execution and provider authorities and
   defines the exact-plan admission seam after leadership, gates, and checkpoint but
   before the first worker side effect (`src/orchestra/sprint-controller.ts:939-994`).
   A preplanned sprint still runs the same pre-start guards as a fresh plan
   (`src/orchestra/sprint-controller.ts:1028-1081`). Heartbeat startup is opt-in by
   argument and start errors are fail-safe/logged rather than execution authority
   (`src/orchestra/sprint-controller.ts:1205-1217`).

## Operator decision map (inference from the measured boundaries)

- **Dogfood operator:** treat a missing, digest-invalid, generation-mismatched, or
  non-ready run-status model as a read-surface HOLD; do not infer worker progress from
  container exit, public result bytes, or a stale status projection. This follows from
  the explicit readiness and generation fences above.
- **Product operator:** treat provider authority, exact admission/receipt digests, and
  host-ingested attempt observations as separate gates. A scheduler decision is not
  evidence that a provider started, and provider start is not evidence of accepted
  settlement. This is an inference from the separate registry, authorization, and
  observation contracts.
- **Cross-platform scope:** Docker backend state is explicitly platform-bearing
  (`src/orchestra/spawn-backend-docker.ts:11185-11213`), while the exact authorization
  and observation rules are digest/identity based. Validate the platform-specific
  backend capability before applying a recovery decision; do not generalize Docker
  liveness to non-Docker backends.
- **Tenant/project scope:** the observed contracts bind status and execution to
  `projectRoot`, sprint/task IDs, run generations, and attempt identities. A product
  or dogfood operator must keep those scopes isolated; no tenant-wide or
  project-wide recovery inference is supported by these four files alone.

## Unknowns and blocked acceptance

- **Unknown:** no predecessor report was available in the declared directory, so its
  accepted content digest, prior findings, and MASTER3178 dependency settlement are
  not verifiable.
- **Unknown:** these four source files do not establish the current live runtime state,
  provider availability, tenant deployment topology, or a settled recovery outcome.
- **Required next action:** provide/settle the predecessor document in the declared
  dependency path, then re-check this synthesis against that accepted digest. Until
  then, this contribution is evidence-backed but not a closed MASTER3178 recovery
  decision.
