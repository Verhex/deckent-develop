# Enterprise controls, integrations, and resources

## Product-user perspective

Deckent's enterprise surface is a composition of tenant identity, RBAC, policy, approval, audit, authentication, capability and resource controls. No single flag turns a local project into a certified security boundary; each ingress must carry the same actor, tenant, policy and evidence authority. [Evidence: `src/core/tenant-context.ts:5-55`; `src/core/rbac.ts:73-129`; `src/core/policy-engine.ts:39-138`; `AGENTS.md:124-128`]

### Policy and RBAC composition

The unified policy result is `permit`, `deny`, `park`, or `suggest`. Evaluation combines RBAC, activation and conditional layers; a hard deny dominates, a park requires approval, and advisory outcomes do not silently become permits. [Evidence: `src/core/policy-engine.ts:39-138`]

Product RBAC defines viewer, operator and admin permissions. Enterprise defaults keep tenancy and RBAC disabled until configured, use viewer as the default role, and limit flows to one; configuration parsing rejects malformed role/tenant/flow data. [Evidence: `src/core/rbac.ts:11-57`; `src/core/enterprise-config.ts:12-37,91-118`]

Tenant context validates tenant/project identity and derives project-scoped storage paths. API routes derive their principal and tenant from authenticated server context rather than accepting client-provided authority as truth. [Evidence: `src/core/tenant-context.ts:5-55`; `src/api/server.ts:745-856`; `src/api/run-flow-routes.ts:88-120`]

### Authentication and credential custody

| Control | Contract | Evidence |
|---|---|---|
| Static API bearer | Constant-time token verification protects API routes; query tokens are restricted to explicitly permitted streaming paths. | `src/api/middleware/token.ts:1-45` |
| OIDC bearer | JWT verification pins issuer/audience/algorithms and resolves signing keys through JWKS policy. | `src/core/auth-oidc.ts`; `src/core/auth-jwks.ts` |
| Session identity | Session records have explicit creation, expiry and revocation semantics. | `src/core/auth-session.ts` |
| Terminal auth | Terminal sessions use a separate provider/interface and loopback bootstrap; generic API bypass is not terminal authority. | `src/api/terminal/auth-provider.ts`; `src/api/server.ts:2567-2708` |
| Stored credentials | Encryption, per-project custody and provider credential resolution are separate modules; config supports exact `$DECK:` interpolation. | `src/core/credential-encryption.ts`; `src/core/credentials-per-project.ts`; `src/core/credentials.ts`; `src/core/deck-interpolation.ts:1-31` |

Never place a live token in committed configuration, documentation examples, task output, or an audit payload. Secret interpolation replaces only exact whole-string references, and missing references remain explicit rather than partially interpolating surrounding text. [Evidence: `src/core/deck-interpolation.ts:1-31`; `src/core/redact-sensitive.ts`]

### Tamper-evident audit and compliance

Audit writes are hash-linked and typed; read/query, export and retention are distinct capabilities. Compliance reporting summarizes configured controls and actor/event evidence, but its output is a report over supplied evidence—not an external certification. [Evidence: `src/core/audit-writer.ts`; `src/core/audit-query.ts`; `src/core/audit-export.ts`; `src/core/audit-retention.ts`; `src/core/compliance-report.ts:10-75`]

SIEM forwarding converts audit events to bounded records and supports injected transports. HTTP and syslog implementations are explicit network egress surfaces; use dry-run/preview and allowlist/credential policy before enabling them. [Evidence: `src/core/siem-forwarder.ts:17-122`; `src/core/siem-transport-http.ts`; `src/core/siem-transport-syslog.ts`; `src/cli/commands/audit.ts`]

Capability invocations can emit audit evidence through the capability bridge. This makes capability selection and outcome observable, but does not replace the broker's role/capability check or the target handler's validation. [Evidence: `src/core/capability-audit-bridge.ts`; `src/core/capability-broker.ts:78-145,407-441`]

### Enterprise integrations

| Integration family | Current contract | Status |
|---|---|---|
| ERP read | Provider-neutral ERP connector/factory with IFS, Odoo, SAP and Dynamics drivers; read handlers validate configured entities and bounded requests. | ⚠️ live source, environment-dependent. [Evidence: `src/core/erp/index.ts:1-59`; `src/core/erp/factory.ts`; `src/core/erp/handler.ts`] |
| Data capabilities | Registered data/query handlers run through the capability broker rather than arbitrary shell execution. | ⚠️ registry/config dependent. [Evidence: `src/core/capability-handlers-data.ts`; `src/core/capability-runtime.ts`] |
| Notifications | Dispatcher and provider adapters include Discord, Slack and webhook delivery under notification config. | ⚠️ credentials/network dependent. [Evidence: `src/core/notification-config.ts`; `src/core/notification-dispatcher.ts`; `src/core/notification-providers/`] |
| Scheduled flows | Versioned flow definitions are evaluated for due work and dispatched through the flow scheduler. | ⚠️ scheduler/ingress wiring must be verified per deployment. [Evidence: `src/core/scheduled-flow.ts`; `src/core/flow-scheduler.ts`] |
| Event triggers | Incoming events match typed triggers and create durable pending dispatches that can require approval. | ⚠️ policy/approval dependent. [Evidence: `src/core/event-trigger.ts:6-160`] |
| Enterprise API | Authenticated tenant/RBAC/audit/rate endpoints expose read and admin-gated mutation surfaces. | ✅ route wiring; runtime smoke not run here. [Evidence: `src/api/enterprise-endpoint.ts:253-305,540-930`; `src/api/server.ts:832-856`] |

### Runtime dependency inventory

The root runtime requires Node.js `>=24.0.0`. Direct production dependencies are `@lydell/node-pty`, MCP SDK, Noble Ed25519/hashes, `better-sqlite3`, `cli-highlight`, `commander`, `grammy`, Ink, React/React DOM, `ws`, and Zod. Discord, Nodemailer and OpenAI are optional dependencies so those adapters do not become mandatory for every installation. [Evidence: `package.json:115-145`]

Dependency changes cross packaging, native-module, platform and security boundaries. The publish validator checks entry points, package contents, engine, executable bit and bundle conditions; clean-clone and cross-platform smoke remain separate evidence. [Evidence: `scripts/validate-publish.mjs:1-24,188-220`; `scripts/clean-clone-smoke.mjs`; `scripts/xplat-install-smoke.mjs`]

### Capacity and worker admission

`detectSystemCapacity` reports CPU, total/free memory, platform, architecture, Docker/tmux availability and derived memory budget. Worker recommendations are bounded by both CPU and memory rather than treating configured `max_workers` as unconditional capacity. Backend decision logic can return an explicit reason instead of silently using an unavailable environment. [Evidence: `src/core/system-capacity.ts:13-113,184-207`]

The actual execution admission also considers dependency DAG, write-scope collision, provider concurrency/capability, live budget and runtime resource policy. Empty capacity is a valid hold; the runtime must not force a worker only to satisfy a configured number. [Evidence: `AGENTS.md:61-65`; `src/orchestra/dependency-scheduler.ts`; `src/orchestra/scope-collision.ts`; `src/core/provider-concurrency-capability.ts`; `src/core/execution-budget-policy.ts`]

### Resource monitoring and tuning

`resources` reports current samples, a log summary and relevant configuration. The monitor records timestamp, task/container identity, memory, CPU and optional process metrics; summary functions aggregate per task and sprint. Monitor failures are observational and must not fabricate zero consumption. [Evidence: `src/cli/commands/resources.ts:37-181`; `src/orchestra/resource-monitor.ts:14-48,136-214`; `src/orchestra/resource-report.ts:11-170`]

Performance tuning order:

1. Measure current capacity, provider limits, token/cache use, retries and critical path. [Evidence: `src/core/system-capacity.ts`; `src/cli/commands/usage.ts`; `src/cli/commands/kpi.ts`]
2. Remove dependency and file-scope collisions before increasing concurrency. [Evidence: `src/orchestra/dependency-scheduler.ts`; `src/orchestra/scope-collision.ts`]
3. Resolve provider/model/tier through effective policy and live authority; do not pin an undocumented model merely for speed. [Evidence: `src/core/model-registry.ts`; `src/core/routing/route-task-v3.ts`; `AGENTS.md:95-97`]
4. Size Docker/host memory from measured workload and preserve terminal landing/receipt behavior under pressure. [Evidence: `src/core/system-capacity.ts`; `src/orchestra/spawn-backend-docker.ts`; `src/core/execution-budget.ts`]
5. Validate with task/sprint KPI and real surface evidence; a faster NO_GO or inconsistent settlement is not an optimization. [Evidence: `src/orchestra/sprint-metrics.ts`; `src/core/task-result-schema.ts`; `PAZARTESI.md:54-60`]

## Dogfood / repository reality

| Area | State | Current constraint |
|---|---|---|
| RBAC/policy primitives | ✅ live | Typed decisions and denial paths exist; enterprise defaults are opt-in. |
| OIDC/JWKS/session/terminal auth | ✅ live source | This audit did not operate an external identity provider or browser login. |
| Audit/compliance/SIEM | ⚠️ partial | Local writer/query/report paths exist; external SIEM network delivery was not exercised. |
| ERP/data/notification integrations | ⚠️ partial | Adapters exist, but credentials, network and tenant-specific configuration determine readiness. |
| Scheduled/event work | ⚠️ partial | Types, stores and scheduler/trigger logic exist; deployment-specific ingress reachability was not certified. |
| Resource monitor/report | ✅ live source | CLI help was verified; no controlled load benchmark was run in this docs pass. |
| Cross-platform install | ⚠️ HOLD | Scripts exist; macOS, Windows native and WSL2 were not executed in this Linux session. |

See [Platform and security](platform-security.md), [Configuration schema](configuration-schema.md), [Authority/RBAC](../governance/authority-rbac.md), and [API surface](api-surface.md).
