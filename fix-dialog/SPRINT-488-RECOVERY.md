# Sprint 488 Recovery — Codex ↔ Fable 5 Living Dialog

**State:** DALGA-1–3 SOURCE-GREEN · DALGA-4 PARTIAL · REPLAY/BUILD HELD · **Owner:** Alperen · **Implementer:** Codex/Sol ·
**Independent verifier:** Claude/Fable 5 · **Started:** 2026-08-01

Bu dosya onarımın tek living discussion/decision/evidence yüzeyidir. Ayrı özet veya paralel
karar belgesi üretilmez. Raw xverify receipt kendi canonical `.analysis/xverify/` yüzeyinde
kalabilir; bu dosya receipt yolunu ve alınan kararı kaydeder.

## 1. Authority ve baseline

- Owner kararı: Deckent dogfooding kapalı; düzeltme Codex tarafından manual recovery seam'inde
  uygulanacak; Fable 5 farklı-provider danışman/hakem olarak kullanılacak.
- Kırık forensic baseline: `f59503a43954219e50f0cd67fe2bb5caa1e8f29c`.
- MASTER reconciliation: `c637ca0d`.
- Sprint 488: `PAUSED/FIX`, active worker `0`, logical `8 done / 12 blocked / 20`, terminal
  publication `open/null`.
- `finalize --force`: success-benzeri summary sonrası `TERMINAL_EVIDENCE_HOLD`, exit 1.
- `cleanup`: `run-paused`, exit 1; forensic artifacts korunuyor.
- Salt-okunur triage: `.analysis/triage-2026-08-01-degradation/report.md`.
- Shared worktree'deki design değişiklikleri başka session'a aittir ve bu onarımın scope'u değildir.

## 2. Alp Discipline boundary declaration

**İrtifa:** bounded recovery design + implementation slice.

**Yapılmayacaklar:**

1. Sprint 488 resume/finalize/cleanup tekrarlarıyla kanıtı silmek veya state'i zorlamak.
2. Receipt/finalizer fail-closed kapısını gevşetmek.
3. `NOT_DISPATCHED`ı koşulsuz DONE/FAILED saymak.
4. Retry limitini kör biçimde kaldırıp aynı failure fingerprint'ini sonsuz çalıştırmak.
5. Full suite veya aktif/paused Sprint üzerinde build çalıştırmak.
6. Shared-worktree'deki design dosyalarını stage/edit etmek.
7. K1–K3 küçük patch'lerini kalıcı shared authority yerine yeni competing helper'larla çözmek.

**İhlal örneği:** finalizer receipt alabilsin diye `UNSETTLED` kontrolünü atlamak görünürde Sprint
488'i kapatır, fakat product kullanıcılarına delilsiz COMPLETE/cleanup üretir.

## 3. Karpathy execution contract

- Read/plan before code; bu dosya direct-recovery `.plan` otoritesidir. Paused Sprint 488'in
  `.tasks` alanına sentetik worker planı yazılmayacak.
- Existing pattern first; yeni abstraction yalnız canonical SSOT oluyorsa ve en az üç gerçek
  consumer'ı birleştiriyorsa kabul edilir.
- Surgical scope; dalga dışı bulgu yalnız burada residual olarak kaydedilir.
- Her patch aşağıdaki acceptance satırına ve exact scoped test kanıtına bağlanır.
- Test hermetic: tmpdir, async spawn, no live `.tasks`, no HOME/config dependency.

## 4. Birleşik root-cause

Fail-closed primitive'ler büyük ölçüde doğru; fakat breaker, finalizer, terminal receipt,
scheduler, prompt ve status aynı `logical task` / `settled state` projection'ını tüketmiyor.
Üç legacy consumer attempt-scoped attribution yerine ambient shared-worktree durumuna bakıyor.

## 5. Uygulama dalgaları ve acceptance

### Dalga 1 — kanamayı durdur

#### K1 · Liveness identity SSOT

- Docker worker adı yalnız `dockerContainerNameForTask(projectRoot, taskId)` veya canonical
  attempt labels üzerinden çözülür.
- Heartbeat monitor ve Auditor eski `deckent-w-${taskId}` / `deckent-${workerId}` varsayımı yapmaz.
- Docker, subprocess ve tmux davranışı backend adapter sınırında korunur.
- Sağlıklı hash-named Docker worker stale `.hb` yüzünden dead/stale seçilemez.

#### K2 · Collect→evaluate→sync atomicity

- Bir attempt ancak authoritative result enrichment/persist ve task-status evaluation/sync
  başarıyla tamamlanınca `collected` olur.
- Evaluation throw aynı attempt'i görünmez yapmaz; sonraki tick retry veya typed deferred/HOLD
  settlement üretir.
- Results array ve `collected` set duplicate veya partially-committed state bırakamaz.

#### K3 · NOT_DISPATCHED terminal projection

- `NOT_DISPATCHED` task defect değildir ve FIX bütçesi tüketmez.
- Dispatch evidence'e göre resumable/failed/skipped typed settlement üretir.
- Breaker, finalizer ve receipt aynı projection'ı tüketir; terminally accepted state receipt'i
  bloke etmez, recoverable state RETRO/COMPLETE'e geçmez.
- Resume aynı one-shot marker nedeniyle sonsuz HOLD'a dönmez.

### Dalga 2 — verdict ve production wiring dürüstlüğü

- Finalizer `tryCodeVerifiedDone` ile ambient diff'ten sentetik DONE yazamaz.
- Acceptance-bound semantic verdict production evaluate/settlement yolunda zorunludur.
- `decideFixRepairAuthority` FIX doğumundan önce gerçek production consumer olur.
- Dependency prompt aggregate repaired lineage digest'ini scheduler ile paylaşır.
- Read-only persona write repair alamaz; repair scope canonical consumer closure'dan türetilir.
- Worker-note regex'i typed host evidence'in önüne geçemez.

### Dalga 3 — projection ve recovery tutarlılığı

- `RUN_PAUSED` typed event olur; FAILED ile karışmaz.
- Dashboard tek fenced projection tüketir; controller terminal snapshot'ı `%100 done` ile ezmez.
- Dead coordinator lease process-start identity/heartbeat ile erken ve dürüst retire olur.
- Finalizer disk'teki bütün attempt'leri tek logical lineage altında fold eder.
- Status `active`, agents, provider attained concurrency, denominators ve receipt aynı revision'dır.
- Source/dist mismatch dogfood admission'ında typed HOLD olur.

### Dalga 4 — yapısal yakınsama

- Breaker, finalizer, receipt, dependency scheduler ve status tek shared lineage/settlement
  projection modülünü tüketir.
- XVerify evidence producer-settlement digest'ine bağlanır; ambient/legacy path promotion yapamaz.
- Original/FIX/XFIX/FIX-FIX tek logical task sayılır; authorized successor başarılı leaf'i
  bozamaz.

## 6. Verification ladder

Her dalga için:

1. Exact unit/contract tests.
2. İlgili scoped integration testleri; full suite yok.
3. Sprint aktif olmadığı ve owner build gate'i ayrıca açıldığı zaman post-settlement build/binary.
4. Fable 5 read-only xverify: farklı provider, exact files, exact criteria.
5. Ancak bütün dört dalga kapandıktan sonra owner-started replay:
   - trivial multi-provider smoke,
   - controlled NO_GO→FIX chain,
   - Sprint-488 landing/checkpoint replay,
   - synthetic NOT_DISPATCHED run.

## 7. Fable 5 design question — Round 1

Fable şu soruları file:line kanıtıyla adjudicate etsin:

1. K1 için canonical container identity'yi import etmek katman yönünü ihlal ediyor mu; labels ile
   probe etmek isimden daha doğru ve every-environment yaklaşım hangisi?
2. K2'de en küçük doğru transaction boundary nedir? `collected.add`i sona taşımak yeterli mi,
   yoksa `results.push`/persist/status sync için rollback/idempotent state gerekli mi?
3. K3 için `NOT_DISPATCHED` hangi typed state'lere ayrılmalı ve breaker/finalizer/receipt tek
   projection'ı hangi mevcut module boundary'sinde yaşamalı?
4. Dalga-1'in Dalga-4 shared projection'ını erken ve gereksiz abstraction olarak getirmeden,
   sonradan competing authority yaratmamasını sağlayan minimum design nedir?
5. Hangi mevcut testler yanlış ön-koşulla yeşil ve hangi exact negative cases önce RED olmalı?

## 8. Dialog log

### 2026-08-01 · Codex Round 1

- Triage file:line çapaları source üzerinde doğrulandı.
- K1 naming drift, K2 collected-before-sync ve K3 breaker/finalizer NOT_DISPATCHED farkı confirmed.
- `tryCodeVerifiedDone`, semantic acceptance gate ve isolation repair authority wiring boşlukları
  ayrıca production-call graph ile doğrulandı.
- Fable Round 1 canonical `deckent xverify` ile istendi; verifier dispatch edilmeden typed HOLD
  döndü: `xverify_provider_authority_unavailable`.
- Raw host report:
  `.analysis/xverify/xv-1785563964837-8cda91ea-d8fa-4e4f-974c-123f6cb11a9c.md`.
- Config Fable modelini ve auditor execution budget'ını içeriyor; fakat owner-authored
  `provider_limits` parent/project layer yok. CLI composition root bu nedenle
  `openLocalProviderAuthorityRuntimeIfConfigured()` sonucunu absent bırakıyor ve exact xverify
  doğru biçimde zero-dispatch HOLD ediyor.
- Same-provider self-verify veya sessiz `claude -p` fallback yapılmadı.

### 2026-08-01 · Owner transport decision

- Owner, canonical xverify authority onarılana kadar host `claude -p --model claude-fable-5`
  read-only advisory kullanımını açıkça onayladı.
- İlk sandboxed çağrı restricted-network nedeniyle çıktı üretmeden beş dakika sonra yalnız kendi
  process'i durdurularak contained edildi. Repo/Sprint state mutasyonu olmadı.
- Aynı bounded prompt network-enabled host çağrısıyla tekrar çalıştırıldı.

### 2026-08-01 · Fable 5 Round 1 advisory

- **Verdict:** `CONFIRMED` — non-xverify advisory; canonical adjudication receipt değildir.
- K1/K2/K3 mekanizmaları source üzerinde confirmed; bunların Sprint-488'in belirli exit-137,
  EXECUTE-deadlock ve terminal-HOLD vakalarına tekil eşlemesi replay'e kadar causal inference.
- **K1 decision:** Core container identity import'u katman yönünü ihlal etmiyor. Docker probe için
  exact project/task/attempt labels tercih edilir; canonical name yalnız exact fallback. Backend
  identity çözümü adapter sınırında kalır, tmux/subprocess davranışı değişmez.
- **K2 decision:** Sadece `collected.add` taşınmayacak. Enrich/persist/status-sync staging;
  `results.push + collected.add + newlyCollected.push + metric` başarı-sonrası commit olacak.
  Aynı ordering üç ingest yolunda korunacak. Deterministic throw retry edilebilir kalacak ve mevcut
  tick-armor artık gerçekten gözlemleyebilecek.
- **K3 decision:** `NOT_DISPATCHED_RESUMABLE`, `NOT_DISPATCHED_EXHAUSTED` ve
  `NOT_DISPATCHED_STARVED` ayrımı dispatch evidence/dependency authority ile yapılacak.
  Receipt gate gevşetilmeyecek. Pure classifier mevcut `core/task-lineage.ts` authority'sinde
  yaşayacak; breaker, finalizer ve FIX re-dispatch tüketicileri aynı sonucu kullanacak.
- **ADR flags:** K1, ADR-G-014 observation kontratını düzeltir; label observation belgelemesi
  residual olabilir. K2 retry'ı ADR-G-037 budget enrichment/settlement idempotency'sini korumalı.
  K3 host-authored typed evidence olmalı, synthetic worker DONE/NO_GO sonucu olmamalı.
- **Required RED:** canonical Docker identity probe; stale HB + host-alive suppression; evaluator
  throw→retry→single result; deterministic throw armor; salt NOT_DISPATCHED exhausted receipt;
  marker-unburnt resumable PAUSE; dependency-starved SKIPPED.

### 2026-08-01 · Codex Wave-1 implementation

- **K1:** Heartbeat monitor ve Auditor artık Docker spawn authority SSOT'u olan
  `dockerContainerNameForTask(projectRoot, taskId)` tüketiyor. Auditor substring `docker ps`
  yerine exact-name `docker inspect` kullanıyor; scan-loop project authority'yi probe'a taşıyor.
- **K2:** Beş result-ingest yolunda `syncTaskStatusFromResult` collection commit'inden önce.
  Initial collection transient evaluation throw'u transactional boundary'nin gerisinde bırakıyor;
  bounded watcher armor aynı result'ı tekrar değerlendiriyor, array/set duplicate üretmiyor.
- **K3:** `core/task-lineage.ts` pure projector `RESUMABLE/DISPATCH_RETRY_AVAILABLE`,
  `FAILED/DISPATCH_EXHAUSTED`, `SKIPPED/DEPENDENCY_STARVED` üretiyor. Breaker exhausted root'u
  unresolved sayıyor. Finalizer sentetik worker result üretmeden host-authored `NOT_APPLICABLE`
  zero-work evidence ile FAILED lineage kuruyor; receipt fail-closed gate'i değişmedi.
- **Proof:** 7 exact test file, 107/107 PASS; `npx tsc --noEmit --pretty false` PASS.
- **Verifier Round 2:** Owner talimatı gereği uzun süren direct Fable process kritik yoldan
  çıkarıldı; yaklaşık 90 saniyede output üretmeyen yalnız o read-only process durduruldu.

### 2026-08-01 · Codex Wave-2 implementation

- Dependency evidence object-form aggregate reader'a geçirildi; accepted FIX leaf çıktıları
  prompt'a ve exact read-scope'a aynı projection ile giriyor.
- Finalizer'ın ambient shared-worktree diff'ten sentetik DONE yazması kaldırıldı. Ambient probe
  yalnız diagnostic; evaluation/result mutasyonu yapmıyor.
- Verification-isolation receipt'i Brain verdict→FIX birth production sınırına bağlandı.
  `DEFERRED/NOT_DISPATCHED` task defect veya FIX bütçesi tüketmiyor; worker notes authority değil.
- Greenfield write scope `acknowledgeScopePaths` ile plan-time `plannedNewFiles` olarak digest'e
  bağlanıyor; start-time drift fail-closed.
- FIX, worker prose'undan scope genişletmiyor ve birth-time PAUSED tuzağı üretmiyor.
- Routing/prompt admission exception'ları artık generic persona ile fail-open devam etmiyor.
- Mid-sprint ambient git diff, commit ve rollback verdict/attribution yolu kaldırıldı; yalnız exact
  `workAttribution.state=VERIFIED` promotion veya disk reconciliation'a katılıyor.
- Direct repair lineage doğmuşsa geç gelen speculative XFIX artık üretilmiyor; aynı logical root
  üzerindeki FIX-FIX/XFIX concurrent-write sızıntısı kapandı.

### 2026-08-01 · Codex Wave-3 implementation

- `RUN_PAUSED` canonical RunFlow event/reducer/coordinator/CLI ingress'ine bağlandı; resumable
  pause artık FAILED projection değildir.
- Dashboard publication sprint-id + terminal-authority fence'li, same-directory atomic tek
  projection oldu; controller finalizer snapshot'ını `%100 done` ile ezmiyor.
- Coordinator lease numeric PID yerine process start-token + startedAt + heartbeat nesliyle
  doğrulanıyor; PID reuse ACTIVE yalanı üretemiyor.
- Finalizer aynı sprintin disk FIX task JSON'larını archive boundary'de yükleyip logical fold'a
  dahil ediyor; original+FIX ayrı task/KPI sayılmıyor.
- Scheduler, her dispatch/re-dispatch öncesi active exact write-scope collision'ını tekrar
  kontrol ediyor. Backend inventory'den kaybolan worker iki-aşamalı bounded reaper ile exact
  settlement'a veya typed timeout'a taşınıyor; slot sonsuza dek pinlenmiyor.

### 2026-08-01 · Codex Wave-4 partial convergence

- `core/task-lineage.ts` artık logical root, resolving tip ve typed settlement state için tek saf
  projection yayımlıyor. Breaker bu projection'ı tüketiyor; finalizer aynı exported root resolver'ı
  kullanıyor; fenced receipt finalizer'ın aynı terminal truth nesnesinden yayımlanıyor.
- `fixForTaskId` topology authority kabul edildi; legacy task'ta eksik `isPriorityFix` metadata'sı
  finalizer ve scheduler fold'unu ayıramıyor.
- Provider-log XVerify terminal satırı yalnız advisory semantic evidence kaldı. Raw
  `EXIT_WITHOUT_RESULT` result/task artık log fallback ile sentetik DONE'a çevrilmiyor; mandatory
  authority yalnız closed host settlement yolundan gelebilir.
- XVerify V2 execution contract artık `producerSettlementDigest` taşır. Implementation verification
  yalnız exact closed producer result settlement ile ve passed result byte-semantically aynıysa
  evidence snapshot'a ilerler; missing/open/mismatch provider authority'ye dokunmadan typed HOLD'dur.
  Attended standalone claim için wx host-authored claim/result çifti ayrı typed producer receipt'tir.
- Legacy invocation retirement, coordinator-exit receipt, subprocess attribution parity ve
  production semantic/wiring receipt producer'ları henüz kapanmadı. Olmayan producer yerine
  fabricated receipt eklenmedi.

### 2026-08-01 · Independent review punch-list closure

- Bağımsız ikinci tur 20 iddianın 16'sını `CONFIRMED`, 4'ünü `PARTIAL` buldu; ek rapor
  `.analysis/triage-2026-08-01-degradation/report.md` sonundadır.
- **R1:** PID writer'ın ürettiği exact `startedAt`, kernel `startToken` ve cross-platform random
  `leaseId` tek authority record olarak snapshot writer'a taşınıyor. WSL namespace görünmezliği iki
  saat çağrısının byte-drift'ine düşmüyor; kernel token bulunmayan platformlar fresh matching lease
  ile çalışıyor, foreign lease fail-closed kalıyor.
- **K1 residual:** `worker-liveness` ve user-facing `watch` Docker yolları da project+task-scoped
  `dockerContainerNameForTask` SSOT'una bağlandı; eski `deckent-w-${taskId}` türetimi kalmadı.
- **N1 residual:** dependency audit verdict'i hardcoded `attempt-1` yerine tek-pass index'ten en
  yüksek numeric attempt'i tüketiyor. En yeni artifact malformed ise eski verdict'e fallback yok.
- **V1 residual:** `verifyWorkerResult` artık NO_GO'yu ambient shared-worktree probe ile PASS'e
  çevirmiyor; exact attempt settlement/reconciliation tek promotion authority'si.
- **Restart inventory:** Subprocess ve sandbox backend'leri process-local worker envanterini
  `active/absent/unknown` olarak sınıflandırıyor. Yeni coordinator'ın boş map'i önceki generation
  worker'ını yok saymıyor; per-task-timeout backend'leri de `list/kill` authority'sine kayıtlı.
- **Canonical collision admission:** Exact active write-overlap kontrolü `executeSpawnTask` içine
  taşındı. Local queue, reducer ve dependency respawn aynı admission'ı tüketiyor; held task
  spawn/metrik/return listesinde spawned sayılmıyor.
- **Dashboard SSOT:** alert-emitter ve sprint-estimator direct truncate writer olmaktan çıkarıldı;
  sprint-id/terminal-authority fence'li same-directory atomic `updateDashboard` tüketiyor.
- **Below-threshold FAILED:** Circuit-breaker eşiğinin altındaki unresolved lineage finalizer'da
  çıkışsız HOLD'a düşmüyor. Ayrı typed `unresolved-lineage-operator-decision` PAUSED yüzeyi exact
  recover/force-finalize authority'sini yayımlıyor; breaker policy değiştirilmedi.
- Review punch-list 9 (subprocess verification-isolation parity) açık residual olarak korunuyor.

### 2026-08-01 · Third-review R1 resume closure

- İkinci-tur bağımsız kontrol, fresh PID authority zincirinin doğru olduğunu fakat legacy
  resume-evaluate kolunun periodic/initial snapshot writer'ı hiç başlatmadığını buldu.
- Fresh ve resume generation artık aynı `activateCoordinatorSnapshotWriter` lifecycle seam'ini
  tüketiyor. Her ikisi exact `writePid` authority'sini `createSprintStateSnapshot` pure builder'ına
  geçiriyor; `startedAt`, kernel `startToken` ve cross-platform `leaseId` ikinci bir saat/PID
  okumasından yeniden türetilmiyor.
- Initial snapshot strict admission boundary oldu: snapshot diske atomik yayımlanamazsa coordinator
  EVALUATE/SPAWN'a ilerlemiyor, kendi PID/active/lock authority'sini retire edip hatayı taşıyor.
  Sonraki 30 saniyelik heartbeat snapshot'ları best-effort kalıyor ve mevcut finally teardown'ını
  tüketiyor.
- Eski token/lease içermeyen Sprint-488 PID/snapshot artifact'leri yeni generation kanıtı değildir;
  resume fresh authority üretir. Legacy artifact'i sahte biçimde sahiplenme veya migrate etme yoktur.

## 9. Evidence log

| Time | Stage | Command/evidence | Outcome |
|---|---|---|---|
| 2026-08-01 | Baseline | `deckent status --json` | PAUSED/FIX, 8/12/20, receipt null |
| 2026-08-01 | Governance | `node scripts/lint-master-plan.mjs --check` | 309/309, projections in sync |
| 2026-08-01 | Design | `deckent xverify ... --verifier claude --verifier-model claude-fable-5` | HOLD; zero dispatch; `xverify_provider_authority_unavailable` |
| 2026-08-01 | Design | owner-approved `claude -p --model claude-fable-5` | `CONFIRMED`; non-xverify advisory; K1–K3 design narrowed |
| 2026-08-01 | Wave-1 RED | 7 scoped test file | K1/K2/K3 expected failures observed before production patch |
| 2026-08-01 | Wave-1 GREEN | 7 scoped test file | 107/107 PASS |
| 2026-08-01 | Wave-1 type | `npx tsc --noEmit --pretty false` | PASS |
| 2026-08-01 | Verify Round 2 | direct Fable 5 read-only diff review | output timeout; stopped, no repo/sprint mutation |
| 2026-08-01 | Wave-2/3/4 broad scoped | 26 recovery test files | 542/543 PASS; sole failure isolated to stale known-consumer allowlist |
| 2026-08-01 | Final changed-surface scoped | 20 recovery test files + isolated ratchet rerun | 463/463 unique tests PASS; eight exact-plan contract consumers documented, production allowlist unchanged |
| 2026-08-01 | Dashboard fence | `tests/monitor/auditor.test.ts` | 153/153 PASS |
| 2026-08-01 | Lineage/XFIX convergence | 5 scoped files | 79/79 PASS |
| 2026-08-01 | XVerify no-synthetic-DONE | `tests/orchestra/cross-verify-wire.test.ts` | 64/64 PASS |
| 2026-08-01 | XVerify producer settlement binding | execution-contract + production-ingress + strict-launcher | 23/23 PASS |
| 2026-08-01 | RUN_PAUSED exact contract | targeted reducer test | 1/1 PASS |
| 2026-08-01 | Static type authority | `npx tsc --noEmit --pretty false` | PASS |
| 2026-08-01 | Docs/diff authority | MASTER check + `git diff --check` | PASS; 309/309 projection in sync |
| 2026-08-01 | Independent punch-list 1–4 | 7 exact test files | 239/239 PASS; TypeScript + diff PASS |
| 2026-08-01 | Independent punch-list 5–8 | 10 exact regression files | 155/155 PASS; restart inventory, canonical collision, dashboard fence and operator PAUSE covered |
| 2026-08-01 | Recovery changed-surface regression | 34 recovery test files | 652/652 PASS; no full-suite run |
| 2026-08-01 | R1 resume lease/snapshot | `sprint-pid-manager.test.ts` + TypeScript + diff | 28/28 PASS; fresh/resume shared writer and exact authority projection covered |
| 2026-08-01 | R1 adjacent recovery scope | 7 resume/recovery test files | 89/90 PASS; six files green, sole failure is an unchanged stale `commands/resume` mock expecting pre-connector options and is outside this diff |

## 10. Owner-authorized terminal recovery outcome

Owner approvalünden sonra Sprint-488 normal finalizer'a sokulmadı. Canonical force-recovery
implementation'ı exact coordinator containment sonrası generation-fenced `ABORTED` receipt
yayımladı: 20 logical task / 33 attempt içinde 8 `DONE`, 1 settled `NO_GO` ve 11 unresolved
lineage korundu. Ardından cleanup yalnız receipt ile aynı sprint/outcome authority'sini kabul etti,
Sprint-488'e ait live artifact'leri temizledi ve bağımsız XVerify task/result evidence'ını korudu.
Canonical status `IDLE`, coordinator `absent`, `resumable=false` oldu; force yolunda retrospective,
learning veya config mutation çalışmadı.

Historical Sprint-488 cleanup, archive-before-delete hardening'inin son implementation adımından
önce çalıştırıldığı için task/result JSON'ları archive'da yoktur. Terminal receipt, logs, runtime
events/evaluations/routing evidence korunur. Sonraki isolated real-dist fixture owned task/result
bytes'larının archive readback'i doğrulanmadan live kopyanın silinmediğini ve foreign XVerify
artifact'inin korunmasını kanıtladı.

## 11. Residual / owner-decision register

Canonical xverify provider authority hâlâ açık residual'dır. Numeric/provider limit policy veya
fabricated authority yazılmayacak. Ayrıca semantic verdict / production-wiring isolation
receipt'lerinin gerçek host producer'ı, coordinator-exit terminal receipt, subprocess attribution
parity ve source/dist dogfood admission kanıtı açıktır. Producer-settlement snapshot digest'i
source düzeyinde bağlandı; fresh live verifier replay kanıtı henüz yoktur.
Independent review punch-list 9 (subprocess verification-isolation parity) ilgili canonical program
diliminde çözülmek üzere açıktır; bu source patch'leri hiçbir MASTER satırını DONE yapmaz.
Canonical xverify ancak XVERIFY-WIRE/provider authority kapandıktan sonra tekrar zorunlu yapılır.
Sprint-488 artık `ABORTED → cleanup → IDLE` terminal gerçeğindedir ve recovery implementation'ı
`e941a66a` commit'iyle korunur. Fresh owner-started replay hâlâ yapılmadı. Canonical status şu anda
`IDLE` yayımlasa da provider execution observation store'daki dört Sprint-488 interval'ı `end=null`
kaldığı için ayrı status consumer'ı `currentAttained=4` göstermektedir. Bu tarihsel provider
observation'ı silinmeyecek veya IDLE presentation katmanında gizlenmeyecek; exact run/generation
attribution ve verified termination reconciliation ile `RECOVERY-BORN-488-STATUS-PROJECTION-001`
altında çözülecektir.

## 12. Approved next implementation train — status/recovery truth

Owner approval: 2026-08-01. Dogfood execution bloke olduğu için implementation typed manual
recovery seam'inde ilerler; ilk güvenli sınırdan sonra owner-started dogfood canary'ye döner.

1. Run generation/revision/digest bağlı, atomic ve persisted canonical read model üret.
2. Provider open interval'larını exact active task/attempt authority'sine bağla. Retired run'a ait
   kapanmamış observation `currentAttained` değildir; silinmeyen typed forensic HOLD evidence'ıdır.
3. CLI, MCP, Terminal, Desktop, dashboard, metrics, notification ve finalizer aynı snapshot
   revision/digest'ini tüketir; hiçbir adapter task/dashboard/DB tarayarak lifecycle türetmez.
4. Source/dist build identity mismatch'i plan/start/resume öncesi typed admission HOLD olur.
5. Recover exact `resumed-running | resumed-paused | completed | aborted | failed` sonucu ve sonraki
   authority komutunu yayımlar; generic error terminal kontratı değildir.
6. Scoped/hermetic contracts, gerçek built-binary proof ve Linux/macOS/Windows-native/WSL adapter
   karar matrisi geçmeden MASTER satırı DONE olmaz veya dogfood replay başlamaz.

### Acceptance matrix

| Concern | Required truth |
|---|---|
| Lifecycle | Tek persisted revision; IDLE/ACTIVE/PAUSED/ORPHANED/COMPLETE/ABORTED bütün yüzeylerde byte-semantically aynı |
| Logical work | Original/FIX/XFIX attempt'leri tek logical denominator; exact attempt identity korunur |
| Provider concurrency | Yalnız current run'a exact-attributed open provider windows sayılır; retired/stale windows ayrı HOLD evidence olur |
| Terminal receipt | Receipt outcome/lifecycle/digest aynı revision'da; force hiçbir zaman COMPLETE üretmez |
| Recovery | Exit code, JSON/human output ve next authority aynı typed outcome'u taşır |
| Build identity | Aktif host adapter source/dist mismatch'te dispatch öncesi fail-closed |
| Every environment | Platform adapter capability yoksa honest unsupported/HOLD; POSIX inference yok |
| Scale/tenancy | Snapshot tenant/project/run/generation scoped, bounded ve atomic; global mutable singleton yok |
