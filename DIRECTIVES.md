# PROMPT-DELIVERY-FRESH-DIST-CANARY — multi-wave settlement acceptance

## Goal

Fresh compiled runtime üzerinde canonical agent/skill prompt-delivery authority'sini normal
dogfood lifecycle ile kabul et. İlk wave iki bağımsız read-only acceptance taskını paralel
çalıştırır; ikinci wave ikisine bağlı fan-in taskını çalıştırır. Worker project file yazmaz ve
rapor/evidence dokümanı üretmez. Host; routing, rendered persona/skill bytes, current receipt,
canonical `.result` settlement, finalizer attribution ve archive integrity zincirini disk truth'tan
doğrular.

## Execution contract

- `DOGFOOD_MODE=ON`; run/sprint ID yalnız canonical allocator'dan gelir.
- Task 1 ve Task 2 bağımsız ilk wave'dir. Task 3 her ikisine bağlı ikinci wave'dir.
- Bütün tasklar read-only acceptance işidir; yalnız worker lifecycle `.hb`/`.result` yazıları
  yapılabilir. Project source/test/docs değişikliği NO-GO'dur.
- Her task yalnız declared exact targeted test commandını çalıştırır. Aktif run sırasında build,
  full suite, auth/config/bot mutation ve manual source edit yoktur.
- Assignment delivery kanıtı değildir. Current receipt actual final prompt bytes, persona segmenti,
  skill segmentleri ve PromptCompilePlan identity üzerinden üretilmelidir.
- Current receipt yoksa veya malformed ise agent/skill credit fail-closed `HOLD` olur.
- Finalizer yalnız delivered agent/skill identities tüketir; worker result claims attribution
  authority değildir.
- Yeni project dokümanı/evidence dosyası yazılmaz.

## Task 1: Prompt receipt and result-contract acceptance
- Reads: src/core/prompt-delivery-receipt.ts, src/core/prompt-compile-plan.ts, src/core/task-result-schema.ts, src/core/worker-dod-contract.ts, tests/core/prompt-delivery-receipt.test.ts, tests/core/prompt-compile-plan.test.ts, tests/core/task-result-schema.test.ts, tests/core/task-types.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/prompt-delivery-receipt.test.ts tests/core/prompt-compile-plan.test.ts tests/core/task-result-schema.test.ts tests/core/task-types.test.ts
### Description
Read-only acceptance yap. Current receipt schema/digest validation, PromptCompilePlan binding,
structured `.result` compatibility ve GO/NO-GO polarity semantics için yalnız exact test setini
çalıştır. Source veya test dosyası değiştirme. Result'ta gerçek command outcome ve kriter kanıtını
taşı; worker agent/skill claimsinin host delivery truth olmadığını koru.
### goNogo
- goCriteria: Exact four-file targeted test set exits zero; current receipt malformed inputta typed HOLD veriyor; result schema and polarity contract tests pass; project file change yok
- nogo: Exact targeted test kırmızı; receipt assignment veya worker claiminden delivery türetiyor; NO-GO criterion MET başarı etiketi gibi kullanılıyor; herhangi bir project file değişiyor

## Task 2: Docker settlement and finalizer attribution acceptance
- Reads: src/orchestra/spawn-backend-docker.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/result-assembler.ts, tests/orchestra/docker-result-settlement.test.ts, tests/orchestra/docker-worktree-session-isolation.test.ts, tests/orchestra/catalog-stats-outcome-truth.test.ts, tests/orchestra/result-assembler.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/docker-result-settlement.test.ts tests/orchestra/docker-worktree-session-isolation.test.ts tests/orchestra/catalog-stats-outcome-truth.test.ts tests/orchestra/result-assembler.test.ts
### Description
Read-only acceptance yap. Real production-chain Docker settlement testi, nested repository Git
discovery isolationı, malformed current receipt no-credit davranışı, finalizer catalog stats ve
canonical result attribution setini exact commandla çalıştır. Source/test/docs değiştirme.
Worker-provided agentId/skillIds current receipt'i override edememeli.
### goNogo
- goCriteria: Exact four-file targeted test set exits zero; real V3 route to body resolver to prompt to Docker settlement to finalizer test passes; nested git init main read-only metadatadan izole; malformed current receipt no-credit; project file change yok
- nogo: Assignment/result claim current receipt üzerinde attribution fallback oluyor; finalizer undelivered identityye credit veriyor; exact targeted test kırmızı; herhangi bir project file değişiyor

## Task 3: Dependent and FIX shared-boundary fan-in acceptance
- Reads: src/orchestra/task-builder.ts, src/orchestra/scheduler-effects.ts, src/orchestra/sprint-spawner.ts, src/orchestra/sprint-phases.ts, src/orchestra/debt-manager.ts, tests/orchestra/skill-force-delivery.test.ts, tests/orchestra/scheduler-spawn-executor.test.ts, tests/orchestra/prompt-compile-authority.test.ts, tests/orchestra/fix-task-enrichment.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 1, Task 2
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/skill-force-delivery.test.ts tests/orchestra/scheduler-spawn-executor.test.ts tests/orchestra/prompt-compile-authority.test.ts tests/orchestra/fix-task-enrichment.test.ts
### Description
Wave-1 sonuçları dependency-satisfying ise read-only fan-in acceptance yap. Initial/dependent/FIX
dispatch yollarının aynı `buildWorkerPrompt` boundary ve current receipt schema'sını tükettiğini;
FIX promptunun exact Brain evaluation reasonıyla original typed verification authority'sini
taşıdığını scoped tests ile doğrula. Source/test/docs değiştirme.
### goNogo
- goCriteria: Both dependencies terminal satisfying; exact four-file targeted test set exits zero; initial/dependent/FIX shared receipt boundary tests pass; FIX host reason enrichment pass; project file change yok
- nogo: Dependency settlement bypass; dispatch-specific duplicate receipt producer; FIX implementationı sebepsiz replay ediyor; exact targeted test kırmızı; herhangi bir project file değişiyor

## Root acceptance after terminal finalization

Codex canlı PID/log/heartbeat ve task/receipt/result dosyalarını izler. Terminalden sonra canonical
archive manifest/integrity, raw task/evidence relocation, Brain archive index refresh ve legacy raw
write absence doğrulanır. Üç taskın current receipt'i, rendered agent persona digest'i ve non-empty
relevant delivered skill seti fresh disk truth ile görülmeden outcome COMPLETE değildir. Build ve
lint yalnız terminalden sonra root gate olarak yeniden çalıştırılır.
