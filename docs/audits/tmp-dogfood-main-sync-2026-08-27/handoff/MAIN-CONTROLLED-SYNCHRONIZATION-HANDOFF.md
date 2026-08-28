# Main kontrollü eşitleme devir paketi

Tarih: 2026-08-27  
Rol: supervisor handoff  
Kaynak worktree: `/tmp/deckent-md-contract-authority-20260827`  
Kaynak base/HEAD: `417f4955b970327ee86d34c74dc06638a23dd02e`  
Hazırlık anındaki main: `a4913b1405bbd8fff1a598a920093618f788ac5a`  
Hazırlık anındaki fark: main kaynak base'den 23 commit ileride  
Karar: source-only, package-by-package reimplementation; wholesale merge/cherry-pick **NO-GO**

Bu belge eski tmp snapshot'ı authority yapmaz. Alıcı oturum önce canlı owner talimatını, güncel
`AGENTS.md` control block'unu, operating policy'yi ve disk gerçeğini yeniden okur. Buradaki SHA ve
çakışma listeleri hazırlık kanıtıdır; main ilerlediyse yeniden ölçülür.

## Kopyalanabilir ana-session promptu

```text
Deckent tmp dogfood worktree'sindeki doğrulanmış source-only işleri GÜNCEL main'e kontrollü biçimde
eşitle. Bu bir eski diff uygulama işi değildir. Güncel main ürün gerçeğidir; tmp yalnız kaynak kod,
test ve bulgu kanıtıdır. Kesin olduğun ve güncel main üzerinde yeniden doğruladığın paketleri uygula;
belirsiz, ürün kararı isteyen veya yeni main semantiğiyle çakışan parçaları typed HOLD olarak bırak.

AUTHORITIES VE SINIRLAR

1. Önce güncel `/home/alperen/deckent-dev/AGENTS.md` dosyasını, sonra
   `docs/governance/deckent-dev-operating-policy.md` dosyasını baştan sona oku. Run'a dokunacaksan
   güncel `DIRECTIVES.md` ve ilgili `.codex/rules/{brain,worker-default,auditor}.md` rollerini de
   oku. Canlı Alperen talimatı ve güncel DECKENT-DEV-CONTROL bloğu retained tmp belgelerinden üstün.
2. Hazırlık anında DOGFOOD_MODE=ON idi. Bunu geçmiş rapordan devam ettirme; canlı control block'tan
   yeniden çöz. ON ise her implementation slice Deckent Goal/Mission/Flow/Run/Do üzerinden yürür.
   Engine degraded ise yalnız typed ADR-D-007 bounded recovery seam'i kullanılır ve ilk güvenli
   sınırda dogfood'a dönülür. Aktif başka product outcome varsa ikinci outcome başlatma. Hazırlık
   anında `docs/execution/active/PROVIDER-OBS-MIGRATION-001.md` capsule'ı `ACTIVE`, Work 480 ve Owner
   Closure `OPEN` idi; bu exact authority kapanmadan veya canlı owner istisnası olmadan sync mutation
   başlatma. Read-only discovery/handoff hazırlığı yapılabilir.
3. Root main worktree'nin mevcut değişikliklerine dokunma: stash/reset/checkout/restore/clean yok.
   `.tasks`, `.brain/memory.db`, `.deckent/runtime`, DB/WAL/SHM, logs, receipts, generated exports,
   provider observations ve owner notifications kaynak paket değildir; hiçbirini taşıma/silme.
4. Commit/push/merge yapma; owner ayrıca isterse önce `git branch -vv`, HEAD drift ve exact staged
   set doğrulanır. Cleanup/kill ve raw `.tasks` deletion yok.
5. Combined tmp snapshot için bağımsız critic verdict'i NO-GO'dur. Bu verdict küçük source-only
   paketleri reddetmez; fakat terminal/finalizer snapshot'ını ve runtime state'i kesin biçimde
   merge dışı bırakır.
6. Hazırlık anındaki main `DIRECTIVES.md`, landed CLI reform dilim-1a metnini taşımaya devam
   ediyordu. Retained directive yeni sync'in execution authority'si değildir; owner-admitted yeni
   outcome açılırsa exact projection Deckent tarafından yeniden üretilir, eski dosya elle uyarlanmaz.

PARALEL READ-ONLY DISCOVERY

Main orchestrator dahil en fazla dört slot kullan. Üç subagent yalnız read-only çalışsın; hiçbir
subagent edit/build/commit/cleanup/run-state mutation yapmasın:

- Docs/authority reader: tmp altındaki dokuz Markdown belgesini ve etkilenen host/worker/Brain
  authority zincirini baştan sona okusun. Owner kararlarını, implemented+verified maddeleri,
  PRODUCT_DECISION_REQUIRED/HOLD maddelerini, stale/çelişkili iddiaları ve canonical source →
  generated projection zincirini raporlasın.
- Code/three-way reader: tmp base `417f495...`, güncel main ve tmp working tree arasında semantic
  three-way analiz yapsın. Her paket için ALREADY_PRESENT / REIMPLEMENT / HOLD / OBSOLETE kararı,
  symbol/file/test listesi ve yeni main feature çakışmalarını çıkarsın.
- Verification/operations reader: package.json scriptleri, scoped testler, real-binary ingress,
  i18n/ErrorRegistry/link/hermetic gates, platform matrix, recovery/rollback ve handoff receipt
  akışını doğrulasın. Eski PASS sayılarını güncel kanıt saymasın.

Main orchestrator bu raporları disk/code evidence ile uzlaştırmadan edit başlatmasın. Transcript
authority değildir; sonuçlar versioned receipt'in `openActions` ve verification alanına işlenir.

OKUNACAK TMP KANIT KÜMESİ

Şu dizindeki tüm Markdown dosyalarını baştan sona oku:
`/tmp/deckent-md-contract-authority-20260827/findings/deckent-tmp-dogfood-20260827/`

Özellikle:

- `REPORT.md`: bütün snapshot için REVISE/NO-GO ve eski verification inventory.
- `FINDINGS.md`: F-001..F-052 production observations.
- `SOLUTIONS.md`: S-001..S-048 disposition ve çözüm sınırları.
- `CRITIC-REVIEW.md`: CR-01..CR-05; combined acceptance blockers.
- `WORKER-AUTHORITY-DIRECTIVES.md`, `REPAIR-DIRECTIVES.md`,
  `AUTONOMOUS-ARTIFACT-AUTHORITY-DIRECTIVES.md`,
  `SPRINT-008-TSC-CLOSURE-DIRECTIVES.md`,
  `TERMINAL-TRUTH-CONVERGENCE-DIRECTIVES.md`: tarihsel exact-scope/evidence; güncel run authority
  değildir.

Disposition kelimelerini literal yorumla: `IMPLEMENT_IN_TMP` bir çözüm niyetidir, implemented
kanıtı değildir. S-023/S-028 raporda uygulanmış görünürken ledger etiketi güncellenmemiştir;
S-020 implement niyeti taşısa da terminal truth BLOCKER kalmıştır. S-042/S-044 scoped test yeşili
terminal/finalizer bundle'ını landing-ready yapmaz.

PREFLIGHT VE İZOLASYON

1. Read-only snapshot al: current HEAD, branch -vv, status --short, changed/untracked paths ve
   `417f495...` ile merge-base/commit/file delta. Hazırlık anında main `a4913b1...` ve 23 commit
   ilerideydi; bu sayı/SHA değişmiş olabilir.
2. Hazırlık anında main dirty set yalnız runtime/observation sınıfındaydı. Bunu varsayma; yeniden
   sınıflandır. Başka session'ın source/doc değişikliği varsa korunur ve collision olarak yazılır.
3. Active-outcome authority gate açıldıktan sonra canlı root main üzerinde patch deneme. Current
   main SHA'dan yeni, disposable bir `/tmp` integration worktree aç. Bu owner'ın gerçek
   parallel-work gerekçesine dayalı izolasyondur. Source paketleri orada kur ve kanıtla; root main
   yalnız son owner-authorized landing adımında hedef olabilir.
4. Integration worktree'de değişiklik öncesi baseline çalıştır. Mevcut failure varsa exact command,
   exit, failure class ve SHA ile kaydet. Baseline kırmızısını yeni değişikliğin başarısızlığı gibi
   veya tersi biçimde sunma.
5. Tmp'den `git diff` topluca apply etme; tmp'de commit olmadığı için cherry-pick yapma. Her paketi
   güncel main API/types/i18n/CLI contracts üzerine yeniden uygula.

HAZIRLIK ANINDAKİ DOĞRUDAN PATH OVERLAP

Tmp tracked diff ile base→main değişikliklerinin kesişimi 16 path idi:

`.brain/exports/debt.md`, `.brain/exports/memory.md`, `.brain/exports/summary.md`,
`.deckent/settings/features-manifest.json`, `DIRECTIVES.md`, `docs/CHANGELOG.md`,
`docs/SPRINT-LOG.md`, `src/cli/commands/autonomous.ts`, `src/cli/helpers/messages.ts`,
`src/orchestra/result-evaluator.ts`, `src/orchestra/scheduler-effects.ts`,
`src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-finalizer.ts`,
`src/orchestra/task-builder.ts`, `tests/orchestra/sprint-finalizer.test.ts`,
`tests/orchestra/task-builder.test.ts`.

İlk yedi runtime/generated/active-ledger path taşınmaz. Kalan dokuz source/test path semantic
conflict kabul edilir. Ayrıca type/import/consumer bağımlılıkları nedeniyle listede görünmeyen
semantic collision'ları da araştır.

PACKAGE DISPOSITION VE UYGULAMA SIRASI

Her package tek outcome slice olarak uygulanır; her birinin implementation pass'i ve bağımsız
verification pass'i ayrıdır. Bir package GO olmadan sonraki package'a onun dependency'si gibi
dayanma.

P1 — Typed RunFlow planner failure: REIMPLEMENT CANDIDATE

- Kaynak intent: planner failure'ın `null/generic` kaybını kaldır; secret-safe typed evidence taşı:
  reason/reasonCode, provider/model, attempt, elapsed, exit/signal, stdout/stderr byte count,
  framed output digest, parser stage ve varsa durable invocation receipt reference. Raw provider
  stdout/stderr/prompt render etme veya persist etme.
- Temp files: `src/orchestra/planner.ts`, `src/orchestra/run-proposal-compiler.ts`,
  `src/cli/commands/do.ts`, `src/cli/helpers/messages.ts` ve üç matching test.
- Main conflict: `messages.ts` güncel CLI reformuyla değişti; yalnız yeni en/tr keys ve mevcut
  bounded message-catalog family contractına uygun wiring ekle; yeni family'yi `BASE_MESSAGES`
  içine ekleme. Dosyayı temp sürümüyle değiştirme.
- Bu paket yalnız terminal failure sonucunu çözer. F-052 live invocation identity/stage/cancel
  eksikliğini çözülmüş sayma.
- Failure digest byte-length-framed ve algorithm-prefix'li olmalı; stdout/stderr basit delimiter ile
  concat edilmez. Built proof TTY ile pipe/non-TTY outputta aynı semantic evidence'ı göstermeli.
- Scoped proof:
  `VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/planner-zeroconfig.test.ts tests/orchestra/run-proposal-planner.test.ts tests/cli/do-runflow-adapter.test.ts`
- Post-settlement real-binary proof: supported no-provider predispatch ile gerçek provider nonzero/
  timeout/parse sınıflarından en az birini; secret leakage olmadan typed output + receipt ile kanıtla.

P2 — Hermetic dispatcher fixture: TEST-ONLY REIMPLEMENT CANDIDATE

- Yalnız `tests/orchestra/autonomous/execute-dispatcher.test.ts` içindeki provider'a kaçan fixture'a
  deterministic `evaluate`, `audit` ve `crossVerify` seam'leri inject et. Production dosyasını bu
  package için değiştirme; suite-wide provider guard ayrı finding'dir.
- Gerçek provider integration ayrı admitted test sınıfı olarak kalır. Unit fixture herhangi bir
  account, reachability veya timeout davranışına bağımlı olamaz.
- Scoped proof:
  `VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/autonomous/execute-dispatcher.test.ts`

P3 — Canonical root + Docker attempt identity + backend-bound worker core: REIMPLEMENT CANDIDATE

- `project-root` selector bütün project path'lerini canonical olarak kapsamalı; exact-file ve
  directory-tree narrowing korunmalı. Discriminated union exhaustive olmalı.
- Worker core externalization provider adına göre değil exact selected backend instance + requested
  route + supported system-prompt channel capability'sine göre çözülmeli. Docker dışı
  subprocess/tmux/auto yollarında core kaybolmamalı; unsupported channel fail-closed inline kalmalı.
- Temp files include `src/core/execution-write-scope-policy.ts`, task/run compilation consumers,
  `src/orchestra/spawn-backend.ts`, `src/orchestra/spawn-backend-docker.ts`,
  `src/orchestra/sprint-spawner.ts` ve matching tests.
- Docker settlement reference prompt compilation bitmeden allocate/reuse edilmeli; aynı exact
  `attemptId/backend=docker` compiled prompt, host heartbeat ve backend spawn options'a bağlanmalı.
  Current-main real Docker canary bu üç projection'ın aynı identity taşıdığını kanıtlamalı.
- Main scheduler spawn seam'inde yeni failure-disposition/`REPAIR_NO_MINT`, task-builder'da
  `forceModel` pass-through vardır. Bunlar korunur; tmp dosyaları overwrite edilmez.
- Scoped closure battery:
  `VITEST_MAX_FORKS=2 npx vitest run tests/core/execution-write-scope-policy.test.ts tests/orchestra/spawn-backend.test.ts tests/orchestra/task-mode-runner.test.ts tests/orchestra/autonomous/execute-dispatcher.test.ts tests/cli/run.test.ts tests/orchestra/worker-identity-hostbound.test.ts tests/orchestra/worker-core-system-prompt.test.ts tests/orchestra/task-builder.test.ts`
- Tmp kanıtında Docker `selectorMatches(project-root)` consumer'ını doğrudan pinleyen test eksiktir;
  landing öncesi bu exact consumer testi additive olarak yazılmalı ve geçmelidir.
- Docker, subprocess ve tmux için prompt-core presence/absence semantics'i test et; yalnız Docker
  smoke ile “every backend closed” deme. Desteklenmeyen platform capability typed HOLD olmalı.

P4 — Host/Brain/Worker/Auditor authority contracts: REPAIR REQUIRED BEFORE APPLY

- Kabul edilen semantics: Brain kendi kararını accepted yapamaz; generic product-memory ile
  deckent-dev dogfood core-memory authority ayrılır; host'a çağrılamayan internal functionlar komut
  diye emredilmez; worker plan dosyası yazmaz; locks host-owned; heartbeat exact attempt/backend
  identity ile strict current schema; result ingress camelCase current runtime schema; docs yalnız
  write scope içindeyse değiştirilir, değilse `docImpact`; non-Docker core delivery kaybolmaz;
  verification ve CUSTOM critical rules hostlar arasında semantic parity taşır.
- Canonical source'u önce belirle: templates/generator/schema/runtime source. Generated host
  projections elle ayrı ayrı düzenlenmez; canonical source düzeltilir, resmi generator çalıştırılır,
  sonra semantic parity test edilir.
- Tmp Brain ve Worker iyileştirmeleri bundle'ın tamamını kapatmıyor. Canonical Auditor template ve
  dört host projection hâlâ `MemoryStore`, `store.getByType` ve `store.insert` gibi host'un public
  capability olarak çağıramayacağı internal API/DB mutation dilini emrediyor. Auditor önce public
  capability + typed HOLD sözleşmesine taşınır ve semantic parity testine dahil edilir.
- Dogfood core-memory ile generic product-memory ayrımı Brain'de doğru kurulmuş olsa da tmp BOOT,
  DECKENT, Auditor ve Karpathy metinlerinde yeniden çelişiyor. Deckent-dev için
  `.deckent/docs/core-memory/MEMORY.md` authority'si, generic kullanıcı ürünü için
  `.brain/memory.db` authority'si aynı cümlede birbirine karıştırılmadan yüzey bazında korunur.
- Temp touched `DECKENT.md`, BOOT/TOOLS/WORKER-GUIDE, `.codex/.claude/.cursor/.gemini` role rules,
  rule templates/generator, manifest sync ve tests. Current main authority metnini tamamen
  değiştirme; tmp semantics'i current owner/policy metnine üç-yönlü uygula.
- `features-manifest.json`, generated stats/exports ve current ADR index temp'den kopyalanmaz.
  Manifest current main canonical scriptinden yeniden üretilir. Immutable historical closure
  snapshots rewrite edilmez.
- Repo root'unda generic `manifest.json` yoktur. `DECKENT.md` kullanım bağlamına göre gerçek feature
  registry `.deckent/settings/features-manifest.json` veya CLI surface manifest
  `docs/generated/cli-manifest.json` yoluna bağlanır. `docs/reference/agents.md` gibi var olmayan
  path'ler gerçek `docs/en/reference/agents.md` / `docs/tr/reference/agents.md` authority'sine
  düzeltilir; yalnız backtick string varlığını test eden assertion path-existence kanıtı sayılmaz.
- ADR-G-040 stale-name taraması ayrı semantic package olarak ele alınır: current canonical ADR file
  `docs/adr/adr-g-041-core-enterprise-modular-architecture.md`; operative refs migrate edilir,
  immutable/historical evidence allowlisted/preserved olur. Accepted-id list current repository'den
  generate edilir; temp list körlemesine kopyalanmaz.
- Tmp'deki untracked `scripts/lint-stale-adr.mjs` doğrudan alınmaz: package/script gate registry'sine
  bağlı değildir ve tmp test değişikliği mevcut catalog-ratchet coverage'ını overwrite eder. Gate
  gerekiyorsa mevcut testler korunarak additive test + explicit package wiring ile yeniden kurulur.
- `GEMINI.md` içindeki tek ADR rename host parity closure değildir; provider-specific auth/routing,
  hardcoded count ve stale path'ler current authority'ye göre ayrıca sınıflandırılır. Host Markdown
  değişikliği tek başına universal system-prompt enforcement değildir: compiled worker persona
  authority'si `.deckent/agents/<id>/PROMPT.md` zinciri ve attempt-bound prompt producer'ıdır.
- Scoped proof en az rule-generator, rules-parity (Auditor dahil), worker-core-system-prompt,
  worker-identity-hostbound, worker-activity-heartbeat, managed-docs generators, stale-ADR lint ve
  real compiled prompt inspection kapsar.

P5 — Evidence-preserving self-audit HOLD: SPLIT REIMPLEMENT / FINALIZER WIRE HOLD

- `src/core/self-audit-adapter.ts` process failure evidence'ını shell-free argv, exit/timeout,
  byte counts, output digest ve parser reason ile secret-safe koruyabilir; bu adapter kısmı güncel
  main üzerinde cerrahi adaydır.
- Tmp adapter digest'i `stdout + "\n" + stderr` biçimindedir; current-main reimplementation planner
  ile aynı byte-length-framed, algorithm-prefix'li envelope kullanmadan kabul edilmez.
- Tmp `src/orchestra/sprint-finalizer.ts` değişikliği bütün halinde taşınmaz. Current main base'den
  sonra terminal publication/failure-disposition/terminalTruth zincirini önemli ölçüde değiştirdi;
  adapter evidence mapping'i gerekiyorsa current finalizer contractına en küçük wiring olarak
  yeniden yazılır.
- Scoped proof: `tests/core/self-audit-adapter.test.ts`,
  `tests/orchestra/self-audit-adapter-wire.test.ts` ve current finalizer publication tests.

P6 — Autonomous cleanup/status source: HOLD_CURRENT_ARCHITECTURE

- Tmp archive-first/CAS/foreign-preservation algoritması ürün yönü olarak değerlidir; fakat yalnız
  legacy v1 `backlog.json` + `BacklogEntry.lastResult.taskLineage` authority'sini bilir. Current main
  aynı zamanda v2 `autonomous.db` MissionStore ve `autonomous mission` yüzeyini taşır.
- Tmp cleanup/status/approval kodunu uygulamak iki truth surface üretir. Önce v1+v2 için ortak
  terminal attempt/lineage application service'i; MissionStore dispatch claim + invocation receipt
  binding'i; status/list/cleanup common consumer'ı ve current CLI registry/help parity tasarlanır.
- Tmp implementation'ın kendisi de yeniden çalışma gerektiriyor: `CLI_COMMAND_CONTRACTS` içinde
  `autonomous cleanup` iki kez farklı effect/defaultExecution/authority ile kayıtlı; status her
  `parked + lastResult.reason` satırını execution HOLD sayıyor, bunun yerine typed
  `providerAuthorityHold` authority'si kullanılmalı; yeni mesajlar current catalog kuralına rağmen
  `BASE_MESSAGES` içine eklenmiş. Bu kod “kanıtlandı, aynen taşı” sınıfında değildir.
- Ayrıca `BacklogEntry.id`/nested `attemptId` yalnız non-empty kabul edilip archive path'ine doğrudan
  join ediliyor; segment/path-within ve symlink containment yok. Persisted `../../...` kimliği veya
  archive symlink'i root dışına kaçabilir. Receipt `ARCHIVED` yayımlandıktan sonra source removal
  failure'ı HOLD dönebildiği crash-state de tek terminal truth üretmiyor. Path authority, platform
  adapterı, crash transactionı ve Linux/macOS/Windows/WSL testleri olmadan direct-apply yasaktır.
- F-040 provider HOLD vs human approval ayrımı doğru intenttir; F-029 atomic genuine approval intake
  yine açıktır. İkisini display-only legacy patch ile closure sayma.
- Autonomous production değişiklikleri bu sync'in emin olunan landing setine dahil değildir.
  P2'deki test-only hermetic fixture bu HOLD'dan bağımsızdır.

P7 — Terminal/finalizer/archive snapshot: HOLD / DO NOT PORT

- Tmp'deki 300+ satırlık finalizer, archive conflict, force-abort ve terminal projection değişikliği
  current main'e patchlenmez. Main son 23 committe failure-disposition, terminal publication ve
  receipt truth alanlarını ilerletti; tmp tasarımı artık hem çakışmalı hem kısmen obsolete olabilir.
- CR-01/F-050/F-051; normal/recovery/completed-checkpoint/force-abort için uniform terminal
  job+phase+receipt, provider-observation retirement ve cross-surface parity güncel main üzerinde
  ayrı product outcome/owner decision gerektirir.
- F-005 foreground/join/cancel RunFlow, F-029 atomic approval intake ve F-052 live planner lifecycle
  de bu sync içinde çözülmüş sayılmaz. Bunları bulgu olarak teslim et; otomatik MASTER girişi açma.

NEVER-TRANSFER SET

- `.brain/**` (özellikle memory DB, backups ve generated exports)
- `.tasks/**`, `.locks/**`, `.dashboard` runtime projections
- `.deckent/provider-execution-observations.db`, `.deckent/runtime/**`, autonomous runtime JSON/DB,
  logs, receipts, notifications, prompt authority logs
- `DIRECTIVES.md`, `docs/SPRINT-LOG.md`, `docs/CHANGELOG.md`, current MASTER/generated stats from tmp
- tmp project config/feature manifest as bytes
- sprint-010 archive/runtime artifacts or force-finalize state
- any broad search/replace inside signed/immutable closure batches

VERIFICATION LADDER

For every package:

1. Before/after file manifest and semantic diff; no unrelated path.
2. Exact scoped Vitest command; report file/test counts from the NEW run, not this handoff.
3. `npx tsc --noEmit` on the integration snapshot.
4. `npm run lint:errors`, `npm run lint:i18n`, `npm run lint:link`, relevant hermetic/parity/manifest/
   operating-policy gates and `git diff --check`.
5. User-visible CLI change requires current built-binary proof. Never build while a sprint is active;
   run build only after the exact active settlement boundary and coordinate adapter restart/cache.
6. Dashboard/Desktop claim requires their dependencies plus rendered/interaction/a11y evidence;
   absent deps remain typed HOLD. Do not turn root tsc into Dashboard green.
7. Platform statement separates Linux-local evidence from macOS, Windows native, WSL, container
   and remote executor evidence. Unsupported/unrun cells are UNAVAILABLE/HOLD, not PASS.
8. Independent reviewer checks producer → consumer → entrypoint/ingress → policy/config enablement,
   secret handling, i18n, failure/recovery, concurrent-main collision and no regression of current
   main features. Same evidence is not recycled into a second audit.
9. Report `LOCAL_VERIFIED` and `REMOTE_ADVISORY` separately; scoped green is not repo green.

Active sprint yokken package closure için ortak command floor:

`npx tsc --noEmit`  
`npm run lint:errors`  
`npm run lint:i18n`  
`npm run lint:spawnsync`  
`npm run lint:hermetic`  
`npm run lint:manifests`  
`npm run lint:operating-policy`  
`npm run lint:link`  
`git diff --check`

Dependencies kurulmuş fresh integration worktree'de `npm run lint` root TypeScript, Dashboard
TypeScript ve gates sonuçlarını ayrı ayrı raporlar. `npm run build` yalnız terminal settlement
sonrası çalışır. Desktop etkilenirse `npm run test:desktop` ve mevcut desktop typecheck scripti;
Docker etkilenirse gerçek Docker attempt proof'u ayrıca gerekir.

LANDING / ROLLBACK

- Keep each package independently recoverable and dependency-ordered. Failed worktree forensic
  evidence olarak korunur; `reset --hard` yapılmaz. Gerekirse captured main SHA'dan yeni temiz
  integration worktree açılır; later packages failed package code'unu smuggle edemez.
- Before any owner-authorized landing, remeasure root main HEAD/status and repeat the three-way
  analysis if SHA moved. Prefer current main behavior; reconcile manually.
- Stage only the exact source/test/doc package. Verify staged diff and absence of never-transfer
  paths. Commit only after explicit owner instruction and `git branch -vv`.
- Produce a schemaVersion=1 handoff receipt with base/head/branch, policy/scope digests, exact files,
  commands+outcomes, finding dispositions, remaining openActions and receipt digest.
- Final report must say for each package: APPLIED+LOCAL_VERIFIED, ALREADY_PRESENT, HOLD or REJECTED;
  name current SHA and exact proof. Never say “all done” while any claimed surface lacks production
  wiring or real-surface evidence.

REQUIRED OUTPUT

1. Current-main three-way conflict matrix.
2. Package-by-package implementation and verification table.
3. Never-transfer audit result.
4. Real binary / cross-surface / platform evidence matrix.
5. Independent verification verdict.
6. Versioned handoff/landing receipt.
7. Unresolved product decisions and smallest next safe action, without auto-admitting new work.
```

## Hazırlık kanıtı ve önemli gerçekler

- Tmp tracked diff: 147 dosya, 2.869 insertion, 5.813 deletion; ek untracked source/test/findings ve
  runtime state vardı. Bu büyüklük tek package değildir.
- Current main, tmp base'den sonra CLI surface reformunu, failure-disposition zincirini ve terminal
  publication contractını ilerletti. Özellikle `autonomous.ts`, `messages.ts`, scheduler/controller/
  finalizer/task-builder ve testleri kör overwrite edilemez.
- Tmp force settlement dürüstçe `ABORTED` kaldı ve archive verify geçti; buna rağmen job yoktu,
  phase `TRANSITION` idi ve provider-observation history canlı statusu kirletiyordu. Bu runtime
  sonucu source acceptance değildir.
- Eski tmp kanıtları kıymetli regression hypotheses'tir; updated main'de yeniden koşulmadan landing
  gate değildir.

## Paralel audit sentezi

Üç read-only audit rolünün güncel-main karşılaştırması aşağıdaki disposition'da birleşti:

| Paket | Disposition | Ana gerekçe |
|---|---|---|
| Typed planner failure | `APPLY_BY_REIMPLEMENTATION` | Main'de yok; yalnız güncel message catalog ile semantic merge |
| Canonical project-root | `APPLY_BY_REIMPLEMENTATION` | Bug main'de sürüyor; direct Docker consumer testi eksik |
| Docker attempt identity | `APPLY_BY_REIMPLEMENTATION` | Prompt/heartbeat/backend aynı attempt'a henüz normal yolda bağlanmıyor |
| Route-aware worker core | `APPLY_BY_REIMPLEMENTATION` | Provider-only externalization sürüyor; main `NO_MINT`/`forceModel` korunmalı |
| Dispatcher fixture | `TEST_ONLY_REIMPLEMENTATION` | Provider'a kaçan unit fixture bağımsız ve düşük riskli |
| Self-audit evidence | `NARROW_REIMPLEMENTATION` | Adapter evidence alınabilir; terminal/finalizer hunks alınamaz |
| Docs/rules | `REPAIR_THEN_REGENERATE` | Auditor/internal-call, memory authority, broken paths ve parity gap açık |
| Autonomous cleanup/status | `HOLD_CURRENT_ARCHITECTURE_AND_SECURITY` | v1/v2 split truth + duplicate contract + path escape/crash-state riskleri |
| Terminal/finalizer/archive | `HOLD_WHOLESALE_OBSOLETE` | Current main terminalTruth/publication ilerledi; tmp açık blocker taşıyor |
| Sync mutation zamanı | `HOLD_ACTIVE_OUTCOME` | `PROVIDER-OBS-MIGRATION-001` ACTIVE/owner closure OPEN |

Bu tablo “uygulanacak her şey garantili” anlamına gelmez. İlk altı satır bile current SHA üzerinde
fresh baseline, exact implementation, scoped test, production wiring ve bağımsız verification
geçmeden landing-ready değildir.

## Ürün/lifecycle state matrisi

| Eksen | Bu devirde kabul edilen durum | Devirde yasaklanan collapse |
|---|---|---|
| Lifecycle | package discovery → implementation → verification → landing-ready/HOLD | tmp PASS → main DONE |
| Freshness | current SHA + current run evidence | 417f/71f tarihsel kanıtı current sayma |
| Authority | canlı owner + control block + policy | retained DIRECTIVES/tmp report mode authority |
| Evidence | new scoped tests + built binary + wiring inspection | worker/critic verdict tek başına proof |
| Outcome | APPLIED, ALREADY_PRESENT, HOLD, REJECTED | unresolved/unknown → success |

## Failure ve recovery matrisi

| Failure | Güvenli davranış | Recovery |
|---|---|---|
| Main SHA drift | edit/landing durur | yeni SHA ile three-way ve scoped tests tekrar |
| Dirty source collision | kullanıcı dosyasına dokunulmaz | separate integration worktree + manual reconcile |
| Active sprint sırasında build ihtiyacı | build yapılmaz | terminal settlement sonrası coordinated build/restart |
| Scoped test failure | package HOLD/revert | exact cause fix; unrelated package ilerleyebilir |
| Missing Dashboard/Desktop deps | surface claim HOLD | dependencies available olunca ayrı real-surface pass |
| Provider unavailable | typed unavailable/HOLD | authority/reachability değişince new evidence |
| Runtime/generated path staged | landing bloklanır | path'i staged setten çıkar; source producerdan regenerate |
| Finalizer semantic conflict | tmp code port edilmez | current-main versioned terminal contract outcome'u |

## Kaynak belgeler

- [REPORT.md](./REPORT.md)
- [FINDINGS.md](./FINDINGS.md)
- [SOLUTIONS.md](./SOLUTIONS.md)
- [CRITIC-REVIEW.md](./CRITIC-REVIEW.md)
- [Machine-readable receipt](./MAIN-CONTROLLED-SYNCHRONIZATION-RECEIPT.json)
