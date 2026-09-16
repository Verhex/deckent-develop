# Enterprise control, integration ve resource'lar

## Product-user perspektifi

Deckent'in enterprise surface'i tenant identity, RBAC, policy, approval, audit, authentication, capability ve resource control'lerinin composition'ıdır. Tek bir flag local project'i certified security boundary yapmaz; her ingress aynı actor, tenant, policy ve evidence authority'yi taşımalıdır. [Kanıt: `src/core/tenant-context.ts:5-55`; `src/core/rbac.ts:73-129`; `src/core/policy-engine.ts:39-138`; `AGENTS.md:124-128`]

### Policy ve RBAC composition

Unified policy sonucu `permit`, `deny`, `park` veya `suggest` olur. Evaluation RBAC, activation ve conditional layer'ları birleştirir; hard deny baskındır, park approval ister ve advisory outcome sessizce permit olmaz. [Kanıt: `src/core/policy-engine.ts:39-138`]

Product RBAC viewer, operator ve admin permission'larını tanımlar. Enterprise default'ları configured edilene kadar tenancy ve RBAC'yi kapalı tutar, default role olarak viewer kullanır ve flow concurrency'yi bire sınırlar; configuration parser malformed role/tenant/flow data'yı reject eder. [Kanıt: `src/core/rbac.ts:11-57`; `src/core/enterprise-config.ts:12-37,91-118`]

Tenant context tenant/project identity'yi validate eder ve project-scoped storage path türetir. API route'ları principal ve tenant'ı authenticated server context'ten türetir; client-supplied authority'yi truth olarak kabul etmez. [Kanıt: `src/core/tenant-context.ts:5-55`; `src/api/server.ts:745-856`; `src/api/run-flow-routes.ts:88-120`]

### Authentication ve credential custody

| Control | Contract | Kanıt |
|---|---|---|
| Static API bearer | Constant-time token verification API route'larını korur; query token yalnız explicitly permitted stream path'leriyle sınırlıdır. | `src/api/middleware/token.ts:1-45` |
| OIDC bearer | JWT verification issuer/audience/algorithm pin eder ve signing key'i JWKS policy ile resolve eder. | `src/core/auth-oidc.ts`; `src/core/auth-jwks.ts` |
| Session identity | Session record'ları explicit creation, expiry ve revocation semantiği taşır. | `src/core/auth-session.ts` |
| Terminal auth | Terminal session ayrı provider/interface ve loopback bootstrap kullanır; generic API bypass terminal authority değildir. | `src/api/terminal/auth-provider.ts`; `src/api/server.ts:2567-2708` |
| Stored credentials | Encryption, per-project custody ve provider credential resolution ayrı module'lerdir; config exact `$DECK:` interpolation destekler. | `src/core/credential-encryption.ts`; `src/core/credentials-per-project.ts`; `src/core/credentials.ts`; `src/core/deck-interpolation.ts:1-31` |

Live token'ı committed configuration, documentation example, task output veya audit payload'a koymayın. Secret interpolation yalnız exact whole-string reference'ları değiştirir; eksik reference çevresindeki metni partial interpolate etmek yerine açık kalır. [Kanıt: `src/core/deck-interpolation.ts:1-31`; `src/core/redact-sensitive.ts`]

### Tamper-evident audit ve compliance

Audit write'ları hash-linked ve typed'dır; read/query, export ve retention ayrı capability'lerdir. Compliance reporting configured control ile actor/event evidence'ı özetler; output'u external certification değil, verilen evidence üstünde bir rapordur. [Kanıt: `src/core/audit-writer.ts`; `src/core/audit-query.ts`; `src/core/audit-export.ts`; `src/core/audit-retention.ts`; `src/core/compliance-report.ts:10-75`]

SIEM forwarding audit event'lerini bounded record'a çevirir ve injected transport destekler. HTTP ve syslog implementation'ları explicit network egress surface'leridir; enable etmeden önce dry-run/preview ve allowlist/credential policy kullanın. [Kanıt: `src/core/siem-forwarder.ts:17-122`; `src/core/siem-transport-http.ts`; `src/core/siem-transport-syslog.ts`; `src/cli/commands/audit.ts`]

Capability invocation'ları capability bridge üzerinden audit evidence emit edebilir. Bu, capability selection ve outcome'u observable yapar; broker role/capability check veya target handler validation'ın yerini almaz. [Kanıt: `src/core/capability-audit-bridge.ts`; `src/core/capability-broker.ts:78-145,407-441`]

### Enterprise integration'lar

| Integration family | Güncel contract | Durum |
|---|---|---|
| ERP read | IFS, Odoo, SAP ve Dynamics driver'lı provider-neutral ERP connector/factory; read handler configured entity ve bounded request'i validate eder. | ⚠️ canlı source, environment-dependent. [Kanıt: `src/core/erp/index.ts:1-59`; `src/core/erp/factory.ts`; `src/core/erp/handler.ts`] |
| Data capabilities | Registered data/query handler'ları arbitrary shell yerine capability broker üzerinden çalışır. | ⚠️ registry/config dependent. [Kanıt: `src/core/capability-handlers-data.ts`; `src/core/capability-runtime.ts`] |
| Notifications | Dispatcher ve provider adapter'ları notification config altında Discord, Slack ve webhook delivery içerir. | ⚠️ credential/network dependent. [Kanıt: `src/core/notification-config.ts`; `src/core/notification-dispatcher.ts`; `src/core/notification-providers/`] |
| Scheduled flows | Versioned flow definition'ları due work için evaluate edilir ve flow scheduler üzerinden dispatch edilir. | ⚠️ scheduler/ingress wiring deployment başına verify edilmelidir. [Kanıt: `src/core/scheduled-flow.ts`; `src/core/flow-scheduler.ts`] |
| Event triggers | Incoming event typed trigger'larla match edilir ve approval isteyebilen durable pending dispatch üretir. | ⚠️ policy/approval dependent. [Kanıt: `src/core/event-trigger.ts:6-160`] |
| Enterprise API | Authenticated tenant/RBAC/audit/rate endpoint'leri read ve admin-gated mutation surface sunar. | ✅ route wiring; runtime smoke burada çalıştırılmadı. [Kanıt: `src/api/enterprise-endpoint.ts:253-305,540-930`; `src/api/server.ts:832-856`] |

### Runtime dependency envanteri

Root runtime Node.js `>=24.0.0` ister. Direct production dependency'ler `@lydell/node-pty`, MCP SDK, Noble Ed25519/hashes, `better-sqlite3`, `cli-highlight`, `commander`, `grammy`, Ink, React/React DOM, `ws` ve Zod'dur. Discord, Nodemailer ve OpenAI optional dependency'dir; böylece bu adapter'lar her installation için mandatory olmaz. [Kanıt: `package.json:115-145`]

Dependency change; packaging, native-module, platform ve security boundary'lerini keser. Publish validator entry point, package content, engine, executable bit ve bundle condition kontrol eder; clean-clone ile cross-platform smoke ayrı evidence olarak kalır. [Kanıt: `scripts/validate-publish.mjs:1-24,188-220`; `scripts/clean-clone-smoke.mjs`; `scripts/xplat-install-smoke.mjs`]

### Capacity ve worker admission

`detectSystemCapacity`; CPU, total/free memory, platform, architecture, Docker/tmux availability ve derived memory budget raporlar. Worker recommendation hem CPU hem memory ile bounded'dır; configured `max_workers` unconditional capacity sayılmaz. Backend decision logic unavailable environment'i sessizce seçmek yerine explicit reason döndürebilir. [Kanıt: `src/core/system-capacity.ts:13-113,184-207`]

Actual execution admission ayrıca dependency DAG, write-scope collision, provider concurrency/capability, live budget ve runtime resource policy'yi hesaba katar. Empty capacity valid hold'dur; runtime configured sayıyı doldurmak için worker zorlamaz. [Kanıt: `AGENTS.md:61-65`; `src/orchestra/dependency-scheduler.ts`; `src/orchestra/scope-collision.ts`; `src/core/provider-concurrency-capability.ts`; `src/core/execution-budget-policy.ts`]

### Resource monitoring ve tuning

`resources` current sample, log summary ve ilgili configuration'ı raporlar. Monitor timestamp, task/container identity, memory, CPU ve opsiyonel process metrics kaydeder; summary function'ları task ve sprint seviyesinde aggregate eder. Monitor failure observation'dır; sıfır consumption uydurmamalıdır. [Kanıt: `src/cli/commands/resources.ts:37-181`; `src/orchestra/resource-monitor.ts:14-48,136-214`; `src/orchestra/resource-report.ts:11-170`]

Performance tuning sırası:

1. Current capacity, provider limit, token/cache use, retry ve critical path'i ölçün. [Kanıt: `src/core/system-capacity.ts`; `src/cli/commands/usage.ts`; `src/cli/commands/kpi.ts`]
2. Concurrency artırmadan dependency ve file-scope collision'larını kaldırın. [Kanıt: `src/orchestra/dependency-scheduler.ts`; `src/orchestra/scope-collision.ts`]
3. Provider/model/tier'i effective policy ve live authority ile resolve edin; yalnız hız için undocumented model pin etmeyin. [Kanıt: `src/core/model-registry.ts`; `src/core/routing/route-task-v3.ts`; `AGENTS.md:95-97`]
4. Docker/host memory'yi measured workload'tan boyutlayın ve pressure altında terminal landing/receipt behavior'ı koruyun. [Kanıt: `src/core/system-capacity.ts`; `src/orchestra/spawn-backend-docker.ts`; `src/core/execution-budget.ts`]
5. Task/sprint KPI ve real surface evidence ile validate edin; daha hızlı NO_GO veya inconsistent settlement optimization değildir. [Kanıt: `src/orchestra/sprint-metrics.ts`; `src/core/task-result-schema.ts`; `PAZARTESI.md:54-60`]

## Dogfood / repository gerçeği

| Alan | Durum | Güncel kısıt |
|---|---|---|
| RBAC/policy primitive'leri | ✅ canlı | Typed decision ve denial path'leri vardır; enterprise default'ları opt-in'dir. |
| OIDC/JWKS/session/terminal auth | ✅ canlı source | Bu audit external identity provider veya browser login işletmedi. |
| Audit/compliance/SIEM | ⚠️ kısmi | Local writer/query/report path'leri vardır; external SIEM network delivery çalıştırılmadı. |
| ERP/data/notification integration'ları | ⚠️ kısmi | Adapter'lar vardır; credential, network ve tenant-specific configuration readiness'i belirler. |
| Scheduled/event work | ⚠️ kısmi | Type, store ve scheduler/trigger logic vardır; deployment-specific ingress reachability certify edilmedi. |
| Resource monitor/report | ✅ canlı source | CLI help doğrulandı; bu docs pass controlled load benchmark çalıştırmadı. |
| Cross-platform install | ⚠️ HOLD | Script'ler vardır; bu Linux session'da macOS, Windows native ve WSL2 çalıştırılmadı. |

[Platform ve security](platform-security.md), [Configuration schema](configuration-schema.md), [Authority/RBAC](../governance/authority-rbac.md) ve [API surface](api-surface.md) belgelerine bakın.
