# Authority, RBAC, and scope

Deckent has several role vocabularies for different boundaries. They must not be treated as interchangeable: product RBAC governs users/tenants, orchestration authority governs Brain/Auditor/Worker, approval requester roles classify actors asking for consent, and capability roles map non-code operations to grants. [Evidence: `src/core/rbac.ts:11-57`; `src/orchestra/authority-enforcer.ts:16-23`; `src/core/approval-contract.ts:61,246-260`; `src/core/capability-broker.ts:29-50`]

## Product-user perspective

### Precedence

When instructions conflict, the repository contract orders them as: provider/system safety; the owner's live instruction; the three Immutable Laws; operating rules; active-run `DIRECTIVES.md`; role rules; skill/procedure; generated content. Ambiguity becomes typed HOLD, and no role may expand its own authority. [Evidence: `AGENTS.md:124-128`]

Generated dashboards and exports provide evidence; they do not make policy. Repository-local hooks and policies are not an unbypassable administrative boundary. Managed enterprise requirements are needed for that claim. [Evidence: `AGENTS.md:124-128`]

### Product RBAC

| Role | Effective permissions when RBAC is enabled |
|---|---|
| `viewer` | `read`, `sprint:read` |
| `operator` | Viewer permissions plus `write`, `execute`, `sprint:write`, `audit:read`, `flow:manage` |
| `admin` | Operator permissions plus `admin`, `audit`, `tenant:admin` |

[Evidence: `src/core/rbac.ts:11-57`]

Invalid tenant IDs, unknown roles, and missing permissions deny. With audit context, denial writes an `access:denied` audit event. Runtime `enforceRbac` checks only when RBAC is enabled; the standalone enterprise defaults keep tenancy and RBAC disabled, default the role to viewer, and set flow concurrency to one. [Evidence: `src/core/rbac.ts:73-129`; `src/core/enterprise-config.ts:12-37`]

Connector permissions use `resource:action` strings and support `*`, `resource:*`, and `*:action`. A configured external group can override the role mapping; then explicit role permissions; then built-in defaults. [Evidence: `src/core/rbac.ts:131-145`; `src/connectors/identity/role-map.ts:4-27`]

### Orchestration authority

| Role | Owns | Must not claim |
|---|---|---|
| Brain | Planning/orchestration state, task assignment, lifecycle events, managed memory projections. | Source/test writes under the static matrix. [Evidence: `src/orchestra/authority-enforcer.ts:127-171`] |
| Auditor | Read/verification, gate/event evidence, audit reporting, lock observation. | Source/test/task-plan/memory authority. [Evidence: `src/orchestra/authority-enforcer.ts:174-213`] |
| Worker | Exact assigned task artifacts, heartbeat/result/question channels, scoped source/test work. | Brain/Auditor state or another worker's scope. [Evidence: `src/orchestra/authority-enforcer.ts:215-247`; `src/agents/worker.ts:793-835`] |

The matrix itself currently reports `soft` decisions; worker code can hard-deny when its RBAC enforcement option is enabled. These seams do not prove universal enforcement across every adapter. [Evidence: `src/orchestra/authority-enforcer.ts:1-7,252-307`; `src/agents/worker.ts:793-835`]

### File and tool scope

Pre-spawn scope validation classifies declared paths as confirmed, new-plausible, or suspect. Suspect write paths block by default unless explicitly acknowledged; some unambiguous task-local typos can be resolved when that policy is enabled. [Evidence: `src/core/scope-gate.ts:1-118,123-153`]

Tool scope resolves real paths so a symlink inside an allowed directory cannot escape the actual boundary. Its pure gate supports advisory and enforce modes. The module default is advisory, while effective config currently defaults `boundary_enforcement` to true; canonical composition/default semantics are unresolved in OQ-22. [Evidence: `src/core/tool-scope-gate.ts:1-19,31-49,103-139`; `src/core/config.ts:1652,2764`; OQ-22]

### Approvals

Approval requesters are `brain`, `worker`, `auditor`, `nervous`, or `connector`. Ordered policy rules can match scope, risk, requester, and tenant. The fallback maps the request's default action to an equal-or-more-restrictive policy; critical risk is never auto-approved. [Evidence: `src/core/approval-contract.ts:61,246-260`; `src/core/approval-policy.ts:22-126`]

“Always allow” is never global: a grant is bound to a scope identity, approval scope, maximum risk, and expiry. The current allow-scope module explicitly says broker composition is a downstream integration concern, so its existence is not proof that every approval ingress consumes it. [Evidence: `src/core/approval-allowscope.ts:1-8,202-220`]

The runtime approval core now has real consumers: worker tool gates can wait for an external
decision, terminal decisions use live authentication, and attended execution verifies and claims
an exact dispatch before provider work. This does not yet prove one universal product surface:
Nervous normal/panic paths and every Terminal, Desktop, API, connector, CLI, and MCP projection
are not fully converged. [Evidence: `src/agent/permission-store.ts:214-280`;
`src/core/approval-decision-ingress.ts:213-390`;
`src/core/attended-execution-approval.ts:741-825`]

The approved product direction is **one attention-and-consent experience**. Nervous observes,
explains, and proposes; ApprovalBroker owns the exact human decision; the executor consumes only
verified authority; settlement reports the real outcome. Signatures stay behind that experience
as tamper-evident evidence rather than becoming a second user-facing approval workflow. See
[Nervous System](../guide/nervous-system.md).

### Archived identity/RBAC plans, rechecked

The four archived identity/RBAC plans describe design intent and dated task state, not a current completion certificate. Current source does contain the tenant-aware `admin|operator|viewer` evaluator and the connector group→role→default permission mapping, so their “planned-only” state is stale. Status remains `⚠️ partial`: enterprise RBAC defaults off, orchestration/approval/capability vocabularies are separate, and the canonical cross-vocabulary mapping remains OQ-23 rather than being inferred from those plans. [Evidence: `src/core/rbac.ts:11-59,73-145`; `src/connectors/identity/role-map.ts:4-27`; `src/core/enterprise-config.ts:12-37`; archived identity/RBAC plan inventory]

## Dogfood / repository reality

| Control | State | Current constraint |
|---|---|---|
| Tenant-aware RBAC evaluator | ✅ live | Role hierarchy, validation, permission check, and denial audit are implemented. |
| Enterprise RBAC default | ⚠️ opt-in | Standalone defaults disable tenancy/RBAC; disabled enforcement is a permissive no-op. |
| Connector role mapping | ✅ live | Group/role/default precedence and wildcard permissions are implemented. |
| Brain/Auditor/Worker matrix | ⚠️ partial | Static paths/channels exist, but the authority enforcer reports soft mode; some consumers add hard-deny behavior. |
| Tool realpath containment | ✅ live primitive | Symlink-aware checks exist; canonical default/composition remains OQ-22. |
| Capability least privilege | ⚠️ opt-in | Registry default is permissive unless grants or `leastPrivilegeEnabled`/per-call enforcement is supplied. [Evidence: `src/core/capability-broker.ts:78-93,132-145`] |
| Role vocabulary unification | ⚠️ HOLD | Product RBAC lacks `developer`, capability roles include it, and approval/orchestration roles use other sets; mapping authority is OQ-23. |
| Runtime-wide approvals | ⚠️ live core, partial convergence | Durable broker, authenticated decision ingress, worker gate, and exact attended-execution consumers are live; Nervous and all user surfaces do not yet share one complete request→decision→effect→settlement path. |

Do not describe repository-local policy as an enterprise security boundary until the exact ingress, enforcement mode, tenant context, audit sink, and managed host policy are all verified. [Evidence: `AGENTS.md:124-128`; `src/core/tenant-context.ts:5-55`]
