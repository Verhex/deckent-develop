# SPRINT-660 EXECUTION-AUTHORITY CLOSURE + MODULAR BOUNDARY LANDING

## Goal

Sprint-660'ta gözlenen never-born worker, false work attribution, unreachable FIX, heartbeat/status
consumer drift ve worker-core delivery provenance blockerlarını tek production authority zincirinde
kapat; korunmuş modular layer-gate implementationını green hale getir; aynı 5-task failure shape'ini
adversarial fan-in ile yeniden üretip run'ın dependency-ready parallel executiondan terminal
settlement'a kesintisiz yürüdüğünü kanıtla.

## Execution contract

- DOGFOOD_MODE=ON; tek active outcome bu closure package'tır. Yeni MASTER root/outcome açılmaz.
- Existing scopes: SCHEDULER-001, SCHEDULER-SHADOW-EVIDENCE-001, RUNFLOW-001,
  KERNEL-SETTLEMENT-001, RESULT-INGEST-001, EVALUATION-001, PROMPT-001,
  PROMPT-COMPILE-EVIDENCE-AUTHORITY-001, WORKER-PROMPT-COST-ARCHITECTURE-001,
  LAYER-BOUNDARY-GATE-001 ve MODULAR-BOUNDARY-FREEZE-001.
- Scope filesWrite yalnız exact path taşır. Aynı path filesRead'a eklenmez; filesWrite zaten read
  authority verir. Raw glob write grant, directory prefix overload veya second registry yoktur.
- Wave 1: Task 1, 2 ve 4 parallel. Wave 2: Task 3 (1'e bağlı). Wave 3: Task 5 (1+2), Task 6
  (3) ve Task 7 (3) dependency-ready/file-disjoint parallel. Wave 4: Task 8 (1+5) serial.
  Wave 5: read-only Task 9 fan-in bütün tasklara bağlıdır.
- Direct manual source edit yoktur. Worker yalnız listed filesWrite alanına yazar. Shared owner dirt,
  `.deckent/settings/repl-history`, `.deckent/runtime/*`, `docs/WHAT-IS-DECKENT.md`, silinmiş
  `ozet_rapor_1.md` ve başka user docs kapsam dışıdır.
- Aktif run sırasında build/full suite/provider auth/config/bot mutation, MASTER/current-flow
  mutation ve kill/cleanup yoktur. Testler hermetic tmpdir + async spawn kullanır; local forks en çok 2.
- Deterministic pre-dispatch defect transient retry sayılmaz. Exactly-once typed zero-work
  settlement üretir; unknown/transient class bounded retry/backoff/attempt evidence olmadan sonsuz
  PENDING kalamaz. Nervous nonexistent worker'ı respawn etmeye çalışmaz.
- Write-scope selector tek compiler/manifest authority'dir. Prompt, tool grants, collision topology,
  locks, baseline, disk diff, attribution ve FIX/replan aynı digest-bound projectionı tüketir.
- Worker result claim authority değildir. Host measurement worker claim'den bağımsızdır; mismatch
  ölçülmüş in-scope work'ü sıfırlamaz. Canonical TaskResultV1 normal success/recovery/finalizer
  zincirinde tek executable consumer shape'tır.
- `.hb` worker activity projectionıdır; host attempt/process authority liveness truth'udur. Status,
  Auditor, Dashboard, Sprint tracker ve Nervous aynı alive/dead/unknown semantics'ini tüketir.
- `.worker-core-*` plain Markdown system prompt artifactıdır. Full SHA-256, immutable byte check,
  provider channel/argv/config/attempt binding ve canonical archive replay evidence zorunludur.
- Eski worker-core veya sprint artifactı silinmez. Historical MASTER state elle reopen/DONE yapılmaz.

## Task 1: Canonical scope compiler and prompt admission
- Files: src/core/execution-write-scope-policy.ts, src/orchestra/task-builder.ts, src/orchestra/prompt-god-template.ts, src/orchestra/prompt-gate.ts, src/orchestra/sprint-planner.ts, tests/core/execution-write-scope-policy.test.ts, tests/orchestra/prompt-god-template.test.ts, tests/orchestra/worker-core-system-prompt.test.ts, tests/orchestra/prompt-gate-scope-wiring.test.ts
- Reads: src/core/scope-satisfiability.ts, src/core/execution-topology.ts, docs/en/reference/api-surface.md
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/execution-write-scope-policy.test.ts tests/orchestra/prompt-god-template.test.ts tests/orchestra/worker-core-system-prompt.test.ts tests/orchestra/prompt-gate-scope-wiring.test.ts
### Description
Versioned discriminated exact-file/directory-tree/glob selector compiler kur. Legacy string scope'u
tek admission boundary'de fail-closed parse et; current exact-mode'da wildcardı typed HOLD yap veya
explicit selectorı deterministic project inventory manifestine aç. Slash/NFC/case/drive/UNC/root
escape/symlink ambiguity policy'sini tek digest'e bağla. filesWrite'ın kapsadığı exact path'i
filesRead'dan canonical çıkar; plan/start ve dynamically born FIX task persistenceından önce pure
compile preflight çalıştır. PromptCompilePlan aynı canonical scope'u kullansın.
### goNogo
- goCriteria: Scope compiler deterministic versioned manifest produces one exact authority for prompt and downstream consumers; read/write overlap is safely canonicalized before prompt compilation; wildcard string overload cannot reach spawn; plan/start/FIX preflight fail closed with typed evidence; focused tests pass
- nogo: Prompt compiler still throws a normal overlapping edit task after planning; raw glob/prefix semantics remain ambiguous; invalid scope reaches scheduler; a second scope registry appears; cross-platform ambiguity silently passes

## Task 2: Scheduler admission settlement, quiescence and journal truth
- Files: src/orchestra/scheduler-effects.ts, src/orchestra/scheduler-driver.ts, src/orchestra/scheduler-journal.ts, src/orchestra/result-collector.ts, tests/orchestra/scheduler-effects-cascade.test.ts, tests/orchestra/scheduler-executed-engine.test.ts, tests/orchestra/scheduler-shadow-coverage.test.ts, tests/orchestra/scheduler-continuous-quiescence.test.ts
- Reads: src/orchestra/scheduler-reducer.ts, src/core/task-lineage.ts
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/scheduler-effects-cascade.test.ts tests/orchestra/scheduler-executed-engine.test.ts tests/orchestra/scheduler-shadow-coverage.test.ts tests/orchestra/scheduler-continuous-quiescence.test.ts
### Description
Spawn failure taxonomy'sini deterministic admission vs transient host failure olarak typed yap.
Prompt/scope compile admission failure worker doğmadan exactly-once NOT_DISPATCHED/NO_GO settlement,
event ve metric üretsin; task sonraki tickte yeniden spawnable kalmasın. Transient failure bounded
attempt/backoff/terminal HOLD taşımadan sonsuz tekrar edemesin. EXECUTE repair yield ve checkpoint
state'i settled admissionı toplasın. Shadow journal actual executed engine, decided effects, landed
effects ve spawn skip reasonlarını ayırsın; misleading legacyDecision yorumu kalmasın.
### goNogo
- goCriteria: A deterministic pre-dispatch failure settles once and lets EXECUTE reach evaluation/FIX; unknown transient failures have bounded durable retry semantics; journal identifies the executed engine and landed effect; replay is idempotent; focused tests pass
- nogo: A spawn-threw task remains admitted PENDING indefinitely; exception is swallowed without settlement/metric; journal implies the wrong engine; quiescence depends on an external worker that never existed

## Task 3: One-write worker activity heartbeat identity
- Files: src/core/worker-activity-heartbeat.ts, src/core/monitoring-types.ts, src/orchestra/prompt-god-template.ts, src/agents/worker.ts, tests/core/worker-activity-heartbeat.test.ts, tests/orchestra/prompt-god-template.test.ts, tests/orchestra/heartbeat-contract.test.ts
- Reads: src/core/worker-heartbeat-authority.ts, src/core/worker-heartbeat-authority-store.ts
- Dependencies: Task 1
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/worker-activity-heartbeat.test.ts tests/orchestra/prompt-god-template.test.ts tests/orchestra/heartbeat-contract.test.ts
### Description
Worker-authored heartbeat'i versioned activity projectionı olarak tek schema'da tanımla. Minimum
identity taskId, workerId, attemptId ve backend; activity status/currentAction/observed timestamp
taşır. One-write cost discipline korunur; sequence/progress/process liveness uydurulmaz. Native
worker ve generated Codex/Claude prompt aynı serializer/validator contractını kullansın. Legacy
shape explicit typed compatibility/HOLD alsın.
### goNogo
- goCriteria: Every new heartbeat carries versioned task/worker/attempt/backend identity while remaining one-write activity-only; native and prompt producers share one contract; malformed/ambiguous legacy data is typed; focused tests pass
- nogo: Consumers must infer taskId from filenames; worker activity becomes process authority; sequence refresh loop returns; prompt and native worker emit divergent schemas

## Task 4: Repair preserved modular layer gate implementation
- Files: scripts/lint-layer-shims.mjs, .deckent/settings/layer-shims.json, tests/docs/layer-shims.test.ts
- Reads: docs/adr/adr-d-004-brain-central-import.md, docs/adr/adr-g-041-core-enterprise-modular-architecture.md, docs/design/DECKENT-CORE-ENTERPRISE-MODULAR-ARCHITECTURE.md, package.json, tsconfig.json, src/dashboard/tsconfig.json, src/desktop/tsconfig.json
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/docs/layer-shims.test.ts
### Description
Sprint-660'tan kalan graph gate/script/registry/test diffini disk truth'tan repair et. 16 failure'ın
root cause'unu düzelt: exception ownership/lifecycle, unique source ownership, case collision,
ignore policy ve initializer atomic no-clobber. Full production graph AST discovery, exact baseline,
portable containment, explicit writers ve deterministic 0/1/2 CLI contractını koru. Testi yalnız
beklenti gevşeterek yeşile çevirme; default check read-only, init/shrink/topology writers atomic olsun.
### goNogo
- goCriteria: tests/docs/layer-shims.test.ts is 45/45 green; real registry parses and gate default check is deterministic/read-only; ownership, ignore, case, exception and initializer semantics are fixed in production code; no unrelated owner files change
- nogo: Any failure is hidden/skipped; registry becomes a manual allow-all baseline; AST/new-file discovery regresses; broad wildcard exception or non-atomic writer is admitted

## Task 5: Scope attribution, canonical result and FIX routing convergence
- Files: src/core/task-result-schema.ts, src/orchestra/result-assembler.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/result-evaluator.ts, src/orchestra/fix-failure-classification.ts, src/orchestra/debt-manager.ts, tests/core/task-result-schema.test.ts, tests/orchestra/result-assembler.test.ts, tests/orchestra/docker-result-settlement.test.ts, tests/orchestra/timeout-placeholder-scope-diff.test.ts, tests/orchestra/fix-failure-classification.test.ts
- Reads: src/core/execution-write-scope-policy.ts, src/core/task-types.ts, src/orchestra/disk-verify.ts
- Dependencies: Task 1, Task 2
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/task-result-schema.test.ts tests/orchestra/result-assembler.test.ts tests/orchestra/docker-result-settlement.test.ts tests/orchestra/timeout-placeholder-scope-diff.test.ts tests/orchestra/fix-failure-classification.test.ts
### Description
Task 1'in compiled scope manifestini Docker baseline, exit/diff, claim validation ve settlementta
tek authority yap. Spawn-time matched files + matching new files ölçülsün; traversal/case/symlink
ambiguity fail-closed. Worker claim mismatch host-measured in-scope diff'i silmesin; claim ve
violation ayrı fields olarak korunsun. Worker ingressi canonical TaskResultV1 assemblerdan geçir;
normal Docker success, recovery, evaluator ve finalizer aynı parsed shape'i tüketsin. Typed
testVerification/criteriaEvidence/attribution/dependency lineage tek failure classifier'a bağlansın;
replan write ihtiyacını access:write taşısın ve doğru upstream FIX doğsun.
### goNogo
- goCriteria: Concrete files authorized by a compiled selector receive verified host attribution; omitted/false worker claims cannot create zero-work VERIFIED or erase measured work; persisted normal results are strict canonical V1; one typed classifier produces correct FIX/replan authority; focused tests pass
- nogo: Raw glob is compared literally; host diff depends on worker filesChanged; HOLD overwrites evidence with zeroes; parallel legacy/canonical result dialects continue as independent authorities; false reviseScope blocks repair

## Task 6: Host-primary heartbeat consumers for Auditor, Dashboard and Nervous
- Files: src/monitor/auditor.ts, src/orchestra/sprint-state-tracker.ts, src/nervous/detectors/stale-worker.ts, tests/orchestra/auditor-stale-race.test.ts, tests/orchestra/docker-heartbeat-authority-wire.test.ts, tests/orchestra/sprint-state-tracker.test.ts, tests/nervous/stale-worker.test.ts
- Reads: src/core/worker-activity-heartbeat.ts, src/orchestra/heartbeat-monitor.ts, src/core/worker-heartbeat-authority-store.ts
- Dependencies: Task 3
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/auditor-stale-race.test.ts tests/orchestra/docker-heartbeat-authority-wire.test.ts tests/orchestra/sprint-state-tracker.test.ts tests/nervous/stale-worker.test.ts
### Description
Activity heartbeat'i yalnız UI action/identity projectionı yap; liveness verdictini exact
attempt-bound host heartbeat-authority snapshotından çöz. Auditor active/result lookup,
Dashboard dynamic dependency/FIX row ve Sprint tracker minimal new schema'yı kaybetmesin.
Nervous stale detector same alive/dead/unknown truth'u kullansın; no-worker spawn admissionı
stale respawn saymasın. 10+ dakika frozen activity + live host zero stale; host signal unavailable
typed unknown/HOLD; exact dead attempt tek stale event versin.
### goNogo
- goCriteria: Auditor, Dashboard, tracker and Nervous consume one host-primary liveness verdict and preserve activity identity; false hb.stale is zero for live/settled workers; dynamic FIX workers appear; unavailable is not dead; focused tests pass
- nogo: task-undefined lookup remains; .hb mtime alone can kill/respawn; Nervous drops new heartbeat records; host probe failure silently becomes dead

## Task 7: `deckent status` host-authority read model
- Files: src/cli/commands/status.ts, src/orchestra/worker-liveness.ts, tests/cli/status-liveness-truth.test.ts, tests/cli/status-output.test.ts, tests/orchestra/worker-liveness.test.ts
- Reads: src/core/worker-activity-heartbeat.ts, src/orchestra/heartbeat-monitor.ts, src/core/worker-heartbeat-authority-store.ts
- Dependencies: Task 3
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/status-liveness-truth.test.ts tests/cli/status-output.test.ts tests/orchestra/worker-liveness.test.ts
### Description
Status presentationını legacy blocking Docker `spawnSync`/mtime fallback'ından çıkar. Resolved
project root ve exact attempt identity ile host heartbeat-authority read modelini tüket; alive,
dead ve unavailable/HOLD'u ayır. Root ve nested cwd aynı worker truth'u vermeli. Frozen one-write
activity + live process active; result-settled worker stale değil; unavailable probe ERROR/dead
uydurmamalı. User-facing text mevcut i18n keys üzerinden kalmalı.
### goNogo
- goCriteria: deckent status uses host-primary attempt authority with resolved project root; nested cwd parity and alive/dead/unknown semantics are tested; no blocking spawnSync liveness path remains; i18n stays clean; focused tests pass
- nogo: Status still treats heartbeat age as process truth; AgentInfo pid fiction remains; Docker probe unavailable becomes dead; cwd changes container identity; user-facing strings are hardcoded

## Task 8: Worker-core immutable delivery and archive provenance
- Files: src/core/prompt-delivery-receipt.ts, src/orchestra/task-builder.ts, src/orchestra/spawn-backend-docker.ts, src/core/sprint-archive.ts, tests/core/prompt-delivery-receipt.test.ts, tests/orchestra/docker-provider-cli.test.ts, tests/orchestra/worker-core-system-prompt.test.ts, tests/core/sprint-archive.test.ts
- Reads: src/core/provider-command-spec.ts, src/core/execution-write-scope-policy.ts
- Dependencies: Task 1, Task 5
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/prompt-delivery-receipt.test.ts tests/orchestra/docker-provider-cli.test.ts tests/orchestra/worker-core-system-prompt.test.ts tests/core/sprint-archive.test.ts
### Description
Worker core artifact filenameini full SHA-256 ile content-address et; existing bytes digest/length
match değilse fail-closed, writer atomic/exclusive olsun. Prompt delivery receipt'i task, attempt,
provider, core full digest/bytes, role profile, injection channel, context-suppression flags ve
provider argv digestine bağla. Claude/Codex gerçek command argümanı receipt ile exact match olsun.
Canonical sprint archive yalnız referenced core bytes+receipt'i manifestine alıp replay verify
etsin. Eski kısa-hash artifacts korunur ama yeni attempt authority sayılmaz.
### goNogo
- goCriteria: New core artifacts are full-digest immutable and byte-verified; task-attempt-provider delivery receipt binds the exact channel and argv; archive replay verifies referenced bytes; Claude/Codex injection tests pass; historical files are untouched
- nogo: 12-hex collision can silently reuse wrong bytes; receipt omits actual core/channel/argv; archive cannot reconstruct system prompt; old artifacts are deleted; provider-specific silent fallback occurs

## Task 9: Read-only adversarial fan-in and sprint-660 replay
- Reads: .analysis/sprint-660-execution-authority-rca-2026-08-24.md, scripts/lint-layer-shims.mjs, .deckent/settings/layer-shims.json, tests/docs/layer-shims.test.ts, src/core/execution-write-scope-policy.ts, src/core/task-result-schema.ts, src/core/prompt-delivery-receipt.ts, src/orchestra/scheduler-effects.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/result-collector.ts, src/monitor/auditor.ts, src/cli/commands/status.ts
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/docs/layer-shims.test.ts tests/core/execution-write-scope-policy.test.ts tests/core/task-result-schema.test.ts tests/core/prompt-delivery-receipt.test.ts tests/orchestra/scheduler-effects-cascade.test.ts tests/orchestra/docker-result-settlement.test.ts tests/orchestra/auditor-stale-race.test.ts tests/cli/status-liveness-truth.test.ts tests/orchestra/worker-core-system-prompt.test.ts
### Description
Mutation yapmadan production code, task results, scheduler journal ve scoped test outputlarını
bağımsız değerlendir. Sprint-660 failure shape'ini adversarial matrixte doğrula: overlapping edit
scope admission; deterministic pre-dispatch failure exactly-once; raw glob rejection/explicit
selector expansion; concrete/new/omitted/false claims; Windows/case/symlink; canonical V1; correct
FIX birth; frozen activity + alive/dead/unavailable host; full-digest core argv/archive replay.
Her criterion için disk/command evidence ver; eksik olanı DONE sayma.
### goNogo
- goCriteria: Fan-in command is green and every sprint-660 causal blocker has independent disk evidence showing the repaired production consumer chain; no project file is changed; verdict is honest
- nogo: Any focused test fails; proof relies only on worker claims; an expected FIX/settlement/liveness/core consumer remains unwired; read-only worker mutates project files

## Root acceptance after terminal finalization

Codex run boyunca PID/container/log/activity heartbeat/host heartbeat-authority/scheduler/result/diff
truth'unu izler. Terminalden sonra scoped batteries, `npm run lint`, `npm run build:all`, real
compiled structured dry-run/status/nested-cwd/scope-attribution/core/archive smoke'ları çalışır.
MASTER existing-row evidence, generated projections ve current-flow yalnız disk truth'a göre
güncellenir. Formal XVerify fresh different provider ile bir kez; verdict + real provider call +
provider-reported usage + closed settlement + durable receipt yoksa typed HOLD. Commit/push yalnız
Alperen ayrıca isterse.
