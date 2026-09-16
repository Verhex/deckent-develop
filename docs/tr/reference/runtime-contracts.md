# Runtime contract'ları: Goal, Mission, Flow, Run, WorkItem, Attempt, Operation

## Product-user perspektifi

Product model bir lineage'dır, synonym listesi değildir:

`Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`

- **Goal**, istenen durable outcome ve acceptance criteria'yı söyler.
- **Mission**, tenant-scoped progress ile bir veya daha fazla durable work item'ı sahiplenir.
- **Flow**, tek requested execution için proposal, preview, approval/rejection, start ve terminal event'leri taşır.
- **Run**, approved plan veya work item'ın bir admitted execution'ıdır.
- **WorkItem**, mission içinde scheduled dependency-addressable unit'tir.
- **Attempt**, work item'ın tek fenced claim/execution'ıdır; retry ayrı identity alır.
- **Operation**, en alt side-effecting provider/tool/capability action'dır ve authority/receipt lineage'ını korumalıdır.

İlk altı anlam concrete current contract taşır. Son link için tek canonical `Operation` type kurulmamıştır; OQ-05 benzer adlı routing type'ı tahminle seçmek yerine link'i `HOLD` tutar. [Kanıt: `.deckent/workspace/IDENTITY.md:7`; `src/orchestra/autonomous/mission-store/mission-types.ts:12-188`; `src/core/run-flow-contract.ts:1-390`; OQ-05]

## Mission ve WorkItem formatları

| Contract | Required identity/state | Payload ve authority | Kanıt |
|---|---|---|---|
| `Mission` | `id`, `kind`, `status`, `tenant`, `title`, timestamps | `spec`, creator/delivery/render fields, progress, completion, last result | `src/orchestra/autonomous/mission-store/mission-types.ts:76-88` |
| `WorkItem` | `id`, `missionId`, `kind`, `status`, `revision` | `spec`, `policy`, render mode, progress, dependencies, trigger, claim fields, admission fence, registry digest, result | `src/orchestra/autonomous/mission-store/mission-types.ts:89-106` |
| Approval binding | work-item/mission/request ID'leri ve publish/decision state | canonical request + decision ve durable timestamp'ler | `src/orchestra/autonomous/mission-store/mission-types.ts:111-128` |
| Dispatch claim | schema v1, work/mission/worker ID'leri, item revision, `attemptId` | private fence token ile persisted hash ve registry revision/digest | `src/orchestra/autonomous/mission-store/mission-types.ts:129-148` |
| Recovery attempt | schema v1 ile tenant/work/mission/attempt identity | immutable pre-revocation claim ve engine-observation evidence | `src/orchestra/autonomous/mission-store/mission-types.ts:160-187` |

Mission kind'ları `list|goal`; state'leri `pending|active|completed|failed|cancelled`dır. WorkItem kind'ları `task|sprint|capability|process`; state'leri `pending|running|done|failed|blocked|parked`; policy'leri `auto|approval-required|risk-tagged`dır. [Kanıt: `src/orchestra/autonomous/mission-store/mission-types.ts:12-23`]

Store atomic mission+DAG creation, lease-guarded recovery, first-writer-wins recovery acknowledgement, approval parking, claim fencing ve settlement operation'larını enforce eder. Caller DB row veya JSON projection elle değiştirmek yerine store method'larını kullanmalıdır. [Kanıt: `src/orchestra/autonomous/mission-store/mission-types.ts:190-230`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`]

## Flow ve Run formatları

`RunFlowContext` state-machine aggregate'idir. Proposal/plan/approved snapshot, decision ve start evidence, event history, state ile failure/terminal context taşır; transition'lar shared reducer ve coordinator üzerinden geçer. REST, terminal ve diğer surface'ler bağımsız flow engine değil bu service'lerin consumer'ıdır. [Kanıt: `src/core/run-flow-contract.ts:1-390`; `src/api/run-flow-routes.ts:1-19,500-570`]

Güncel flow state ve event'leri core contract'ta versioned'dır; invalid transition sessiz coerce edilmez, reject edilir. API approved/exact-plan evidence'ı persist eder ve client-supplied tenant yerine request principal'dan türetilen tenant'ı kullanır. [Kanıt: `src/core/run-flow-contract.ts`; `src/api/run-flow-routes.ts:88-120,500-570`]

Eski `Sprint` contract'ı structured-run aggregate olarak sürer: ID/number, `SprintStatus`, `SprintPhase`, tasks, workers, timing, metrics, planner proof, execution mode, cleanup policy, rollback fields ve prompt-gate result. [Kanıt: `src/core/sprint-types.ts:9-20,22-89`]

## Task formatı

Güncel task-file contract'ı `Task`tır:

| Grup | Fields | Authority notu |
|---|---|---|
| Identity | `id`, `title`, `description`, opsiyonel `sprintId` | Host/planner authored. |
| Routing | `model`, `effort`, `priority`, `reason`, provider/model/agent/skill override ve exclusion'ları | Effective routing `assignedAgent`, `assignedSkills` ve `routingMeta` ekleyebilir. |
| Scope | `directories`, `filesRead`, `filesWrite` | Lock ve disk-boundary check için kullanılır; worker prose genişletemez. |
| Dependencies | `dependencies` | Scheduler authority; cycle E049 ile reject edilir. |
| Acceptance | `goNogo` ile stable criterion item/evidence requirement | Criterion ID'leri host-derived SHA-256 identity'dir. |
| Execution | `status`, opsiyonel backend/auth/model-effort/fix-mode/smoke/budget fields | Admission/policy execution'ın başlayıp başlamayacağını belirler. |

[Kanıt: `src/core/task-types.ts:218-340,512-610`; `src/orchestra/task-builder.ts:903-1120`]

Task status'ları draft, pending, claimed, executing, testing, documenting, done, no-go, paused ve manual-review-required içerir. Evaluation DONE, GO_WITH_TECH_DEBT, NO_GO, DEFERRED ve NOT_DISPATCHED'i ayırır; saturation veya missing dispatch worker'a yüklenmez. [Kanıt: `src/core/task-types.ts:221-279`]

## Result formatı

Yeni result consumer'ları Zod schema'dan inferred versioned `TaskResultV1` kullanmalıdır. Contract provenance/timing, git-authoritative work output, token/cost evidence, test/tsc verification, worker assessment, Brain evaluation, cross-verification, communication ve Auditor validation'ı ayırır. [Kanıt: `src/core/task-result-schema.ts:1-18,205-300`]

Required top-level evidence task/worker/provider/model identity, changed file ve line total'ları, token usage, cost, tests, tsc ve self-assessment içerir. Downstream Brain/Auditor field'ları worker collection sonrasında doldurulduğu için optional/defaulted'dır. [Kanıt: `src/core/task-result-schema.ts:205-300`]

Önemli invariant'lar:

- file change ve boundary violation orchestrator/git authority'sidir;
- token usage provider-adapter ile tokenizer-fallback provenance'ını kaydeder;
- provider billing local estimate ile reconciliation taşıyabilir;
- worker production wiring için yalnız presence/incomplete/unsupported/contradictory evidence bildirebilir, structural completion bildiremez;
- cross-verification `confirmed|refuted|unclear` veya typed `unavailable` olabilir.

[Kanıt: `src/core/task-result-schema.ts:44-203`]

Legacy `TaskResult` interface existing consumer'lar için sürer ve farklı shape taşır (`filesChanged: string[]`, line total, boolean tests, numeric coverage). Barrel, bunu V1'e alias etmenin live consumer'ları kıracağını açıkça söyler. [Kanıt: `src/core/types.ts:25-48`; `src/core/task-types.ts:841-918`]

## Lock formatı

Basit lock projection `{ filePath, ownerWorkerId, acquiredAt, taskId }`dır. Worker wrapper acquire/release'i core file-lock implementation'a delegate eder; serialized lock'lar `.locks` altında, spawn-specific lock'lar `.spawnlock` olarak yaşar. Güncel file-lock module dört field projection'ın ötesinde fencing/quarantine/database reconciliation içerdiği için cleanup/recovery lock service'lerini kullanmalıdır. [Kanıt: `src/core/monitoring-types.ts:109-121`; `src/agents/worker.ts:170-207`; `src/core/file-lock.ts:64-105,4190-4978`; `src/orchestra/sprint-lifecycle.ts:487-501`]

## Canonical execution request ve migration durumu

`ExecutionRequest` provider-neutral envelope tanımlar: description/kind, environment, requirement profile, scope veya capability target, project root, acceptance, routing override, interaction mode, actor/origin/lineage ve finite budget. Risk caller authority olarak saklanmaz; capability ve target verb'lerinden türetilir. [Kanıt: `src/core/work-model.ts:13-186`]

⚠️ Aynı source header modelin additive ve “dead until a consumer migrates” olduğunu söyler. Process/capability path'lerinde consumer vardır; fakat tüm legacy task taxonomy'lerinin eksiksiz migration'ı kanıtlı değildir. OQ-06 normalized end-to-end closure'ı `HOLD` tutar. [Kanıt: `src/core/work-model.ts:1-12,140-230`; OQ-06]

## Dogfood / repository gerçeği

- ✅ Mission/WorkItem, flow, sprint/task, versioned result ve lock contract'larının production source owner'ları vardır.
- ⚠️ Legacy ve versioned result shape'leri design gereği birlikte yaşar; reader hangi contract'ı aldığını belirlemelidir. [Kanıt: `src/core/types.ts:25-48`]
- ⚠️ Final Operation link'i ve canonical work modelin total adoption'ı çözümsüz authority sorularıdır; complete ilan edilmez. [Kanıt: OQ-05, OQ-06]
