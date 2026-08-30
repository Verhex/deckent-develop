# Deckent tam kod-gerçeği analizi — 2026-08-30

> Durum: KANIT VE DEVAMLILIK DOKÜMANI.
> Bu dosya authority, policy, MASTER, Closure receipt, aktif run sözleşmesi veya owner kararı değildir.
> Her devam oturumu canlı owner talimatını, `AGENTS.md` control block'unu, canonical operating
> policy'yi, core memory'yi, IDENTITY'yi, MASTER'ı ve disk/runtime durumunu yeniden ölçer.
> Generated dosyalar ve tarihsel sprintler yalnız kanıttır. Bu analizden kendiliğinden iş doğmaz.

## Belge amacı ve baseline

Bu belge, 2026-08-30 tarihinde Alperen'e sunulan bütün-repo analizinin kayıpsız devamlılık
kopyasıdır. Uzun ham logları veya kaynak kodu çoğaltmaz; bütün hükümleri, ayrımları, seçenekleri,
kanıt yollarını, güven düzeylerini ve açık HOLD'ları korur. Secret, credential, private key ve
`.brain/memory.db` içeriği özellikle aranmadı veya okunmadı.

Analiz baseline'ı:

| Ölçüm | Diskten doğrulanan değer |
|---|---|
| Branch | `main` |
| HEAD | `014d4c13a2b0e148bc3c3c837f6fd6d6b171946e` |
| Uzak farkı | `origin/main...HEAD = 0 behind / 17 ahead` |
| MASTER | 562 toplam, 474 aktif, 88 DONE, 214 receipt, 13 blocker class |
| Aktif durum dağılımı | 362 OPEN, 69 BLOCKED, 43 VERIFY |
| 4030 | `OPERATION-001 = VERIFY` |
| 4031 / 4032 / 4033 | `DONE` |
| 4034+ | Başlamamış |
| Closure OS | 7 append-only event; head 4033 |
| Sprint 711 / 712 / 713 | `ABORTED`; ürün 4033 daha sonra ayrı ADR-D-007 manual recovery ile kapandı |
| Bot | PID 2964974 canlı |
| Deckent worker/coordinator/container | Aktif kanıt yok; `docker ps` boş |
| `.tasks` | Tarih/otorite yan kayıtları var; canlı flat task/result/hb koşusu yok |
| Worktree | Başka oturumlara ait eski/runtime değişiklikler korunuyor |
| Push | Yapılmamış |

Analizden sonra Alperen önerilen sırayı kabul edip bu main session'a yürütme yetkisi verdi. İlk
bounded recovery ayrı branch/worktree'de açıldı. Bu sonradan başlayan execution, yukarıdaki analiz
baseline'ını geriye dönük değiştirmez. Güncel execution kaydı belgenin sonundadır.

## Kullanılan durum dili

- **Çalışıyor:** Producer → consumer → entrypoint → effective enablement → gerçek çalıştırma
  kanıtı zinciri mevcut.
- **Kısmen çalışıyor:** Zincirin önemli bölümü gerçek, fakat bir authority, surface, platform,
  scale veya settlement halkası eksik.
- **Yalnız görünüşte var:** Doküman, tip, test, mock, fixture veya UI mevcut; production consumer
  ya da gerçek outcome kanıtı yok.
- **Çalışmıyor:** Üretim yolunda yeniden üretilmiş yanlış sonuç, kırık zincir veya unreachable yol var.
- **Kanıtlanamadı:** Erişilemeyen ortam, owner-only yetki veya açılmaması gereken hassas veri
  nedeniyle kesin hüküm yok.

Her bulgu yalnız şu sınıflardan biriyle ele alınır:

- `BLOCKS_CURRENT_DONE`
- `RELATED_BUT_NONBLOCKING`
- `UNRELATED`

Bu sınıflar tek başına implementation yetkisi üretmez.

# 1. Bir sayfalık genel hüküm

Deckent bugün boş bir vizyon veya yalnız mock'lardan oluşan demo değildir. İçinde gerçek CLI,
Terminal/REPL, Desktop, Dashboard, HTTP API, MCP, provider adapterları, Docker/subprocess worker
yolları, planner, evaluator, settlement, approvals, memory, agent/skill katalogları ve büyük bir
test sistemi bulunan ciddi bir yerel-first agent execution platformudur.

Buna karşılık Deckent henüz IDENTITY ve vision dosyalarının tarif ettiği tek, kesintisiz
`Goal → Mission → Flow → Run → WorkItem → Attempt → Operation` kernel'i değildir. Aynı kavramların
birkaç tarihsel motoru ve projection'ı yan yana yaşamaktadır. En büyük sorun özellik eksikliğinden
çok **doğruluk zinciri eksikliği**dir: doğru veri üretildiği halde canonical ingress'te
kaybolabiliyor; evaluation exact accepted attempt'a bağlanmayabiliyor; hiç koşmayan plan düğümü
attempt sayılabiliyor; finalizer ve recovery farklı tarihsel gerçekleri birleştirebiliyor.

711–713 olayları bu yüzden çok değerlidir. 4033 ürün kodunun manual recovery ile kapanması gerçek
ve meşrudur; fakat bu, onu koşturan orkestrasyon motorunun düzeldiğini kanıtlamaz. Worker doğru
sonucu üretmiş olsa bile `runPolicyEvidence` canonical result ingress'te silinmiş, evaluator bunu
haklı olarak eksik kanıt saymış ve 100/100 rubrik puanı `NO_GO` olmuştur. Ardından attempt, FIX ve
finalization kusurları semptomu büyütmüştür.

Güvenlik ve enterprise foundation geniştir ama tamamlanmış değildir. Principal, tenant, operation,
approval, receipt, audit, secret, permission ve execution authority için çok sayıda güçlü modül
vardır; bunlar henüz bütün ingress ve effect yollarında tek bir enforced zincire dönüşmemiştir.
4030 child DAG ayrımı doğrudur: 4030 yalnız operation identity/coverage/invocation/effect
attribution; permission/enforcement 4040; approval authority 4050 kapsamındadır.

Provider neutrality kodda gerçektir: config, registry, routing, auth/reachability ve usage/limit
parçaları vardır. Ancak model/provider seçimi yalnız katalog varlığıyla kanıtlanamaz; effective
admission zinciri ve gerçek provider receipt gerekir. XVerify ayrımı güçlü bir policy'dir fakat
şu anda owner-deferred'dır ve bazı tarihsel producer-fencing sorunları vardır.

En güçlü taraflar: dürüst HOLD dili, geniş typed contract külliyatı, güçlü test yatırımı,
provider-neutral yön, local-first memory/evidence yaklaşımı, Terminal/Desktop/Dashboard rol
ayrımının açık olması ve Closure OS'nin append-only owner-signed yönüdür.

En büyük riskler: duplicated authority, canonical ingress alan kaybı, accepted-attempt bağının
eksikliği, phantom attempt, eski flow death-sweep, finalizer/recovery ayrışması, advisory kalan
security/tenant enforcement, build/source/runtime identity drift'i ve test yeşilinin production
wiring yerine geçebilmesidir.

Genel güven: **yüksek**. Ürün yönü ve temel motor kusurları doğrudan kaynak+disk kanıtlıdır.
Native macOS/Windows, milyon ölçek, HA/DR, gerçek enterprise tenant izolasyonu ve bazı dış provider
kanıtları için güven **düşük/orta**; bunlar açık HOLD'dur.

# 2. Deckent bugün gerçekte nedir?

Canonical kimlik Deckent'i `provider-neutral, local-first Agent OS / AI runtime ecosystem` olarak
tanımlar; Assistant · Worker · Platform üç yüzünün tek kernel/policy/evidence/learning sistemi
kullanmasını ister. Terminal ve Desktop primary control/operator yüzeyleridir; Dashboard yalnız
observability projection'dır. Kanıt: `.deckent/workspace/IDENTITY.md:3-19,31-32` ve
`docs/en/vision.md:7-39,53-97,126-140`.

Kod gerçeği daha dar ama gerçektir:

- TypeScript/Node ESM tabanlı yerel orchestration ve control-plane ürünüdür.
- Repository-development dogfood motoru ile son kullanıcı ürün motoru büyük ölçüde aynı kaynak
  ağacını paylaşır.
- CLI/Terminal en olgun kontrol yüzeyidir.
- Desktop gerçek native operator yüzeyi foundation'ı taşır fakat bütün kararları aynı service'e
  indirme tamamlanmamıştır.
- Dashboard anlamlı read-model ve görünürlük taşır; authority olmaması yönü doğrudur.
- API, MCP, autonomous, connector ve process yolları gerçek adapterlardır; fakat her biri henüz
  bütün lifecycle ve trust contractlarını aynı derinlikte tüketmez.
- Sprint/DIRECTIVES yolu compatibility motoru olarak çok gelişmiştir; yeni Goal/Mission/Flow/Run
  modeliyle tam birleşme tamamlanmamıştır.

Solo kullanıcıdan enterprise'a aynı ürün modeli **tasarım olarak korunuyor**, çünkü kimlik, kernel,
scope, evidence ve surface doktrini tek ürün ister. **Production kanıtı olarak henüz korunmuş
sayılmaz**, çünkü tenant isolation, distributed state, HA/DR, fleet, policy enforcement ve scale
satırları açık veya kısmi durumdadır. Bu yüzden `aynı ürün` bugün doğru yön, kısmi implementation ve
kanıtlanmamış ölçek iddiasıdır.

# 3. Gerçekten çalışan yetenekler

Aşağıdaki hükümler en az bir gerçek producer-consumer-entrypoint zincirine dayanır:

1. **CLI ve native Terminal foundation'ı çalışıyor.** Çok geniş command registry, i18n katalogları,
   status/inspect/approval/run/archive/recovery komutları ve gerçek binary kontrat testleri vardır.
   Kanıt: `src/cli/entry.ts`, `src/cli/index.ts`, `src/core/cli-command-contract.ts`,
   `src/cli/repl/`, `scripts/test-binary-contracts.mjs`.
2. **Canonical task result schema ve strict validation çalışıyor.** `TaskResultV1` Zod şemasından
   türetiliyor; evaluator/finalizer önemli eksik kanıtlarda fail-closed davranıyor.
   Kanıt: `src/core/task-result-schema.ts:1-460`, `src/orchestra/result-evaluator.ts:1590-1626`.
3. **Docker result settlement gerçek.** Raw result okunuyor, normalize ediliyor, canonical sonuç
   yazılıyor ve immutable settlement üretiliyor. Sorun zincirin var olmaması değil, giriş
   projection'ının bazı alanları silmesi. Kanıt: `src/orchestra/spawn-backend-docker.ts:953-1040`.
4. **Run-policy producer ve consumer parçaları gerçek.** Resolver task'a digest damgalıyor, prompt
   worker'dan echo istiyor, schema alanı kabul ediyor, evaluator/finalizer parity gate uyguluyor.
   Kanıt: `src/orchestra/run-policy-resolver.ts:56-100`,
   `src/orchestra/prompt-god-template.ts:1898-1921`,
   `src/core/task-result-schema.ts:95-99,379-380`.
5. **Config/registry/routing foundation'ı çalışıyor.** Üç katmanlı config, model registry, role/tier
   routing ve provider adapterları production kaynaklarında tüketiliyor.
   Kanıt: `src/core/config.ts`, `src/core/model-registry.ts`,
   `src/core/routing-engine.ts`, `src/orchestra/task-router.ts`, `src/providers/`.
6. **DB-first product memory foundation'ı çalışıyor.** SQLite/FTS5 store/query, CLI ve MCP memory
   yüzeyleri vardır; repo-local dogfood core memory bundan ayrılmıştır.
   Kanıt: `DECKENT.md:41-51`, `src/core/memory-store.ts`, `src/core/memory-query.ts`.
7. **Agent ve skill katalogları gerçek.** Manifest, prompt/body resolution, routing profile ve
   builtin package'lar vardır. Kullanım kalitesi ve lifecycle closure ayrı sorundur.
   Kanıt: `src/core/agent-pool.ts`, `src/core/skill-pool.ts`, `src/core/builtins/`.
8. **Approval altyapısı geniş ve gerçek.** Broker, store, decision ingress, terminal live-auth,
   rules engine, expiry ve çeşitli adapterlar üretim kodundadır. MCP pending inbox read-only
   ayrımı doğru yöndedir.
   Kanıt: `src/core/approval-*`, `src/cli/commands/approvals.ts`,
   `src/mcp/tools/approvals.ts`.
9. **Closure OS foundation'ı gerçek.** Append-only hash chain, public genesis anchor, owner-custody
   signer ve authenticated batch writer/projection vardır; 7 gerçek event ölçülmüştür.
   Kanıt: `docs/governance/closure-dispositions.jsonl`,
   `scripts/closure-ledger/`, `DECKENT.md:85-94`.
10. **Test ve hermeticity yatırımı gerçektir.** 2.964 tracked test dosyası/fixture alanı, Vitest
    suite'leri, lint ratchet'leri ve binary-contract runner vardır. Bu, her özelliğin production
    wired olduğu anlamına gelmez.

# 4. Kısmen çalışan veya yalnız görünüşte çalışan yetenekler

| Yetenek | Hüküm | Neden |
|---|---|---|
| Tek Goal→Operation kernel'i | Kısmen çalışıyor | Goal/Mission autonomous store'larda, Flow/Run ayrı store/service'lerde, Sprint/DIRECTIVES başka lifecycle'da; ortak type graph tamamlanmamış |
| Planner | Kısmen çalışıyor | AI/structured plan, routing ve task stamp gerçek; history'de scope normalization, exact artifact drift ve task doğum kusurları var |
| Brain supervision | Kısmen çalışıyor | Phase controller, evaluation ve recovery gerçek; sentetik verdict, disk truth ve accepted attempt her yolda tek receipt'e bağlı değil |
| Worker pool | Kısmen çalışıyor | Docker/subprocess/agentic yollar gerçek; provider evidence, heartbeat, result ve host overlay tek authenticated envelope değil |
| Evaluator | Kısmen çalışıyor | Fail-closed parity iyi; 100 puan/NO_GO çelişkisi puan motoru ile terminal gate'in iki ayrı gerçeği taşıdığını gösteriyor |
| FIX | Kısmen çalışıyor | Depth/budget/fingerprint parçaları var; runtime-born lineage ve engine failure fingerprint kapsaması eksik |
| Recovery | Kısmen çalışıyor | Typed adapters ve receipts var; force-finalize, stale flow, cleanup residue ve mode parity açık |
| Finalizer | Kısmen çalışıyor | Terminal receipt üretimi geniş; hiç koşmayan plan node'unu phantom attempt sayabiliyor ve taskId üzerinden sonradan result/evaluation eşliyor |
| Archive/retention | Kısmen çalışıyor | Manifest/seal/retention parçaları var; `.tasks` terminal residue ve farklı archive yolları için HOLD'lar sürüyor |
| Desktop | Kısmen çalışıyor | Gerçek native code ve tests var; bütün lifecycle/approval/recovery semantic parity kapanmış değil |
| Dashboard | Çalışan observability + kısmi kontrol taklidi riski | Read-model gerçek; yön gereği authority değil. Mutation/control öğeleri canonical service tüketmiyorsa yalnız görünüşte kontrol olur |
| HTTP API | Kısmen çalışıyor | Run-flow, mission, approvals, SSE gibi route'lar gerçek; auth/tenant/effect enforcement tüm route'larda birleşik değil |
| MCP | Kısmen çalışıyor | 51 tool/8 resource projection'ı ve gerçek server var; bazı komutlarla semantics parity açık, approvals kararı bilinçli read-only |
| Autonomous | Kısmen çalışıyor | Mission/backlog/scheduler/store geniş; read-purity, migration, exact execution ve unattended terminal certification açık |
| Connectors | Kısmen çalışıyor | Telegram/Discord/WhatsApp ve approval clients gerçek; tenant/identity/effect settlement bütün adapterlarda aynı değil |
| VS Code extension | Yalnız ince adapter/foundation | 4 tracked source dosyası; tam operator surface veya authority parity kanıtı yok |
| Plugin sistemi | Kısmen çalışıyor | Install/list/hooks/security pipeline gerçek; default security enforcement advisory, MJS managed-doc loader production pipeline'a wired değil |
| Learning loop | Yalnız kısmen kapalı | Memory, routing evidence ve promotion organları var; outcome→promotion→training end-to-end production closure sertifikalı değil |
| Million-scale/HA/DR | Yalnız görünüşte planlı foundation | MASTER ve post-product tasarımı güçlü; distributed store, failover, RPO/RTO ve load/chaos proof açık |

Önemli instruction drift örneği: güncel operating rule provider/model'i effective config'ten
çözerken `DECKENT.md:213-260` hâlâ DIRECTIVES örneğinde exact `Model` ve `Provider` satırları
öğretiyor. Bu dosya mechanical reference'tır; AGENTS control/operating policy üstündür. Yine de
stale talimat üretim kullanıcılarını yanlış rotaya sürükleyebilir.

# 5. En önemli güven ve doğruluk açıkları

1. **Canonical ingress alan kaybı — `BLOCKS_CURRENT_DONE`.** Typed producer çıktısı manual
   allowlist projection'ında silinebiliyor. 711–713 run-policy vakası ve daha eski
   `hostTerminalProjection` düzeltmesi aynı defect class'ıdır.
2. **Accepted-attempt bağı eksik — `RELATED_BUT_NONBLOCKING` successor.** Settlement exact
   attempt UUID/result digest taşısa da evaluation audit çoğunlukla sprintId/taskId/numeric attempt
   ile kalıyor; finalizer result ve evaluation'ı taskId üzerinden yeniden eşliyor.
3. **Phantom attempt — `RELATED_BUT_NONBLOCKING` successor.** Finalizer bütün plan görevlerini
   candidate yapıp result/settlement olmayanlar için boş attempt kimliği üretebiliyor.
4. **FIX causality — `RELATED_BUT_NONBLOCKING` successor.** Depth gate vardır fakat evaluation
   anında yalnız in-memory sprint task map'i kullanılınca disk-born lineage eksilebilir;
   run-policy gibi engine HOLD fingerprint'e girmeyebilir.
5. **Duplicated authority.** Goal/Mission/Flow/Run/Sprint, task state, result, settlement, audit ve
   projection katmanları arasında aynı anlamın birden çok temsili vardır.
6. **Fail-open/advisory yollar.** Plugin security, scope enforcement'ın bazı legacy backend'leri,
   çeşitli error/log paths ve connector/adaptor surfaces her yerde enforce değildir.
7. **Projection'ın authority sanılması.** `.brain/exports`, Dashboard, docs/generated, eski
   sprint state ve retained DIRECTIVES yanlış okunursa canlı policy gibi davranabilir.
8. **Build/source/runtime identity.** `dist` long-lived process tarafından cache'lenir; build
   sonrası restart/reconnect olmadan kaynak düzeltmesi canlı ürüne ulaşmış sayılmaz.
9. **Test-only wiring ve mock green.** Geniş test sayısı güçlüdür fakat yalnız import edilen module,
   fixture-local reimplementation veya mocked surface production closure değildir.
10. **Trust domain karışması.** Worker ve host observations bugün aynı düz `.result` dosyasında
    birleşir; field disposition sessiz kaybı önler ama producer kimliğini kriptografik kanıtlamaz.

# 6. 711–713 kök neden analizi

## 6.1 Ana gerçek

711–713 tek bir hata değildir. Birbirini büyüten dört sınıf vardır:

1. **İlk neden: canonical ingress `runPolicyEvidence` alanını düşürdü.**
2. **Evaluation exact accepted attempt'a tam bağlanmadı.**
3. **Finalizer hiç koşmayan plan düğümlerini attempt gibi saydı.**
4. **FIX/recovery zinciri ilk yanlış NO_GO'yu çoğalttı.**

4033 ürün kodunun manual recovery ile kapanması yalnız ürün outcome'unu kurtardı; bu dört
orkestrasyon kusurunu otomatik olarak kapatmadı.

## 6.2 100/100 iken neden NO_GO?

Rubrik puanı ve terminal policy gate iki ayrı karar katmanıdır. Rubrik kriterleri 100/100
olabilir; fakat task'ta run policy varsa evaluator exact worker digest evidence arar. Alan canonical
sonuçta yoksa `HOLD:missing-worker-policy-evidence` üretir ve terminal verdict `NO_GO` olur.
Evaluator burada fail-closed davranarak doğru işi yapmıştır. Yanlışlık evaluator'da değil, evidence
alanını consumer'a ulaştırmayan ingress'tedir.

Kanıt zinciri:

- Worker contract: `src/orchestra/prompt-god-template.ts:1898-1921`
- Schema: `src/core/task-result-schema.ts:95-99,379-380`
- Kayıplı projection: `src/orchestra/result-ingress.ts:81-149`
- Docker canonical overwrite: `src/orchestra/spawn-backend-docker.ts:1015-1039`
- Fail-closed gate: `src/orchestra/result-evaluator.ts:1590-1626`
- Finalizer gate: `src/orchestra/sprint-finalizer.ts:3097-3139`
- Canlı sonuç: `.deckent/archive/sprints/sprint-713/evaluations/713-001-attempt-1.json:159-168`

## 6.3 Optional coverage

Tarihsel evaluator yollarında optional/not-applicable verification ile coverage cezası aynı
terminal karara karışabildi. Bugün applicability/outcome alanları schema'da ayrılmış ve bazı
ceiling/fix'ler vardır; fakat 711–713'ü yalnız coverage hatasıyla açıklamak yanlıştır.
Run-policy evidence kaybı bağımsız ve doğrudan kanıtlı kök nedendir.

## 6.4 Worker policy evidence nerede kayboluyor?

Task üzerindeki `runPolicy` ve worker prompt'u doğru üreticilerdir. Worker raw result alanı yazsa
bile `persistDockerTaskResultSettlement` sonucu `assembleCanonicalIngressResult` içinden geçirir.
Bu fonksiyon manual candidate oluşturur, schema alanını kopyalamaz, sonra strict parse eder.
Zod unknown alanı geri getirmez. Ardından kayıplı canonical object hem `.result` üstüne hem
immutable settlement'a yazılır. Consumer'a ulaşan veri artık eksiktir.

Ham worker JSON canonicalization öncesi bağımsız archive edilmediği için bazı task'larda structured
alanın gerçekten yazıldığı doğrudan byte kanıtı yoktur. Worker log/notlarında exact echo vardır ve
ingress'in alan verilse bile deterministik sileceği kesindir. Bu nüans açık HOLD olarak korunur.

## 6.5 `brainEvaluation:null`

Diskte worker sonucu veya rubrik kaydı bulunması, canonical accepted evaluation projection'ının
aynı objeye yazıldığı anlamına gelmez. Bazı result'larda `brainEvaluation:null` kalırken ayrı
evaluation JSON'u vardır. Bu iki ayrı truth kaynağı ve producer ordering problemidir; ingress
düzeltmesi bunu tek başına kapatmaz.

## 6.6 Worker sonucu ile accepted attempt ayrışması

`task-result-settlement.ts` exact attempt UUID ve result digest taşır. Buna karşılık
`evaluation-audit-trail.ts` kaydı ağırlıkla `(sprintId, taskId, attemptNum)` ile tanımlar; aynı
numeric attempt için evidence/skor değişikliği tam content binding değildir. Finalizer sonuç ile
evaluation'ı taskId üzerinden birleştirir. Bu nedenle hangi worker result'ının gerçekten kabul
edildiği her terminal projection'da kanıtlanmaz.

Kanıt: `src/core/task-result-settlement.ts:54-60,236-242,698-714,972-988`,
`src/orchestra/evaluation-audit-trail.ts:65-90,193-233`,
`src/orchestra/sprint-finalizer.ts:2876-2957`.

## 6.7 Gereksiz veya sınırsız FIX görünümü

Kodda tamamen sınırsız retry yoktur: task-lineage depth gate, budget ve bazı repeated-failure
fingerprint/circuit-breaker parçaları vardır. Fakat run-policy evidence gibi engine-level HOLD
fingerprint'e girmeyebilir; runtime-born FIX lineage yalnız in-memory map'te bulunmayınca depth
yanlış düşük hesaplanabilir. Böylece son izinli turun ardından çalışmayacak bir child daha
materialize olabilir. Doğru hüküm `sınırsız` değil, `bounded mekanizma var fakat causality ve
birth gate eksik`tir.

Kanıt: `src/core/task-lineage.ts:381-419`, `src/orchestra/sprint-phases.ts:3432-3435,
3554-3558,3670-3707`, `src/orchestra/debt-manager.ts:765-777,928-1001`,
`src/orchestra/fix-failure-classification.ts:297-333`.

## 6.8 Hiç çalışmayan görev için attempt

Finalizer planın bütün görevlerini observed-attempt candidate listesine alır. Raw result, host
pre-dispatch settlement veya valid attempt identity yoksa boş attemptId ile projection üretilebilir.
Sprint 713 receipt'inde 713-004…010 gibi hiç başlamamış yedi plan node'u `INVALID_IDENTITY` attempt
olarak görünür. Logical plan denominator'ında bulunmaları normaldir; attempt denominator'ında
bulunmaları yanlıştır.

Kanıt: `src/orchestra/sprint-finalizer.ts:2878-2897`,
`.deckent/archive/sprints/sprint-713/sprint-713-terminal-receipt.json:33-41,53-130`.

## 6.9 Force-finalize ve ABORTED truth

ABORTED receipt, ürün kodunun değersiz olduğu anlamına gelmez; run lifecycle'ın terminal outcome'udur.
Manual recovery ile ürün commit'i ayrı kanıt zincirinde kapanabilir. Tersi de geçerlidir: ürün
commit'i landing yapınca tarihsel ABORTED run COMPLETE'e çevrilmez. Force-finalize eski receipt'i
silmemeli veya sessiz overwrite etmemeli; generation/supersession authority gerekir.

## 6.10 Eski flow ve `.tasks` kalıntıları

Run-flow death-sweep ve status read-model bazı eski records için canonical store/legacy projection
ayrışması taşır. `.tasks` terminal kalıntıları cleanup HOLD durumundadır; eldeki yasağa uygun olarak
hiçbiri elle silinmedi. Bu alanlar ingress recovery'den ayrıdır.

# 7. MASTER ile gerçek kod arasındaki farklar

## 7.1 Ölçüm

Baseline MASTER 562 row taşır: 88 DONE, 43 VERIFY, 69 BLOCKED, 362 OPEN. 357 P0, 155 P1,
50 P2 vardır. Active projection 474 row'dur. Bu sayıların büyüklüğü, hepsinin bağımsız ve
uygulanabilir küçük iş olduğu anlamına gelmez; parent/child, historical closure, residual ve
certification satırları birlikte bulunur.

## 7.2 En önemli drift

`RUN-POLICY-DELIVERY-001` 17 Ağustos'ta geçerli canlı canary ve Closure seq2 ile DONE olmuştur.
Kayıplı strict ingress 24 Ağustos `e41b3acae3` commit'iyle sonradan gelmiştir. Bu nedenle doğru
yorum `7140 o gün false-DONE idi` değildir; **sonradan capability regression oluştu**. Tarihsel
receipt/Closure event yeniden yazılmaz. Yeni born recovery child açılır.

## 7.3 DONE görünen ama bugünkü capability için yeni kanıt isteyen sınıflar

- Sonradan regression'a uğrayan capability'ler tarihsel DONE'u bozmaz; successor born row ister.
- Mock/hermetic proof'u olan fakat native/scale/live entrypoint'i olmayan satırlar çoğunlukla
  VERIFY/OPEN kalmalıdır; `code present` DONE değildir.
- Bir ürün outcome'u manual recovery ile kapanabilir, fakat onu tetikleyen engine defecti ayrı
  satırda açık kalmalıdır.
- Closure OS event'i yalnız exact row disposition'ını kapatır; bütün parent veya komşu motoru
  otomatik kapatmaz.

## 7.4 OPEN/VERIFY olup kodu büyük ölçüde bulunan sınıflar

Birçok satırda C/W/E/H/L/X/S truth hücreleri kısmen doludur. Bunlar yanlışlıkla açık bırakılmış
olmayabilir; owner closure, native platform, fresh live replay, independent provider, scale veya
security enforcement bekler. Özellikle 4030, recovery certification, provider authority, memory
migration, plugin security ve surface parity satırlarında `kod var` ile `outcome kapalı` aynı şey
değildir.

## 7.5 4030 child DAG sınırı

Doğrulanan ayrım:

- 4030: operation identity/version/coverage, invocation context ve durable effect causal attribution.
- 4040: permission/capability/enforcement.
- 4050: approval authority.
- 4030 bütün 4031–4039 children ve 4057 kapanmadan terminal olamaz.

4031/4032/4033 DONE olsa da 4034+ başlamamıştır; 4030'ın VERIFY kalması doğrudur. 4033 manual
recovery ürünü operation invocation context'i kapatır, enforcement veya approval yetkisi vermez.

## 7.6 MASTER darboğazları

1. Accepted-attempt ve settlement truth (`KERNEL-ATTEMPT`, `KERNEL-SETTLEMENT`, evaluation truth).
2. Operation DAG 4034–4039, sonra effect attribution fan-in.
3. Principal/tenant/resource/environment enforcement ve approval authority.
4. Durable state/migration/retention; ardından HA/DR/scale.
5. Surface semantic parity ve production wiring closure.
6. Provider usage/cost/limit evidence ve XVerify producer separation.

MASTER veya Closure üzerinde bu analiz sırasında hiçbir otomatik state değişimi yapılmadı.

# 8. Post-product hedeflerine uzaklık haritası

## 8.1 Portfolio guardrail'i

`docs/post-product/README.md` altı programı tek causal contract altında tutar:

`intent → authority → admitted operation → bounded capability → effect → evidence → verification → settlement`

Bu portfolio bugünkü MASTER değildir. `PP-*` kimlikleri vision namespace'idir; Alperen product
completion ilan edip exact outcome'a fresh admission vermeden hiçbir satır uygulanamaz.

Bugünkü en önemli doğru kararlar:

- Enterprise ikinci kernel, scheduler, approval sistemi veya settlement engine kurmaz.
- Solo/Core güvensiz edition değildir; enterprise governance aynı objeleri derinleştirir.
- Unknown allowed sayılmaz; raw secret worker/Brain'e verilmez.
- Terminal/Desktop control, Dashboard observability rolü korunur.
- Mock, screenshot, config flag veya valid JSON closure değildir.

## 8.2 Operational Fabric ve IFS

**Hedeflenen sonuç:** Deckent external enterprise sistemlerini kopyalamadan; source truth'u koruyan
projection, operational twin, policy-bound context, semantic command, brokered effect, verification
ve reconciliation zinciriyle işletir. IFS 10 ve IFS Cloud ayrı capability/evidence profilleriyle
ilk proving programını oluşturur.

**Bugünkü gerçek foundation:**

- 4031 operation catalog identity foundation DONE.
- 4032 catalog convergence DONE.
- 4033 provider-neutral invocation context manual recovery ile DONE.
- Connector, HTTP/MCP, approval, memory, event, result schema ve audit primitives gerçek.
- Local task execution, typed HOLD, idempotency vocabularies ve settlement parçaları vardır.

**Eksik temel parçalar:**

- 4034–4039 operation child zinciri ve durable effect attribution fan-in.
- 4040 permission/enforcement ve 4050 approval authority'nin bütün ingress/effect yollarında closure'ı.
- Accepted-attempt/result/evaluation bağı.
- Secret broker custody, tenant isolation, durable distributed storage, HA/DR ve scale.
- Integration Package Compiler, source discovery/drift contractı, normalized object/state model.
- Typed sync/event ingress, source load/backpressure, semantic Effect Broker ve reconciliation engine.
- Yetkili IFS 10 ve IFS Cloud non-production environment, exact version/build, business/security owner.

**Yanlış veya erken varsayımlar:**

- IFS 10 ve IFS Cloud aynı driver'ın iki config'i değildir.
- OData/OpenAPI varlığı supported action veya permission kanıtı değildir.
- HTTP 2xx/accepted business settlement değildir.
- Native integration database table write yetkisi değildir.
- Vector index memory'nin tamamı değildir.
- Distributed transaction varmış gibi blind retry yapılamaz.
- Bir proof production effect veya deployment yetkisi değildir.

**Bağımlı programlar:** Agent Capability Governance, Fleet/Sovereign Control Plane, Private
Capability Ecosystem, Process Intelligence ve Continuous Assurance.

**Önce kapanması gereken çekirdek işler:** motor truth recovery → 4030 child DAG → 4040/4050
trust chain → tenant/storage/secret/effect → surface parity → HA/DR/scale.

**Güvenlik ve ölçek koşulları:** least privilege, no-worker-secret, SoD, tenant/residency binding,
exact source version, idempotency, rate budget, unknown external outcome, reconciliation, backup/
restore, load/soak/failover ve ayrı IFS target verdictleri.

**Gerçek müşteri yolculuğu:**

1. Order publish/release: supported query/event → source/version doğrulama → operational twin →
   signed `order.publish@v1` proposal → policy/approval → supported IFS action → read-back/event →
   settlement veya reconciliation case.
2. Invoice approval: aynı kernel; finance role, amount, currency, tax, closed period, attachment
   classification, dual control ve non-compensatable effect policy'siyle.

**Başarı ölçümü:** exact versioned discovery snapshot, read/sync freshness, duplicate/order/loss
recovery, source-load budget, command idempotency, deny/stale/timeout/partial/concurrent paths,
read-back verified outcome, correlated Deckent+IFS audit, p50/p95/p99, RPO/RTO ve iki target için
ayrı evidence-backed GO/NO-GO.

**Başlatılmaması gereken erken işler:** IFS-branded dashboard, generic CRUD connector, table-write
shortcut, production credential ingest, marketplace packaging, production deployment veya
`tek IFS adapter` iddiası.

### Operational Fabric hazırlık özeti

| Durum | Bugünkü yetenekler |
|---|---|
| Hazır foundation | operation catalog 4031, convergence 4032, invocation context 4033, local execution, typed result/schema, connector/MCP primitives, approval/memory/audit foundation |
| Kısmi | tek authority chain, principal/tenant, capability/approval enforcement, accepted attempt, effect attribution, storage/migration, context grants, surface parity |
| Eksik | Integration Package Compiler, IFS environments/discovery, source projection/twin, semantic Effect Broker, reconciliation/Saga, distributed HA/DR, live scale/security certification |

Sonuç: IFS proving programı için değerli foundation vardır; program **başlatmaya hazır değildir**.

## 8.3 Agent Capability Governance

**Hedef:** Her agent/worker doğarken exact skill, tool, data, secret reference ve effect capability
seti; owner, scope, expiry, policy digest ve revocation lifecycle'ıyla derlenir.

**Foundation:** agent/skill manifests, routing profiles, scope, approvals, operation catalog,
permission/capability modules ve worker guards.

**Eksik:** tek capability algebra, effective enforced consumer coverage, tenant-bound grants,
secret/effect broker, birth/change/revoke receipts, cross-surface preview ve scale proof.

**Erken varsayım:** manifest veya prompt'ta capability yazması runtime enforcement değildir.

**Bağımlılıklar:** 4030/4040/4050, principal/tenant, attempt settlement, plugin/skill supply chain.

**Müşteri yolculuğu:** read-only auditor birth → exact preview/approval → scoped execution →
capability use receipts → revoke/expiry → audit.

**Ölçüm:** zero unauthorized effects, complete grant→use→settlement lineage, revocation latency,
300-agent/1000-skill routing/load ve tenant isolation.

**Erken başlatılmaması gereken:** yalnız görsel permission matrix, role-name hardcode, manifest-only
allow veya worker context'ine raw secret.

## 8.4 Enterprise Fleet ve Sovereign Control Plane

**Hedef:** Binlerce installation/runtime'ı enrollment, desired state, placement, update/canary,
air-gap, capacity, backup/restore ve sovereign policy ile tek kernel üzerinden işletmek.

**Foundation:** local config/registry, worker backends, bot/Nervous, runtime observations, package
ve binary identity guards.

**Eksik:** installation/node PKI lifecycle, signed enrollment, distributed desired-state store,
remote execution realm, multi-region partitioning, HA/DR, air-gap update channel, fleet SLO/cost.

**Erken varsayım:** çok sayıda local project kaydı fleet control plane değildir; Dashboard fleet
authority değildir.

**Bağımlılıklar:** packaging/release, tenant/principal, durable storage, HA, secret custody,
capability governance.

**Müşteri yolculuğu:** site enroll → identity/attestation → policy/desired state → staged rollout →
health/evidence → rollback/recovery.

**Ölçüm:** enrollment integrity, policy convergence lag, rollback time, offline survival, RPO/RTO,
noisy-neighbor isolation ve fleet scale.

**Erken başlatılmaması gereken:** central admin dashboard, remote kill surface, unsigned agent veya
customer data'yı zorunlu merkezi cloud'a taşıma.

## 8.5 Process Intelligence ve Digital Twin

**Hedef:** Source events ve cases üzerinden process reconstruction, conformance, diagnostics,
simulation ve kontrollü recommendation-to-action.

**Foundation:** event/audit stores, memory/retrieval, operation lineage, metrics primitives ve
Operational Fabric vision.

**Eksik:** governed event/case schema, data quality/freshness, process mining, uncertainty-aware
simulation, ground-truth labels, recommendation approval/effect/reconciliation loop.

**Erken varsayım:** logs process truth değildir; correlation eksikken case uydurulamaz; simulation
prediction veya authority değildir.

**Bağımlılıklar:** Operational Fabric, data governance, storage, assurance, capability/effect.

**Müşteri yolculuğu:** order-to-cash bottleneck veya purchase-to-pay deviation → provenance-bound
case graph → conformance → scenario → human/policy decision → effect veya no-action → measured outcome.

**Ölçüm:** event coverage, case-link precision/recall, model calibration, counterfactual validity,
operator acceptance ve realized outcome uplift.

**Erken başlatılmaması gereken:** pretty process map, autonomous optimizer veya synthetic data'yı
business truth saymak.

## 8.6 Private Capability Ecosystem

**Hedef:** Organization/partner agent, skill, MCP, workflow ve integration packages'ını signed,
versioned, sandboxed, reviewable, installable, revocable ve rollback-safe biçimde yönetmek.

**Foundation:** plugin/skill/agent manifests, CLI install/create/list, plugin hook security pipeline,
marketplace primitives ve builtin packages.

**Eksik:** canonical package envelope/SBOM/signature trust, publisher identity, transitive
dependency policy, compatibility registry, certification, atomic install/update/rollback/revoke,
tenant/private registry ve license boundary.

**Erken varsayım:** local path/npm install güvenilir package değildir; advisory plugin validation
supply-chain enforcement değildir.

**Bağımlılıklar:** capability governance, fleet distribution, Operational Fabric packages,
principal/tenant/secrets, dependency supply-chain defense.

**Müşteri yolculuğu:** author → build/SBOM/sign → review/certify → private publish → tenant-scoped
install/enable → observe → update/rollback/revoke.

**Ölçüm:** signature/owner coverage, vulnerable dependency block rate, revocation convergence,
rollback success, compatibility pass ve 1000-package scale.

**Erken başlatılmaması gereken:** marketplace UI, remote install convenience, unreviewed dynamic
code veya capability enforcement'tan önce package promotion.

## 8.7 Continuous Assurance ve AI Governance

**Hedef:** Agentic operations, policies, models, controls, findings, exceptions ve evidence'ın
sürekli değerlendirilmesi; auditor/regulator için reproducible assurance packs.

**Foundation:** evaluator, audit/event streams, result/settlement, Closure OS, provider observations,
approvals, traces ve extensive tests.

**Eksik:** accepted-attempt-bound evidence fabric, control inventory/mapping, AI asset/model
lifecycle, finding/remediation authority, exception/risk acceptance, tamper-evident tenant stores,
data/privacy governance ve continuous control monitors.

**Erken varsayım:** green test, self-report, screenshot veya unsigned JSON assurance değildir;
Closure OS event bütün kontrol evrenini kanıtlamaz.

**Bağımlılıklar:** portfolio'daki bütün programlar; özellikle authority, fleet, Operational Fabric,
process intelligence ve ecosystem.

**Müşteri yolculuğu:** high-risk agent onboarding → control evaluation → evidence gap/finding →
remediation veya approved exception → re-evaluation → signed audit package/incident reconstruction.

**Ölçüm:** control coverage/freshness, evidence provenance, false-positive/negative, remediation
SLA, exception expiry, reproducibility ve independent verification.

**Erken başlatılmaması gereken:** compliance badge, generic governance dashboard veya model card
formu; evidence producer/settlement kapanmadan assurance claim'i.

# 9. En güçlü yanlar

1. **Kimlik ve yön netliği.** Terminal/Desktop/Dashboard rolleri ve provider-neutral product
   identity açık.
2. **Dürüst failure vocabulary.** HOLD, unavailable, unsupported, partial ve ABORTED kavramları
   başarıya ezilmemiş.
3. **Typed contract yoğunluğu.** Result, settlement, approval, invocation, operation, provider
   observation ve recovery için gerçek şemalar var.
4. **Fail-closed evaluator/finalizer niyeti.** 711'de yanlış veri kaybını başarıya çevirmemesi
   güvenlik açısından doğru.
5. **Local-first ve provider-neutral architecture.** Provider ürün kimliği değil adapter.
6. **Geniş test/hermeticity sistemi.** Mock riskine rağmen regressions yakalayacak güçlü zemin.
7. **Append-only Closure OS yönü.** Owner custody ve history preservation doğru güven modeli.
8. **Dogfood verisi.** 711–713 gibi olaylar saklandığı için sistem kendi kusurunu kanıtlayabiliyor.
9. **Post-product tasarım kalitesi.** External source authority, effect verification, reconciliation
   ve honest scale varsayımları erken tanımlanmış.
10. **Tek kernel ısrarı.** Solo-to-enterprise fork ve Dashboard authority sapması açıkça reddedilmiş.

# 10. En riskli kırılma noktaları

1. Result/settlement/evaluation/finalizer arasında exact attempt bağı.
2. Manual allowlist'li canonical projections ve additive schema drift.
3. Goal/Mission/Flow/Run/Sprint state authority çoğalması.
4. Worker ve host evidence'ın aynı dosyada origin ayrımı olmadan birleşmesi.
5. Phantom attempts ve denominator/success metric bozulması.
6. FIX birth/depth/fingerprint'in engine failures ile tam bağlı olmaması.
7. Stale flow/death-sweep, force-finalize ve cleanup terminal truth ayrışması.
8. Advisory kalan permission/plugin/scope yolları.
9. Tenant/principal/resource/environment binding'in tüm effects'e ulaşmaması.
10. Build/dist/long-lived process cache drift'i.
11. Test-only wiring veya mock green'in production closure sanılması.
12. Native Windows/macOS, HA/DR ve milyon ölçek için gerçek kanıt yokluğu.
13. Generated exports, stale DIRECTIVES veya historical sprint'in authority sanılması.
14. Model/provider route'unun metinden zorlanması ve live auth/limit evidence'ın atlanması.

# 11. Muhtemel iş sırası için üç seçenek

## Seçenek A — Önce motor doğruluğu

Sıra: result ingress → accepted-attempt/evaluation binding → phantom attempt → FIX birth/depth/
fingerprint → finalizer/recovery/death-sweep → `.tasks` terminal disposition.

Kazanç: Sonraki bütün işler doğru evidence, attempt ve terminal truth üzerine oturur. Dogfood yeniden
güvenilir hale gelir.

Risk: Kullanıcıya görünür yeni capability kısa süre ertelenir; hot orchestration dosyaları seri
iş ister.

Bekleme nedeni: Engine kendi sonucunu yanlış öldürüyorsa 4030 veya security rollout kanıtı da
güvenilir olmaz.

## Seçenek C — Önce 4030 operation child DAG

Sıra: 4034–4039, 4057 ve effect attribution fan-in; permission 4040, approval 4050 sınırları
korunur.

Kazanç: Product authority spine hızla ilerler; Operational Fabric için önemli temel oluşur.

Risk: Kırık attempt/result/finalization motoru bu DAG'ın closure evidence'ını bozabilir; manual
recovery tekrarı doğabilir.

Bekleme nedeni: En az ilk motor-truth paketi geçmeden başlamak güvenilir değildir.

## Seçenek B — Önce security/tenant enforcement

Sıra: principal/tenant/resource/environment → permission/enforcement → approval → secret/effect
broker → audit/receipt.

Kazanç: Enterprise trust boundary güçlenir; riskli surface büyümesi daha güvenli olur.

Risk: Orkestrasyon kendi accepted attempt'ını kanıtlamadan enforcement outcome'ları da yanlış
settle olabilir; büyük çaplı cross-surface migration gerekir.

Bekleme nedeni: Motor truth ve operation identity foundation önce gelmelidir.

## Kabul edilen sıra

Alperen 2026-08-30 tarihinde **A → C → B** sırasını kesin kabul etti.

Daha sonra ayrıca dokuz parçalı operational skill ailesinin atlanmamasını kabul etti. Bu aile,
motor-doğruluğu paketi kapandıktan sonra ve 4030'a geçmeden önce ayrı outcome olarak kalıcılaştırılır;
recovery ile skill creation aynı aktif scope'a karıştırılmaz.

# 12. Kabul edilen sıranın kazancı, riski ve bekleme nedeni

| Basamak | Kazanç | Ana risk | Neden şimdi/sonra |
|---|---|---|---|
| A: Motor truth | Dogfood evidence ve terminal karar yeniden güvenilir | Hot files, regression ve restart/canary riski | Bütün sonraki closure kanıtının zemini |
| Operational skill ailesi | Doğru kullanım ve authority ayrımı kalıcı olur | Yanlışlıkla ikinci workflow engine yaratma | İlk recovery dersleri görülür; 4030'dan önce tekrarları önler |
| C: 4030 DAG | Operation identity→invocation→effect attribution spine kapanır | Permission/approval kapsamına taşma | Motor artık result/attempt truth'u korur |
| B: Trust/enforcement | Enterprise principal/tenant/permission/approval/secret zinciri güçlenir | Büyük cross-surface migration | Operation spine doğru sınırları sağlar |
| Post-product | IFS/fleet/governance ürünleri gerçek temel üzerinde başlar | Erken vision execution | Yalnız owner product-completion + fresh admission sonrası |

# 13. Önerilen Deckent kullanım ve operasyon skill seti

Tek büyük skill doğru değildir. Analiz, planlama, execution, observation, recovery, closure ve
handoff farklı yetki seviyeleridir. Tek dosya bunları birleştirirse read-only audit yanlışlıkla run
başlatabilir veya recovery normal implementation yoluna dönüşebilir.

| Skill | Ne zaman çağrılır | Kesinlikle çağrılmaz | Yetki ve okuma sınırı |
|---|---|---|---|
| `deckent-authority-bootstrap` | Her Deckent-dev oturumunun başında | Tek başına iş başlatmak için | AGENTS control block, operating policy, core MEMORY, IDENTITY, MASTER; tamamen read-only |
| `deckent-readonly-audit` | Snapshot, bütün-repo truth, wiring veya incident analizi | Kod yazma, sprint/run oluşturma, cleanup | Inventory, source/test/runtime evidence; secret ve `.brain/memory.db` hariç; mutation sıfır |
| `deckent-outcome-ordering` | Audit kabulünden sonra owner ile iş sırası | Owner kabulü olmadan MASTER/plan yazmak | Bulgular, dependency DAG, kullanıcı etkisi; her tur tek kısa soru |
| `deckent-outcome-plan` | Exact outcome ve authority owner tarafından seçilince | Belirsiz mega-outcome veya post-product vision için | DIRECTIVES, role rules, exact file scope, verification manifest; execution başlatmaz |
| `deckent-parallel-execution` | Kabul edilmiş DAG bağımsız işlere ayrılabiliyorsa | Read-only audit veya tek küçük işte keyfî agent çoğaltma | Effective config/capacity; provider/model/count metinden seçilmez; exact disjoint writes |
| `deckent-observe` | Aktif Run/Flow/worker izlemek | Mutation yapan status/commandı read-only sanmak | Heartbeat, receipt, disk diff, safe projections; recovery/decision yapmaz |
| `deckent-recovery` | `DOGFOOD_HEALTH=DEGRADED` ve typed ADR-D-007 | Normal feature/refactor veya kolay implementation yolu | Tek bounded package; exact owner scope; build/reconnect/destructive yetkiler açık olmalı |
| `deckent-closure` | Implementation ve production wiring tamamlandıktan sonra | HOLD/UNCLEAR/self-report/mock-only sonuç | Local proof, real binary, disk truth, terminal settlement, independent verification, gerektiğinde different-provider XVerify |
| `deckent-versioned-handoff` | Analiz kabulü + sıra + exact next-session authority birlikte | Transcript kopyalama veya erken devir | prepared → verified → committed; SHA/runtime/MASTER/Closure yeniden ölçülür |

## 13.1 Zorunlu çağrı zinciri

- Her skill'den önce `deckent-authority-bootstrap`.
- Audit sonucu implementation olmaz; önce `deckent-outcome-ordering`, sonra owner kabulü, sonra
  `deckent-outcome-plan`.
- Paralel execution yalnız planın bağımsız DAG/file collision haritasından sonra.
- Observation karar vermez; recovery koşulu görürse yalnız typed öneri üretir.
- Recovery bitince normal dogfood'a dönüş ve `deckent-closure` zorunludur.
- Handoff yalnız üç canonical koşul oluşunca; current session için Alperen açıkça handoff'u kaldırdı.

## 13.2 Kesin read-only işler

Snapshot, inventory, git/HEAD/status, process/container listesi, effective config provenance'nin
redacted görünümü, MASTER/Closure ölçümü, source/test wiring, archived receipt incelemesi ve
projection comparison. Secret/credential/private key ve `.brain/memory.db` içeriği bu listeye
girmez.

## 13.3 Owner onayı gerektiren işler

Outcome admission/sıra, MASTER/Closure disposition, sprint/run start, kill/cleanup, destructive
recovery, build+long-lived adapter restart penceresi, auth mutation, XVerify policy gerekiyorsa
provider-independent call, commit/push/publish ve post-product entry.

Canlı owner talimatı exact yetki verdiğinde skill bu kararı kaydeder ama fake receipt üretmez.

## 13.4 Eski sprint/generated authority yanılgısını önleme

Her skill kaynakları üçe ayırır:

1. Authority: canlı owner → control block/policy → canonical MEMORY/IDENTITY/MASTER.
2. Evidence: settlement, receipts, source, tests, runtime, git.
3. Projection/history: exports, Dashboard, generated docs, old sprint, retained DIRECTIVES.

Üçüncü sınıf birinci sınıfa terfi edemez. Her mutation öncesi canlı disk yeniden ölçülür.

## 13.5 Mega-task ve FIX zincirini önleme

- Read-only audit tracked her dosyayı tek ana alana bağlar.
- Outcome plan tek outcome, exact DAG, exact file authority, collision map ve negative scope üretir.
- Task sayısı keyfî cap'ten değil bağımlılık/capacity'den gelir.
- FIX ancak typed failure, değişen authority/fingerprint ve kalan finite budget varsa doğar.
- Aynı authority/fingerprint/diff başka retry tüketemez.
- Hiç dispatch edilmeyen node attempt sayılmaz; plan denominator ve attempt denominator ayrıdır.

## 13.6 Başarı iddiasının zorunlu kanıtı

- Exact owner/outcome authority ve baseline SHA.
- Producer → consumer → entrypoint → effective policy zinciri.
- Accepted attempt UUID + immutable result digest + evaluation/settlement binding.
- Scoped disk diff ve boundary check.
- Hermetic targeted tests ve type-check.
- User-facing/production change için real compiled binary.
- Runtime/source identity ve gerekli restart/reconnect.
- Truthful terminal receipt; HOLD/ABORTED gizlenmez.
- Bağımsız read-only verification.
- Gerektiğinde different-provider XVerify; unavailable ise HOLD.
- İddiaya göre native platform, tenant, load/scale, HA/DR ve security proof.

## 13.7 Mevcut katalogla yeniden kullanım ve çakışma

Yeniden kullanılabilecek built-in parçalar:

- `deckent-config-authority`
- `deckent-hermetic-testing`
- `deckent-repair-alignment`
- `deckent-worker-evidence`
- `provider-cli-matrix`
- `file-watch-hygiene`

Repo-local design skill'leri (`deckent-design-dna`, `deckent-agentic-ux`,
`deckent-product-design`, enterprise/terminal/workspace/design-system ailesi) product/design
authority sağlar; operational execution authority değildir. Yeni aile bunları kopyalamaz.

Risk: Deckent product builtin skill katalogu ile host `.codex/skills` kataloğu farklı consumer
zincirleridir. Aynı isimli iki skill üretmek veya host skill'i production worker tüketiyor sanmak
yasaktır. Hangi katalogda yaratılacağı ve distribution/sync authority'si skill implementation
outcome'unda exact karara bağlanmalıdır.

Tasarım Alperen tarafından kabul edilmiştir. `skill-creator` yalnız bu aile ayrı aktif outcome
olduğunda kullanılacaktır; mevcut motor recovery paketine eklenmez.

# 14. Kanıt kapsamı ve açık HOLD'lar

## 14.1 Envanter yöntemi

Bu analiz “her dosyanın her satırını elle okudum” iddiasına dayanmaz. Önce Git'in izlediği bütün
dosyaların exact isim envanteri çıkarıldı; sonra her tracked dosya örtüşmeyen **tek bir ana inceleme
alanına** bağlandı. Kritik ürün, authority, motor ve olay zincirleri satır düzeyinde çapraz okundu.
Test, fixture ve büyük yapılandırılmış veriler konuya göre tarandı. Binary içerik ve secret-benzeri
materyal açılmadı.

Baseline envanteri **7.029 tracked dosyadır**. Örtüşmeyen ana dağılım:

| Ana inceleme alanı | Dosya | Pay | Ana kapsam |
|---|---:|---:|---|
| Test ve fixture | 2.967 | %42,2 | Unit/integration/e2e/contract/snapshot/fixture |
| Doküman, plan ve araştırma | 1.701 | %24,2 | Vizyon, governance, reference, MASTER, analysis ve research |
| Ürün kaynağı ve yüzeyleri | 1.617 | %23,0 | `src`, native ve ürün runtime/source parçaları |
| Host agent, skill ve rol kuralları | 279 | %4,0 | `.codex`, `.claude`, agent/skill manifest ve promptları |
| Workspace, runtime ve kanıt | 269 | %3,8 | `.deckent`, `.brain` projection/history ve repo-local evidence |
| Tooling, CI ve config | 196 | %2,8 | `scripts`, `.github`, build/lint/package/config |
| **Toplam** | **7.029** | **%100** | Her tracked dosya tam bir ana alanda |

Ana kök ölçümleri ayrıca şunlardır: `tests/` 2.964, `docs/` 1.591, `src/` 1.543,
`.deckent/` 255, `scripts/` 160, `.claude/` 136, `.codex/` 133, `deckent-hub/` 66,
`codex-analysis/` 39, `design/` 36 ve `.github/` 18. Bu kök ölçümleri yukarıdaki ana alanlarla
aynı lens değildir; örneğin `docs/` dışındaki Markdown analizleri de doküman alanına girer.

## 14.2 İncelenen varlık türleri

| Lens | Ölçüm | Açıklama |
|---|---:|---|
| Ana source kökleri | 1.548 | `src`, `native` ve ürün source lensi |
| Test kökleri | 2.967 | `tests` ve diğer canonical test kökleri |
| Script | 160 | Build, lint, migration, governance ve verification scriptleri |
| Geniş config lensi | 36 | TypeScript/package/build/test/workspace/CI configleri |
| Doküman ana alanı | 1.701 | Authority ve evidence ayrımıyla |
| Skill yolu/varlığı | 475 | Host, project ve builtin katmanlar; aynı ID farklı katmanda olabilir |
| `SKILL.md`/manifest tanımı | 224 | 134 `SKILL.md` paketini de kapsayan tanım lensi |
| Agent/rule yolu | 214 | Prompt, persona, manifest ve host role kuralları |
| Agent/PROMPT/rule tanımı | 96 | 45 PROMPT paketini kapsayan daha dar lens |
| Generated projection | 12 | Authority değil; canonical producer/hash ile karşılaştırıldı |

Source yüzey lensi örtüşebilir; çünkü bir dosya hem source hem de CLI yüzeyidir. Ölçümler:

- `core` 564, `orchestra` 232, `cli` 207, `dashboard` 137, `desktop` 85,
  `connectors` 64, `mcp` 61, `api` 44, `nervous` 34, `agents` 29,
  `agent` 27, `providers` 23, `intelligence` 15, `monitor` 6,
  `extensions` 4, `training` 4, `mcp-client` 4 ve `sdk` 2.

Generated identity ölçümleri 37.553 test descriptor, 96 Dashboard testi, 81+ CLI command,
51 MCP tool/8 resource, 22 builtin agent ve 35 builtin skill bildiriyor. Bunlar **projection verisidir**;
feature'ın çalıştığını tek başına kanıtlamaz.

## 14.3 Atlanan veya içeriği açılmayan dosyalar

Tracked envanterden ana alana bağlanmamış dosya **yoktur**. Buna karşılık aşağıdaki içerikler
bilinçli olarak semantik okumaya açılmadı:

- 3 database, 20 `.ed25519`, 13 PNG ve 36 font dosyası: toplam 72 binary/opaque artifact.
- 1 `tsbuildinfo` ve 1 log dosyası da ham içerik yerine metadata olarak ele alındı.
- 12 tracked dosya 1 MiB veya daha büyüktü; toplam 39.893.534 byte. Büyük JSON/Markdown/fixture
  dosyaları tam dump edilmedi; şema, anahtar, sayım ve ilgili satır aralıklarıyla sorgulandı.
- `.brain/memory.db` kesinlikle açılmadı, taşınmadı, silinmedi veya yeniden yaratılmadı.
- Private key, token, credential veya secret aranmadı ve okunmadı. `.ed25519` içerikleri bu nedenle
  public/private ayrımı yapılmadan opaque tutuldu.

Bu sınır “dosya yok sayıldı” demek değildir; isim, tür, boyut ve ana alan kapsamı envantere dahildir.
İçerik doğruluğu gereken binary/database iddiaları açık `HOLD` olarak kalır.

## 14.4 Untracked ve runtime ayrımı

Untracked/runtime dosyaları 7.029 tracked sayısına katılmadı. Baseline'da korunması gereken önceki
değişiklikler şunlardı:

- `.brain/exports/debt.md`, `memory.md`, `summary.md`
- `.deckent/provider-execution-observations.db`
- owner notification ve prompt-authority runtime JSONL kayıtları
- `follow-up-works/kernel-tree-closure-map.md`
- `.brain/ERRORS-critical.md`
- prompt-cost canary, closure-staging, runtime logs ve notification receipts
- üç versioned handoff dizini

Bu veriler başka oturumların/runtime'ın kanıtıdır. Silinmedi, normalize edilmedi, stage edilmedi ve
policy sayılmadı. Bu raporun kendisi owner talebiyle sonradan eklenen ayrı bir untracked continuity
belgesidir.

## 14.5 Çelişen kaynaklarda üstünlük

| Çelişki | Üstün kabul edilen | Neden |
|---|---|---|
| Canlı owner talimatı ↔ retained DIRECTIVES/eski sprint | Canlı owner + AGENTS control block | Canonical precedence bunu açıkça tanımlar |
| MASTER ↔ generated active projection | Canonical MASTER | Projection hash/sayı sağlar, policy üretmez |
| Worker self-report ↔ disk/immutable settlement | Disk diff + accepted settlement | Worker result girdi; terminal kabul değildir |
| 4033 ürün recovery'si ↔ 711–713 run durumu | İkisi ayrı gerçek | Ürün kodu kurtarılmış, run'lar yine ABORTED |
| 7140 DONE ↔ bugünkü ingress regression'ı | Tarihsel DONE korunur + yeni born child | Regression 7140 kapanışından sonra doğmuştur |
| 100/100 skor ↔ policy parity veto | Typed evaluator veto | Skor tek başına terminal karar değildir; fakat kayıp alan motor kusurudur |
| Dashboard/export ↔ source/runtime | Source + durable store/receipt | Dashboard yalnız observability projection'dır |
| Belge capability iddiası ↔ production consumer | Producer→consumer→entrypoint→config→binary | Test-only veya doküman-only wiring çalışma kanıtı değildir |

## 14.6 Ana bölüm güven seviyeleri

| Bölüm | Güven | Sınır |
|---|---|---|
| Ürün kimliği ve yüzey rolleri | Yüksek | Canonical IDENTITY/vision ve source aynı yönü gösteriyor |
| Gerçek çalışan yetenekler | Orta-yüksek | Source/test/runtime kanıtı var; bütün yüzeylerde fresh binary run yok |
| 711–713 kök nedeni | Yüksek | Archive result/evaluation/receipt ile bugünkü consumer kodu uyuşuyor |
| MASTER/DAG | Yüksek | 562 satır machine-parse ve canonical linter/projection çaprazlandı |
| Goal→handoff motor zinciri | Yüksek | Producer/consumer/entrypoint kodu okundu; dış provider davranışı ayrı HOLD |
| Provider/model/config/maliyet | Yüksek kod, orta canlılık | Live auth/reachability/limit/fiyat freshness secret-safe ölçülmedi |
| Principal/tenant/permission/approval | Orta-yüksek | Typed foundation güçlü; bütün stores/surface'lerde enforcement kanıtı yok |
| Memory/agent/skill/plugin | Yüksek kod, orta runtime | `.brain/memory.db` açılmadı; plugin lifecycle kısmi |
| Post-product uzaklık | Yüksek repo yorumu | Gerçek müşteri/IFS/fleet ortamı yok |
| macOS/Windows/WSL/accessibility | Orta-düşük | Hedef ve adapter kodu var; fresh native matrix yok |
| HA/DR/milyon ölçeği | Düşük/kanıtlanamadı | MASTER da bunları açık tutuyor |

## 14.7 Açık HOLD listesi

1. XVerify owner-deferred; farklı provider ile bağımsız verdict üretilmedi.
2. Canlı provider auth, entitlement, reachability, usage/limit ve pricing freshness ölçülmedi.
3. `.brain/memory.db` içeriği, tenant dağılımı, backup ve restore durumu bilinmiyor.
4. macOS, Windows-native ve WSL gerçek-binary matrixi bu analizde çalıştırılmadı.
5. Screen-reader, tam keyboard, contrast ve native accessibility matrixi canlı kanıtlanmadı.
6. Multi-tenant adversarial isolation, load/soak/chaos, milyon-scale ve HA/failover/DR kanıtı yok.
7. IFS erişimi, gerçek non-production tenant, müşteri data owner'ı ve reconciliation proof yok.
8. Legacy file-only 26 flow için migration/disposition authority belirlenmedi; otomatik ölüm/silme yok.
9. `.tasks` cleanup HOLD tarihsel receipttir; elle silme yetkisi üretmez.
10. Closure OS signer/private key owner custody'dir; içerik ve sign operasyonu kapsam dışıdır.
11. Post-product belgeleri `VISION_ONLY`; product-completion ilanı ve fresh admission yok.
12. Remote CI için owner 2026-08-30'da GitHub Actions aylık limitinin dolduğunu, 2026-09-01'e
    kadar job'ların kırmızı kalacağını bildirdi. Bu süre içinde durum
    **`REMOTE_ADVISORY / QUOTA_UNAVAILABLE`** kabul edilir; kod regression'ı diye etiketlenmez.
    Local verification yine zorunludur.

# Ek A — Goal'dan handoff'a tam çalışma zinciri

| Zincir | Karar ve veri nerede doğuyor? | Tüketici ve giriş | Gerçek ayar/kapı | Hüküm ve sessiz risk |
|---|---|---|---|---|
| Goal | `src/core/goal-mission.ts:192-337` hedef ve acceptance contract'ını üretir | MissionStore ve `advanceGoalMission` | Acceptance verifier ve round guard | Kısmen çalışıyor; verifier yoksa kapanmaz. `maxRounds` verilmezse local guard sonsuz olabilir (`:245-252`) |
| Mission | SQLite mission store, lease ve admission | `src/core/mission-engine-wire.ts:372-517` scheduler/runner/audit/delivery | Kind admission, lease, runner registry | Güçlü foundation; crash sırasında çalışan dispatch kör tekrar yerine park edilir (`:441-451`) |
| Flow | Durable event log + reducer | `src/core/run-flow-coordinator.ts:295-383,412-645,683-780`; API/Terminal | Expected sequence ve command dedupe | Kısmen çalışıyor; legacy dual-read/stale file ikinci truth riski |
| Run/Sprint | PLAN→execution→evaluation→cleanup controller | `src/orchestra/sprint-controller.ts:1865-2050` | DOGFOOD mode, effective config ve admission | Gerçek; terminal truth 711–713 kusurları nedeniyle kısmi |
| Autonomous | Mission lease/scheduler/runner ve delivery | `src/core/mission-engine-wire.ts:372-517`; CLI autonomous ingress | Opt-in config ve kind admission | Gerçek foundation; unattended publish-grade proof yok |
| Do | Kullanıcı niyeti, plan preview ve seçilen seam | `src/cli/commands/do.ts:228-326,391-501` | Command mode/confirmation/golden-flow seçimi | Kısmen çalışıyor; birden çok execution seam'i ve bazı hardcoded metinler var (`:111-116`) |
| Planner | DIRECTIVES/task goal → Task DAG ve runPolicy authority | `src/orchestra/run-policy-resolver.ts:56-100`; `sprint-planner.ts:1035-1047` | Effective config, routing ve policy resolver | Producer çalışıyor; 711 regression'ında consumer alanı düşürdü |
| Brain | Planner/controller/evaluator servislerini birleştiren facade | `src/orchestra/brain.ts` ve çağırdığı orchestra modülleri | Brain seçimi effective config'ten | Gerçek; sentetik Brain verdict disk truth yerine geçmez |
| Worker | Claim, scope, lock, heartbeat, provider call, atomic result | `src/agents/worker.ts:303-443,526-633,885-961` | Worker scope, backend, effective routing/config | Çalışıyor; self-report terminal kabul değildir |
| Evaluator | Canonical result + rubric + policy gates | `src/orchestra/result-evaluator.ts:316-473,1481-1626` | Rubric/applicability/runPolicy gates | Kısmi; doğru kanıt ingress'te düşerse yanlış NO_GO üretir |
| FIX | Typed NO_GO/debt/failure → retry/FIX task | `src/orchestra/debt-manager.ts:694-1001` ve sprint phases | Finite retry/depth/budget | Stop'lar var; disk-born lineage ve base task listesi ayrışırsa gereksiz child doğabilir |
| Recovery | Checkpoint ve typed recovery operation | `src/orchestra/sprint-recovery-operation.ts:388-598` | ADR-D-007 yalnız DEGRADED motor için bounded seam | Güçlü foundation; normal feature yolu değildir |
| Finalizer | Logical/exact attempts → terminal evidence ve receipt | `src/orchestra/sprint-finalizer.ts:2876-2957,3149-3165,4146-4308` | Evidence/failure gates | Kısmi; hiç dispatch edilmeyen plan node'u phantom attempt olabilir |
| Settlement | Attempt identity + result bytes/hash + host receipt | `src/orchestra/task-result-settlement.ts:698-714,972-988,2149-2291` | Immutable path ve exact ref | Docker yolu güçlü; evaluator/finalizer exact UUID/digest bağını her yerde taşımıyor |
| Archive | Hash-bound publication, reconcile, seal, verify | `src/orchestra/sprint-archive.ts:459-667,1257-1427,2016-2175` | Terminal receipt ve publication gates | Güçlü; HA/legal hold/restore matrixi açık |
| Approvals | Pending request + authenticated human decision | CLI live-auth consumer; durable broker (`docs/en/reference/authority-rbac.md:43-61`) | MCP yalnız read-only inbox; decide CLI'da | Core çalışıyor, surface convergence kısmi; self-approval yasak |
| Closure OS | Authenticated batch, append-only gate, projection settlement | Closure writer/signer ve canonical ledger | Owner custody + authenticated authority | Gerçek 7 olay var; elle MASTER/ledger edit closure değildir |
| Task handoff | Upstream artifact varlığı ve handoff record | `.tasks/handoffs` → downstream prompt (`handoff-protocol.ts:20-90`; `task-builder.ts:2360-2387`) | Config-gated injection | Kısmi; hata yolları `undefined` ile sessizleşebiliyor |
| Session handoff | Versioned receipt, digest ve openActions | Yeni main session doğrulayıcısı | `prepared → verified → committed` | Task handoff'tan ayrıdır; transcript authority değildir |

Bu zincirin ana duplicated-authority (iki doğruluk kaynağı) riskleri: flow DB ile legacy files,
worker result ile accepted settlement, plan node ile gerçek attempt, project/builtin skill katmanları,
source ile stale `dist`, canonical MASTER ile generated projection ve Terminal ile Desktop local state.

# Ek B — Bütün ürün yüzeylerinde aynı anlam sözleşmesi

| Yüzey | Bugünkü gerçek | Aynı kernel sözleşmesindeki açık |
|---|---|---|
| CLI | Geniş command registry ve gerçek service çağrıları var | Komut varlığı effect/terminal truth kanıtı değil |
| Terminal/TUI | Gerçek REPL, chat, approval, run/flow ve result feed | Büyük ölçüde in-process; Desktop ile aynı daemon client yolu değil |
| Desktop | Electron shell, daemon adopt/spawn, REST/SSE/WS ve sandboxed preload gerçek | İki shell/renderer-local state ve ayrı conversation identity |
| Dashboard | Gerçek projection ve gözlem | Doğru biçimde execution authority değil |
| HTTP API | Route, auth, SSE ve WS gerçek | Ortak versioned client protocol tamamlanmadı; SSE auth/chat query riski (`src/api/server.ts:1086-1121,2443-2468`) |
| MCP server | First-class tool/resource server var | Tool varlığı bütün operation/approval semantics'in aynı olduğunu kanıtlamaz |
| External MCP client | Production wiring var | Opt-in/default-off; birleşik lifecycle/Desktop Hub yok |
| Autonomous | Store, lease, scheduler, admission, recovery, delivery gerçek | Unattended closure ve publish-grade certification yok |
| Agent tools | Worker/tool contracts gerçek | Bütün tools operation identity, tenant ve approval envelope'ına bağlı değil |
| Connectors | Telegram/Discord/WhatsApp/gateway adapter foundation'ı var | Ortak application-service ve approval/effect parity canlı kanıtlanmadı |
| VS Code | Extension host integration mevcut | Dört source dosyasıyla dar; aynı terminal truth contractı canlı kanıtlanmadı |
| Bot/monitor/Nervous | Gerçek process, watcher ve meta-orchestration kodu var | Güncel canlı davranış ayrı runtime ölçümü ister; projection tek başına yeterli değil |
| Process/worker thread | Subprocess/container/worker-thread sınırları ve credential scrub parçaları var | Cancellation, backpressure, tenant/resource quota ve multi-host fencing bütün yollarda kanıtlı değil |

Önemli tasarım çelişkisi `docs/design/DECKENT-DESKTOP-TERMINAL-RECONCILIATION.md:44-77`
içinde açıkça kaydedilmiştir: ürün “iki client, tek runtime” olmak isterken bugün Terminal in-process,
Desktop daemon-client ve conversation aggregates ayrıdır. Bu nedenle yüzeylerin görünüşü benzer olsa
da aynı kalıcı kararı tükettiği henüz söylenemez.

# Ek C — Authority ve güven sınırlarını birbirinden ayırma

| Boyut | Bugünkü foundation | Açık sınır |
|---|---|---|
| Principal/kimlik | Verified principal, identity class, assurance ve provenance (`src/core/principal.ts:15-98`) | Strict enforcement config-gated; permissive yol tenant'sız çağrıyı `local` sayabilir (`:154-197`) |
| Tenant/project/resource/environment | Operation context bu scope'ları typed taşır | Bütün stores, surfaces ve effects'te mandatory enforcement yok |
| Operation kimliği | `operationId@version`, catalog ve invocation identity foundation'ı | 4034+ coverage/consumer children açık |
| Invocation ve causation | Invocation, transaction, attempt, correlation, causation typed envelope (`operation-invocation-identity.ts:42-145`) | Her adapter aynı envelope'ı üretmiyor |
| Durable effect | Effect attribution ve settlement parçaları var | External side-effect verification/reconciliation/compensation eksik |
| Permission/enforcement | RBAC evaluator ve realpath/tool containment var | 4040 alanı; bazı defaults off/advisory; 4030'a karıştırılamaz |
| Approval | Durable pending/decision primitives ve CLI live-auth var | 4050 alanı; role vocabulary/surface convergence kısmi |
| Receipt | Result, settlement, archive, approval, cross-verify ve Closure receipt aileleri var | Receipt türleri tek causal graph'ta birleşmiş değil |
| Audit | Event log, evaluation audit, provider observation ve Closure eventleri var | Accepted attempt UUID/result digest bağı ve tenant-scoped causal audit eksik |
| Secret/credential | Provider credential scrub/reinjection ve external custody ilkeleri var | Secret broker/rotation/revocation bütün surfaces için tek model değil; içerik bu analizde okunmadı |
| Idempotency | Operation idempotency, flow dedupe, immutable settlement var | External effect reconciliation ve duplicate-side-effect proof eksik |
| Replay | Hash/ref ve duplicate command korumaları var | Bütün adapters için replay window/nonce/fencing sözleşmesi yok |
| Cancellation/recovery | Mission lease, checkpoint, typed recovery ve archive reconciliation var | Cancellation accepted attempt/effect/compensation ile bütün yüzeylerde bağlı değil |

4030 sınırı değişmez: yalnız operation identity, coverage, invocation ve effect attribution. Permission
4040, approval 4050'dedir. 4030 ancak bütün children ve 4057 terminal olduğunda kapanabilir
(`docs/MASTER-PLAN.md:1110-1137`).

# Ek D — Provider, model, kapasite ve maliyet zinciri

1. **Effective config:** defaults → global → project merge ve validation
   `src/core/config.ts:2240-2289,3373-3436` içinde yapılır. Metindeki model adı authority değildir.
2. **Model registry:** provider ownership, API identity, capability ve pricing provenance
   `src/core/model-registry.ts:73-120` ve registry/catalog zincirinden gelir. Bilinmeyen cloud model
   isimden “ücretsiz” sayılamaz.
3. **Activation:** `model-activation-store.ts:29-57,278-293` implicit/explicit active state ve hard
   limit taşır.
4. **Routing:** task kind/tier/capability ve provider evidence merkezi resolver/routing engine'de
   birleşir. Model-family adına göre prose routing yapılmaz.
5. **Auth/reachability:** typed provider evidence, truth store ve reachability adapterları var;
   live entitlement bu raporda secret-safe biçimde ölçülmedi.
6. **Concurrency:** worker resolver config/system profile/plan limitini çözer
   (`config.ts:1698-1733`). DAG, file collision, tenant/host ve provider capacity kesişiminin bütün
   dispatch yollarında aynı anda uygulandığı canlı proof yok.
7. **Usage:** provider-reported usage normalizerları var. Bazı fallback'ler “ölçülmedi” provenance'ı
   taşır; sentetik tahmin gerçek provider usage yerine geçmemeli.
8. **Cost:** request token/USD ceiling ve unknown pricing fail-closed admission var
   (`cost-gate.ts:124-207`). Günlük/aylık cumulative gate default-off/warn-only olabilir (`:252-313`).
9. **Failure sınıfları:** auth, reachability, rate/limit, backend, output/framing ve unavailable typed
   sınıfları var; sessiz provider fallback doğru değildir.
10. **XVerify:** üretenden farklı provider, gerçek call, provider usage, terminal settlement ve
    durable verdict receipt ister (`cross-verify.ts:105-174`). Bu analizde owner-deferred kaldı.

Hüküm: karar kaynakları olgun ve provider-neutraldır; **canlı kapasite/entitlement/fiyat freshness'i
kanıtlanamadı**. Bu raporda geçen hiçbir provider/model adı gelecek run için route talimatı değildir.

# Ek E — Memory, agent, skill ve plugin sistemi

## E.1 Memory

- Repo-local core memory policy/kalıcı karar kaynağıdır; MASTER iş ledger'ıdır;
  `.brain/memory.db` ürün kullanıcı belleğidir (`MEMORY.md:1-6`; `AGENTS.md` operating rules).
- Ürün belleğinde SQLite/WAL/FTS5, relation/history ve tenant alanları gerçek
  (`memory-store.ts:129-257`; `memory-query.ts:169-304`).
- CLI remember/recall gerçek consumer'dır (`src/cli/commands/memory.ts:35-123`).
- “Recall salt-okunurdur” fiziksel olarak kanıtlı değildir: writable MemoryStore constructor schema
  migration/WAL açabilir (`memory-store.ts:135-160,219-257`). Bu nedenle analiz sırasında çağrılmadı.
- Explicit tenant istenirken foreign/legacy DB'de tenant kolonu yoksa query predicate'i atlayabilir
  (`memory-query.ts:306-355`). Canonical migration bunu düzeltir; canlı DB açılmadığı için risk HOLD.

## E.2 Agent ve PROMPT

- Prompt önceliği project `PROMPT.md` → runtime → builtin → aynı katmandaki `systemPrompt` degraded
  fallback'tir; içerikler gelişi güzel birleştirilmez (`agent-pool.ts:1220-1235,1366-1449`).
- Digest/persona integrity foundation'ı vardır.
- Prompt eksikliği her zaman fail-closed değildir; degraded persona ile devam edebilir. Bunun kabulü
  task assurance/routing policy'sine bağlı olmalıdır.
- Host `.codex/rules` interactive role talimatıdır; Deckent worker persona authority'si değildir.

## E.3 Skill

- Effective resolver masked/quarantined/retired skill'i ayırır; body path/budget probleminde typed
  HOLD üretir (`skill-pool.ts:1332-1400`).
- Explicit force/exclude production task-builder'a bağlıdır; body worker promptuna girer
  (`task-builder.ts:2390-2575,2710-2760`).
- Finalizer delivery attribution üretir fakat `appliedEvidence` üretmediğini açıkça söyler
  (`sprint-finalizer.ts:4259-4281`). “Promptta verildi” ile “işi gerçekten üretti” aynı değildir.
- Project/builtin/host katalogları farklı consumer ve layer'lardır. Aynı isimli üçüncü bir authority
  yaratılmamalıdır.

## E.4 Plugin

- Manifest, path containment, static scan, SHA integrity ve publisher identity foundation'ı gerçek
  (`plugin-loader.ts:1-12,60-101`).
- Default security enforcement advisory olabilir; uyarılan plugin yine yüklenebilir
  (`plugin-hooks.ts:123-175,298-343`).
- Invalid plugin directory scanner'da sessizce atlanabilir (`plugin.ts:168-195`).
- `beforeTask` ilan edilmiş fakat production çağrısı bulunamadı; `afterTask` çağrısı olsa da validated
  manifest alanı taşımıyor (`plugin-hooks.ts:120-142`; `plugin.ts:82-94,136-141`;
  `sprint-phases.ts:2687-2695`). Bu iki hook **yalnız görünüşte var** sayılır.

# Ek F — Kalite, platform, güvenlik ve ölçek

## F.1 Güçlü foundation

- Root, Dashboard ve Desktop TypeScript strict; root ayrıca `noUncheckedIndexedAccess`
  (`tsconfig.json:2-26`; Dashboard/Desktop tsconfigleri).
- i18n, hermeticity, model literal, CLI/MCP parity, manifest, operation ingress,
  approval/recovery authority ve Closure OS için geniş lint gate seti var (`package.json:39-62`).
- Atomic write, SQLite WAL, lease, digest, immutable settlement, archive seal ve recovery store
  desenleri yaygın.
- Electron window `contextIsolation`/sandbox açık, Node integration kapalı
  (`src/desktop/src/main/window-manager.ts:101-115`).
- Test altyapısı geniş; fakat test sayısı tek başına proof değildir.

## F.2 Açık kalite riskleri

- i18n kapsamlı olsa da `src/cli/commands/do.ts:111-116` ve `memory.ts:323-353` gibi hardcoded
  kullanıcı metinleri sürüyor.
- Test-only import, fixture-local reimplementation ve mock green riski capability başına gerçek
  producer→consumer→entrypoint→policy→binary zinciriyle kapatılmalı.
- Plugin hook mismatch, best-effort handoff, surface-local state ve ingress alan kaybı dead/unwired
  veya fail-open/fail-wrong örnekleridir.
- Source/dist/long-lived process kimliği build ve restart/reconnect olmadan eşit varsayılamaz.
- Yanlış başarı kadar yanlış ölüm de risktir: 711–713 fail-closed görünürken doğru kanıtı kaybedip
  gerçek işi öldürmüştür.

## F.3 Platform ve scale hükmü

Linux/macOS/Windows-native/WSL hedefi canonical kimlikte vardır; aynı product model tasarımda
korunur. Fakat aşağıdakiler MASTER'da da OPEN'dır:

- million-scale assurance (`docs/MASTER-PLAN.md:1347`)
- distributed storage adapter (`:1348-1349`)
- data lifecycle/residency/delete (`:1350`)
- HA/failover/DR (`:1351`)
- SLO ve load/chaos (`:1352-1353`)
- cost authority (`:1354-1355`)
- enterprise no-fork modularity (`:1356-1360`)
- assurance pack (`:1361`)

Sonuç: solo kullanıcıdan en büyük kuruluşa **aynı kavramsal ürün modeli** korunuyor; milyon-scale,
yüksek erişilebilirlik, backup/DR ve bütün native platformlar bugün production-proof değildir.

## F.4 Security hükmü

Typed principal, tenant scope, approval, RBAC, realpath containment, Electron sandbox, provider
credential separation, plugin publisher identity ve tamper-evident receipt güçlü parçalardır.
Ancak RBAC/tenant/capability enforcement'ın bazı defaults'ları off/advisory; role vocabularies
birleşik değil; SSE token/chat query riski var; plugin default advisory ve tenant isolation bütün
stores/surfaces için kanıtlanmış değil. Repository-local policy de tek başına managed enterprise
security boundary değildir.

# Ek G — Kabul sonrası yürütme ve kanıt durumu

Bu ek analiz sonucundan sonra oluşan yürütme bilgisidir; önceki hükmü geriye dönük değiştirmez.

- Alperen A → operational skill ailesi → C → B sırasını kabul etti ve bu oturumu main execution
  session olarak yetkilendirdi; ayrı session handoff istemedi.
- İlk bounded motor recovery kimliği:
  `RECOVERY-BORN-711-RUN-POLICY-EVIDENCE-INGRESS-001`.
- Recovery, tarihsel `RUN-POLICY-DELIVERY-001` kapanışını silmez; 2026-08-24 sonrası ingress
  regression'ını yeni born child olarak sahiplenir.
- Exact scope yalnız canonical ingress'te `runPolicyEvidence` ve `productionWiringEvidence`
  preservation, schema growth classification, regression tests ve compiled binary proof'tur.
- Accepted-attempt UUID/digest, phantom attempt, FIX fingerprint/depth, death-sweep ve `.tasks`
  disposition sonraki ayrı outcome'lardır; bu pakete karıştırılmaz.
- `follow-up-works/current-flow.md` yalnız context kaybı riski doğarsa geçici yaz/sil buffer'ıdır;
  authority, receipt veya MASTER değildir. Bu belge kalıcı continuity kaynağıdır ama yine policy
  üretmez.
- GitHub Actions quota owner bilgisi nedeniyle 2026-09-01'e kadar remote kırmızı beklenir.
  Kapanış dili ayrı tutulur: `LOCAL_VERIFIED` ve `REMOTE_ADVISORY=QUOTA_UNAVAILABLE_UNTIL_2026-09-01`.
- İlk dar recovery'nin testleri alan kaybını doğru yakalayıp source düzeltmesini yeşile taşıdı; ancak
  bağımsız inceleme, worker JSON ile host-authored `hostTerminalProjection`/`workerId` provenance'ının
  aynı ingress nesnesinde ayrılmadığını kanıtladı. Paket build/landing öncesi
  `HOLD:host-ingress-provenance-unseparated` ile durdu; MASTER'da typed blocker olarak kaydedildi.
  Güvenli devam, Docker caller ve durable host channel'ı sahiplenen ayrı bounded successor'dır.

# Ek H — İkinci motor recovery'sinin bağımsız güven hükmü

Bu ek 2026-08-30'da ilk analizin kabulünden sonra yürütülen
`RECOVERY-BORN-711-HOST-INGRESS-PROVENANCE-002` paketinin kanıtını kayıpsız taşır. Ana analiz
hükümlerini geriye dönük değiştirmez.

Paket; worker ingress, task authority ve host observation alanlarını strict üç kanala ayırdı;
bounded/private raw snapshot, immutable task-ingress sidecar, host observation seal ve additive V2
settlement foundation'ı kurdu. Raw worker'ın host-shaped alanları ile worker identity'sinin canonical
sonucu değiştirmesini engelleyen core testler üretildi. Ancak bağımsız crash, proof-governance ve
security incelemeleri bu ara tasarımın production closure olmadığını kanıtladı.

`BLOCKS_CURRENT_DONE` bulguları:

1. Normal Docker task authority, host-private receipt'ten önce worker-writable
   `.tasks/task-<id>.json` dosyasını okur. Sonradan üretilen digest, kaynağın host-authored olduğunu
   kanıtlamaz. Exact-v2 için var olan attempt-private snapshot normal implementation yolunda yoktur.
2. `.result`, `.partial-result`, `.timeout` ve `.log` task-level ortak `.tasks` mount'unda bütün
   implementation worker'larına read-write açıktır. Başlangıçtaki absence fence, fence sonrasında
   sibling/prior worker yazımını veya cross-attempt replay'i fiziksel olarak engellemez.
3. Worker-writable eski task loguna host normalized satırları eklenir; ardından birleşik log billing
   receipt ve sınırlı `xverify-v1` terminal verdict girdisi olabilir. Böylece worker-controlled bytes
   host-private authority'ye yükseltilebilir.
4. Partial-result promotion yolu no-follow, regular-file, link-count ve boyut sınırını uygulamaz;
   symlink/FIFO/oversize ve hata halinde evidence silme riski taşır.
5. Production continuation bugün landing yapan A attempt'inden B continuation'a ulaşır; B yeniden
   landing checkpoint üretmediği için gerçek A→B→C zinciri yoktur. Test factory'siyle ikinci
   checkpoint üretmek production wiring kanıtı sayılmaz.
6. Source `npx tsc --noEmit` ve `git diff --check` temizdir, fakat root tsconfig test/scriptleri
   derlemez. Scoped ölçüm core'da `23 pass / 16 fail`, diğer yedi suite'te `49 pass / 72 fail`dir;
   ikinci grupta dört bilinen sandbox `execSync EPERM` vardır. Yirmi iki test/script caller zorunlu
   `resultIngressFence` alanını taşımamaktadır. Build ve compiled proof bu nedenle başlatılmadı.

Hüküm: **`HOLD:attempt-private-ingress-and-host-task-authority-unavailable`**. İkinci recovery
branch'i de landing/commit/push/canary/Closure olmadan forensic kanıt olarak korunur. Güvenli
successor; host-authored immutable task snapshot'ı attempt publication'dan önce kurmalı;
result/partial/timeout/log için exact-attempt private output mount kullanmalı; billing ve terminal
receipt'i yalnız pristine current provider capture veya host-private evidence'dan üretmeli;
restart/adoption/result-collector zincirini exact settlement'a bağlamalı; gerçek historical V1 ile
V2 attempt'i ayırmalı; etkilenen legacy testleri ve hermetic inventory ratchet'ını exact scope'a
almalıdır. Mevcut capsule union'ı bu producer/consumer dosyalarını kapsamadığı için ayrı owner
admission olmadan uygulanamaz.

---

Bu rapor yeni iş başlatan authority değildir. Kalıcı görevi, yeniden bütün-repo analizine dönmeden
kanıtlı baseline'ı, kabul edilen sırayı, açık kusurları ve `HOLD` sınırlarını kayıpsız taşımaktır.
Canlı disk/runtime her mutation ve closure öncesinde yine yeniden ölçülür.

# Ek I — Motor A için güvenli successor admission tasarımı

Bu ek, `RECOVERY-BORN-711-HOST-INGRESS-PROVENANCE-002` bağımsız NO_GO kararından sonra yapılan
üç ayrı salt-okunur incelemenin birleşimidir. **Henüz başlamış bir outcome, recovery, sprint, run
veya write authority değildir.** Önerilen bounded successor kimliği:

`NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001`

## I.1 Sonuç ve neden ayrı admission gerekiyor

İkinci recovery'deki üç-kanallı schema ve host seal foundation'ı korunabilir; fakat mevcut capsule
normal Docker task üreticilerini, shared `.tasks` mount'unu, restart/adoption consumer'larını,
billing/finalization zincirini ve bütün legacy fixture göçünü yazmaya yetkili değildir. Bu dosyaları
sessizce capsule'a eklemek kapsam genişletme olur. Güvenli devam ancak owner'ın aşağıdaki exact
sınırı tek bir sonuç olarak kabul etmesiyle başlayabilir.

Bu genişlik keyfî değildir. İlk 20 production adayının ikinci incelemesinde şu gizli consumer ve
producer'lar ayrıca bulundu:

- `src/core/task-settlement-authority.ts:948-1008`, ortak `.result` içindeki worker
  `selfAssessment` değerini terminal invocation disposition'a çevirebiliyor.
- `src/core/task-settlement-authority.ts:1077-1119`, ortak task JSON'ını receipt projection'ı için
  yeniden authority girdisi yapıyor.
- `src/cli/commands/run.ts:726-755` ve `src/mcp/tools/run.ts:183-190`, host belleğindeki task'ı
  ortak JSON'a yazdıktan sonra snapshot/ref olmadan spawn ediyor.
- `src/orchestra/debt-manager.ts:928-1001` ve `:1018-1119`, FIX/XFIX task'larını doğrudan ortak
  JSON'a yayımlıyor ve eski task/result projection'larını tekrar okuyor.
- `src/orchestra/cross-verify-production-ingress-authority.ts:890-936`, verifier attempt ve
  claim'ini verifier task snapshot'ı doğmadan önce yayımlıyor.
- `src/orchestra/cross-verify-docker-runtime-authority.ts:204-228`, coordinator'ın doğruladığı
  `request.taskSnapshot` bilgisini Docker backend'e taşımıyor.
- `src/cli/commands/finalize.ts:136-220` ve `src/orchestra/sprint-finalizer.ts:2539-2796`, normal
  veya recovery kapanışında ortak/arşiv task ve result projection'larını tekrar truth yapabiliyor.
- `src/orchestra/sprint-finalizer.ts:3912-3996`, helper cost'u ortak task logundan türetiyor.

Bu bulguların tümü `BLOCKS_CURRENT_DONE` sınıfındadır. Multi-hop continuation, evaluator rubriği,
FIX politikası, routing, model/provider seçimi, permission/approval enforcement ve non-Docker
backend göçü bu successor'ın sonucu değildir.

## I.2 Tek canonical veri akışı

```text
host belleğindeki Task / Plan / FIX / XVerify task
    ↓ immutable DockerTaskAdmissionEnvelopeV1
host-private exact-attempt dizini hazırlanır
    ├── task-snapshot.json          host-authored, immutable, container'a read-only
    ├── worker-output/              yalnız bu attempt container'ına read-write
    │   ├── task-<id>.result
    │   ├── task-<id>.partial-result
    │   ├── task-<id>.timeout
    │   ├── task-<id>.log
    │   ├── task-<id>.hb
    │   ├── task-<id>.question
    │   └── task-<id>.answer
    ├── worker-ingress.raw          ilk dondurulan bounded worker bytes
    ├── provider-capture.raw        pristine current-attempt Docker stream
    ├── task-ingress-authority.json
    ├── host-observation-seal.json
    ├── settled.json
    └── closure.json
    ↓ yalnız terminal closure sonrasında
project .tasks/*.json/result/log/hb  compatibility + observability projection
```

Project `.tasks` kullanıcı/operatör gözlem yüzeyi olmaya devam eder; ancak task identity, accepted
attempt, result acceptance, timeout, billing, XVerify verdict, restart/adoption veya finalization
kararı için authority olamaz.

## I.3 Değişmez güven kuralları

1. Host-private task snapshot ve exact output dizini **attempt/claim publication'dan önce** hazır
   olmalıdır. Crash bu sırayı tersine çeviremez.
2. Backend task authority'yi hiçbir normal Docker yolunda `.tasks/task-<id>.json` üzerinden yeniden
   okuyamaz. Yeni callsite snapshot/ref vermezse compile-time veya runtime typed HOLD üretir.
3. Her attempt'ın ayrı `worker-output/` dizini container içinde `/workspace/.tasks` üzerine bağlanır;
   project'in ortak `.tasks` dizini container'a görünmez. Exact task snapshot ayrıca read-only bind
   edilir.
4. Result, partial-result, timeout ve log yalnız bounded, regular-file, no-follow, link-count,
   inode/device ve boyut doğrulamasından sonra dondurulur. Symlink, FIFO, oversize veya değişen inode
   terminal başarı üretemez.
5. Pristine provider stream önce host-private alana first-writer olarak kaydedilir. Normalize edilmiş
   veya worker'ın yazabildiği public log billing/verdict authority'si değildir.
6. Terminal billing receipt yalnız tamamlanmış final capture'dan doğar. Eksik capture, canlı akıştaki
   ilk usage envelope veya sonradan zenginleştirilen public log maliyet gerçeği üretemez.
7. Settled Docker sonucu `result-collector`, autonomous consumer, finalizer veya CLI finalize
   tarafından public log/result ile yeniden zenginleştirilemez ya da semantik olarak değiştirilemez.
8. Restart/adoption exact attempt ref + private claim/dispatch/container label + private artifacts
   üzerinden çözülür. Public task-level artifact yeni attempt seçemez.
9. Geç biten eski attempt, ordinal/CAS koruması olmadan yeni public projection'ı ezemez.
10. Continuation parent'ın immutable task admission ve terminal receipt'lerini digest ile miras alır;
    kendi output dizini ayrıdır. Parent billing archive logundan tekrar parse edilmez.
11. Açık veya belirsiz private attempt artifact'ı silinmez. Retention/backup/DR ayrı policy'dir;
    cleanup bu pakette authority evidence yok edemez.
12. POSIX/macOS/Linux/WSL adapterı `0700/0600`, no-follow, inode tekrar doğrulaması ve durable
    first-writer uygular. Runtime root DrvFS üzerindeyse capability ayrıca kanıtlanır.
13. Windows-native adapter owner-only DACL'ı uygular ve geri okuyarak doğrular; reparse point'i
    reddeder, exclusive create/no-replace ve flush uygular. Bunlar kanıtlanamıyorsa sessiz POSIX
    fallback değil typed `HOLD` üretir.
14. XVerify provider ayrımı, approval authority, evaluator/finalizer karar politikası ve effective
    config routing bu altyapı değişikliğiyle genişletilemez.
15. Gerçek üç veya daha fazla continuation hop'u bu pakete fixture ile taklit edilmez; ayrı outcome
    olarak kalır.

## I.4 Production write-eligible allowlist — 33 path

Bu liste azami yazma sınırıdır; yeşil kalan dosyayı değiştirme zorunluluğu vermez. Liste dışı bir
production mutation gerekirse paket otomatik genişlemez, typed scope HOLD verir.

### Core custody ve terminal authority — 6

1. `src/core/task-result-settlement.ts`
2. `src/core/task-result-schema.ts`
3. `src/core/task-settlement-authority.ts`
4. `src/core/task-attempt-custody-store.ts` — NEW
5. `src/core/task-attempt-custody-posix-adapter.ts` — NEW
6. `src/core/task-attempt-custody-win32-adapter.ts` — NEW

### Task/FIX üretimi ve host snapshot publication — 7

7. `src/orchestra/sprint-planner.ts`
8. `src/orchestra/task-artifact-projection.ts`
9. `src/orchestra/scheduler-effects.ts`
10. `src/orchestra/sprint-phases.ts`
11. `src/orchestra/sprint-spawner.ts`
12. `src/orchestra/task-mode-runner.ts`
13. `src/orchestra/debt-manager.ts`

### Entrypoint ve dispatch sınırları — 9

14. `src/orchestra/spawn-backend.ts`
15. `src/orchestra/spawn-backend-docker.ts`
16. `src/cli/commands/spawn.ts`
17. `src/cli/commands/run.ts`
18. `src/mcp/tools/run.ts`
19. `src/orchestra/execution-continuation-runner.ts`
20. `src/orchestra/cross-verify-production-ingress-authority.ts`
21. `src/orchestra/cross-verify-docker-runtime-authority.ts`
22. `src/orchestra/cross-verify-runner.ts`

### Result ingress, collection ve projection — 7

23. `src/orchestra/result-ingress.ts`
24. `src/orchestra/result-assembler.ts`
25. `src/orchestra/task-result-authority.ts`
26. `src/orchestra/result-collector.ts`
27. `src/orchestra/task-settlement-projection.ts`
28. `src/orchestra/autonomous/execute-dispatcher.ts`
29. `src/orchestra/ipc-registry.ts`

### Restart, adoption ve closure — 4

30. `src/orchestra/sprint-checkpoint.ts`
31. `src/cli/commands/resume.ts`
32. `src/orchestra/sprint-finalizer.ts`
33. `src/cli/commands/finalize.ts`

Carry-forward foundation yalnız ikinci recovery'nin beş production değişikliğidir:
`task-result-settlement.ts`, `task-result-schema.ts`, `result-ingress.ts`, `result-assembler.ts` ve
`spawn-backend-docker.ts`. Eski branch bütün olarak merge/cherry-pick edilmez; HOLD kayıtları ve
NO_GO nedenleri korunarak exact diff yeniden sahiplenilir.

## I.5 Test, script ve fixture manifesti — 126 benzersiz path

Bu sayı “hepsi değişecek” demek değildir. `MUTATE-ALLOWED`, production type/API veya gerçek
authority davranışı nedeniyle ancak gerektiğinde değiştirilebilir. `VERIFY-ONLY` regression
yüzeyidir; davranış kırılırsa production tasarımına dönülür, test beklentisi gevşetilmez.

### MUTATE-ALLOWED — 101

- `scripts/lint-test-hermeticity.mjs`
- `scripts/test-binary-contracts.mjs`
- `tests/backends/docker-corrupt-result-recovery.test.ts`
- `tests/cli/run-result-settlement.test.ts`
- `tests/cli/spawn-final-only-parity.test.ts`
- `tests/cli/spawn-lifecycle.test.ts`
- `tests/cli/spawn-settlement-attempt.test.ts`
- `tests/core/cross-verify-evidence-broker.test.ts`
- `tests/core/execution-termination-ledger.test.ts`
- `tests/core/provider-execution-observation-reconciliation-approval.test.ts`
- `tests/core/provider-execution-observation-reconciliation-receipt-store.test.ts`
- `tests/core/provider-execution-observation-reconciliation.test.ts`
- `tests/core/task-result-schema.test.ts`
- `tests/core/task-result-settlement.test.ts`
- `tests/helpers/task-result-settlement-stub.ts`
- `tests/helpers/task-result-settlement-v2-fixture.ts` — NEW
- `tests/integration/provider-execution-observation-reconciliation.integration.test.ts`
- `tests/integration/xverify-claude-model-limit-window.integration.test.ts`
- `tests/integration/xverify-owner-tier-authority.integration.test.ts`
- `tests/orchestra/acceptance-authority-restart.integration.test.ts`
- `tests/orchestra/checkpoint-cascade-restore.test.ts`
- `tests/orchestra/cross-verify-docker-runtime-authority.test.ts`
- `tests/orchestra/cross-verify-docker-strict-launcher.test.ts`
- `tests/orchestra/cross-verify-owner-tier-authority.test.ts`
- `tests/orchestra/cross-verify-production-ingress-authority.test.ts`
- `tests/orchestra/cross-verify-provider-observation-retirement.test.ts`
- `tests/orchestra/cross-verify-wire.test.ts`
- `tests/orchestra/docker-auth-precedence.test.ts`
- `tests/orchestra/docker-container-start-failed.test.ts`
- `tests/orchestra/docker-continuation-lineage.test.ts`
- `tests/orchestra/docker-dist-guard.test.ts`
- `tests/orchestra/docker-final-only-containment.test.ts`
- `tests/orchestra/docker-multicli-buildarg.test.ts`
- `tests/orchestra/docker-provider-auth.test.ts`
- `tests/orchestra/docker-provider-cli.test.ts`
- `tests/orchestra/docker-restart-reconcile.test.ts`
- `tests/orchestra/docker-result-settlement.test.ts`
- `tests/orchestra/docker-settlement-monitor-wire.test.ts`
- `tests/orchestra/f1014-auth-isolation.test.ts`
- `tests/orchestra/memory-limit-by-kind.test.ts`
- `tests/orchestra/result-assembler.test.ts`
- `tests/orchestra/result-collector-settlement-authority.test.ts`
- `tests/orchestra/spawn-backend-docker-mounts.test.ts`
- `tests/orchestra/spawn-backend-docker.test.ts`
- `tests/orchestra/sprint-checkpoint.test.ts`
- `tests/orchestra/sprint-terminal-settlement-hold.test.ts`
- `tests/orchestra/state-recovery.test.ts`
- `tests/orchestra/task-result-authority.test.ts`
- `tests/orchestra/wm5-auth-guard.test.ts`
- `tests/orchestra/worker-auth-isolation.test.ts`
- `tests/orchestra/xverify-producer-fencing.test.ts`
- `tests/unit/spawn-backend-docker.test.ts`
- `tests/cli/task-settlement.test.ts`
- `tests/core/task-settlement-authority.test.ts`
- `tests/cli/run.test.ts`
- `tests/cli/run-pre-dispatch-settlement.test.ts`
- `tests/mcp/run-tool-parity.test.ts`
- `tests/mcp/tools/run.test.ts`
- `tests/cli/finalize-termination-truth.test.ts`
- `tests/cli/finalize-orphan-normal.test.ts`
- `tests/cli/finalize-refinalize.test.ts`
- `tests/cli/force-finalize-contract.test.ts`
- `tests/orchestra/finalize-coordinator-retirement.test.ts`
- `tests/orchestra/sprint-finalizer-terminal-wire.test.ts`
- `tests/orchestra/finalize-sprint.test.ts`
- `tests/orchestra/sprint-finalizer-task-projection.test.ts`
- `tests/orchestra/sprint-finalizer-terminal-publication.test.ts`
- `tests/orchestra/sprint-finalizer.test.ts`
- `tests/core/task-attempt-custody-store.test.ts` — NEW
- `tests/core/task-attempt-custody-posix-adapter.test.ts` — NEW
- `tests/core/task-attempt-custody-win32-adapter.test.ts` — NEW
- `tests/cli/run-attempt-custody.test.ts` — NEW
- `tests/mcp/run-attempt-custody.test.ts` — NEW
- `tests/cli/finalize-attempt-custody.test.ts` — NEW
- `tests/orchestra/sprint-finalizer-attempt-custody.test.ts` — NEW
- `tests/integration/task-attempt-custody-cutover.integration.test.ts` — NEW
- `tests/orchestra/debt-manager-fix-authority-wire.test.ts`
- `tests/orchestra/evaluation-honesty-negative-replay.test.ts`
- `tests/orchestra/evaluate-enforcement-gates.test.ts`
- `tests/orchestra/fix-agent-selection.test.ts`
- `tests/orchestra/debt-manager.test.ts`
- `tests/orchestra/postfix-pending-scan.test.ts`
- `tests/orchestra/repair-task-constraint-inheritance.test.ts`
- `tests/orchestra/evaluate-phase-idempotency.test.ts`
- `tests/orchestra/gwtd-fix-trigger.test.ts`
- `tests/orchestra/evaluate-trigger-gate.test.ts`
- `tests/orchestra/scheduler-cascade-composition.test.ts`
- `tests/orchestra/fix-task-force-skills.test.ts`
- `tests/orchestra/failure-disposition-chain.test.ts`
- `tests/orchestra/fix-phase-map.test.ts`
- `tests/orchestra/fix-task-enrichment.test.ts`
- `tests/orchestra/fix-retry-circuit-breaker.test.ts`
- `tests/orchestra/planner-evaluation-recovery.integration.test.ts`
- `tests/orchestra/debt-manager-attempt-custody.test.ts` — NEW
- `tests/orchestra/fix-dispatch-continuation.test.ts`
- `tests/orchestra/execute-fix-quiescence.integration.test.ts`
- `tests/orchestra/repair-dispatch-chain-seal.test.ts`
- `tests/orchestra/repair-overflow-dispatch.test.ts`
- `tests/orchestra/cascade-unblock-wire.test.ts`
- `tests/orchestra/repair-quiescence-gate.test.ts`
- `tests/orchestra/scheduler-single-truth.test.ts`

### VERIFY-ONLY — 25

- `tests/scripts/lint-test-hermeticity.test.ts`
- `tests/cli/commands.test.ts`
- `tests/cli/run-flow-inbox.test.ts`
- `tests/orchestra/run-flow-decision-service.test.ts`
- `tests/cli/run-budget-contract.test.ts`
- `tests/cli/commands/run.test.ts`
- `tests/cli/commands/run-overhaul.test.ts`
- `tests/cli/index.test.ts`
- `tests/mcp/run-budget-authority.test.ts`
- `tests/mcp/run-provider-free.test.ts`
- `tests/cli/commands/finalize.test.ts`
- `tests/orchestra/decay-config-wire.test.ts`
- `tests/orchestra/debt-manager-acceptance-route.test.ts`
- `tests/orchestra/debt-ledger-coverage.test.ts`
- `tests/orchestra/debt-injection-success-echo.test.ts`
- `tests/orchestra/memory-decay.test.ts`
- `tests/orchestra/brain-integration.test.ts`
- `tests/orchestra/scope-w1b.test.ts`
- `tests/orchestra/debt364-followups.test.ts`
- `tests/orchestra/brain-budget-decay.test.ts`
- `tests/orchestra/fresh-eyes-rotation.test.ts`
- `tests/orchestra/format-consistency.test.ts`
- `tests/orchestra/promote-w1b.test.ts`
- `tests/orchestra/brain-provider.test.ts`
- `tests/orchestra/fix-repair-authority.test.ts`

Mevcut 116 path diskte vardır; on `NEW` test/helper path'i successor içinde doğacaktır. Mevcut
V1 writer ölçümü 26 test dosyası / 59 çağrıdır. İkinci recovery capsule'ı dışındaki 24 dosyada 42
çağrı bulunur. Gerçek V2 fixture, production settlement API'lerini kullanmalı; test-local sahte
receipt veya V2 attempt + V1 settlement karışımı üretmemelidir. Historical V1 yalnız açık
`historicalV1` cutover profiliyle yazılabilir.

## I.6 Authority/projection yazma zarfı

Successor admit edilirse implementation scope'a ek olarak yalnız şu yönetişim dosyaları yazılabilir:

- `DIRECTIVES.md`
- `docs/MASTER-PLAN.md`
- `docs/generated/master-plan-active.json`
- `docs/generated/master-plan-active.md`
- `docs/execution/active/RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001.md` — NEW
- Aynı capsule'ın `.expected-red.json` dosyası — NEW

`follow-up-works/current-flow.md` yalnız continuity projection'ıdır; authority değildir. Closure OS
ledger/signer, `.brain/memory.db`, `.tasks` manual deletion, config, skill, provider credential ve
başka MASTER outcome'ları bu yazma zarfının dışındadır.

## I.7 İç bağımlılık DAG'ı

Bu sonuç tek mega-task olarak bir workera verilmez. Aynı atomik closure altında collision-aware
bağımlı dilimler şunlardır:

1. **Expected-red ve custody kernel:** private store, POSIX/Win32 adapter, immutable schema ve
   first-writer/tamper testleri.
2. **Task producer/admission:** Plan, CLI, MCP, scheduler, FIX/XFIX, continuation ve XVerify task
   snapshot'ının attempt publication'dan önce host-private olması.
3. **Docker physical boundary:** exact-attempt mount, read-only task snapshot, pristine stream,
   bounded result/partial/timeout/log ve attempt-private IPC.
4. **Canonical consumers:** result ingress/collector, invocation settlement, restart/adoption,
   autonomous, finalizer ve CLI finalize'ın yalnız exact settlement tüketmesi.
5. **Projection ve cutover:** public `.tasks` CAS projection, genuine historical V1 ayrımı, shared
   log/result fallback'larının exact Docker altında kapanması.
6. **Test/hermeticity göçü:** 59 V1 writer çağrısı, shared stub tüketicileri ve source-derived
   hermetic fingerprint yalnız nihai ağaçta güncellenir.
7. **Gerçek çalışma kanıtı:** scoped testler, TypeScript/gates, build sonrası compiled CLI ve ağsız
   hermetic Docker canary, ardından ayrı bağımsız read-only verification.

Bir dilim ara-artifact üretebilir; fakat 1–7 zinciri kapanmadan parent sonuç `DONE`/`COMPLETE`
olamaz. Aynı dosyaya yazan dilimler paralel çalışmaz; bağımsız POSIX, Windows, ingress ve test
census işleri kapasite/effective config elverdiği ölçüde paralel olabilir. Provider/model/worker
sayısı instruction metninden seçilmez.

## I.8 Kapanış kanıtı ve durma koşulları

Zorunlu local proof:

- Expected-red, shared task/result/log/timeout spoof ve cross-attempt replay'i gerçekten göstermeli.
- Yeni store ve platform adapter testleri; custody yok/tamper/unsupported durumda typed HOLD.
- CLI, MCP, Sprint, FIX/XFIX, continuation ve XVerify task snapshot producer testleri.
- Result collector, invocation settlement, restart, finalizer ve force-finalize exact accepted
  attempt testleri.
- `npx tsc --noEmit`, scoped Vitest grupları, binary-contract ve hermeticity gate.
- Nihai ağaçtan source-derived hermetic inventory; ara kırmızı ağacın fingerprint'i baseline olmaz.
- Aktif sprint/worker yokken build; sonra compiled CLI + provider çağrısı yapmayan hermetic gerçek
  Docker canary. Mock-only yeşil closure değildir.
- Independent read-only verification. XVerify owner-deferred kaldığı sürece çağrılmaz ve closure
  receipt'i varmış gibi gösterilmez.

2026-09-01'e kadar GitHub Actions aylık quota yoktur. Bu nedenle uzak kırmızı/çalışmayan job yalnız
`REMOTE_ADVISORY / QUOTA_UNAVAILABLE_UNTIL_2026-09-01` olarak raporlanır. `LOCAL_VERIFIED` yerine
geçmez; aynı zamanda tek başına code regression kanıtı da değildir.

Aşağıdakilerde successor hemen durur:

- 33 production path veya authority zarfı dışında mutation ihtiyacı;
- mevcut dirty main değişiklikleriyle gerçek collision;
- aktif sprint/worker/container veya belirsiz attempt;
- task snapshot'ın shared `.tasks` kaynağından yeniden üretilmesi;
- public log/result fallback'ının billing, verdict veya terminal truth'a geri girmesi;
- Windows capability kanıtı olmadan başarı fallback'ı;
- gerçek Docker kanıtı olmadan mock-only yeşil;
- multi-hop continuation, permission/approval, routing veya non-Docker migration ihtiyacı;
- commit, push, kill/cleanup, XVerify veya Closure signing için ayrı owner authority olmaması.

## I.9 Açık owner kararı

Bu exact kapsam henüz admit edilmemiştir. Owner kabul ederse yeni capsule fresh main/runtime
snapshot'ından hazırlanır; iki HOLD branch'i forensic olarak korunur. Commit/push authority bu
admission'ın içinde değildir ve ayrıca istenir.
