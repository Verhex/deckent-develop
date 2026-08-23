# DIRECTIVES — FINAL-ONLY USAGE CONTAINMENT PARITY

## Goal

Manual `deckent spawn --force` ile normal sprint executor arasındaki final-only usage
containment authority farkını kapat. Tek product outcome budur. Provider live-usage
capability, immutable task budget policy ve owner-authored final-only grant tek shared
resolver üzerinden kesişmeli; manual, initial sprint, retry, FIX ve continuation yolları
surface-local fallback veya ikinci grant üretmeden aynı kararı tüketmelidir.

Aktif run sırasında build, provider auth mutation ve XVerify çalıştırma. `.brain/memory.db`
silinmez veya taşınmaz; `.tasks` içeriği `rm` ile temizlenmez. Başka outcome'a ait finding
yalnız `RELATED_BUT_NONBLOCKING` olarak raporlanır.

## Task 1: FO01 ingress wiring inventory
- Files: docs/evidence/final-only-usage-containment-parity-2026-08-23/01-ingress-inventory.md
- Reads: src/cli/commands/spawn.ts, src/orchestra/sprint-spawner.ts, src/orchestra/scheduler-effects.ts, src/orchestra/cross-verify-runner.ts, src/orchestra/task-mode-runner.ts
- Dependencies: none
- Priority: HIGH
- Test: git diff --check -- docs/evidence/final-only-usage-containment-parity-2026-08-23/01-ingress-inventory.md
### Description
Manual spawn, initial sprint scheduler, scheduler retry/FIX/continuation, task mode ve XVerify
producer-to-consumer-to-backend zincirlerini fresh source references ile ölç. Her ingress'in
provider route seçimi, live-usage admission, grant forwarding, dispatch boundary ve terminal
settlement davranışını tablo halinde kaydet. Kod veya başka dosya değiştirme.
### goNogo
- goCriteria: Exact production references ile tüm execution ingressleri ve manual-vs-sprint divergence noktası kaydedilir; yalnız declared evidence file değişir
- nogo: Tahmini wiring yazılır; başka file değiştirilir; formal closure veya runtime-hygiene DONE iddia edilir

## Task 2: FO02 policy and provenance inventory
- Files: docs/evidence/final-only-usage-containment-parity-2026-08-23/02-policy-provenance.md
- Reads: src/core/execution-budget-policy.ts, src/core/execution-plan-digest.ts, src/core/task-types.ts, src/orchestra/spawn-backend-docker.ts, src/core/task-execution-settlement.ts
- Dependencies: none
- Priority: HIGH
- Test: git diff --check -- docs/evidence/final-only-usage-containment-parity-2026-08-23/02-policy-provenance.md
### Description
Final-only authorization'ın provider live-usage capability, immutable task budget snapshot,
policy digest, role, tenant, run, task, attempt, deadline ve wall-clock binding zincirini ölç.
Replay, expiry, missing grant, provider mismatch, backend mismatch ve stale task projection
negative-space'ini exact source references ile kaydet. Kod veya başka dosya değiştirme.
### goNogo
- goCriteria: Authority inputs and fail-closed negative space exact production references ile kaydedilir; yalnız declared evidence file değişir
- nogo: Yeni authority uydurulur; replay veya expiry sessiz kabul edilir; başka file değiştirilir

## Task 3: FO03 conformance matrix inventory
- Files: docs/evidence/final-only-usage-containment-parity-2026-08-23/03-conformance-matrix.md
- Reads: tests/orchestra/docker-final-only-containment.test.ts, tests/orchestra/spawn-spawner-wire.test.ts, tests/orchestra/scheduler-spawn-executor.test.ts, tests/cli/spawn-lifecycle.test.ts, tests/cli/commands/multi-provider-spawn-kill-run.test.ts, tests/cli/spawn-settlement-attempt.test.ts
- Dependencies: none
- Priority: HIGH
- Test: git diff --check -- docs/evidence/final-only-usage-containment-parity-2026-08-23/03-conformance-matrix.md
### Description
Mevcut final-only ve manual-spawn test coverage'ını normal completion, hang, child process,
missing-final usage, missing grant, replay, crash, stale result ve exactly-once settlement
eksenlerinde say. Covered ve missing hücreleri test isimleriyle kaydet; implementation önerisini
yalnız measured gap ile sınırla. Kod veya başka dosya değiştirme.
### goNogo
- goCriteria: Test matrix gerçek test isimleri ve measured covered-missing counts taşır; yalnız declared evidence file değişir
- nogo: Çalışmayan test varmış gibi gösterilir; başka file değiştirilir; mock-only proof COMPLETE sayılır

## Task 4: FO04 shared containment authority resolver
- Files: src/core/final-only-usage-containment.ts, tests/core/final-only-usage-containment.test.ts
- Reads: docs/evidence/final-only-usage-containment-parity-2026-08-23/01-ingress-inventory.md, docs/evidence/final-only-usage-containment-parity-2026-08-23/02-policy-provenance.md, src/core/execution-budget-policy.ts, src/core/provider-command-spec.ts, src/orchestra/spawn-backend.ts
- Dependencies: Task 1, Task 2
- Priority: CRITICAL
- Test: npx vitest run tests/core/final-only-usage-containment.test.ts
### Description
Provider live-usage mode, resolved executor capability, immutable execution budget ve task-stamped
owner authorization kesişimini tek pure shared resolver'da üret. Resolver only-if-exact semantics,
typed reason code ve fail-closed negative-space taşısın; grant üretmesin veya genişletmesin.
Cross-platform `auto` backend sonucu caller tarafından resolved executor olarak verilmelidir.
### goNogo
- goCriteria: Shared resolver final-only plus live ceiling plus eligible executor plus exact authorization kesişiminde grant döndürür; missing or mismatch cases typed fail-closed olur; scoped unit tests green
- nogo: Resolver owner grant üretir; backend tahmin eder; non-final-only provider'a containment verir; expiry or mismatch kabul eder; scoped tests fail

## Task 5: FO05 manual spawn production consumer
- Files: src/cli/commands/spawn.ts, tests/cli/spawn-lifecycle.test.ts
- Reads: docs/evidence/final-only-usage-containment-parity-2026-08-23/01-ingress-inventory.md, docs/evidence/final-only-usage-containment-parity-2026-08-23/02-policy-provenance.md, src/core/final-only-usage-containment.ts, src/orchestra/spawn-backend-docker.ts
- Dependencies: Task 4
- Priority: CRITICAL
- Test: npx vitest run tests/cli/spawn-lifecycle.test.ts
### Description
Manual `registerSpawn` task snapshotındaki final-only authorization'ı shared resolver inputuna
taşısın. `spawnWorkerMultiProvider` gerçek configured backend'i resolve ettikten sonra containment
kararını versin; geçerli Docker containment varken host-adapter short-circuit etmesin. Dispatch
boundary receipt backend spawn'dan önce, terminal settlement exact attempttan ve stale result guard
korunarak çalışsın. Missing grant veya uygun olmayan executor provider work öncesi fail-closed olsun.
### goNogo
- goCriteria: Manual force spawn valid final-only taskı shared resolver ile Docker containment'a yollar ve exact grant backend optionına ulaşır; missing grant and non-Docker paths provider work öncesi fail-closed; scoped tests green
- nogo: Surface-local grant üretilir; host-adapter bypass sürer; wall-clock cap düşer; dispatch receipt veya stale-result guard zayıflar; scoped tests fail

## Task 6: FO06 sprint and continuation consumer parity
- Files: src/orchestra/sprint-spawner.ts, src/orchestra/scheduler-effects.ts, tests/orchestra/spawn-spawner-wire.test.ts, tests/orchestra/scheduler-spawn-executor.test.ts
- Reads: docs/evidence/final-only-usage-containment-parity-2026-08-23/01-ingress-inventory.md, docs/evidence/final-only-usage-containment-parity-2026-08-23/02-policy-provenance.md, src/core/final-only-usage-containment.ts
- Dependencies: Task 4
- Priority: CRITICAL
- Test: npx vitest run tests/orchestra/spawn-spawner-wire.test.ts tests/orchestra/scheduler-spawn-executor.test.ts
### Description
Initial sprint spawner ile scheduler retry/FIX/continuation executor'ındaki duplicate final-only
kararlarını shared resolver consumerlarına çevir. Her iki yol provider, resolved backend, immutable
budget ve task authorization'ın aynı kesişimini kullansın. Existing dispatch, approval, timeout,
settlement ve provider-unavailable semantics değişmesin; ikinci grant veya fallback oluşmasın.
### goNogo
- goCriteria: Initial and continuation paths shared resolver kullanır ve identical valid plus missing-grant outcomes üretir; existing routing and settlement tests green
- nogo: Consumerlardan biri local predicate tutar; FIX or retry farklı grant semantics alır; approval or settlement ordering değişir; scoped tests fail

## Task 7: FO07 adversarial parity fan-in proof
- Files: tests/cli/spawn-final-only-parity.test.ts, docs/evidence/final-only-usage-containment-parity-2026-08-23/04-adversarial-proof-plan.md
- Reads: docs/evidence/final-only-usage-containment-parity-2026-08-23/03-conformance-matrix.md, src/core/final-only-usage-containment.ts, src/cli/commands/spawn.ts, src/orchestra/sprint-spawner.ts, src/orchestra/scheduler-effects.ts, src/orchestra/spawn-backend-docker.ts
- Dependencies: Task 3, Task 5, Task 6
- Priority: HIGH
- Test: npx vitest run tests/cli/spawn-final-only-parity.test.ts
### Description
Manual ve sprint ingresslerini aynı immutable task projectionıyla conformance-test et. Valid grant,
missing grant, final-only mismatch, non-Docker executor, `auto` platform resolution, stale result,
replay ve exactly-once dispatch/settlement vakalarını hermetic test et. Hang, child process, crash ve
missing-final gerçek-process kanıtlarının mevcut Docker suite ile bağlantısını evidence planında
kaydet; gerçek binary canary'yi post-terminal host adımı olarak bırak.
### goNogo
- goCriteria: Hermetic parity battery manual and sprint authority kararlarının eşitliğini ve adversarial fail-closed vakaları kanıtlar; proof plan remaining real-binary checks'i authority requirements ile tanımlar; scoped suite green
- nogo: Mock result real-process proof diye sunulur; replay accepted olur; process-tree negative space kaybolur; başka file değiştirilir; scoped suite fail
