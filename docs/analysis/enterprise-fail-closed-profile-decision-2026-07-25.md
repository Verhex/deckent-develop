# Enterprise fail-closed profile — owner decision packet

**Date:** 2026-07-25
**Altitude:** design
**Scope:** non-Desktop multi-tenant authority composition, strict enforcement,
surface parity and evidence-grade rollout
**MASTER-PLAN:** row 534 / `ENT-FAILCLOSED`

## Outcome

Deckent has real enterprise primitives, but no single enterprise fail-closed
profile. The current behavior is surface-dependent:

- the agentic scope guard and flag-enabled Worker RBAC can hard-deny;
- the general authority enforcer remains soft/advisory by default;
- connector RBAC hard-denies only capability entries carrying a permission tag;
- `parseEnterpriseConfig()` has no production caller;
- custom `rate_rules` are persisted but do not drive runtime rate authority;
- RBAC call sites can bypass enforcement by omitting the optional role;
- `MemoryStore` now defaults to strict behavior for an explicitly supplied
  tenant, but its 55 production constructors do not receive one canonical
  enterprise context and tenant-unaware reads remain tenant-unscoped;
- the audit HMAC uses non-production custody.

Focused tests passing does not turn these independent controls into one
enterprise guarantee. Row 534 is partial, not complete.

No runtime behavior, accepted ADR byte, default, provider call, key custody,
commit or push was changed by this packet.

## Negative space

- Do not claim an enterprise profile from a collection of optional flags.
- Do not treat a missing tenant, principal, role or policy as community mode
  after enterprise mode has been selected.
- Do not allow a surface to omit role/tenant parameters to bypass enforcement.
- Do not report `strict_tenant_isolation=ON` while tenant-aware stores were not
  opened from the same authority snapshot.
- Do not persist custom RBAC/rate policy without making its enforcement status
  explicit.
- Do not hard-flip community defaults under an enterprise-only repair.
- Do not use a public/static audit secret as evidence-grade signing custody.
- Do not implement Desktop/admin UI under this decision.

A concrete violation is enabling enterprise mode, accepting a request without
a verified role, and letting `flow-registry.addFlow(..., role?)` proceed because
the caller omitted the optional parameter.

The obstacle blocks the current piecemeal-flag approach, not the product goal.
The smallest durable alternative is one immutable enterprise authority snapshot
that every surface and execution boundary must consume.

## Disk truth

| Layer | Current truth | Evidence status |
|---|---|---|
| Enterprise schema | `parseEnterpriseConfig` validates tenancy/RBAC/flow but is imported by no production caller. | code-present; production-unwired |
| Memory tenant filtering | Explicit-tenant queries default strict in `MemoryStore`; constructors generally receive no unified tenant context. | partial mechanism; no runtime-wide authority |
| Worker RBAC | `enforce_rbac=true` can hard-deny; absent/false emits a soft warning and proceeds. | flag-wired; default advisory |
| General scope authority | Enforcement is deliberately mixed under ADR-G-020. | surface-dependent |
| Connector identity | Hard block is opt-in and only effective for permission-tagged capabilities. | partial |
| Custom roles/rates | CRUD/persistence exists; custom runtime authority is incomplete and `rate_rules` do not drive `TenantRateLimiter`. | management-wired; enforcement-unwired |
| Audit integrity | Hash/HMAC machinery exists; production key custody is separately incomplete. | mechanism-present; custody-unproven |
| Provider authority | Enterprise mode without an explicit verified tenant already HOLDs in the new provider authority service. | one correct fail-closed precedent |

## Verification

The bounded enterprise matrix passed 15 files / 186 tests:

```text
npx vitest run \
  tests/core/enterprise-config.test.ts \
  tests/core/ent2-deepen.test.ts \
  tests/core/memory-tenant-isolation.test.ts \
  tests/core/memory-tenant-scope.test.ts \
  tests/core/rbac-runtime-enforce.test.ts \
  tests/core/flow-registry-rbac.test.ts \
  tests/core/rate-limiter.test.ts \
  tests/orchestra/authority-enforcer.test.ts \
  tests/orchestra/authority-enforcer-symlink.test.ts \
  tests/orchestra/ent1-rbac-enforce.test.ts \
  tests/orchestra/ent2-tenant-thread.test.ts \
  tests/orchestra/rbac-spawn-mainline.test.ts \
  tests/api/server-tenant-scope-wire.test.ts \
  tests/api/enterprise-roles-rate.test.ts \
  tests/api/terminal/audit-integrity.test.ts --reporter=dot
```

The green matrix explicitly includes tests proving soft-warning/pass behavior
when hard RBAC is disabled. It therefore proves the mixed current contract, not
the requested unified strict profile.

## Required architecture

### I1 — Immutable `EnterpriseAuthorityProfileV1`

Resolve one canonical snapshot at process/project/tenant composition time:

- mode: `community | enterprise-preview | enterprise-strict`;
- tenant and project authority, deployment/host identity and policy revision;
- verified identity providers and principal/role sources;
- RBAC, resource ACL, scope, rate, audit, retention and approval policies;
- required platform adapters/capabilities;
- canonical digest, effective time, expiry and evidence references.

`parseEnterpriseConfig` becomes an input validator, not a second runtime
authority. Legacy flat fields are migrated explicitly into the snapshot.
Ambiguous or conflicting fields fail loudly.

### I2 — Exact `EnterpriseExecutionContext`

Every API, CLI, MCP, terminal, connector, process, flow, mission, Brain, Worker
and Auditor operation receives one immutable context binding:

- tenant/project/run/task/call/request/attempt;
- verified actor, role, identity authority and authentication/session refs;
- profile/policy/scope/budget/approval digests;
- provider/model/backend when execution is involved.

In enterprise modes tenant and role are non-optional. Missing context returns a
typed HOLD before reads, writes, planning, provider calls or backend spawn.
Community mode remains explicit and byte-compatible; absence of enterprise
context cannot be inferred after enterprise mode was selected.

### I3 — One enforcement matrix

The snapshot drives a single decision interface for:

1. filesystem/tool/process authority, including realpath and cross-platform
   scope adapters;
2. tenant-scoped MemoryStore/query/relations/exports;
3. RBAC and per-resource ACL;
4. connector capability permission;
5. configured tenant/action rate rules;
6. audit signing, retention, legal hold and export;
7. ApprovalBroker and provider/limit admission.

Each enforcement decision emits a durable receipt containing the exact context
and policy digest. A missing enforcement adapter is HOLD, never warning+allow,
in `enterprise-strict`.

### I4 — Platform and deployment capability matrix

The full contract covers native Windows, WSL, Linux, macOS, containers,
Kubernetes and multi-host enterprise deployments. Each strict deployment must
attest its exact adapters:

- identity/session verification;
- filesystem/sandbox/process isolation;
- tenant-scoped data and secret custody;
- KMS/HSM-backed audit/approval integrity where required;
- distributed rate/concurrency authority;
- durable receipt/retention/export stores.

An unsupported adapter fails honestly for that profile. It does not silently
fall back to a local-file or single-process authority.

### I5 — Evidence-gated rollout

1. Owner approves the ADR-G-020/G-031 amendment/cross-reference proposal.
2. Unified profile/context and compatibility migration land default-off.
3. Provider-free negative matrix proves zero side effects for every missing,
   mismatched, stale and ambiguous authority.
4. CLI/API/MCP/connector/process/mission parity tests consume the same snapshot.
5. Real-binary enterprise fixture proves restart/replay and receipt integrity.
6. Key provisioning and any paid/multi-host canary remain separate owner gates.
7. Enterprise-profile enablement/default changes remain separate owner gates.

## ADR boundary

ADR-G-020 intentionally records mixed enforcement today and a future hard
enforcement vein. ADR-G-031 records the enterprise foundation as opt-in and
lists the exact config, rate, audit and capability gaps. I1–I5 advances those
roadmaps but changes their runtime composition contract.

Accepted ADR bytes remain unchanged. Implementation requires an owner-authorized
amendment/cross-reference proposal first.

## Owner decision requested

Approve or revise I1–I5 and authorize the ADR-G-020/G-031 amendment proposal.
Approval does not authorize key provisioning, paid/multi-host canaries, default
flips, commit/push, publish, Desktop implementation or repo migration.
