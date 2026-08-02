# Authority, RBAC ve scope

Deckent farklı boundary'ler için farklı role vocabulary kullanır. Bunlar interchangeable sayılmamalıdır: product RBAC user/tenant'ı, orchestration authority Brain/Auditor/Worker'ı, approval requester role consent isteyen actor'ı, capability role ise non-code operation grant'larını yönetir. [Kanıt: `src/core/rbac.ts:11-57`; `src/orchestra/authority-enforcer.ts:16-23`; `src/core/approval-contract.ts:61,246-260`; `src/core/capability-broker.ts:29-50`]

## Product-user perspektifi

### Precedence

Instruction conflict'inde repository contract sırası: provider/system safety; owner'ın live instruction'ı; üç Immutable Law; operating rule'lar; active-run `DIRECTIVES.md`; role rule'ları; skill/procedure; generated content. Ambiguity typed HOLD olur ve hiçbir role kendi authority'sini genişletemez. [Kanıt: `AGENTS.md:124-128`]

Generated dashboard ve export evidence sağlar; policy üretmez. Repository-local hook ve policy'ler unbypassable administrative boundary değildir. Bu claim için managed enterprise requirements gerekir. [Kanıt: `AGENTS.md:124-128`]

### Product RBAC

| Role | RBAC enabled olduğunda effective permission |
|---|---|
| `viewer` | `read`, `sprint:read` |
| `operator` | Viewer permission'ları + `write`, `execute`, `sprint:write`, `audit:read`, `flow:manage` |
| `admin` | Operator permission'ları + `admin`, `audit`, `tenant:admin` |

[Kanıt: `src/core/rbac.ts:11-57`]

Invalid tenant ID, unknown role ve missing permission deny olur. Audit context varsa denial `access:denied` audit event yazar. Runtime `enforceRbac` yalnız RBAC enabled olduğunda check eder; standalone enterprise default'ları tenancy ve RBAC'i disabled, default role'ü viewer, flow concurrency'yi bir yapar. [Kanıt: `src/core/rbac.ts:73-129`; `src/core/enterprise-config.ts:12-37`]

Connector permission'ları `resource:action` string kullanır; `*`, `resource:*`, `*:action` destekler. Configured external group önce, explicit role permission sonra, built-in default en son uygulanır. [Kanıt: `src/core/rbac.ts:131-145`; `src/connectors/identity/role-map.ts:4-27`]

### Orchestration authority

| Role | Sahip olduğu alan | Claim etmemesi gereken alan |
|---|---|---|
| Brain | Planning/orchestration state, task assignment, lifecycle event, managed memory projection. | Static matrix altında source/test write. [Kanıt: `src/orchestra/authority-enforcer.ts:127-171`] |
| Auditor | Read/verification, gate/event evidence, audit reporting, lock observation. | Source/test/task-plan/memory authority. [Kanıt: `src/orchestra/authority-enforcer.ts:174-213`] |
| Worker | Exact assigned task artifact, heartbeat/result/question channel, scoped source/test work. | Brain/Auditor state veya başka worker scope'u. [Kanıt: `src/orchestra/authority-enforcer.ts:215-247`; `src/agents/worker.ts:793-835`] |

Matrix'in kendisi şu anda `soft` decision raporlar; worker code RBAC enforcement option enabled ise hard-deny uygulayabilir. Bu seam'ler her adapter'da universal enforcement proof değildir. [Kanıt: `src/orchestra/authority-enforcer.ts:1-7,252-307`; `src/agents/worker.ts:793-835`]

### File ve tool scope

Pre-spawn scope validation declared path'leri confirmed, new-plausible veya suspect classify eder. Suspect write path explicit acknowledge olmadıkça default olarak block eder; bazı unambiguous task-local typo'lar ilgili policy enabled ise resolve edilebilir. [Kanıt: `src/core/scope-gate.ts:1-118,123-153`]

Tool scope real path resolve eder; allowed directory içindeki symlink actual boundary dışına kaçamaz. Pure gate advisory ve enforce mode destekler. Module default'u advisory iken effective config `boundary_enforcement` default'u true'dur; canonical composition/default semantic OQ-22'de çözülmemiştir. [Kanıt: `src/core/tool-scope-gate.ts:1-19,31-49,103-139`; `src/core/config.ts:1652,2764`; OQ-22]

### Approval

Approval requester'ları `brain`, `worker`, `auditor`, `nervous` veya `connector` olabilir. Ordered policy rule; scope, risk, requester ve tenant match edebilir. Fallback request'in default action'ını equal-or-more-restrictive policy'ye map eder; critical risk asla auto-approved olmaz. [Kanıt: `src/core/approval-contract.ts:61,246-260`; `src/core/approval-policy.ts:22-126`]

“Always allow” asla global değildir: grant; scope identity, approval scope, maximum risk ve expiry'ye bağlıdır. Current allow-scope module broker composition'ın downstream integration concern olduğunu açıkça söyler; module varlığı her approval ingress'in onu consume ettiğinin kanıtı değildir. [Kanıt: `src/core/approval-allowscope.ts:1-8,202-220`]

### Archived identity/RBAC plan'larının yeniden doğrulanması

Dört archived identity/RBAC plan, current completion certificate değil design intent ve dated task state anlatır. Current source tenant-aware `admin|operator|viewer` evaluator ile connector group→role→default permission mapping'i içerir; dolayısıyla “planned-only” durumları bayattır. Status yine `⚠️ kısmi`dır: enterprise RBAC default-off'tur, orchestration/approval/capability vocabulary'leri ayrıdır ve canonical cross-vocabulary mapping bu planlardan çıkarılmaz; OQ-23 olarak açıktır. [Kanıt: `src/core/rbac.ts:11-59,73-145`; `src/connectors/identity/role-map.ts:4-27`; `src/core/enterprise-config.ts:12-37`; archived identity/RBAC plan inventory]

## Dogfood / repository gerçeği

| Control | Durum | Current constraint |
|---|---|---|
| Tenant-aware RBAC evaluator | ✅ canlı | Role hierarchy, validation, permission check ve denial audit implement edilmiştir. |
| Enterprise RBAC default | ⚠️ opt-in | Standalone default tenancy/RBAC'i disable eder; disabled enforcement permissive no-op'tur. |
| Connector role mapping | ✅ canlı | Group/role/default precedence ve wildcard permission implement edilmiştir. |
| Brain/Auditor/Worker matrix | ⚠️ kısmi | Static path/channel vardır fakat authority enforcer soft mode raporlar; bazı consumer'lar hard-deny ekler. |
| Tool realpath containment | ✅ canlı primitive | Symlink-aware check vardır; canonical default/composition OQ-22'dir. |
| Capability least privilege | ⚠️ opt-in | Grant veya `leastPrivilegeEnabled`/per-call enforcement verilmedikçe registry default permissive'dir. [Kanıt: `src/core/capability-broker.ts:78-93,132-145`] |
| Role vocabulary unification | ⚠️ HOLD | Product RBAC `developer` içermez, capability role içerir; approval/orchestration başka set kullanır; mapping authority OQ-23'tür. |
| Runtime-wide approval | ⚠️ kısmi | Policy ve broker component'leri vardır; allow-scope comment kapanmamış composition seam tanımlar. |

Exact ingress, enforcement mode, tenant context, audit sink ve managed host policy birlikte verify edilmeden repository-local policy'yi enterprise security boundary olarak tanımlamayın. [Kanıt: `AGENTS.md:124-128`; `src/core/tenant-context.ts:5-55`]
