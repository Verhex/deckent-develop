# ExecutionRequest — Full Persona/Scenario Coverage Analysis & Universal Contract (2026-06-09)

> **Why this doc:** Before unifying the 3 execution paths (WM-1), Alperen asked —
> does the `ExecutionRequest` contract cover EVERY usage scenario across all four
> personas (solo AI-assistant, developer, team, enterprise)? This sweeps the
> Trinity 3-face × 3-audience matrix + the 6 "everyone everywhere" scenarios,
> inventories every axis a work-request must express, finds the gaps, and
> lays out the contract's **growth path**. The deliverable is the COVERAGE PROOF
> (the matrix + 16-axis inventory show no axis is unaccounted-for); the contract
> grows by adding **optional** fields *with their feature*.
>
> **Positioning (Alperen, 2026-06-09):** deckent is an **agentic-OS + agentic-run
> ecosystem** — install it, run it, ready+orchestrated, integrates everywhere,
> takes/gives data, understands the structure, learns, and uses the models
> correctly. The contract must therefore carry not just code-task fields but the
> ecosystem axes: provenance/integration (`origin`), data-in/out targets
> (`capabilityTarget`), and correct-model-use (`modelEffort` + routing). The
> coverage matrix below confirms each maps to an axis.
>
> **Correction (advisor review):** the contract does NOT need every field baked in
> now. Fields are OPTIONAL — adding `actor?` when TEAM-1 lands is additive and
> touches only the team path built then, NOT the cli/dev paths that never set it
> (the 2026-06-08 spec mandates "new fields OPTIONAL, migrate consumers
> one-by-one"). So "widen now or re-touch everything later" is a FALSE premise. Add
> only fields with a consumer **today** (`origin`, `modelEffort`); the rest is a
> recorded roadmap whose shape is validated by the feature that consumes it
> (guessing `actor.role` / `capabilityTarget` shape now = reshape later + a dead
> field reading as "wired" when unused). And: `ExecutionRequest` has ZERO consumers
> today — a wider type proves nothing; shipping ONE path (CLI) through
> `buildExecutionRequest`→`resolveToTask` is what earns the contract its shape.

## 1. The coverage matrix (Trinity 3-face × 3-audience)

```
              | End User              | Developer              | Enterprise
AI Assistant  | chat brainstorm/      | chat dev-assist        | chat ops-alert /
              | daily tasks (mail,    | (explain, scaffold)    | approve-in-chat
              | calendar)             |                        |
AI Sys Worker | task automation       | sprint orchestration   | multi-tenant pipeline /
              | (one-off)             | (run/start)            | autonomous process (ERP)
Dev Platform  | skill install         | custom agent/skill/    | mTLS + SSO + audit +
              |                       | provider/MCP           | RBAC + capability-broker
```
+ 6 everyone-everywhere scenarios: (1) zero/empty project, (2) in-development,
(3) finished+monitored, (4) daily/personal automation, (5) ERP/enterprise
process, (6) all-on-one-engine (Trinity).

## 2. Axis inventory — what a work-request must express, vs current contract

| # | Axis | Serves | Current `ExecutionRequest` | Status |
|---|------|--------|----------------------------|--------|
| 1 | **WHAT** — description, `kind` (TaskKind) | all | ✅ description, kind | ✅ |
| 2 | **WHERE** — `environment` (WorkDomain × ExecutionContext) | all | ✅ environment | ✅ |
| 3 | **NEEDS** — `requirements` (Capability + ResourceNeed) | dev/ent | ✅ requirements | ✅ |
| 4 | **TARGET (code)** — `scope` (files/dirs) | dev | ✅ scope | ✅ |
| 5 | **TARGET (non-code)** — capability/connector invocation (mail.send, erp.read, db.query, calendar) | end-user daily (4), ERP (5) | ❌ none — `scope` is file-centric | **GAP** |
| 6 | **OUTCOME** — `goNogo` (kind/stack-aware via WM-7) | all | ✅ goNogo | ✅ |
| 7 | **HOW** — provider, model, effort, priority, authMode, autoApprove, timeoutMs | all | ✅ all | ✅ |
| 8 | **REASONING DEPTH** — `modelEffort` (WM-7/F1-RE, distinct from work-size effort) | all | ❌ on Task, NOT on contract | **GAP** |
| 9 | **ROUTING HINTS** — agentId, skillIds | dev/team | ✅ (optional hints) | ✅ |
| 10 | **INTERACTION MODE** — interactive (chat, multi-turn) vs batch (autonomous) vs streaming | AI-assistant (chat) | ❌ none — assumes single-shot | **GAP** |
| 11 | **WHO (identity)** — actor id + role | team, enterprise | ❌ none | **GAP** |
| 12 | **TENANT** — tenantId (multi-tenancy) | enterprise (ENT-2) | ⚠️ capability `tenant-scope` exists, no tenantId field | **GAP** |
| 13 | **PROVENANCE** — origin (cli/mcp/chat/autonomous/webhook/scheduled/api/ide) | audit, persona-routing | ❌ none | **GAP** |
| 14 | **AUDIT LINEAGE** — correlationId, causationId | enterprise (ENT-3) | ❌ none | **GAP** |
| 15 | **GOVERNANCE** — riskClass / approvalRequired / policyContext | enterprise (F10) | ⚠️ capability `approval`, no first-class risk | **PARTIAL** |
| 16 | **CONSTRAINTS** — cost/token budget | enterprise cost-control | ⚠️ timeoutMs only | **GAP** |

**Verdict (confirms Alperen's instinct):** the current contract is **code-task-
centric** (scope=files, goNogo=build/test, no identity). It serves Developer
fully and Solo-assistant partially, but **structurally under-serves Team
(no actor/role), Enterprise (no tenant/audit/risk/budget), and the
non-code daily/ERP scenarios (no capability-target)** and the conversational
AI-Assistant (no interaction mode).

## 3. The contract — coverage-complete DESIGN (growth path, NOT all-add-now)

> This is the full shape the contract GROWS into — proof that every axis has a
> home. Per the advisor correction, only **`origin`** and **`modelEffort`** are
> added to the type in WM-1 (they have consumers today); the rest are shown here
> as the validated growth path and are added (optional, additive) WITH their
> feature (see §4). Fields marked `// ROADMAP` are not committed to the type yet.

```ts
export interface ExecutionRequest {
  // ── WHAT ──
  description: string;
  kind: TaskKind;
  // ── WHERE ──
  environment: EnvironmentType;
  // ── NEEDS ──
  requirements: RequirementProfile;
  // ── TARGET ──
  scope: TaskScope;                                   // code work (files/dirs)
  capabilityTarget?: {                                // GAP-5: non-code work (F8 broker)
    capability: string;                               // 'mail.send' | 'erp.read' | 'db.query' | …
    args?: Record<string, unknown>;
    connector?: string;                               // imap | graph | odoo | …
  };
  projectRoot: string;
  // ── OUTCOME ──
  goNogo?: GoNoGoCriteria;
  // ── HOW ──
  provider?: ProviderName;
  model?: ModelType;
  modelEffort?: string;                               // GAP-8: reasoning depth (F1-RE)
  effort?: TaskEffort;
  priority?: TaskPriority;
  authMode?: 'subscription' | 'api';
  autoApprove?: boolean;
  timeoutMs?: number;
  agentId?: string;
  skillIds?: string[];
  // ── INTERACTION ──
  mode?: 'batch' | 'interactive' | 'streaming';       // GAP-10: assistant vs autonomous
  // ── IDENTITY / GOVERNANCE envelope ──
  actor?: { id: string; role?: string; tenantId?: string };  // GAP 11/12: WHO + RBAC + tenant
  origin?: 'cli' | 'mcp' | 'chat' | 'autonomous' | 'webhook' | 'scheduled' | 'api' | 'ide';  // GAP-13
  correlationId?: string;                             // GAP-14: audit — request grouping
  causationId?: string;                               // GAP-14: audit — lineage (ENT-3)
  budget?: { maxUsd?: number; maxTokens?: number };   // GAP-16: enterprise cost-control
}
// riskClass (GAP-15) is DERIVED, not stored: resolveRiskClass(req) from
// requirements.capabilities (shell/erp-write/db-write/network/approval) +
// capabilityTarget — single source, no drift.
```

## 4. Define-now / consume-incrementally (the answer to "kapsamlı mı?")

**Define the FULL contract now** (one additive type change, zero runtime impact —
all new fields optional). **Consume each field when its feature lands**, so no
path is ever re-touched for the contract:

| Field group | Defined | Consumed by | When |
|---|---|---|---|
| WHAT/WHERE/NEEDS/scope/HOW/goNogo/routing | ✅ now | the 3-path unification | **WM-1 (now)** |
| `origin` | now | set per path (cli/mcp/autonomous) + audit | **WM-1 (now — free)** |
| `modelEffort` | now | spawn (already wired on Task) | WM-1 carries it through |
| `actor`/tenantId | now | RBAC (ENT-1/F4) + multi-tenancy (ENT-2) | TEAM-1 / ENT-1/2 |
| `correlationId`/`causationId` | now | audit lineage | ENT-3 |
| `mode` | now | chat/interactive execution | AI-Assistant (chat round-trip) |
| `capabilityTarget` | now | capability broker | F8 / ERP-1 |
| `budget` | now | pre-spawn cost-gate | cost-control |
| `riskClass` (derived) | helper now | policy-gate park | F10 / WM-6 |

So **WM-1 stays surgical** (unify the 3 code paths using the core fields + set
`origin`), while the contract is **comprehensive from day one** — TEAM/ENT/F8/
chat features populate their fields without re-designing the contract or
re-touching run/start/autonomous.

## 5. Migration impact (unchanged from the WM-1 spec, plus origin)

`buildExecutionRequest` sets `origin` from the calling path; `resolveToTask`
ignores the not-yet-consumed envelope fields (forward-compatible). Everything
in `2026-06-09-wm1-execution-request-design.md` still holds; this doc only
WIDENS the contract definition + records the coverage rationale.

## 6. Scenario spot-checks (does each cell fit?)

- **End-user daily (mail):** `{kind:'generic', environment:{domain:'messaging',context:'local-dev'}, capabilityTarget:{capability:'mail.send',connector:'graph'}, mode:'interactive', origin:'chat'}` ✅ fits.
- **Developer sprint task:** `{kind:'code-development', scope:{...}, goNogo, modelEffort:'high', origin:'cli'}` ✅ fits (today's path).
- **Team task w/ RBAC:** `{…, actor:{id:'u42',role:'engineer',tenantId:'acme'}, origin:'api'}` ✅ fits.
- **Enterprise ERP process (autonomous):** `{kind:'data', environment:{domain:'erp',context:'production-tenant'}, capabilityTarget:{capability:'erp.write'}, requirements:{capabilities:['erp-write','approval']}, actor:{tenantId:'acme',role:'ops'}, origin:'scheduled', causationId:'flow-7', budget:{maxUsd:5}}` ✅ fits — and `resolveRiskClass` → high (erp-write) → policy-gate parks for approval.

All 9 matrix cells + 6 scenarios express cleanly. No further axis identified.

## 7. ADR

Folds into ADR-087 ("Canonical Work-Model — Universal ExecutionRequest …");
extend its scope note to "universal work-request (code + capability + governed +
multi-persona)", written at the memory-export cycle.
