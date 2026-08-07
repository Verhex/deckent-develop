# Project Inventory ve Scope Admission Authority — VCS-Neutral Evidence, Drift ve Repair Handoff (2026-08-06)

> **Karar durumu:** KABUL EDİLDİ — Alperen, 2026-08-06 OWASP Agentic Top 10 bağımsız
> inceleme oturumu, Bulgu 9.
>
> **Implementation durumu:** Bu oturumda production kodu, config, test veya canonical ledger
> değiştirilmedi. Bu belge başka bir Deckent session'ında Goal/Mission/Flow/Run planına alınacak
> implementation authority girdisidir.
>
> **Önceki bulgu hükmü:** **CONFIRMED** — exact legacy `runSprint()` pre-spawn scope gate,
> `git ls-files` veya gate zinciri başarısız olduğunda açıkça fail-open devam eder. Bütün güncel
> Deckent yüzeyleri için genelleme **PARTIAL**'dır: canonical RunFlow plan service tracked-file
> evidence unavailable durumunu typed scope HOLD olarak persist eder ve approval'ı reddeder.
>
> **MCP notu:** Bulgu 8 owner kararıyla `MCPV2.md` planı ve production cutover sonrasındaki fresh
> code-truth değerlendirmesine **DEFERRED/HOLD** bırakılmıştır. Bu belge MCPv1 trust tasarımı yapmaz.
>
> **Canonical ledger owners:** disposition `SEC-ENFORCE-WIRE-001` (order 4200), assurance parent
> `SEC-OWASP-ASI-001` (4190), truth/evidence owner `TRUTH-BASELINE-001` (40), authority owners
> `CAPABILITY-001` (4040), `TOOL-AUTHORITY-001` (4060), `TRUST-HANDOFF-001` (4180),
> platform owner `ENV-ADAPTER-001` (8010), exact-plan/RunFlow owners güncel `KERNEL-001` DAG'ı.
>
> **Hard architecture dependencies:**
> `docs/audits/provider-neutral-worker-execution-authority-design-2026-08-06.md`,
> `docs/audits/attempt-effect-attribution-authority-design-2026-08-06.md` ve
> `docs/audits/enforcement-module-disposition-authority-design-2026-08-06.md`.

## 1. Sonuç — tek cümle

Deckent, scope admission için dağınık ve sessizce fail-open `git ls-files` çağrılarına güvenmeyecek;
Git'i VCS-neutral Project Inventory Authority'nin bir adapter'ı yapacak, project identity + baseline +
inventory provenance'ını exact plan/approval digest'ine bağlayacak, unavailable/empty/non-Git/stale/drifted
durumlarını tipli ayıracak, legacy runtime gate'i canonical RunFlow/Execution Admission cutover sonrası retire
edecek ve gerçek write güvenliğini scope heuristic'inden değil provider-neutral containment + Attempt Effect +
Landing Authority zincirinden sağlayacaktır.

## 2. Kapsam

Bu karar aşağıdaki production ve authority yüzeylerini kapsar:

1. legacy `runSprint()` pre-spawn scope gate;
2. RunFlow exact-plan tracked-file evidence acquisition ve approval binding;
3. plan-time prompt/scope lints;
4. dynamic FIX/debt repair scope re-gate;
5. planner/task-builder içindeki dağınık Git inventory reads;
6. greenfield/root-only/non-Git/unsupported project ayrımı;
7. project/repository/workspace identity ve root binding;
8. inventory snapshot digest, TTL, revision ve drift semantics;
9. suspect path resolution ve explicit acknowledgement;
10. plan approval ile spawn admission arasındaki revalidation;
11. scope signal ile execution/effect/landing enforcement ayrımı;
12. Git, filesystem manifest, other-VCS ve remote workspace adapters;
13. multi-project/multi-tenant/scale/concurrency/recovery;
14. observe→shadow→enforce migration ve legacy retire;
15. Every Environment proof'u ve typed unsupported behavior.

Bu belge şunları **yapmaz**:

- Git'i Deckent'in bütün projeler için zorunlu runtime dependency'si yapmaz;
- `evaluateScopeGate()` heuristic'ini sandbox veya filesystem enforcement saymaz;
- bütün Git/evidence failure'larında bağlamsız global process abort önermez;
- greenfield projeyi corrupt/unavailable repository ile aynı saymaz;
- raw `--force-scope` boolean'ını kalıcı authorization contractı kabul etmez;
- `docs/MASTER-PLAN.md` üzerinde mutation yapmaz;
- MCPv2 gerçekleşmeden MCP trust çözümü yazmaz.

## 3. Nihai verdict ve enforcement matrisi

| Mekanizma/yol | Bugünkü code-truth | Sınıf | Güvenlik notu | Nihai disposition |
|---|---|---|---|---|
| Legacy `runSprint` scope gate, Git success | Suspect write paths default blok; exact boolean override var | **ENFORCED/PARTIAL** | Yalnız path-quality admission | Pure classifier + decision semantics'i canonical authority'ye absorb |
| Legacy `runSprint` Git/gate failure | Non-`BrainError` catch debug-log sonrası spawn'a devam | **ADVISORY/fail-open** | Zayıf/kritik combined gap | Ad-hoc acquisition ve catch'i retire |
| RunFlow evidence unavailable | Preview fail/deny; approval `SCOPE_GATE_HOLD` | **ENFORCED** | Güçlü plan-time baseline | Preserve, VCS-neutral authority'ye generalize |
| RunFlow scope evidence digest | `scopeInput` planning/source hash'ine bağlı | **ENFORCED/PARTIAL** | Değerli provenance foundation | Project identity/revision/TTL/adapter assurance ile genişlet |
| Legacy `--force-scope` | Caller boolean bütün suspects'i geçirir | **CONFIG/CALLER-GATED/PARTIAL** | Principal/digest/path-specific receipt değil | Exact acknowledgement/approval receipt'e migrate |
| RunFlow scope acknowledgement | Planning hash + plan digest + approval re-acknowledgement | **ENFORCED/PARTIAL** | Doğru yön, blanket suspect seti | Exact suspect/path/evidence decision'a daralt |
| Dynamic FIX re-gate | Git failure unchanged scope; `acknowledgeScopePaths:true` ile block yok | **ADVISORY/fail-open** | Cascading failure riski | Repair revision/capability/HOLD authority'sine cut over |
| Prompt-gate tracked-file lints | Git failure'da scope lints skip | **ADVISORY/fail-soft** | Security boundary değil | Shared inventory evidence tüket; coverage durumunu görünür yap |
| Auto-resolution persistence | In-memory scope değişir; task JSON write failure debug-only | **PARTIAL/fail-open** | Disk/plan divergence riski | Resolution before digest + atomic durable plan |
| Runtime filesystem write scope | Provider ve shell paths'te tam structural enforcement yok | **UNWIRED/PARTIAL** | Asıl effect boundary gap | Accepted Bulgu 4/5 authority'lerine bağla |

Exact önceki bulgu **CONFIRMED**'dır. “Deckent scope gate her production ingress'te Git failure'da
fail-open” genellemesi güncel code-truth'a göre **PARTIAL**'dır; RunFlow plan ingress'i bu failure'ı HOLD yapar.

## 4. Bugünkü code-truth baseline

### 4.1 Legacy `runSprint()` bilinçli fail-open'dır

Fresh execution path plan üretildikten ve sprint lock execution'a bind edildikten sonra pre-spawn scope gate
çalışır (`src/orchestra/sprint-controller.ts:1888-1917`). Kod comment'i mekanizmanın hedefini doğru tanımlar:
planned `filesWrite/filesRead` yollarını real tracked-file set'e karşı kontrol ederek typo/wrong-directory
orphan-file riskini worker spawn'dan önce yakalamak.

Acquisition:

- `spawnSync('git', ['ls-files'])` çağrısı yapılır
  (`src/orchestra/sprint-controller.ts:1918-1921`);
- yalnız exit status `0` ve string stdout varsa evaluator çalışır (`:1922-1935`);
- suspect write bulunursa `BrainError` ile PLAN durur (`:1936-1941`);
- diğer bütün durumlar gate yokmuş gibi bir sonraki prompt gate/spawn zincirine geçer.

Policy niyeti comment'te açıkça “Fail-OPEN: a git failure never blocks a legitimate sprint” olarak yazılıdır
(`src/orchestra/sprint-controller.ts:1915-1918`). Catch yalnız Git process error'ını değil bütün non-`BrainError`
exceptions'ı yutar (`:1986-1989`).

Bu nedenle aşağıdakilerin hepsi silent permissive outcome üretir:

- Git executable unavailable;
- non-Git project veya yanlış root;
- permission/repository corruption;
- maxBuffer/process failure;
- unexpected evaluator exception;
- unexpected resolution/application exception;
- other I/O/runtime exception within outer block.

`debugLog` owner-visible typed terminal state, approval request veya durable receipt değildir.

### 4.2 Gate'in success yolu gerçek blok üretir fakat security boundary değildir

`evaluateScopeGate()` pure I/O-free classifier'dır; caller tracked-file listesi verir
(`src/core/scope-gate.ts:1-17`, `:317-339`). Path'leri sırayla:

- tracked/planned dependency write ise `confirmed`;
- distinctive basename başka yerdeyse wrong-directory `suspect`;
- tracked parent altında yeni path ise `new-plausible`;
- established root altında bounded-depth yeni directory ise `new-plausible`;
- out-of-root/suspicious/deep/unbacked location ise `suspect`

olarak sınıflandırır (`src/core/scope-gate.ts:317-451`). Yalnız suspect WRITE paths block üretir;
suspect READ advisory'dir (`:453-527`).

Bu classifier:

- filesystem operation intercept etmez;
- child process/shell write'ını sınırlamaz;
- symlink/reparse/mount escape'i işlem anında önlemez;
- observed disk effects'i attempt'e atfetmez;
- persistent landing'i authorize etmez.

Dolayısıyla success path'te deterministik blok değerli bir plan-quality shield'dır; runtime write security
authority'si değildir.

### 4.3 Greenfield semantics doğru niyet taşır fakat evidence provenance gerektirir

Evaluator `trackedDirs.size === 0` olduğunda yanlış-dir signal'ının yapısal olarak bulunmadığını kabul eder ve
greenfield/root-only project için nested writes'i advisory `new-plausible` sayar
(`src/core/scope-gate.ts:358-366`, `:407-417`). Caller bunu console warning ve event olarak yayınlar
(`src/orchestra/sprint-controller.ts:1970-1984`).

Bu kullanıcı deneyimi için doğru bir ihtiyaçtır: gerçek boş veya yalnız root files içeren project'in ilk nested
file'ı otomatik typo sayılamaz. Ancak empty list ancak acquisition başarısı, project identity ve baseline state
ile birlikte anlamlıdır. `[]` tek başına greenfield, unavailable, wrong root veya unsupported adapter'ı ayıramaz.

### 4.4 RunFlow plan authority failure'ı tipler ve approval'ı kapatır

`run-flow-plan-service.ts` tracked-file acquisition'ı async process olarak yapar:

- spawn throw → `unavailable` (`src/orchestra/run-flow-plan-service.ts:286-305`);
- 10s timeout → child terminate + `unavailable` (`:307-314`);
- 64 MiB output overflow → terminate + `unavailable` (`:315-325`);
- child error/non-zero close → `unavailable` (`:327-331`);
- only exit `0` → `available` + parsed paths (`:333-336`).

Evidence unavailable ise exact plan:

- `scopeGateResult:'fail'` üretir (`src/orchestra/run-flow-plan-service.ts:675-680`);
- preview `gateResult:'fail'` ve `policyDecision:'deny'` olur (`:811-833`);
- durable plan/preview kaydedilebilir, fakat approval `SCOPE_GATE_HOLD` ile reddedilir
  (`:858-869`, `:466-485`).

Negative test unavailable tracked-file evidence'ın explicit HOLD olarak persist edildiğini ve approval'ın hiç
yazılmadığını doğrular (`tests/orchestra/run-flow-plan-service.test.ts:427-438`).

Bu path mevcut doğru fail-closed foundation'dır.

### 4.5 RunFlow evidence'i source authority hash'ine bağlar

`buildSourceAuthority()` planning content, config, proposal, context, recommendation, preview options,
acknowledgement, scope input, lineage ve projection adoption facts'ini canonical hash'e dahil eder
(`src/orchestra/run-flow-plan-service.ts:207-244`). `scopeInputSha256` ayrıca ayrı field olarak tutulur ve durable
record reuse'da equality check edilir (`:247-258`).

Bu, aynı flow/revision altında farklı inventory ile sessiz plan reuse riskini azaltır. Eksik facets:

- stable project/workspace/repository identity;
- VCS root/subproject binding;
- baseline revision/tree identity;
- adapter/probe/version/assurance;
- acquired-at/TTL;
- relevant path subset/coverage;
- stale/drifted/freeze semantics;
- remote workspace identity.

Target authority bu foundation'ı değiştirmek yerine genişletmelidir.

### 4.6 Exact start immutable plan tüketse de legacy runtime gate'i yeniden çağırır

Exact `deckent start --flow-id --revision --plan-digest` approved snapshot'ı yükler, flow/digest/attempt/process
capability'yi doğrular ve replanning yapmadan `runSprint()`'e `preplannedSprint` + `exactPlanAuthority` ile girer
(`src/cli/commands/start.ts:408-469`, `:471-535`, `:589-617`).

Bu branch plan scope'unu genişletmez; RunFlow plan-time evidence daha önce fail-closed alınmıştır. Yine de
`runSprint()` içindeki legacy Git acquisition tekrar çalışır. Git success ise immutable task scope latest
tracked-file list'e karşı classify edilir; Git failure ise revalidation skip edilir
(`src/orchestra/sprint-controller.ts:1910-1989`).

Problem iki katmanlıdır:

1. exact approved plan için runtime ad-hoc heuristic ikinci bir authority gibi davranır;
2. repository scope-relevant drift veya evidence expiry typed policy olarak değil incidental Git success/failure
   üzerinden belirlenir.

Target exact start, scope gate'i tekrar local olarak yorumlamamalı; approved ProjectInventoryEvidence +
ExecutionAdmission revalidation kararı tüketmelidir.

### 4.7 Legacy direct start path hâlâ canlıdır

Flow flags yoksa CLI start legacy branch'te provider/bootstrap sonrası doğrudan `runSprint()` çağırır
(`src/cli/commands/start.ts:983-1024`). `--force-scope` caller boolean olarak `acknowledgeScopePaths` alanına
aktarılır (`:1007-1010`). Resume, MCP legacy start, test-run ve sprint runner entry de farklı koşullarda
`runSprint()` caller'larıdır.

RunFlow fail-closed foundation var diye legacy fail-open gap'i kapanmış sayılamaz. Surface cutover tamamlanmadan
iki farklı scope/evidence authority birlikte yaşamaktadır.

### 4.8 Blanket scope override legacy authority değildir

Legacy `RunSprintOptions.acknowledgeScopePaths` boolean'ı suspect write paths'in tamamını geçirir
(`src/orchestra/sprint-controller.ts:698-708`, `src/core/scope-gate.ts:507-526`). Principal, exact suspect list,
inventory digest, justification, TTL veya policy revision field'ları bu local decision'da yoktur.

RunFlow daha güçlüdür:

- acknowledgement planning input hash'ine girer;
- scope evidence aynı source authority'ye bağlanır;
- overridden plan approval'ında `acknowledgeScopePaths:true` yeniden şart koşulur
  (`src/orchestra/run-flow-plan-service.ts:475-485`).

Yine de target contract blanket boolean yerine exact suspect set + evidence digest + principal + justification
receipt'i taşımalıdır.

### 4.9 Dynamic FIX/debt scope path'i bilinçli fail-open/advisory'dir

`debt-manager.ts:regateInheritedScope()` mid-sprint fix task'in inherited write scope'unu `git ls-files` ile
yeniden classify eder. Tasarım comment'i unresolved suspect'in cascade'i hard-fail etmemesini ister
(`src/orchestra/debt-manager.ts:35-43`). Behavior:

- Git non-zero/non-string → inherited scope unchanged (`:47-50`);
- gate her zaman `acknowledgeScopePaths:true` ile çalışır (`:51-56`);
- yalnız provable resolution varsa scope değişir (`:57-65`);
- exception → inherited scope unchanged (`:66-67`).

Akışın tamamını bir repair yüzünden kesmemek doğru product ihtiyacıdır; fakat silent inherited authority doğru
çözüm değildir. Repair task ayrı Attempt/Capability revision'dır. Evidence unavailable ise parent/unrelated work
devam edebilir, exact repair candidate typed HOLD'da beklemelidir.

### 4.10 Prompt/scope lint coverage de Git'e dağınık bağlıdır

Sprint planner plan-time prompt gate için ayrı `git ls-files` çağrısı yapar; comment bunu fail-soft olarak
tanımlar ve failure'da scope lints'i skip eder (`src/orchestra/sprint-planner.ts:916-939`). Planner normalization
başka bir `git ls-files` call'ını best-effort kullanır (`src/orchestra/planner.ts:1545-1559`). Task builder,
prompt rendering ve başka consumers da tracked-file snapshot'ı kendi yollarından acquire/optional işler.

Bu mekanizmaların hepsi hard security gate olmak zorunda değildir; sorun aynı project truth'un farklı callers
tarafından farklı zaman, root, timeout, failure ve empty semantics ile yeniden üretilmesidir. Tek Project
Inventory Authority bütün consumers'a same snapshot/provenance sağlamalıdır.

### 4.11 Legacy auto-resolution disk/plan divergence yaratabilir

Legacy gate provable suggestions bulursa sprint task scope'unu memory'de değiştirir, sonra task JSON'ı yazmaya
çalışır (`src/orchestra/sprint-controller.ts:1945-1956`). `writeFileSync` failure yalnız debug log olur ve execution
memory'deki resolved scope ile devam eder (`:1957`). Event/console emission de best-effort'tur (`:1961-1967`).

Sonuç:

- in-memory execution task;
- `.tasks/task-*.json` artifact;
- approval/preview bytes;
- later recovery/audit reader

farklı scope görebilir. Exact plans `resolveSuggestions:false` ile spawn-time mutation'ı engeller; RunFlow
resolution'ı digest'ten önce uygular ve idempotent revalidation yapar
(`src/orchestra/run-flow-plan-service.ts:681-725`). Target bütün production yollarını bu modele cut over etmelidir.

## 5. Risk sınıflandırması

### 5.1 OWASP mapping

| ASI | Bağlantı |
|---|---|
| ASI01 Agent Goal Hijack | Poisoned planning content worker scope'unu yanlış path/target'a yönlendirebilir |
| ASI02 Tool Misuse | Tool/write operation'ı doğrulanmamış resource path üzerinde kullanılır |
| ASI05 Unexpected Code Execution | Wrong path, executable config veya script creation sonraki execution'a dönüşebilir |
| ASI08 Cascading Failures | Yanlış scope dynamic FIX/debt descendants'a miras kalabilir |
| ASI09 Human-Agent Trust | Scope gate “geçti/çalıştı” algısı evidence failure skip'ini gizler |
| ASI10 Rogue Agents | Agent beyanı/meşru task görünümü structural effect enforcement yokluğunu örtebilir |

### 5.2 Olasılık × etki

- **Legacy Git unavailable/non-Git:** olasılık yüksek; Every Environment kullanımında olağan durum.
- **Adversarial Git failure tetikleme:** olasılık orta/düşük; project/PATH/repository state authority'ye göre değişir.
- **Wrong-path creation:** olasılık orta-yüksek; mechanism tarihsel olarak gerçek orphan-file vakasından doğmuştur.
- **Security-impacting host write:** etki yüksek; current provider-neutral containment closure açık olduğu için
  scope signal kaybı başka zayıflıklarla birleşir.
- **Exact RunFlow path:** risk daha düşük; plan-time fail-closed evidence/digest vardır.
- **Dynamic repair cascade:** olasılık orta; impact lineage boyunca büyüyebilir.

Overall current strength: **ORTA-ZAYIF**. RunFlow foundation güçlüdür; legacy/direct/dynamic paths ve real effect
enforcement closure'ı açık kalır.

## 6. Threat model

### 6.1 Korunan varlıklar

- project/repository/workspace identity;
- approved plan ve task scope bytes;
- source, test, config, CI, hooks, agent/provider ve execution-capable files;
- `.tasks`, `.brain`, auth/provider state ve owner instructions;
- project dışı host paths, home, system, sibling projects;
- dynamic repair lineage;
- approval ve landing integrity;
- operator'ın scope preview/gate sonucuna duyduğu güven;
- training/evaluation effect evidence.

### 6.2 Adversary ve failure sınıfları

1. malicious/poisoned planning content yanlış write path üretir;
2. compromised worker/provider scope dışına çıkmaya çalışır;
3. project content/config repository evidence acquisition'ı bozar;
4. environment Git içermez veya başka VCS kullanır;
5. project root parent/nested repository ile yanlış bind olur;
6. Git repository corrupt, permission-restricted, huge veya slow'dur;
7. plan approval sonrası repository drift oluşur;
8. dynamic repair inherited scope'u genişletir/yanlış taşır;
9. caller blanket override ile bütün suspects'i geçirir;
10. recovery stale task artifact'ını in-memory plan authority sanır;
11. remote workspace inventory ile execution target identity ayrışır;
12. concurrent plan/start/update aynı baseline üzerinde race oluşturur.

### 6.3 Abuse-case matrisi

| Vektör | Bugünkü sonuç | Target sonuç |
|---|---|---|
| `git` bulunamıyor | Legacy scope gate skip | Supported adapter veya typed UNAVAILABLE/HOLD |
| Non-Git project | Legacy devam; RunFlow HOLD | Filesystem/other-VCS adapter + explicit assurance profile |
| Empty real project | Greenfield advisory | Typed EMPTY_BASELINE + owner/project policy |
| Wrong project/VCS root | Caller output'u gerçek sanabilir | ProjectRoot↔RepositoryRoot binding verify/HOLD |
| Git timeout/maxBuffer | Legacy skip; RunFlow unavailable | Typed evidence failure, retry/backpressure, no silent skip |
| Poisoned wrong path | Gate varsa block/suggest; yoksa spawn | Admission decision + structural write containment |
| Blanket `--force-scope` | Bütün suspects geçer | Exact path/evidence/principal/TTL acknowledgement |
| Approval sonrası drift | Incidental runtime recheck veya skip | Drift decision + replan/reapproval/HOLD |
| Dynamic FIX wrong scope | Unchanged inherited scope ile devam | Repair candidate HOLD; parent/unrelated flow devam |
| Resolution persist failure | Memory/disk divergence | Atomic durable plan before approval |
| Shell/provider bypass | Scope gate görmez | Tool Gateway/ExecutionAdapter/Effect/Landing enforcement |

## 7. Kabul edilen güvenlik invariant'ları

1. **No silent unknown.** Evidence absence hiçbir zaman empty/greenfield/pass olarak yorumlanmaz.
2. **Identity before inventory.** Project/workspace/repository root identity doğrulanmadan path listesi authority
   değildir.
3. **One snapshot, many consumers.** Aynı plan/revision için planner, prompt, scope, approval, execution ve audit
   aynı inventory evidence reference'ını tüketir.
4. **Plan-bound evidence.** Inventory digest/provenance ve scope decision approved plan digest'ine bağlıdır.
5. **No post-approval mutation.** Scope resolution/normalization approval sonrası task bytes'ını değiştiremez.
6. **Drift is typed.** Plan sonrası relevant drift silent reuse veya incidental skip değildir.
7. **Classifier is not containment.** Scope heuristic security sandbox/landing authority claim etmez.
8. **Effect enforcement independent.** Untrusted worker/provider yalnız granted environment/resource üzerinde
   effect üretebilir.
9. **Override narrows; never blankets.** Acknowledgement exact suspects/snapshot/principal/TTL'ye bağlıdır.
10. **Repair is new authority.** FIX/debt descendant inherited scope'u automatic execution grant saymaz.
11. **Every Environment.** Git olmayan destekli ortam adapter ile çalışır; unsupported state dürüst HOLD'dur.
12. **No second policy engine.** Surface/planner/worker local scope policy üretmez.
13. **Recovery respects generation.** Stale snapshot/task artifact current authority olmaz.
14. **Audit separates facts.** Requested, resolved, acknowledged, attempted, observed ve landed scope ayrı facts'tir.

## 8. Target Project Inventory Authority

### 8.1 Sorumluluk

Project Inventory Authority şunları canonical olarak çözer:

- Deckent project identity;
- workspace root;
- source/repository root;
- subproject/module boundary;
- VCS/filesystem/remote adapter;
- baseline revision/tree/filesystem generation;
- normalized path inventory;
- inventory digest ve coverage;
- empty/non-empty truth;
- provenance/assurance;
- acquired-at, TTL ve refresh policy;
- drift comparison;
- unavailable/unsupported diagnostics;
- tenant/project/execution-target binding.

Bu authority scope policy kararı üretmek zorunda değildir; güvenilir facts/evidence üretir. Scope Admission
Authority bu evidence'i tüketir.

### 8.2 Typed evidence states

| State | Anlam | Default action |
|---|---|---|
| `AVAILABLE` | Identity-bound inventory başarıyla alındı | Policy evaluate |
| `EMPTY_BASELINE` | Desteklenen adapter başarıyla gerçek empty project kanıtladı | Greenfield policy evaluate |
| `NOT_REQUIRED` | Operation declared paths/effects için inventory gerektirmiyor | Operation policy decide |
| `UNSUPPORTED` | Environment/project type için declared adapter yok | Honest capability HOLD/disabled |
| `UNAVAILABLE` | Supported adapter transient/permanent acquisition failure | Retry veya HOLD; no pass |
| `STALE` | Snapshot TTL/policy süresi doldu | Refresh/revalidate before effect |
| `DRIFTED` | Scope-relevant baseline approved snapshot'tan değişti | Replan/reapproval/HOLD |
| `CONFLICT` | Project/repo/remote identity veya multiple roots çelişiyor | Fail-closed HOLD |

Status ve path array ayrı taşınır. Empty array yalnız `EMPTY_BASELINE` veya coverage-specified `AVAILABLE`
altında anlamlıdır.

### 8.3 Evidence facts

Minimum semantic contract:

- schema/version;
- evidence ID/digest;
- tenant/project/workspace IDs;
- project root canonical identity;
- adapter kind/version;
- repository/VCS root identity;
- baseline revision/tree/generation;
- normalized entries ve entry kinds;
- included/excluded/ignored coverage policy;
- case-sensitivity/path-normalization semantics;
- symlink/reparse/mount knowledge;
- acquired-at/expires-at;
- source process/probe/result metadata;
- assurance level;
- status/reason/retryability;
- remote execution target binding;
- prior evidence/drift reference.

Raw Git stdout doğrudan authority object'i değildir; adapter parse/validate/normalize/provenance üretmelidir.

### 8.4 Project/repository root binding

Git adapter yalnız `git ls-files` exit status'ına güvenmemelidir. En az:

- actual Git top-level root;
- declared Deckent project root;
- nested/submodule/worktree relation;
- repository identity;
- current revision/tree/index state;
- safe-directory/ownership condition;
- path output root semantics

doğrulanmalıdır. Parent repository içinde nested project, submodule, worktree, sparse checkout ve case-folding
durumları explicit tiplenecek; path'ler yanlış root'a göre normalize edilmeyecektir.

### 8.5 Adapter ailesi

#### Git adapter

- tracked/index/tree/worktree identities ayrılır;
- submodule/worktree/sparse/ignored semantics görünürdür;
- status/error/timeout/output-limit typed olur;
- executable/path provenance ve version evidence taşır;
- hooks çalıştırmadan read-only plumbing tercih edilir;
- malicious filenames/NUL/newline/case normalization güvenli parse edilir.

#### Filesystem/project-manifest adapter

- non-Git local projects için bounded inventory;
- ignore/exclude policy explicit;
- symlink/reparse/mount handling;
- stable root identity;
- scale/backpressure;
- snapshot/drift generation;
- weak/strong assurance class.

#### Other-VCS adapter

Mercurial, Perforce, SVN ve future systems tek project-inventory contractına map edilir; unsupported adapter Git
fallback yapmaz.

#### Remote workspace adapter

Container/pod/SSH/remote IDE/workspace inventory execution target'tan signed/fenced evidence olarak gelir;
local checkout inventory remote target için authority sayılmaz.

### 8.6 Acquisition service

- async/cancellable;
- bounded timeout/output/memory;
- per-project/tenant backpressure;
- idempotent cache by identity/revision/policy;
- TTL ve invalidation;
- concurrent request dedupe;
- no event-loop-blocking `spawnSync` in canonical path;
- structured diagnostics;
- no raw secret/path dump beyond policy;
- adapter outage isolation;
- immutable evidence artifact.

## 9. Target Scope Admission Authority

### 9.1 Scope request

Scope decision en az şu inputs'i bağlar:

- verified principal/actor;
- tenant/project/workspace;
- proposal/flow/revision/task;
- operation/effect class;
- requested filesRead/filesWrite/directories/patterns;
- project inventory evidence ref/digest;
- execution environment/capability profile;
- protected resource classifications;
- prior decisions/acknowledgements;
- policy version;
- source/content provenance;
- intended landing target.

### 9.2 Scope decision

Decision:

- `ALLOW`, `DENY`, `HOLD`, `NOT_REQUIRED`;
- resolved/normalized paths;
- suspects/advisories/resolutions;
- required acknowledgement/approval;
- evidence refs/digests;
- capability ceiling;
- expiry/revalidation condition;
- reason codes;
- audit/receipt lineage

taşımalıdır.

### 9.3 Heuristic classifier disposition

`evaluateScopeGate()` içindeki basename, tracked parent, new-directory depth ve greenfield heuristics değerli
signal primitives'tir. Target:

- pure/deterministic kalır;
- input evidence type/provenance dışarıdan gelir;
- result `ScopeClassificationReport` olur;
- tek başına capability/landing grant vermez;
- policy decision'a input olur;
- false-positive/false-negative corpus ve version taşır;
- common basename/test mirror exceptions policy/version evidence'ına bağlıdır.

### 9.4 Operation/effect-aware failure matrix

Evidence unavailable olduğunda her şey aynı şekilde bloklanmaz:

| Operation/effect | Evidence unavailable | Gerekçe |
|---|---|---|
| Read-only metadata, no project path dependency | Policy ile `NOT_REQUIRED` olabilir | Evidence karar için gerekmiyor |
| Project file read | Alternative identity-bound filesystem evidence gerekir | Data boundary |
| Persistent write, no containment | `HOLD` | Scope/effect uncontrolled |
| Persistent write, strong staging containment | Attempt staging'e admit edilebilir; landing HOLD | Flow sürer, canonical state korunur |
| Protected config/runtime mutation | `HOLD` + approval | High impact |
| Dynamic repair candidate | Repair `HOLD`; unrelated run devam | Cascading failure containment |
| Empty/greenfield supported baseline | Greenfield policy/approval | Legitimate first creation |
| Unsupported platform/adapter | Honest unsupported/HOLD | No silent host fallback |

Bu model owner'ın “akışı bloklamama” ilkesini security fail-open'a çevirmeden uygular: bütün run değil yalnız
evidence-dependent effect/landing durur.

## 10. Exact acknowledgement ve override

### 10.1 Blanket boolean emekli edilir

Acknowledgement/approval minimum şu controlled facts'e bağlıdır:

- actor principal ve assurance;
- tenant/project;
- flow/revision/plan digest;
- inventory evidence digest/revision;
- exact suspect path IDs/normalized paths;
- classifier reason/suggestions;
- requested operation/effect;
- execution/landing profile;
- justification;
- policy revision;
- issued/expiry;
- nonce/CAS/fence;
- revoke status.

### 10.2 Acknowledgement ne yapar?

Owner “bu path yeni ve bilinçli” diyebilir; acknowledgement:

- typo heuristic'ini override eder;
- path'i otomatik protected/unbounded capability yapmaz;
- filesystem containment'ı genişletmez;
- project/tenant boundary'yi aşmaz;
- landing approval'ını otomatik vermez;
- başka task/path/version'a taşınmaz;
- evidence drift sonrası geçerli kalmaz.

### 10.3 RunFlow foundation

RunFlow'un acknowledgement'ı planning hash ve approval re-check'e bağlaması korunur. Target exact suspect set ve
decision receipt'i ekler. CLI/MCP/API/Desktop yalnız aynı application service'e typed intent/decision iletir;
wrapper boolean kendi başına authority olmaz.

## 11. Plan, approval ve spawn revalidation

### 11.1 Plan-time

1. Project identity çözülür.
2. Inventory evidence acquire edilir.
3. Scope classification/policy decision üretilir.
4. Deterministic resolutions plan bytes'ına approval'dan önce uygulanır.
5. Revalidation idempotent olmalıdır.
6. Evidence/decision refs plan digest'e bağlanır.
7. Durable plan/preview/receipt publish edilir.
8. Required owner decision exact proposal'a uygulanır.

### 11.2 Approval sonrası

- Task scope veya resolution sessiz değişmez.
- Approval yeni inventory/path/task bytes'ına taşınmaz.
- Persist failure planı approved göstermez.
- Disk artifact yalnız canonical projection'dır; durable plan authority kazanmaz.

### 11.3 Spawn-time Execution Admission

Spawn service şu facts'i doğrular:

- approved plan/revision/digest;
- evidence identity/revision/TTL;
- project/repository/execution-target identity;
- scope-relevant drift policy;
- capability/containment availability;
- approval/acknowledgement validity;
- fence/generation;
- budget/provider/monitoring admission.

Ad-hoc `git ls-files` call + local catch bu authority'nin yerini alamaz.

### 11.4 Drift classes

| Drift | Örnek | Karar |
|---|---|---|
| Irrelevant | Scope dışı doc/metadata change | Policy ile allow + receipt olabilir |
| Scope-relevant tracked path | Target moved/deleted/renamed | Reclassify + replan/reapproval/HOLD |
| Protected resource | CI/hook/provider/config changed | Mandatory HOLD + protected mutation authority |
| Inventory identity | Repo/root/worktree/remote target changed | Conflict/HOLD |
| New untracked path | Planned target collision/overwrite riski | Reclassify/effect policy |
| Adapter/policy version | Semantics changed | Evidence refresh + decision revision |

Drift policy explicit ve versioned olmalı; “Git command bu sefer çalıştı/çalışmadı” drift kararı değildir.

## 12. Dynamic FIX/debt repair authority

### 12.1 Problem

Bugünkü repair re-gate flow'u parent scope'u inherited facts olarak alır ve akışı kesmemek için her suspect'i
acknowledge eder. Bu, yanlış parent scope'un descendants boyunca yayılmasına neden olabilir.

### 12.2 Target model

Her repair candidate:

- parent logical task/attempt/decision refs;
- exact causal failure;
- requested scope delta;
- fresh inventory evidence;
- new capability ceiling;
- collision/dependency analysis;
- approval requirement;
- repair revision/generation;
- expected effect/landing contract

taşır.

### 12.3 Akış-engellemeyen fail-closed

Evidence unavailable veya scope unresolved ise:

- parent attempt sonucu kaybolmaz;
- unrelated ready tasks/repairs devam eder;
- exact repair candidate `SCOPE_EVIDENCE_HOLD` olur;
- capacity başka admitted work ile doldurulabilir;
- evidence refresh/policy/owner decision sonrası same candidate generation-safe devam eder;
- blanket inherited authority verilmez.

### 12.4 Repair scope widening

Repair parent capability'yi otomatik genişletemez. Yeni file/directory/tool/protected mutation:

- explicit delta;
- policy decision;
- gerekiyorsa owner approval;
- new attempt/capability revision;
- causal receipt

gerektirir.

## 13. Execution, effect ve landing separation

### 13.1 Üç farklı soru

1. **Scope Admission:** Planlanan path mantıklı/izinli mi?
2. **Execution Capability:** Worker hangi resource üzerinde hangi operation'ı gerçekten yapabilir?
3. **Effect/Landing:** Ne değişti, kime ait, canonical state'e alınabilir mi?

Bu sorular tek `scope gate` boolean'ında birleşemez.

### 13.2 Accepted Bulgu 4 dependency

Provider-neutral execution authority:

- closed tool/resource grants;
- sandbox/staging/worktree/overlay;
- filesystem/network/process/secret containment;
- provider parity;
- child process policy;
- exact execution environment identity

sağlamalıdır. Scope classifier failure ambient host write'a dönüşemez.

### 13.3 Accepted Bulgu 5 dependency

Attempt Effect Authority:

- baseline/attempt effect discovery;
- tracked/untracked/deleted/moved/metadata changes;
- attribution;
- protected classification;
- landing decision;
- conflict/CAS;
- receipt/settlement

sağlamalıdır. Planlanan scope ile actual effect ayrı evidence'tır.

### 13.4 Landing rule

Inventory/scope evidence unavailable iken strong staging altında çalışma policy ile mümkün olsa bile persistent
landing:

- actual effect manifest;
- current target baseline;
- capability/approval;
- conflict/drift check;
- protected-resource policy;
- owner/tenant/project identity

olmadan gerçekleşemez.

## 14. Failure semantics

| Failure | Enforce behavior |
|---|---|
| Project identity unresolved | Typed HOLD; synthetic cwd/root yok |
| Adapter unavailable | Retry/HOLD/unsupported; Git fallback zorlanmaz |
| Git executable missing | Other adapter policy; yoksa typed unsupported/HOLD |
| Git non-zero/corrupt/permission | Typed unavailable; no empty/pass |
| Timeout/output limit | Typed resource failure + retry/backpressure; no skip |
| Empty successful inventory | Explicit EMPTY_BASELINE, not unavailable |
| Evaluator throw | Decision unavailable/HOLD; no spawn bypass |
| Resolution persistence failure | Plan not approvable; no memory/disk split |
| Evidence TTL expired | Refresh before admission/landing |
| Scope-relevant drift | New decision/reapproval/HOLD |
| Auth/approval store unavailable | Required override/landing HOLD |
| Containment unavailable | Persistent write attempt HOLD |
| Audit sink unavailable | Risk/profile policy; no silent high-risk write |
| Remote target mismatch | Conflict/HOLD; local evidence not substituted |
| Dynamic repair evidence unavailable | Repair HOLD; unrelated work continues |

## 15. Config ve rollout authority

### 15.1 Logical config domains

Target effective config en az şu semantics'i çözmelidir:

- project inventory adapter selection/order;
- allowed/fallback adapters;
- evidence timeout/output/memory/cache/TTL;
- project root/subproject identity rules;
- greenfield policy;
- non-Git policy;
- scope classifier/policy version;
- acknowledgement/approval tiers;
- drift sensitivity;
- execution/landing behavior by evidence state;
- dynamic repair HOLD/continuation policy;
- observe/shadow/enforce mode;
- audit/redaction/retention;
- platform unsupported behavior.

Exact key/schema names implementation session'da existing config authority üzerinden kararlaştırılmalıdır; bu
belge ikinci config SSOT'si değildir.

### 15.2 Observe → shadow → enforce

1. **Inventory:** bütün direct Git calls, roots, callers, failure/empty semantics çıkarılır.
2. **Observe:** shared authority evidence üretir; legacy decisions değişmez; drift/failure metrics görünür olur.
3. **Shadow:** legacy vs canonical classification/decision karşılaştırılır; no raw path/secret overcollection.
4. **Exact RunFlow enforce:** mevcut fail-closed path new authority evidence'ına cut over edilir.
5. **Legacy ingress migration:** direct start/resume/MCP legacy paths canonical plan/admission service'e alınır.
6. **Repair enforce:** dynamic candidates capability revision/HOLD semantics'e geçer.
7. **Runtime duplicate retire:** sprint-controller ad-hoc Git scope block'u kaldırılır; Execution Admission tüketilir.
8. **Old wrappers retire:** blanket booleans ve duplicate reads no-caller proof ile kaldırılır.

Rollout sırasında unsupported/non-Git users silent allow veya generic fatal crash yaşamamalı; typed diagnosis,
adapter install/config/recovery veya managed staging alternative'i görmelidir.

## 16. Observability ve operator UX

### 16.1 Preview

Operator'a kısa fakat dürüst facts gösterilir:

- project/workspace/repository identity;
- adapter ve assurance;
- baseline revision/generation;
- evidence freshness;
- confirmed/new/suspect/unresolved counts;
- exact suspect paths/suggestions;
- greenfield/non-Git/unsupported state;
- required acknowledgement/approval;
- containment/landing consequence;
- drift/replan requirement.

### 16.2 Terminal states

Typed states/reasons örnek semantics:

- `PROJECT_IDENTITY_HOLD`;
- `PROJECT_INVENTORY_UNAVAILABLE`;
- `PROJECT_INVENTORY_UNSUPPORTED`;
- `EMPTY_BASELINE_REVIEW`;
- `SCOPE_SUSPECT_HOLD`;
- `SCOPE_ACK_REQUIRED`;
- `SCOPE_EVIDENCE_STALE`;
- `SCOPE_RELEVANT_DRIFT`;
- `REPAIR_SCOPE_HOLD`;
- `LANDING_SCOPE_HOLD`.

User “neden durdu, ne devam ediyor, hangi evidence eksik, nasıl güvenli çözülür” sorularını log kazmadan
cevaplayabilmelidir.

### 16.3 Metrics

- evidence acquisition success/empty/unavailable/unsupported/stale/drift by adapter/platform;
- latency/output/cache hit/backpressure;
- scope confirmed/new/suspect/resolved/acknowledged counts;
- legacy/canonical decision drift;
- repairs held vs unrelated continuation;
- override frequency/scope/expiry;
- containment/landing blocks after scope allow;
- false-positive/false-negative corpus outcomes;
- project/root identity conflicts;
- operator recovery success.

Metrics high-cardinality raw paths veya tenant secrets taşımamalıdır.

## 17. Storage, tenancy ve scale

### 17.1 Evidence storage

- content-addressed immutable snapshot/manifest refs;
- tenant/project/root/adapter/revision indexes;
- bounded retention;
- digest/provenance;
- current pointer CAS/fence;
- no path collision across tenants/projects;
- stale/current distinction;
- crash-safe publish;
- orphan cleanup authority.

### 17.2 Multi-tenant isolation

- tenant-A inventory tenant-B planında kullanılamaz;
- same repository path farklı tenants/targets için ayrı identity taşır;
- remote credential/adapter lease tenant-bound'dır;
- cache key raw cwd değildir;
- list/read/refresh/revoke operations capability-controlled'dür;
- audit actor/target tenant ayrıdır;
- noisy tenant inventory crawl başka tenants'i starve etmez.

### 17.3 Million-scale

- full path list her request'te hash/serialize edilmez; manifest/tree/chunked evidence;
- incremental refresh ve revision reuse;
- bounded memory/backpressure;
- concurrent request dedupe;
- large monorepo/subproject filtered views;
- adapter pool/capacity policy;
- TTL jitter/stampede control;
- cancellation;
- deterministic normalization;
- no synchronous event-loop block;
- observability cardinality controls.

## 18. Every Environment proof matrix

| Environment/project | Required proof |
|---|---|
| Linux Git | Root/worktree/submodule/sparse/empty/corrupt/timeout/large inventory |
| macOS Git | Case sensitivity, symlink/path normalization, worktree/root identity |
| Windows native Git | Drive/UNC/case/reparse/path separators, Git absence, process timeout |
| WSL | Windows↔Linux path/root/repository identity, mounted workspace semantics |
| Non-Git local | Filesystem/project-manifest adapter, empty/large/symlink/ignore behavior |
| Mercurial/SVN/Perforce | Declared adapter or honest unsupported; no Git assumption |
| OCI/container | Host checkout vs container mount identity, overlay/generation |
| Kubernetes | Pod/workspace/service account/remote inventory binding |
| SSH remote | Host identity, cwd/repository revision, reconnect/drift/fence |
| Monorepo/subproject | Parent repo vs exact project root filtered manifest |
| Network filesystem | Stale/cache/identity/rename consistency |

Unsupported state test skip veya empty snapshot olarak raporlanamaz; typed evidence artifact üretmelidir.

## 19. Workstream/DAG handoff

Bu sıralama task ID değildir. Implementation session canonical ledger state/dependencies/evidence'ını fresh okuyup
Goal/Mission/Flow DAG'ına dönüştürmelidir. Her foundation workstream exact consumer/cutover/retire closure'a
dependency-bound olmalıdır.

### W1 — Fresh reachability ve behavior inventory

- bütün `git ls-files/status/diff` callers;
- sync/async/root/timeout/buffer/parsing;
- available/empty/error semantics;
- planner/prompt/task-builder/sprint/debt/RunFlow/start/resume/MCP/API/Desktop consumers;
- config/override paths;
- current tests/docs/ADR/ledger claims;
- actual canonical vs legacy ingress usage.

**Exit:** producer→consumer→decision→effect graph ve disposition registry.

### W2 — Project identity ve inventory contracts

- typed evidence states;
- project/workspace/repository/remote target identity;
- manifest/digest/revision/TTL/assurance;
- adapter interface;
- error/retry taxonomy;
- tenancy/storage/redaction;
- scale/backpressure.

**Closure dependency:** W3 Git + at least one non-Git/unsupported adapter consumer.

### W3 — Git ve baseline adapter

- root binding;
- worktree/submodule/sparse/empty semantics;
- safe process execution;
- NUL/path normalization;
- timeout/output/cancellation;
- corruption/permission/Git-absent typed failures;
- manifest generation/digest;
- cross-platform proof.

### W4 — Non-Git/filesystem/remote adapters

- local filesystem/project manifest;
- declared other-VCS capability/unsupported;
- container/remote target binding;
- Every Environment honest behavior;
- weak/strong assurance policy.

### W5 — Scope Admission Authority

- request/decision/reason contracts;
- current classifier signal adapter;
- operation/effect-aware failure matrix;
- exact acknowledgement receipts;
- protected resource integration;
- audit/metrics/UI semantics.

**Closure dependency:** W6 RunFlow production ingress.

### W6 — RunFlow plan/approval cutover

- canonical inventory acquisition;
- scope decision before final digest;
- resolution idempotency/atomic persistence;
- evidence/decision digest binding;
- approval exact acknowledgement;
- preview/HOLD/recovery;
- API/MCP/native/Do parity.

### W7 — Execution Admission ve drift

- snapshot TTL/revision;
- scope-relevant drift classifier;
- start-time project/target identity revalidation;
- replan/reapproval/HOLD;
- attempt fence/generation;
- no ad-hoc runtime Git policy.

### W8 — Dynamic repair authority

- repair scope delta;
- fresh evidence/decision;
- parent ceiling;
- exact repair HOLD;
- unrelated continuation/refill;
- new attempt/capability/approval lineage;
- cascade/recovery proof.

### W9 — Execution/effect/landing integration

- Bulgu 4 containment/Tool Gateway;
- Bulgu 5 effect manifest/attribution/landing;
- staging-continue/landing-HOLD semantics;
- protected mutation;
- audit/receipt causal closure.

### W10 — Legacy cutover ve retirement

- direct start/resume/sprint runner ingress migration;
- planner/task-builder duplicate reads;
- sprint-controller fail-open block;
- debt-manager blanket acknowledgement;
- legacy post-plan resolution;
- wrapper booleans;
- no-caller/no-duplicate proof.

### W11 — Assurance, docs ve governance

- adversarial corpus;
- Every Environment real-binary matrix;
- scale/race/crash/outage;
- ledger evidence/dependencies/state;
- docs/ADR/reference truth reconciliation;
- assurance pack;
- fresh different-provider XVerify veya typed HOLD.

## 20. Acceptance checklist

### 20.1 Project identity ve evidence

- [ ] Project/workspace/repository/execution-target identities ayrı ve bound'dur.
- [ ] Wrong root/parent repo/subproject conflict fail-closed HOLD üretir.
- [ ] Evidence state enum available/empty/not-required/unsupported/unavailable/stale/drifted/conflict ayrımını taşır.
- [ ] Empty array tek başına greenfield/pass değildir.
- [ ] Inventory adapter/version/revision/digest/acquired/expiry/assurance taşır.
- [ ] Evidence tenant/project/target scoped'dur.
- [ ] Git absent/corrupt/permission/timeout/output-limit ayrı typed reasons üretir.
- [ ] Raw Git stdout authority değildir; normalized immutable manifest vardır.
- [ ] Concurrent acquisition dedupe/cancel/backpressure taşır.
- [ ] Large repo bounded memory ve incremental behavior taşır.

### 20.2 Git ve non-Git adapters

- [ ] Git top-level root declared project root ile doğrulanır.
- [ ] Worktree/submodule/sparse/empty/index/tree semantics explicit'tir.
- [ ] Malicious filenames/newline/case/path separator güvenli parse edilir.
- [ ] Git process hooks/interactive prompts/credential mutation tetiklemez.
- [ ] Non-Git local project supported adapter veya honest unsupported alır.
- [ ] Filesystem adapter symlink/reparse/mount/ignore/scale semantics taşır.
- [ ] Remote inventory exact execution target identity'ye bağlıdır.
- [ ] Local inventory remote target için substitute olmaz.
- [ ] Unsupported adapter host/Git fallback yapmaz.
- [ ] Linux/macOS/Windows native/WSL/OCI/remote real evidence vardır.

### 20.3 Scope decision

- [ ] `evaluateScopeGate` signal olarak kalır; capability/landing grant değildir.
- [ ] Scope request principal/tenant/project/flow/task/operation/effect/policy/evidence bağlar.
- [ ] Decision allow/deny/HOLD/not-required + reasons + evidence refs taşır.
- [ ] Suspect READ advisory semantics policy/version-controlled'dür.
- [ ] New-plausible path structural write scope'u otomatik genişletmez.
- [ ] Greenfield yalnız explicit EMPTY_BASELINE evidence ile uygulanır.
- [ ] Evidence unavailable evaluator'ı sessiz skip etmez.
- [ ] Evaluator throw typed HOLD üretir.
- [ ] Scope report false-positive/false-negative corpus/version taşır.

### 20.4 Plan, resolution ve approval

- [ ] Inventory/scope decision final plan digest'ine bağlıdır.
- [ ] Deterministic resolutions approval'dan önce uygulanır.
- [ ] Resolution revalidation idempotent'tir.
- [ ] Persist failure planı approvable/approved bırakmaz.
- [ ] Approval sonrası task/scope mutation yoktur.
- [ ] Acknowledgement exact principal/plan/evidence/suspect paths/TTL/justification taşır.
- [ ] Blanket `--force-scope` global authority değildir.
- [ ] Evidence/path/policy drift acknowledgement'ı invalid eder.
- [ ] Surface wrappers aynı application service/receipt'i kullanır.

### 20.5 Spawn ve drift

- [ ] Exact start local ad-hoc scope policy üretmez.
- [ ] Execution Admission approved evidence identity/TTL/revision doğrular.
- [ ] Scope-relevant drift typed replan/reapproval/HOLD üretir.
- [ ] Irrelevant drift policy/receipt ile ayrılır.
- [ ] Repository/project/remote target identity drift conflict/HOLD'dur.
- [ ] Evidence refresh exact planı sessiz değiştirmez.
- [ ] Stale generation/capability spawn olamaz.
- [ ] Legacy direct starts canonical authority'ye cut over edilmiştir.

### 20.6 Dynamic repairs

- [ ] Repair parent scope'u automatic grant saymaz.
- [ ] Repair requested scope delta ve fresh evidence taşır.
- [ ] Capability yalnız daralır; widening new decision/approval gerektirir.
- [ ] Evidence unavailable exact repair HOLD olur.
- [ ] Parent evidence ve unrelated ready work devam eder.
- [ ] Repair HOLD capacity'yi admitted work için serbest bırakır.
- [ ] Retry/resume generation-safe/idempotent'tir.
- [ ] Repair effects parent/attempt/landing lineage'ına bağlıdır.

### 20.7 Execution/effect/landing

- [ ] Scope allow ambient host write grant değildir.
- [ ] Provider/shell/child processes same execution containment'ı kullanır.
- [ ] Requested vs resolved vs attempted vs observed vs landed scope ayrı facts'tir.
- [ ] Untracked/deleted/moved/metadata/protected effects manifestte görünürdür.
- [ ] Evidence unavailable strong staging policy ile run'a izin verse bile landing fail-closed'dur.
- [ ] Protected mutations ApprovalBroker/Capability/Landing authority'den geçer.
- [ ] Out-of-scope actual effect attributed ve blocked/quarantined/HOLD olur.
- [ ] Worker self-report ground truth değildir.

### 20.8 Failure, scale ve assurance

- [ ] Auth/config/evidence/approval/audit/adapter outage silent allow üretmez.
- [ ] Noisy tenant/project acquisition capacity'sini izole eder.
- [ ] Concurrent plan/refresh/start/revoke race fenced'dir.
- [ ] Cache stale/current/tenant/project identity-safe'dir.
- [ ] Crash sırasında partial evidence current pointer olmaz.
- [ ] Observe/shadow/enforce UI ve metrics'te dürüst görünür.
- [ ] Legacy/canonical decision drift ölçülmüştür.
- [ ] No-old-authority/no-duplicate caller proof vardır.
- [ ] Every Environment real-binary artifacts vardır.
- [ ] Fresh different-provider XVerify vardır veya closure HOLD kalır.

## 21. Adversarial proof catalog

Implementation assurance en az şu vakaları real production call graph üzerinde kapsamalıdır:

1. Git binary missing legacy/direct path'i silent spawn'a götürmez;
2. non-Git project supported adapter veya typed unsupported alır;
3. corrupt repository empty/greenfield sayılmaz;
4. permission denied unavailable/HOLD olur;
5. timeout/output overflow no partial/current evidence bırakır;
6. exit `0` + true empty repository explicit EMPTY_BASELINE olur;
7. root-only README/LICENSE project greenfield policy'yi doğru alır;
8. parent repo içindeki nested project wrong-root inventory kullanmaz;
9. worktree/submodule/sparse checkout identity/path normalization doğrudur;
10. malicious newline/NUL/case/path separator filenames manifest'i bozmaz;
11. plan approval sonrası target file rename/delete drift üretir;
12. irrelevant change policy ile planı gereksiz reapprove etmez;
13. repository root/remote target değişimi conflict/HOLD olur;
14. blanket force-scope bütün suspects'i kapsayamaz;
15. exact acknowledgement başka plan/path/evidence revision'da replay edilemez;
16. evaluator exception spawn bypass üretmez;
17. resolution persistence failure approved/in-memory-only plan üretmez;
18. exact RunFlow start inventory unavailable olduğunda incidental legacy pass'e güvenmez;
19. dynamic repair evidence unavailable parent/unrelated work'i öldürmez fakat repair'i spawn etmez;
20. repair parent capability ceiling'ini genişletemez;
21. scope classifier pass ederken provider actual scope dışına yazmaya çalışırsa containment bloklar;
22. shell/child process scope gate'i bypass etse bile filesystem effect boundary'sini aşamaz;
23. staging effect current baseline drifted ise landing olmaz;
24. tenant-A evidence tenant-B project planında reuse edilemez;
25. local inventory remote pod/SSH target için authority sayılmaz;
26. concurrent refresh/start exact snapshot/fence semantics'i korur;
27. audit requested/resolved/acknowledged/observed/landed facts'i yanlış birleştirmez;
28. unsupported platform adapter host fallback yapmaz.

## 22. Non-goals ve yanlış `COMPLETE` iddiaları

### 22.1 Non-goals

- Git'i Deckent install/use için zorunlu yapmak.
- Her evidence failure'da tüm RunFlow'u global abort etmek.
- Read-only/not-required operations'i gereksiz bloklamak.
- Greenfield project'in ilk file creation'ını imkânsızlaştırmak.
- Scope heuristic'ini kaldırıp plan-quality sinyalini kaybetmek.
- Her VCS'i tek implementation'da hardcode etmek.
- Filesystem inventory'yi malware/trust absence kanıtı saymak.
- Raw path listesini sınırsız audit/metrics'e yazmak.
- Modelin “path intentional” beyanını approval saymak.
- Bulgu 4/5 execution/effect authority'lerini ikinci kez burada implement etmek.

### 22.2 Aşağıdakiler `COMPLETE` değildir

- Legacy catch içine yalnız `throw` eklemek.
- `git ls-files` non-zero ise bütün Deckent'i generic fatal yapmak.
- RunFlow zaten fail-closed diyerek direct start/resume/dynamic paths'i yok saymak.
- Git exit `0` + stdout'u project identity/provenance olmadan authority saymak.
- Empty array'i greenfield varsaymak.
- Git yoksa cwd recursive scan'i sessiz fallback yapmak.
- Scope gate'i sandbox/write enforcement diye belgelemek.
- `--force-scope` boolean'ını default false bırakmayı authorization saymak.
- Blanket acknowledgement'a yalnız actor ID eklemek.
- Inventory digest'i plan hash'ine ekleyip TTL/drift/start revalidation'ı bırakmak.
- Spawn-time ad-hoc gate'i plan-time authority yanında ikinci policy engine olarak tutmak.
- Auto-resolution memory'de yapılıp disk write failure'ını loglamak.
- Dynamic repair'i akış sürsün diye always-acknowledge bırakmak.
- Repair HOLD nedeniyle bütün unrelated run'ı pause etmek.
- Strong staging olmadan evidence-unavailable writes'i çalıştırmak.
- Staging'i persistent landing authority saymak.
- Yalnız tracked modified files'i actual effect manifest saymak.
- Worker `filesChanged` claim'ini scope evidence saymak.
- Unit tests ile Every Environment/real-binary/remote claim yapmak.
- Replacement production consumers olmadan legacy Git callers'i silmek.
- Same-provider self-verify ile assurance settlement vermek.

## 23. Documentation ve truth reconciliation

Implementation session aşağıdaki claims'i fresh doğrulayıp düzeltmelidir:

- scope gate'in “blocks by default” ifadesi evidence unavailable durumunu görünür söylemeli;
- RunFlow exact plan fail-closed semantics canonical surface docs'a yansıtılmalı;
- legacy direct start/resume behavior cutover state'i dürüstçe belgelenmeli;
- `--force-scope` “bypass” vocabulary'si exact acknowledgement semantics'e migrate edilmeli;
- greenfield/non-Git/unsupported ayrımı kullanıcı docs'unda açıklanmalı;
- scope gate'in sandbox/effect enforcement olmadığı net olmalı;
- dynamic repair HOLD/continuation UX'i belgelenmeli;
- Every Environment adapter matrix ve unsupported state doğru olmalı;
- English/Turkish user-visible reference parity korunmalı;
- accepted ADR/ledger evidence stale line numbers/current reachability ile reconcile edilmeli.

## 24. MASTER-PLAN eşleme

| Ledger | Rol | Bu kararın etkisi |
|---|---|---|
| `SEC-OWASP-ASI-001` (4190) | Assurance parent | ASI01/02/05/08/09/10 scope evidence gap/closure mapping |
| `SEC-ENFORCE-WIRE-001` (4200) | Exact disposition owner | `sprint-controller` Git/gate fail-open wire-or-retire closure |
| `TRUTH-BASELINE-001` (40) | Baseline truth owner | Project/repository/workspace inventory identity/revision/provenance |
| `CAPABILITY-001` (4040) | Scope/resource decision owner | Principal+operation+resource+environment capability decision |
| `TOOL-AUTHORITY-001` (4060) | Runtime operation owner | Tool Gateway, exact write/resource grants |
| `TRUST-HANDOFF-001` (4180) | Host-effect owner | Plan signal → containment → effect → landing trust transfer |
| `ENV-ADAPTER-001` (8010) | Platform/VCS adapter owner | Git/non-Git/filesystem/remote Every Environment behavior |
| `KERNEL-001` / RunFlow family | Exact plan/attempt owner | Inventory/scope digest binding, approval, admission, repair revisions |
| Bulgu 4 accepted design | Execution dependency | Provider-neutral containment, staging ve Tool Gateway |
| Bulgu 5 accepted design | Effect dependency | Effect attribution, protected classification ve landing |

`SEC-ENFORCE-WIRE-001` legacy fail-open disposition'ını taşır; shared Project Inventory Authority ve bütün
consumers/cutover acceptance'ı daha geniş bir outcome'dur. Güncel ledger'da exact owner child yoksa yeni child
gerekebilir. Bu belge ID/order uydurmaz; implementation session canonical ledger state/schema/dependency graph'ını
okuyup owner'a exact öneri sunmalıdır.

Bu belge `docs/MASTER-PLAN.md` üzerinde mutation yapmaz.

## 25. Başka session'a doğrudan iş-planı girdisi

1. Bu belgeyi ve header'daki üç hard dependency audit belgesini tamamen oku.
2. `DIRECTIVES.md`, ilgili role rules, live-run state ve canonical ledger satırlarını fresh doğrula.
3. W1 inventory'sini current HEAD production graph üzerinden yeniden çıkar; bu belgedeki line numbers/callers'i
   stale olabilecek evidence olarak doğrula.
4. Shared Project Inventory Authority için exact ledger child gerekiyorsa outcome/acceptance/dependencies ile
   Alperen onayına sun; ID/order'ı canonical ledger kurallarıyla çöz.
5. W2–W11'i dependency-bound Goal/Mission/Flow DAG'ına dönüştür; contract foundation'ı exact RunFlow/legacy
   cutover/retire consumers'dan orphan bırakma.
6. Effective config, project identity, adapter, platform, provider/model, concurrency, finite budget ve admission'ı
   runtime authorities'den çöz.
7. Implementation'ı Deckent dogfood Goal/Mission/Flow/Run/Autonomous/Do yüzeyleriyle yürüt; manual seam typed
   bootstrap/recovery olsun ve ilk güvenli sınırda dogfood'a dön.
8. RunFlow current fail-closed behavior'ını regression olarak koru; legacy behavior'ı ona göre cut over et.
9. Git-only hard block yapma; non-Git/greenfield/unsupported typed adapters ve operation/effect-aware policy'yi aynı
   DAG içinde tasarla.
10. Scope classifier, execution containment ve effect/landing authorities'i ayrı contracts fakat causal refs ile
    bağlı tut.
11. Dynamic repairs için exact candidate HOLD/unrelated continuation semantics'ini global run pause veya blanket
    acknowledgement'a çevirmeden uygula.
12. Resolution yalnız final plan digest'ten önce ve atomik durable authority içinde uygulansın.
13. Exact acknowledgement principal+plan+evidence+paths+TTL+justification'a bağlansın.
14. Spawn-time drift/revalidation ad-hoc Git call değil Execution Admission decision'ı olsun.
15. Observe→shadow→enforce telemetry raw path/secret overcollection yapmadan ilerlesin.
16. Legacy remove yalnız replacement production closure + no-caller/no-duplicate proof sonrası yapılsın.
17. Her slice producer→consumer→ingress→policy/config→effect→settlement evidence taşısın.
18. Adversarial catalog Every Environment real-binary ve scale/race/outage proofs ile bağlansın.
19. Final assurance fresh different provider ile XVerify edilsin; unavailable ise typed HOLD bırakılsın.

## 26. Definition of Done

Bu çalışma ancak aşağıdakilerin tamamıyla DONE'dır:

- project/workspace/repository/execution-target identity canonical ve tenant-scoped'dur;
- Git yalnız VCS-neutral Project Inventory Authority'nin bir adapter'ıdır;
- non-Git/greenfield/unsupported/unavailable/stale/drifted states typed ve dürüsttür;
- empty list failure veya wrong-root ile karışmaz;
- inventory evidence revision/digest/provenance/TTL/assurance taşır;
- planner/prompt/scope/approval/execution/audit aynı snapshot reference'ını tüketir;
- scope classification/policy decision final plan digest'ine bağlıdır;
- deterministic resolutions approval'dan önce atomik uygulanır ve idempotent revalidate edilir;
- approval sonrası task/scope mutation ve memory/disk divergence yoktur;
- exact acknowledgement principal+plan+evidence+suspect paths+TTL+justification'a bağlıdır;
- RunFlow fail-closed unavailable behavior bütün canonical surfaces'te production-wired'dır;
- direct start/resume/legacy ingress'ler canonical plan/admission authority'ye cut over edilmiştir;
- spawn admission inventory freshness/identity/drift/capability/approval/fence doğrular;
- legacy `runSprint` ad-hoc Git fail-open scope gate'i retired'dır;
- dynamic repair parent scope'u blanket grant saymaz; evidence unavailable repair HOLD olur, unrelated work devam eder;
- scope heuristic sandbox/host-effect authority claim etmez;
- provider/shell/child writes Bulgu 4 execution containment'ı altında kalır;
- observed effects Bulgu 5 attribution/protected/landing authority'sine bağlanır;
- evidence unavailable strong staging policy ile attempt'e izin verse bile persistent landing fail-closed'dur;
- dağınık duplicate Git inventory reads/semantics replacement closure sonrası retired veya presentation-only'dir;
- no-old-authority/no-duplicate production reachability evidence vardır;
- auth/config/evidence/approval/audit/adapter outage silent allow üretmez;
- multi-project/multi-tenant/concurrency/crash/scale/backpressure proofs artifact-bound'dır;
- Linux/macOS/Windows native/WSL/non-Git/OCI/remote declared matrix real evidence taşır;
- docs/ADR/config/ledger truth current production graph ile reconcile edilmiştir;
- assurance evidence index'i `SEC-OWASP-ASI-001` mapping'ine bağlıdır;
- independent different-provider verdict vardır veya typed HOLD açık kalır.
