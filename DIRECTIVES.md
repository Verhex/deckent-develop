# C-DALGASI — plan-purity · spawn-retry-immunity · artifact-class · resume-lock · close-stale · budget-authoring · clean-hold-pini

## Goal

Alti owner-admitted MASTER satiri kapanir: 3350 (plan --dry-run gercek-planning'i temsil eder
ve yan-etkisizdir: temp-agent yazimi biter, katalog sessiz-cokusleri typed olur, MCP dryRun
parametresi gercekten uygulanir, iki yolun digest/katalog paritesi pinlenir), 3351 (spawn-retry
in-memory mutasyonu yapay EXACT_PLAN_TASK_ARTIFACT_DRIFT uretmez), 541 (prompt-delivery
receipt'leri task-artifact sayilmaz), 3352 (PAUSED-resume stale-lock typed reconciliation +
close-stale sweep'i start-attempt journal'ini kapsar), 3353 (subprocess+finite-budget calisamaz
kombinasyonu init/config-katmaninda typed onlenir), 540 (clean-HOLD non-zero exit kontrati
kalici pinlenir; exit-0 iddiasi kod-tarafinda curutuldu — olcum-artefakti).

## Execution contract

- Otorite: main'deki kontratlar; assertion zayiflatilmaz. Kesif-referanslari task
  Description'larinda exact dosya:satir olarak verilmistir — once oku, sonra degistir.
- Yalniz kendi Files listendeki dosyalara yaz; Reads listendekileri OKU. Scope disina cikma.
- 0-hardcode; yeni user-facing satirlar getMessage katalogu (en+tr); typed hata/uyari
  duz `Error` yerine mevcut typed factory'lerle (createExecutionAdmissionError emsali).
- Sozlesme degisiminde test yeniden-ifade edilir (guard gevsetme degil).
- Testler hermetik (tmpdir); VITEST_MAX_FORKS=2. Scoped vitest yetmez: degistirdigin dosyalar
  icin `npx tsc --noEmit` SIFIR hata; tsc ciktisini result notes'a yaz.
- Aktif run sirasinda build/provider-auth/bot mutation YASAK.

## Task 1: 3350a plan-purity cekirdegi — dry-run temp-agent yazmaz, katalog sessiz-cokusu typed olur
- Files: src/orchestra/sprint-planner.ts, src/core/agent-pool.ts, tests/core/agent-pool.test.ts, tests/orchestra/temp-agent-dryrun-purity.test.ts
- Reads: src/orchestra/routing-plan-adapter.ts, src/orchestra/plan-preview-service.ts, tests/core/agent-layer-precedence.test.ts, tests/orchestra/sprint-controller.test.ts
- Priority: HIGH
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/temp-agent-dryrun-purity.test.ts tests/core/agent-pool.test.ts tests/core/agent-layer-precedence.test.ts
### Description
(a) sprint-planner.ts:791-800 saveTempAgentToPool cagrisi options.dryRun'a bakmiyor —
dry-run'da temp-agent DISKE YAZILMAZ (in-memory uretim korunur, yalniz persist guard'lanir);
:384-389'daki "dryRun'a BAKMA" yorumu yeni davranisa gore duzeltilir (yorum artik yalniz
task-dosyasi guard'i icin degil temp-agent persist'i icin de dogru olmali). (b)
agent-pool.ts:674 (config.json yokken builtin-katmani sessiz return) ve :677
(resolveBuiltinAgentsDir yokken sessiz return) iki kapi TYPED-SESLI olur: stderr'e tek-satir
typed uyari (getMessage en+tr; katalog-boyut dusuklugu ARTIK sessiz olamaz — 21-vs-14 vakasi)
ve donen havuz uzerinde degraded-marker (opsiyonel alan; okuyucu zorunlu degil). Davranis
degisimi yok — yalniz gorunurluk. YENI test tests/orchestra/temp-agent-dryrun-purity.test.ts
2 it: dryRun:true planSprint sonrasi `.deckent/agents/temp-*` dizini YOK; dryRun:false ayni
fixture'da yazar (mevcut davranis pini). agent-pool.test.ts'e setBuiltinAgentsDirForTests
seam'iyle (agent-pool.ts:43-48) 2 it: iki sessiz-return kapisi typed uyari basar ve havuz
boyutu builtin'siz kalir (degraded gorunur).

## Task 2: 3350b preview-parity yuzeyleri — CLI writeScopePolicy paritesi + MCP dryRun gercek olur
- Files: src/cli/commands/plan.ts, src/mcp/tools/plan.ts, tests/orchestra/plan-preview-service.test.ts, tests/orchestra/plan-preview-parity.test.ts
- Reads: src/orchestra/run-flow-plan-service.ts, src/orchestra/plan-preview-service.ts, src/core/execution-plan-digest.ts, src/orchestra/routing-plan-adapter.ts, src/core/run-flow-contract.ts, src/core/types.ts, src/orchestra/brain.ts, src/orchestra/directives-builder.ts, src/orchestra/run-proposal-compiler.ts, src/orchestra/task-builder.ts
- Priority: HIGH
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/plan-preview-parity.test.ts tests/orchestra/plan-preview-service.test.ts
### Description
(a) MCP plan.ts:43-50 `dryRun` parametresi ilan edilip HIC OKUNMUYOR — `input.dryRun===true`
(default'u zaten true) artik gercekten preview yoluna gider (plan.ts:262 CLI dry-run dalinin
cagirdigi generatePlanPreview zinciri); yalniz acikca dryRun:false verilirse mevcut
planRunFlow (mcp plan.ts:88) yolu kosulur. Bu, MCP'nin "tasks are never written" vaadinin
gercek olmasidir. (b) CLI plan.ts:262-265 dry-run cagrisi writeScopePolicy'yi hic gecmiyor,
gercek yol run-flow-plan-service.ts:576-586'da bindExecutionWriteScopePolicy'ye bagliyor ve
bu alan digest-context girdisi — ayni binding dry-run yolunda da cozulur ve gecirilir
(digest paritesi icin; cozulemeyen ortamda typed-beyanli fark). (c) YENI
tests/orchestra/plan-preview-parity.test.ts 2 it: ayni tmpdir DIRECTIVES+config altinda iki
yolun planDigestContext + sprint.tasks projeksiyonu ES; routing decision-journal `catalog`
alani (routing-plan-adapter.ts:353) iki yol icin ozdes anahtar-kumesi (satirin istedigi
tek-katalog kaniti). plan-preview-service.test.ts:96 ve :175 pinleri yeni gercege gore
yeniden-ifade edilir (:175 bugun MCP'nin gercek yuzeyini temsil etmiyor).

## Task 3: 3351 spawn-retry immunity — runtime-only alanlar drift-karsilastirmasindan cikar
- Files: src/orchestra/sprint-spawner.ts, tests/orchestra/exact-plan-spawn-authority.test.ts
- Reads: src/orchestra/task-builder.ts, src/orchestra/sprint-phases.ts, src/orchestra/exact-plan-start-service.ts, src/core/types.ts
- Priority: HIGH
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/exact-plan-spawn-authority.test.ts
### Description
Kok (sprint-673/493 emsalleri): buildWorkerPrompt onayli task'i dokumante-kontratla mutate
ediyor (task-builder.ts:2936 estimatedTokens, :2939 promptCompilePlanId); attempt-1
budget-gate'te dusunce disk temiz/bellek kirli kaliyor ve attempt-2'de readSpawnTaskAuthority
(sprint-spawner.ts:296-315) canli nesneyi disk-snapshot'la karsilastirip yapay
EXACT_PLAN_TASK_ARTIFACT_DRIFT uretiyor. Onarim (minimum-diff, b1): karsilastirmadan ONCE
her iki taraftan runtime-only alanlar (`estimatedTokens`, `promptCompilePlanId`) cikarilir
(sprint-spawner.ts:302-307 bolgesi; approved-snapshot bu alanlari zaten HIC tasimiyor —
exact-plan-start-service.ts:662/:711 plan snapshot'unu aynen yazar; tespit-gucu kaybi sifir).
computeExactPlanDrift saf-fonksiyonu ve mesaj-format kontrati DEGISMEZ. Test-eki:
exact-plan-spawn-authority.test.ts'e gercek zincir fixture'i — ayni task nesnesiyle
buildWorkerPrompt iki kez kosulur (attempt-1 sonrasi bellek kirli), aradaki
readSpawnTaskAuthority GECER (drift yok); kontrol-pini: gercek plan-alani (orn. model)
degisiminde drift HALA yakalanir (mevcut :97-113 pini korunur).

## Task 4: 541 artifact-class — prompt-delivery receipt'i task sayilmaz
- Files: src/core/task-artifact-classifier.ts, tests/core/task-artifact-classifier.test.ts, tests/orchestra/projection-parity-artifacts.test.ts
- Reads: src/orchestra/sprint-spawner.ts, src/core/prompt-delivery-receipt.ts
- Priority: NORMAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/task-artifact-classifier.test.ts tests/orchestra/projection-parity-artifacts.test.ts
### Description
Kok: task-artifact-classifier.ts:48-58 residueReason `.skill-delivery.json`'i taniyor (:55)
ama `task-<id>.attempt-<uuid>.<provider>.prompt-delivery.json` icin kural yok → 'non-task-filename'
→ sprint-spawner.ts:2704-2707 fallback naif-slice ile phantom-id uretip stray sayiyor →
TaskProjectionParityError. Onarim classifier-TARAFINDA tek dokunus (sprint-spawner'a
DOKUNMA — Task 3'un Files'inda): NonTaskArtifactReason union'ina (:9-24) `'prompt-delivery'`
eklenir ve residueReason `\.prompt-delivery\.json$` desenini bu reason'la doner; boylece
derivePlanCandidateId default-koluna dusup null verir. Test-eki: classifier testine
prompt-delivery it'i; projection-parity-artifacts.test.ts:56 residue-listesine
prompt-delivery ornegi eklenir; :78-110 refuse-arm pinleri (gercek yabanci task /
invalid-task-record / missingOnDisk) AYNEN korunur ve kosturulur.

## Task 5: 3352a lock-ownership — sprint.lock startToken kaniti + resume typed reconciliation
- Files: src/core/multi-ide.ts, src/orchestra/sprint-controller.ts, tests/core/multi-ide.test.ts
- Reads: src/core/pid-ownership.ts, src/core/pid-liveness.ts, src/core/run-status-authority.ts, src/cli/commands/resume.ts, src/cli/commands/recover.ts
- Priority: HIGH
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/multi-ide.test.ts
### Description
Kok: LockFileData (multi-ide.ts:36-41) yalniz pid tasiyor; sahiplik karari isPidAlive
(/proc varlik-testi, pid-liveness.ts:21) — namespace-gorunmezligi iki yonde de yaniltiyor
(container-pid host'ta alakasiz surece carpar → sonsuz-canli; host-pid container'dan
gorunmez → canli koordinatorun kilidi silinir, multi-ide.ts:84/:90/:154-165). Repoda kanit
mekanizmasi hazir: verifyPidOwnership typed 'owned'|'reused'|'dead'|'unknown'
(pid-ownership.ts:60, kernel start-token :20) — coordinator-pid kaydi kullaniyor
(run-status-authority.ts:168-176), sprint.lock kullanmiyor. Onarim: (a) LockFileData'ya
opsiyonel `startToken` (geriye-uyum: alan yoksa mevcut liveness-only davranis AYNEN);
acquireSprintLock yazarken kendi token'ini kaydeder. (b) Sahiplik karari token'li lock'ta
verifyPidOwnership ile: 'reused'/'dead' → stale-temizle+devral; 'owned' → gercek-canli;
'unknown' → MUHAFAZAKAR (silme yok, mevcut davranis). (c) sprint-controller.ts:1807-1812
acquire-basarisizligi opak BrainError yerine typed reconciliation dener: kayitli sprintId
('planning' dahil) + ownership + readCoordinatorState projeksiyonu birlikte; bayat-kanitli
lock typed-log ile temizlenip acquire yeniden denenir, kanit yoksa mevcut hata (typed kodla)
kalir. releaseSprintLockForTerminatedSprint (multi-ide.ts:233-262) semantigi DEGISMEZ.
Test yeniden-ifadesi: multi-ide.test.ts:72/:88 liveness-only pinleri ownership-aware
yeniden yazilir; YENI it'ler: token-mismatch(reused) lock devralinir; token-eslesen canli
lock KORUNUR; token'siz legacy lock eski davranista; 'planning' etiketli bayat lock resume
reconciliation'iyla temizlenir.

## Task 6: 3352b close-stale kapsami — start-attempt journal'i operator sweep'ine girer
- Files: src/orchestra/run-flow-death-sweep.ts, tests/orchestra/run-flow-death-sweep.test.ts, tests/cli/commands/runs.test.ts
- Reads: src/cli/commands/runs.ts, src/core/run-flow-store.ts, src/core/pid-ownership.ts, src/core/run-flow-contract.ts
- Priority: NORMAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/run-flow-death-sweep.test.ts tests/cli/commands/runs.test.ts
### Description
Kok: read-path sweep'i (sweepDeadDetachedRuns) start-attempt journal'ini okuyor
(run-flow-death-sweep.ts:98 loadLatestStartAttempt + :58-61 attemptOwnership) ama operator
sweep'i sweepStaleRuns (:261) YALNIZ loadRunHandle'a bakiyor (:288) — handle'siz olen
detached start-attempt (PREPARED / ADMITTED-yayimsiz) ':289-297'de 'no-pid-record' ile
kapsam-disi kaliyor ve --yes bile kapatamiyor. Onarim: sweepStaleRuns handle yoksa
loadLatestStartAttempt'e duser; attempt-kaydi varsa ayni ownership-reconciliation'la
siniflar (olu/reused → operator-onayinda FLOW_ABORTED kapanisi; canli/unknown → typed skip
aciklamasiyla). Cikti-sozlesmesi: yeni sinif adlari typed (orn. 'stale-start-attempt');
mevcut 'no-pid-record' YALNIZ gercekten hicbir kayit (ne handle ne attempt) olmayan vakada
kalir. Test yeniden-ifadesi: run-flow-death-sweep.test.ts:109 skip-pini yeni siniflandirmaya
gore; runs.test.ts:101 cikti-pini guncellenir; YENI it: PREPARED-yalniz fixture --yes ile
kapanir, canli-attempt fixture'i kapanmaz.

## Task 7: 3353 budget-authoring — calisamayan subprocess+finite-budget kombinasyonu init/config'te onlenir
- Files: src/cli/commands/init-steps.ts, src/core/live-execution-budget.ts, tests/core/live-execution-budget.test.ts, tests/core/spawn-backend.test.ts
- Reads: src/core/execution-budget-policy.ts, src/core/config-types.ts, src/providers/subprocess.ts, src/orchestra/spawn-backend.ts, src/cli/commands/init.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/tmux.ts
- Priority: NORMAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/live-execution-budget.test.ts tests/core/spawn-backend.test.ts
### Description
Kok: default'lar kombinasyonun iki yarisini da uretiyor (finite worker-budget
config-default'u + init'in subprocess'e dusmesi init-steps.ts:214-219/init.ts:231-232) ve
ilk hata provider isinin hemen oncesinde duz `Error` olarak patliyor
(live-execution-budget.ts:319-321 'Live execution budget requires measured streaming
usage'). Dogru knob zaten tipli ve VAR: execution_budget.unmetered_backend
(config-types.ts:847, validasyon execution-budget-policy.ts:428-460) ama yalniz xverify
tuketiyor. Onarim (authoring-katmani; spawn-yollarina DOKUNMA — reroute ayri dilim olarak
result-notes'a): (a) init-steps subprocess'i sectiginde/dusurdugunde finite worker-budget
yaziyorsa yeni config'e `execution_budget.unmetered_backend = { action: 'hold' }` da yazar
ve kullaniciya typed tek-satir uyari basar (getMessage en+tr: kombinasyonun anlami +
docker/measured-stream onerisi). (b) live-execution-budget.ts:304-321
assertLiveUsageBudgetSupport duz Error yerine komsusu gibi createExecutionAdmissionError
(:351/:362/:376 emsali) firlatir; mesaj metni AYNEN korunur (spawn-backend.test.ts:129/:139
regex-pinleri mesaji pinliyor) + remedy alaninda unmetered_backend/docker yolu adlandirilir.
Test-eki: live-execution-budget.test.ts'e typed-error-sinifi pini; init-steps icin yeni it
(subprocess-dususu + finite-budget → unmetered_backend authored + uyari basildi; docker
seciminde authored DEGIL). spawn-backend.test.ts pinleri mesaj-korumasiyla yesil kalir.

## Task 8: 540 clean-HOLD exit-kontrati — kalici alt-surec pini (kanitla-kapanis)
- Files: tests/scripts/build-clean-hold-exit.test.ts
- Reads: scripts/clean.mjs, scripts/clean-clone-smoke.mjs, tests/scripts/clean-active-execution-guard.test.ts
- Priority: LOW
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/build-clean-hold-exit.test.ts
### Description
Kesif sonucu: exit-0 mevcut koddan reprodukte EDILEMEZ — clean.mjs main ile lane arasinda
byte-es (md5 e3e7e588...), HOLD karari reasons'tan turetiliyor (clean.mjs:580-583) ve tek
cikis-yolu catch → process.exitCode=1 (clean.mjs:8137); gozlenen exit-0 buyuk olasilikla
olcum-artefakti (pipe icinde `$?` son komutun kodu). Satirin kabul-kriterindeki
"reprodukte edilemezse kanitla kapat" dali icin KALICI kontrat-pini yazilir: YENI test,
clean-clone-smoke.mjs:33-39 archiveHead desenini kullanarak HEAD'i tmpdir'e acar, kismi
`.locks/` uclusunu kurar (Reads listesindeki guard testinin :1758-1812 sentinelOnly/dbOnly
fixture'lari birebir desen), clean betigini (Reads listesindeki maintenance scripti) node ile ALT-SUREC olarak kosar
(spawnMaintenanceOwner emsali :872-900) ve BIRLIKTE assert eder: exitCode===1 + stderr'de
E_CLEAN_ACTIVE_EXECUTION_HOLD typed JSON'u + AUTHORITY_STATE_MISSING reason'i. (2 it:
sentinelOnly ve dbOnly.) Kaynak koda dokunulmaz; bu task 540'in kanit-kapanisidir.
