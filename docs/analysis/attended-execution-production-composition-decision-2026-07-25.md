# Attended execution production composition — owner decision packet

**Date:** 2026-07-25
**Altitude:** design
**Scope:** non-Desktop runtime-wide approval authentication, integrity custody,
two-phase dispatch adoption and Goal-v2 composition
**Precondition:** MASTER-PLAN 618 / M4-060 is code-present, common-dispatch-wired
and provider-free proven; it is not production-enabled.

## Decision recorded and bounded delivery

Alperen approved A, B, C and D for M4-061 on 2026-07-25. The approval expressly
excluded production key provisioning/rotation, a paid canary, commit/push and
default flips.

M4-061 implemented the approved architecture without crossing those gates:

- dedicated open-only approval-decision custody, independent from provider keys;
- verified API/OIDC authentication and durable revocation-aware live sessions;
- immutable proposal/resume plus first-writer final dispatch claim;
- one injected runtime authority across API, Goal-v2, CLI run, task-mode, MCP
  run, sprint initial/queued/respawn and process execution;
- provider-free rebuilt restart/replay proof with exactly one backend callback.

Delivery is code-present, runtime-wide wired, hermetic-proven and
rebuilt-provider-free-proven. Production enablement remains HOLD until the
separately gated approval key and real IdP credentials are provisioned and a
paid canary is explicitly approved. This packet remains the owner-decision
record; `.tasks/task-m4-061.result` and `.tasks/task-m4-061.evidence` record the
bounded implementation outcome.

## Outcome

M4-060 removed the raw `approvalEvidenceRef` authority bypass. An unsupported
remote backend can now pass the final pre-dispatch gate only with an immutable,
single-use receipt exactly bound to tenant, project, run, task, attempt,
provider, API model, backend, budget, policy and expiry.

Production must remain HOLD today. The repository has:

- `ApprovalDecisionIngress`, which can sign a decision only after live
  reauthentication;
- `ApprovalDecisionAuthority`, which validates request/command/session/MAC,
  identity and expiry at the use boundary;
- `AttendedExecutionApprovalAuthority`, which projects the exact execution
  binding and atomically consumes it;
- common final verification in CLI run, task-mode, MCP run and sprint
  initial/queued/respawn dispatch.

It does not have a production `LiveApprovalAuthenticator`, an approval-specific
`ApprovalDecisionIntegrityAuthority`, a trusted surface composition root or a
durable two-phase request/resume service. Existing API, RPC, REPL and MCP
approval mutations are legacy audit/workflow decisions, not attended execution
authority.

## Negative space

- Do not reuse provider truth/limit key material as an approval signing key.
- Do not infer human attendance from TTY presence, localhost, an OS username,
  `autoApprove`, an MCP connection or a literal actor such as `"terminal"`.
- Do not accept static/opaque API bearer possession as fresh human
  reauthentication.
- Do not trust decoded-but-unverified JWT claims.
- Do not let API, RPC, REPL, MCP or Goal-v2 construct a surface-local approval
  authority.
- Do not regenerate provider/model/backend/budget/attempt identity after the
  user has approved it.
- Do not enable native Windows custody until a verified DACL/DPAPI or equivalent
  adapter exists.
- Do not provision, rotate or migrate keys in normal runtime startup.
- Do not run a paid worker canary, flip a default, commit, push or publish under
  this decision packet.

A concrete violation is the current HTTP mutation path deriving a principal
without the explicit verified-claims signal and calling
`ApprovalBroker.decide()` directly. Another is the REPL supplying
`decidedBy="terminal"`: both are attributable workflow events, but neither
proves a fresh authenticated human session.

The obstacle blocks the current surface-local approach, not the goal. The
smallest durable alternative is one process-scoped approval authority runtime
with domain-separated custody, verified session adapters and exact snapshot
resume.

## Current evidence

| Layer | Disk truth | Evidence status |
|---|---|---|
| Decision contract | `ApprovalDecisionIngress` binds request digest, action, channel, actor, tenant, role, session hash, authentication/expiry times and MAC. | code-present; test-proven |
| Execution projection | `AttendedExecutionApprovalAuthority` binds and consumes the exact final dispatch once. | common-dispatch-wired; compiled/provider-free-proven |
| Goal-v2 | `MissionApprovalCoordinator` revalidates a decision before claim, but production `runV2Engine` receives no coordinator/decision authority. | fail-closed HOLD |
| HTTP API | Bearer middleware can verify configured JWTs; approval mutation still calls generic Broker directly. `deriveRequestPrincipal()` is unsafe for authorization unless explicitly stamped by the verified gate. | legacy mutation enabled only by flag; not execution authority |
| OIDC/JWKS | `verifyJwt` and `verifyJwtWithJwks` provide signature/issuer/audience/expiry checks. | code-present; not threaded as a reusable verified approval context |
| REPL/TUI | Broker relay records decisions with a literal terminal actor. | UX/workflow decision only |
| RPC | `decidedBy` is accepted from the wire. | audit value only; not identity authority |
| MCP stdio | No authenticated human/caller identity context; autonomous approval writes the legacy v1 gate. | execution approval HOLD |
| Session store | Existing `SessionStore` has token/identity/TTL/revoke lifecycle, but raw-token lookup, optional durability and no approval-context binding. | pattern only |
| Key custody | Provider authority keyring demonstrates host-global revision chains and strict POSIX ownership; it intentionally rejects Windows without a verified ACL adapter. | reusable pattern, not reusable approval key |

## Required architecture

### 1. One `ApprovalAuthorityRuntimeService`

Each tenant/project/process opens exactly one runtime service. It owns:

1. the existing project-scoped `ApprovalBroker` and `ApprovalStore`;
2. one approval-specific integrity authority opened from host-global custody;
3. one live-session lease/revocation authority;
4. registered authentication adapters keyed by trusted channel;
5. `ApprovalDecisionIngress` instances derived from that common authority;
6. `ApprovalDecisionAuthority`;
7. `AttendedExecutionApprovalAuthority`;
8. the durable request/resume store described below.

CLI, API, process, Goal-v2, Brain, Worker and Auditor receive this service by
injection. MCP stdio may observe/publish pending requests but cannot decide them
without an authenticated upstream identity adapter.

Runtime startup is **open-only**. Missing key custody, unsupported platform,
missing tenant, unavailable authenticator, ambiguous channel or corrupt session
state returns a typed HOLD before provider/backend work.

### 2. Dedicated approval key domain

Approval decisions require a separate key hierarchy and storage namespace,
for example:

`keys/approval-decision/v1/...`

The approval authority may reuse a generic host-custody implementation pattern,
but must not use the provider authority's root or active key. Its key IDs,
rotation chain, audit records and incident revocation are independent. This
limits compromise blast radius and lets provider evidence remain verifiable
after an approval-key incident, and vice versa.

The integrity payload remains the canonical decision envelope already defined
by `ApprovalDecisionIngress`; no surface signs an ad-hoc projection.

### 3. Cross-platform custody adapter matrix

| Platform / deployment | Required custody adapter | Enablement rule |
|---|---|---|
| Linux host / WSL | Host-global owner-only POSIX store with symlink, owner, mode, atomic-publication and revision-chain verification; enterprise deployments may select Secret Service, TPM or external KMS/HSM adapters. | Enable only after exact adapter attestation; WSL authority never projects to native Windows. |
| macOS | Keychain/Secure Enclave adapter, or an explicitly provisioned and attested host-global owner-only file adapter. | No project-local fallback; adapter identity is durable evidence. |
| Windows native | DPAPI/CNG or enterprise KMS/HSM adapter plus verified DACL/owner checks and atomic publication. | Current generic `icacls` warn-and-continue behavior is insufficient; HOLD until adapter proof exists. |
| Container/Kubernetes | External secret/KMS/HSM or host-injected read-only key handle; no key material in worker mounts or task JSON. | Worker never receives sign authority. |
| Multi-host enterprise | Tenant-scoped KMS/HSM key with key version, policy revision, audit identity and revocation evidence. | Local file keyring cannot claim distributed authority. |

Unsupported adapters fail loudly. The full platform matrix is part of the
contract even when a specific adapter is not yet enabled.

### 4. Fresh authenticated session contract

`LiveApprovalAuthenticator` adapters return only server-verified identities.
The canonical live-session lease binds:

- actor subject, tenant, normalized role and authentication authority;
- trusted channel and client/session class;
- authentication time, expiry and revocation epoch;
- a random opaque session reference persisted only as a hash;
- optional OIDC issuer, audience, `acr`, `amr` and `auth_time` evidence digests;
- the approval request digest and action being reauthenticated.

Session TTL is bounded by the shortest of the IdP assertion, request expiry,
policy maximum and adapter capability. Final dispatch rechecks active session
state; approval history alone never authorizes execution.

#### Channel policy

| Channel | Production authority rule |
|---|---|
| API/OIDC | Recommended first adapter. Require cryptographically verified issuer/audience/signature/expiry claims and a fresh reauthentication or step-up assertion. `sub`, tenant and role come from verified claims, not `parseOidcClaims`. |
| Static API token | HOLD for attended execution. Token possession can protect an API surface but is not fresh human identity. |
| Local terminal | HOLD until a platform reauthentication adapter exists (for example PAM/polkit, macOS LocalAuthentication/Authorization Services, or Windows Hello/WebAuthn). TTY presence and OS username are insufficient. |
| Connector | Enable only when the connector supplies a cryptographically verified actor/tenant/session assertion and anti-replay binding. |
| MCP stdio | HOLD for decisions. It has no human identity boundary. It may list/publish the pending request and return the authenticated decision reference created elsewhere. |
| Authenticated HTTP MCP | May reuse the API/OIDC adapter when the verified principal and fresh session context are carried through the transport. |
| RPC | Existing client-supplied `decidedBy` is not authority. Route through the same verified HTTP principal/reauth context or HOLD. |

### 5. Two-phase exact request/resume

Opening an authority object is insufficient. A command must not approve one
dispatch and later execute a regenerated one.

The common attended flow is:

1. Resolve the final tenant/project/run/task/attempt/provider/API-model/backend,
   owner budget and landing policy **without spawning the backend**.
2. Persist an immutable `AttendedDispatchProposal` containing that exact
   projection and its digest.
3. Submit the deterministic ApprovalBroker request and return/present
   `approval-required` with request/proposal references.
4. A trusted ingress records a live-session decision.
5. The same process, or a restarted process, reloads the exact proposal. It
   must not reroute, replan, widen budget or mint a new attempt.
6. Immediately before backend spawn,
   `verifyAndClaim(requestId, exactProposal)` validates the live decision and
   atomically consumes it.
7. Dispatch/settlement records the same attempt and receipt. A second invocation
   adopts/reconciles existing dispatch evidence or returns consumed/conflict; it
   never spawns twice.

If the approved candidate becomes unreachable, the request expires or policy
changes, execution returns HOLD and requires a new proposal/approval. Fallback
never inherits another provider/model/backend's approval.

Goal-v2 parked WorkItems can reuse their durable approval outbox, but the
attended execution proposal is still a distinct exact dispatch authority.
Mission policy approval does not automatically authorize an unsupported backend.

## Owner decisions requested

### A — Custody

**Recommended:** approve a dedicated approval-decision key hierarchy behind a
generic platform custody interface. Runtime is open-only; provisioning/rotation
remain separate owner/admin operations. Provider keys are not reused.

**Rejected alternative:** add an `approval` domain to the current provider
keyring and use the same root. This saves code but joins compromise, rotation
and incident lifecycles that have different security meanings.

### B — First production authenticator

**Recommended:** API/OIDC with signature/issuer/audience verification plus fresh
step-up/reauth and durable revocation-aware session leases. Static token,
localhost, REPL literal actor, RPC `decidedBy` and MCP stdio remain HOLD.

**Trade-off:** solo local users without configured OIDC cannot yet use the
unsupported-backend exception. They can use landing-capable backends, or wait
for the platform-native local reauth adapters. Treating a TTY as proof would be
more convenient but would reintroduce unauthenticated authority.

### C — Two-phase dispatch adoption

**Recommended:** make immutable proposal/resume mandatory for every attended
hard-stop request. An approval never applies to a newly resolved attempt.

**Rejected alternative:** rerun the command after approval and compare only
provider/model/backend. It loses exact attempt and policy identity and can
duplicate execution after a crash.

### D — Rollout order

**Recommended dependency order:**

1. authority runtime + custody/session interfaces and fail-closed matrix;
2. immutable proposal/resume store and crash/replay reconciliation;
3. API/OIDC verified-context adapter and decision endpoint cutover;
4. Goal-v2 coordinator and attended execution authority injection;
5. CLI/task-mode/MCP/sprint adoption of the same runtime service;
6. platform-native local reauthentication adapters;
7. provider-free real-binary restart/replay proof;
8. separate owner-approved single-worker paid canary;
9. wider canary only after settlement, receipt, token/cache and success evidence.

## Acceptance criteria after owner approval

1. One process-scoped authority is consumed by API, Goal-v2, CLI run,
   task-mode, MCP run and sprint dispatch; no surface-local signer/verifier.
2. Approval key IDs and key material are domain-separated from provider
   authority, host-global and absent from project/worker mounts.
3. Verified OIDC identity, tenant, session, request/action/channel and expiry
   survive restart and are revalidated at final dispatch.
4. Static token, auth-disabled, localhost, TTY, MCP stdio, client-supplied actor,
   missing custody and unsupported platform all HOLD before provider/backend
   work.
5. Approval applies only to the exact immutable dispatch proposal. Reroute,
   replan, budget/policy drift, expiry, revocation and replay are rejected.
6. Restart resumes/adopts the same proposal and attempt; no duplicate provider
   execution occurs.
7. Goal-v2 mission approval and attended unsupported-backend approval remain
   separate authorities and both are required when both policies apply.
8. Hermetic cross-platform adapter tests, targeted integration tests, full lint
   and `build:all` pass.
9. Rebuilt provider-free binary proves request → trusted decision → restart →
   exact single dispatch callback, plus every HOLD case with callback count 0.
10. One finite Fable-5 verifier judges only these written criteria. A paid
    provider canary requires a separate owner decision.

## Decision response format

Implementation authority can be granted unambiguously with:

> Approve A, B, C and D for M4-061. Key provisioning/rotation, paid canary,
> commit/push and default flips remain separately gated.

Any rejected option should name the desired custody/authentication alternative.
Until then, MASTER-PLAN 618 correctly remains 🟡 and attended unsupported remote
execution remains fail-closed HOLD.
