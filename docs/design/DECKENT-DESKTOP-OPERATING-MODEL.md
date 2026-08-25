# Deckent Desktop Operating Model

> Status: operating-model and simplified Basic state baseline accepted for continued design · 2026-08-25
> Surface in this round: Desktop
> Terminal: Causal Workline with contextual Work Ledger accepted separately; see `DECKENT-TERMINAL-SINGLE-SURFACE.md`
> Evidence boundary: product/design target, not a claim of production-complete ERP or integration wiring

## 1. Product statement

Deckent Desktop is a management, intervention, approval, integration and evidence control plane for
AI-operated work. Software delivery is one domain profile. Commerce, order orchestration,
manufacturing, finance operations and other enterprise systems are additional profiles over the
same governed execution model.

The product must answer five questions without requiring the user to understand Deckent internals:

1. What outcome is the organization trying to achieve?
2. What is happening now, and what changed since the last visit?
3. What needs human attention or a decision?
4. Which agents, workers, systems and policies are responsible?
5. What evidence proves the outcome, and what is the next safe action?

Desktop is not an observability-only dashboard. It can start, guide, approve, pause, resume,
reconcile and administer work where the canonical application service grants that authority.
Closing a view never implies stopping execution.

## 2. Authority and honesty boundary

Repository truth currently proves Electron, daemon adoption/spawn seams, REST/SSE/WS projections,
run inspection, approvals, worker/log/terminal views, provider connections and partial MCP client
foundation. It does **not** yet prove one complete Desktop/Terminal protocol path, durable shared
conversation identity, a native secret broker, an ERP capability runtime or production-complete
extension UI.

Therefore the design separates:

- **core semantics:** objects and states already grounded in Deckent's execution/governance model;
- **domain projection:** labels, business objects and domain-specific panels contributed by a
  governed capability;
- **target capability:** ERP and integration examples that define the intended extensibility but
  require protocol, permission, audit and adapter closure before production claims.

No representative data in the prototype is live system evidence.

## 3. One product, two operating modes

Basic and Advanced are views over the same objects, permissions, events and commands. They are not
separate shells, runtimes or editions.

| Contract | Basic | Advanced |
|---|---|---|
| Primary job | Understand outcomes, attention and next actions | Inspect causality, supervise execution and administer policy |
| Default density | Decision-oriented | Operator-dense |
| Vocabulary | Domain language first, exact IDs available on demand | Domain language plus canonical object and policy IDs |
| Navigation | Overview, Work, Decisions, Connections | Overview, Work, Operations, Agents, Decisions, Connections, Governance, Audit |
| Current work | Outcome, owner, progress, risk, ETA/freshness | Goal→Flow→Run→WorkItem→Attempt→Operation, dependency and evidence state |
| Intervention | Guided safe actions with explicit consequence | Full bounded controls, checkpoint/retry/reconcile and policy context |
| Evidence | Verdict and material exceptions | Evidence items, provenance, verifier, freshness and durable receipt |
| Scale controls | Search, attention views and saved summaries | Server-backed filters, grouping, saved views, stable links and bulk semantics |

### Mode invariants

- Switching mode preserves tenant, workspace, environment, selected object, filters and scroll
  anchor wherever the destination representation exists.
- Basic never hides risk, stale state, approval consequence, irreversible side effects, cost limit
  or unknown authority.
- Advanced never requires the user to reconstruct the business outcome from technical telemetry.
- A permission is identical in both modes. The mode changes explanation and density, not authority.
- Users may set a personal default; administrators may recommend but not silently force a mode.
- Deep links resolve to the same canonical object and open at the permitted disclosure level.

## 4. Cross-domain object model

```text
Tenant / Organization
  └─ Workspace
      └─ Environment or Project
          ├─ Domain objects
          │   ├─ Software: repository, change, release, incident
          │   └─ Operations: order, production batch, shipment, invoice
          ├─ Objective / Goal
          │   └─ Mission → Flow → Run → WorkItem → Attempt → Operation
          ├─ Principals
          │   ├─ human, service, agent, worker
          │   └─ role, policy, delegation, approval authority
          ├─ Connections
          │   ├─ provider, model profile, MCP/tool
          │   └─ ERP/MES/WMS/CRM/SCM or developer systems through governed adapters
          └─ Evidence
              ├─ event, artifact, side effect, verification
              └─ audit record, cost, usage, retention
```

A domain capability may contribute nouns, commands, panels and saved views. It may not redefine
run state, approval semantics, permission evaluation, audit identity, secret custody or evidence
truth.

## 5. Stable shell grammar

The same spatial grammar remains in every mode and domain:

1. **Global bar** — tenant/workspace/environment scope, search/command, mode, connection freshness,
   identity and delegated-authority warning.
2. **Capability rail** — stable top-level destinations; Basic collapses advanced destinations but
   never moves the meaning of an existing destination.
3. **Context header** — selected outcome/object, domain identity, live/stale state, responsible
   principal and primary safe action.
4. **Work canvas** — Basic operational narrative or Advanced topology/table/timeline using the same
   selected object.
5. **Context detail** — Basic opens the selected work in a governed context drawer; Advanced may
   keep a durable inspector pane. Both expose approvals, interventions, policy explanation,
   evidence and next safe action without hover-only controls.
6. **Activity ledger** — attributable state changes with freshness and stable deep links.

The shell supports keyboard-complete navigation, resizable panes, saved layouts, zoom/text scaling,
multi-monitor restoration and locale expansion. Layout persistence is versioned user data and is
never silently discarded.

## 6. Basic mode

Basic mode is for a business owner, team lead, occasional operator or developer who needs control
without internal orchestration vocabulary.

### Default overview

- **Operational focus:** one plain-language statement of the most important current outcome,
  material risk and what Deckent is doing about it.
- **Attention queue:** approvals, blocked outcomes, degraded connections and budget/limit risks,
  ordered by impact and expiry rather than arrival time alone.
- **Work portfolio:** business outcome, current phase, owner, state age, evidence verdict and next
  milestone. Counts disclose whether exact or delayed.
- **System readiness:** connections and agents summarized by service impact, with drill-down.
- **Recent outcomes:** verified, partial, failed and superseded outcomes; success is never inferred
  from task completion alone.

Basic defaults to one operational home rather than rendering activity history, forensic topology,
quick controls and an inspector simultaneously. A work row is the entry point to its contextual
detail; sustained work promotes the same object to its full workspace route.

### Context drawer

The drawer is a modal interaction surface that preserves the operational home behind it and returns
focus to the invoking row. It contains Overview, Control, Evidence and Audit views over the same
canonical object. It may guide, request a safe pause, open a bounded approval or start an authorized
reconciliation. Mutation always uses a separate confirmation step with exact scope, authority,
consequence and rollback limits.

The drawer is not used for large data tables, long logs, policy authoring, multi-step administration
or incident command. Those promote to a stable full route with a deep link.

### Basic control vocabulary

Use domain actions such as “Approve inventory allocation”, “Pause release after current check” or
“Retry ERP synchronization from checkpoint”. Exact command, scope and policy identifier appear in
the confirmation sheet before execution.

### Basic state language

Basic does not use a colored rounded badge or a generic “On track / Running / Complete” label as
the primary explanation of state. Those patterns collapse meaning, give routine execution too much
visual weight and resemble a generic AI/admin dashboard.

The canonical state still retains independent lifecycle, freshness, authority, evidence and
outcome truth. Basic does not turn those axes into five visible motifs. Its default tracking order
is deliberately short:

1. **Progress** — exact completed/total evidence or work count with one restrained progress line.
2. **Now** — the current domain phase in plain language.
3. **Last change** — the material transition and exact age.

Portfolio rows repeat the same order: outcome, progress, now, owner and evidence. The “now” cell is
unboxed text with one small non-color mark; it is not a status badge. Healthy work requires no
extra explanation. Approval or reconciliation replaces the phase text with the exact waiting or
recovery condition and its expiry/freshness.

The attention area contains the one material decision or incident and the one safe next action.
Lifecycle, authority, proof provenance, cost and recovery detail remain available in the selected
object's context drawer. This is progressive disclosure, not state loss: screen-reader descriptions
and drawer data retain the canonical axes while the overview optimizes quick tracking.

The Operational Index, Transition Trace and Exception Field exploration is rejected as too
pattern-heavy for Basic and retained only as design history in
`docs/design/prototypes/basic-state-language-lab.html`.

## 7. Advanced mode

Advanced mode is for operators, developers, platform teams, security/governance roles and incident
responders.

### Default operations workspace

- dependency/topology view linked to a stable event rail;
- dense work table with lifecycle, freshness, authority, evidence and outcome as separate axes;
- agent/worker ownership, provider connection, model profile, usage, limit and cost evidence;
- tool/MCP/integration calls with side-effect boundaries and redacted inputs/outputs;
- checkpoint, retry, pause, cancel and reconcile controls with race/partial-effect disclosure;
- policy explanation, approval chain, verifier result and durable evidence links;
- saved views and bulk operations with exact selection/exclusion semantics.

Advanced is not “more charts”. It exposes why an outcome is in its current state and what a
bounded intervention will change.

## 8. Domain profiles

### Software delivery

Primary objects: repository, change set, run, work item, test, release and incident. Relevant
systems may include source control, CI, issue tracking, package registries and deployment targets.

Basic language emphasizes delivery outcome, checks, blockers and release readiness. Advanced
language adds file scope, attempts, commands, logs, providers, workers and verification evidence.

### Commerce and production operations

Primary objects: sales order, fulfillment, production batch, purchase order, shipment and invoice.
Relevant systems may include ERP, MES, WMS, CRM, commerce and carrier adapters.

Basic language emphasizes customer/business impact, promise date, exception, responsible team and
resolution. Advanced language adds adapter transaction, policy, source record, retry boundary,
worker, operation, reconciliation and audit evidence.

The same approval component can authorize a scoped file mutation or an inventory allocation. The
domain description changes; requestor, resource, action, scope, duration, risk, downstream effect
and audit attribution remain invariant.

## 9. Approval and intervention contract

Every approval presents:

- requestor and responsible agent/worker;
- tenant/workspace/environment and affected domain objects;
- proposed action and exact bounded scope;
- source policy, effective permission and inheritance/deny explanation;
- expiry, risk, downstream consequence and known rollback limit;
- cost or capacity effect when relevant;
- approve-once, deny and details actions; longer grants require a separate governed flow.

Interventions distinguish observe, guide, approve, pause-at-safe-boundary, cancel-with-partial-
effects, retry-from-checkpoint, reconcile and manual takeover. Availability comes from runtime
capability, not visual mode.

## 10. Integration and system layer

Connections are first-class managed objects, not a settings list. Each exposes:

- owner/tenant and environment;
- adapter kind, endpoint identity and opaque credential reference;
- capability and permission scope;
- health, freshness, latency and last successful operation;
- policy, rate/capacity limits and cost center;
- audit trail, change history and lifecycle state;
- affected work and safe recovery when degraded.

Basic shows service impact (“Production scheduling is delayed”). Advanced shows the responsible
connection, operation, checkpoint, retryability and evidence. Secret values never appear.

## 11. Visual language candidate

The new candidate is **Graphite Operations**:

- Bricolage Grotesque is the current replacement candidate for interface and long-form reading:
  more cut and authored than Hanken without becoming theatrical;
- Geist Mono only for identifiers, time, quantities, policy and machine evidence;
- compact 13–14 px control rhythm with 15–17 px reading text and tabular numerals;
- a dark graphite navigation frame around a mineral-light work canvas;
- warm oxide as the ownership/attention accent, with independent semantic success, caution and
  failure roles;
- low-radius geometry, explicit dividers and selective elevation for containment;
- no interchangeable card wall, gradient, glow, glass or fake AI activity;
- state always carried by an explicit sentence, mark/shape, position and age in addition to color;
- expected-path state recedes while decision, proof-gap and outcome-exposure changes alter the
  composition rather than merely changing a badge hue.

Small high-value elements use a minimum legibility contract: count first, noun second, sufficient
contrast, non-color glyph and a stable hit target. For example, “8 work items” is a structured
quantity chip rather than faint uppercase metadata.

Theme variants are token projections over this hierarchy. They may change palette and contrast,
but not the meaning, geometry or information order of states.

## 12. Adverse states required in both modes

- permission denied, approval required, expired and policy unavailable;
- live, delayed, stale, disconnected and unknown;
- provider/integration unavailable, rate limited and partially successful;
- budget forecast risk, limit reached and provider evidence unavailable;
- partial side effect, conflicting concurrent action and reconciliation required;
- verifier pending, contradicted, unavailable and failed;
- empty workspace, no permitted objects and offline last-known snapshot.

Every adverse state identifies what is known, what is unknown, last evidence time, affected scope
and next safe action.

## 13. Terminal parity boundary

Terminal will expose the same canonical objects, commands, permission explanations and evidence.
Basic and Advanced remain Desktop-only disclosure modes; Terminal keeps one stable operator
surface. Ask/Run/Control, where present, are authority postures rather than density variants.
Terminal will not mimic Desktop panes or pixels. Desktop design may not introduce a command that
only exists in renderer-local state. The accepted Terminal composition and capability admission
matrix live in `DECKENT-TERMINAL-SINGLE-SURFACE.md` and
`DECKENT-TERMINAL-PLATFORM-MATRIX.md`; Desktop font, background and drawer behavior do not transfer
to the Terminal runtime.

## 14. Acceptance evidence

Before implementation direction is accepted:

- render Basic and Advanced for software and commerce/production profiles;
- show normal, approval-required and degraded-connection states;
- prove selected-object preservation across mode switch in the prototype;
- prove overview row → context drawer → bounded confirmation → return-focus behavior;
- inspect at laptop and large-workspace widths, 100/125/150% scale and text zoom;
- verify Turkish expansion, keyboard routes, visible focus, reduced motion and forced colors;
- classify every displayed capability as current, partial or target.

Production completion additionally requires canonical producer → application service → versioned
protocol → Desktop consumer → durable readback evidence. ERP/MES/WMS examples remain target
capability until governed adapters and their tenant/policy/audit contracts are wired and proven.
