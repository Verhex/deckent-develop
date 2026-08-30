# Deckent dogfood CTO yürütme sözleşmesi

> Tarih: 2026-08-30
> Amaç: Bu belge yeni bir iş planı veya authority kaynağı değildir. Deckent geliştirme
> çalışmalarının hangi sırayla, hangi gerçeklik kaynaklarıyla ve hangi kapanış kanıtıyla
> yürütüleceğini tanımlar. İş ve durum SSOT'u `docs/MASTER-PLAN.md` olarak kalır.
>
> Bu belge gelecekte bir Goal talimatına eklenebilir. Her yeni kullanımda branch, HEAD,
> worktree, runtime, MASTER, Closure OS ve açık HOLD'lar diskten yeniden ölçülür; aşağıdaki
> tarihli snapshot körü körüne yeniden kullanılmaz.

## 1. Kaynakların rolleri

Bu dört kaynak birbirinin yerine geçmez:

| Kaynak | Rolü | Üretemeyeceği şey |
|---|---|---|
| Alperen'in canlı talimatı + `AGENTS.md` + canonical operating policy | Yetki, çalışma modu ve değişmez sınırlar | Tek başına ürünün çalıştığı kanıtı |
| `docs/MASTER-PLAN.md` | Tek canonical iş planı, durum ve dependency ledger'ı | Runtime'ın gerçekten canlı/terminal olduğu iddiası |
| `follow-up-works/deckent-full-code-truth-analysis-2026-08-30.md` | Kabul edilen sıra, kök nedenler ve yöntem | MASTER state mutation authority'si |
| `follow-up-works/current-flow.md` | Geçici aktif imleç, sıradaki kapı ve açık HOLD | Kalıcı plan, receipt veya tarihsel authority |

Generated dosyalar, `.brain/exports/*`, eski sprintler, archive, test fixture'ları ve
Dashboard projection'ları veri sağlar; policy veya authority üretmez.

Çelişkide gerçeklik sırası:

1. Canlı owner kararı ve canonical policy.
2. Append-only authenticated receipt/ledger.
3. Canonical runtime DB/event/attempt/effect kayıtları.
4. Gerçek process, container, disk effect ve source diff'i.
5. MASTER'ın canonical validator ile doğrulanmış satırları.
6. Generated projection ve tarihsel belgeler.
7. Model/worker/self-report ve test sonucu.

Alt sıradaki kaynak üst sıradaki çelişkiyi örtemez.

## 2. Değişmez çalışma sınırları

- Çalışma alanı main'dir: `/home/alperen/deckent-dev`.
- Günlük implementation için eksik runtime/data taşıyan geçici worktree kullanılmaz.
- Gerçek `.brain`, `.tasks`, runtime DB'ler, process/container gerçeği ve gerçek product
  surface birlikte değerlendirilir.
- Mevcut kirli worktree korunur; başka oturumların dosyalarına dokunulmaz.
- `.brain/memory.db` silinmez, taşınmaz, yeniden oluşturulmaz veya elle değiştirilmez.
- `.tasks` altındaki hiçbir şey elle silinmez ya da sahte task/result/receipt olarak yazılmaz.
- Secret, token, credential veya private key aranmaz, okunmaz ve çıktılanmaz.
- XVerify owner-deferred durumundadır; kendiliğinden başlatılmaz.
- Sprint çalışırken build veya provider auth mutation yapılmaz.
- Kill/cleanup, bot restart, destructive işlem, commit ve push kendi exact yetki kapılarını
  korur. Genel execution yetkisi bunları sessizce kapsamaz.
- Web yalnız gerçekten gerekli güncel dış doğrulama için ve birincil kaynaklarla kullanılır;
  repo gerçeğinin yerine geçmez.
- Provider, model, effort veya worker sayısı talimat metninden zorlanmaz. Effective config,
  registry, capability, auth/reachability, usage/limit ve capacity birlikte çözer.
- Aynı anda yalnız bir ACTIVE product outcome bulunur.

## 3. Kalıcı ana sıra

Alperen'in 2026-08-30 tarihli kabulüyle ürün sırası:

1. **A — Motor truth**
2. **Operational skill ailesini Motor A'nın gerçek dersleriyle sağlamlaştırma**
3. **C — 4030 operation child DAG**
4. **B — Trust, tenant, permission, enforcement, approval ve secret zinciri**
5. **Post-product programları**

Operasyon skill ailesinin ilk kullanılabilir sürümü Motor A başlamadan hazırlanır. Bu hazırlık
ikinci bir workflow engine veya yeni product outcome değildir; mevcut Deckent yüzeylerini doğru
yetkiyle kullandıran kontrol katmanıdır. Motor A kapanınca skill'ler gerçek runtime kanıtıyla
revize edilir; ardından 4030 DAG'a geçilir.

Bir sonraki basamak, önceki basamağın terminal closure kanıtı olmadan başlamaz.

## 4. Operasyon skill ailesi

Tek büyük skill kullanılmaz. Read-only çalışma ile mutation/recovery/closure aynı prosedüre
konulmaz.

| Skill | Çağrılma zamanı | Kesin çağrılmama zamanı | Temel sınır |
|---|---|---|---|
| `deckent-authority-bootstrap` | Her Deckent-dev oturumunun başı | Tek başına iş başlatma | Authority dosyalarını ve canlı mode'u read-only çözer |
| `deckent-readonly-audit` | Snapshot, code-truth, wiring veya incident analizi | Kod/run/cleanup mutationı | Inventory + source + runtime + receipt; mutation sıfır |
| `deckent-outcome-ordering` | Audit sonrası owner ile sıra kurma | Owner kabulü olmadan MASTER/plan yazma | Bulgular, dependency ve kullanıcı etkisi; kısa karar turu |
| `deckent-outcome-plan` | Exact outcome owner-admitted olduğunda | Belirsiz mega-outcome | Exact DAG, write scope, stop/closure manifesti; execution yok |
| `deckent-parallel-execution` | DAG gerçekten bağımsız ve write scope'ları ayrık olduğunda | Read-only audit veya tek küçük iş | Effective capacity; çakışmasız exact scope |
| `deckent-observe` | Aktif Goal/Mission/Flow/Run/worker izleme | Mutation yapan status'u read-only sanma | Heartbeat, receipt, disk diff, freshness; karar/recovery yok |
| `deckent-recovery` | Typed `DOGFOOD_HEALTH=DEGRADED` + ADR-D-007 | Normal feature/refactor yolu | Main'de tek bounded package; ilk güvenli sınırda dogfood'a dönüş |
| `deckent-closure` | Production wiring ve gerçek effect tamamlandığında | HOLD/UNCLEAR/self-report/mock-only | Real surface, disk truth, settlement, restart ve bağımsız doğrulama |
| `deckent-versioned-handoff` | Gerçekten başka main session devralacaksa | Aynı session devamı veya transcript kopyası | `prepared → verified → committed`; fresh disk snapshot |

Skill'ler ortak provider-neutral kuralları taşır. Codex, Claude ve Cursor için birbirinden
kopuk authority kopyaları oluşturulmaz; gerekiyorsa yalnız host'a özgü ince manifest/adaptör
bulunur. Skill hiçbir zaman Deckent'in Goal/Mission/Flow/Run state machine'inin yerine geçmez.

Zorunlu çağrı zinciri:

```text
authority-bootstrap
        ↓
readonly-audit
        ↓
outcome-ordering / outcome-plan
        ↓
parallel-execution (yalnız gerçek bağımsızlık varsa)
        ↓
observe
        ↓
recovery (yalnız typed DEGRADED/HOLD halinde)
        ↓
closure
        ↓
versioned-handoff (yalnız gerçek session devri varsa)
```

## 5. Tek outcome yürütme döngüsü

```text
MASTER'daki owner-admitted iş
            │
            ▼
Authority bootstrap
Mode + branch + HEAD + worktree + runtime + açık state
            │
            ▼
Read-only gerçeklik kontrolü
Source + gerçek .brain + gerçek .tasks + process/container + receipts
            │
            ▼
Exact outcome planı
Kimlik + dependency DAG + file scope + stop/closure manifesti
            │
            ├── Motor DEGRADED ise
            │       ▼
            │  Main'de tek bounded ADR-D-007 recovery
            │       │
            └───────┘
            ▼
Gerçek Deckent execution
Goal → Mission → Flow → Run/Do/Autonomous
            │
            ▼
Canlı observation
Worker + attempt + result + evidence + heartbeat + FIX + disk effect
            │
            ▼
Terminal değerlendirme
Accepted attempt gerçek worker sonucu mu?
Brain kararı disk/receipt gerçeğiyle uyumlu mu?
            │
      ┌─────┴─────┐
      ▼           ▼
    HOLD           GO
      │             │
Kök neden /       Real surface + restart/recovery + closure
bounded recovery    │
      │             │
      └─────┬───────┘
            ▼
Canonical settlement
MASTER projection + gerekli authenticated receipt
            │
            ▼
current-flow tüketilir ve yalnız sıradaki tek outcome yazılır
```

### 5.1 Admission

Her outcome başlamadan exact olarak bulunur:

- Canonical Work ID ve tek outcome label'ı.
- MASTER parent/child dependency'leri.
- Owner admission ve dahil olmayan yetkiler.
- Base branch/SHA ve korunacak kirli paths.
- Production write allowlist'i ve read-only evidence paths.
- Gerçek giriş yüzeyi ve effective config yolu.
- Stop koşulları, timeout ve bounded retry/FIX ceiling.
- Kapanış için gerekli real-surface, disk, receipt, restart ve platform kanıtı.

Belirsiz mega-outcome başlatılmaz. Bir finding otomatik iş veya MASTER satırı olmaz.

### 5.2 Execution

- Plan gerçek dependency DAG'ına bölünür; keyfi tek task'a sıkıştırılmaz.
- Paralel agent yalnız bağımsız iş ve ayrık write scope varsa kullanılır.
- Main agent kritik iddiaları diskten tekrar doğrular; subagent özeti authority değildir.
- Worker'ın “DONE” demesi kabul değildir. Result/evidence exact attempt kimliğiyle kabul
  katmanına ulaşmalıdır.
- FIX yalnız typed kusura karşı bounded olur. Aynı kanıtsız tamir zinciri tekrarlanmaz.
- Hiç dispatch edilmeyen task için attempt veya başarı kaydı üretilemez.
- Observation, karar ve recovery ayrı yetkilerdir.

### 5.3 Observation

Her aktif nesne için şu zincir izlenir:

```text
Goal → Mission → Flow → Run → WorkItem → Attempt → Operation → Effect → Receipt
```

Her aşamada başlatan principal, authority/scope, provider/worker, freshness, state age,
input/output, side effect, usage/limit, evidence ve recovery yolu görülür.

`unknown`, `stale`, `unavailable`, `failed`, `blocked`, `paused` ve `aborted` tek bir “sorun”
durumuna indirgenmez. Bir yüzeyi kapatmak process'i durdurmuş sayılmaz.

### 5.4 Recovery

Recovery normal implementation kısayolu değildir. Yalnız motorun kendi dogfood yolunu
güvenilir biçimde yürütemediği typed durumda kullanılır.

- `DOGFOOD_HEALTH=DEGRADED` açık yazılır.
- Tek bounded recovery package ve exact write scope bulunur.
- Product outcome truth'ü ile recovery sonucu birbirine karıştırılmaz.
- Build/restart/kill/cleanup/auth/destructive yetkileri ayrı tutulur.
- İlk güvenli execution sınırında Deckent dogfood'a geri dönülür.

### 5.5 Closure

Bir outcome ancak aşağıdaki zincirle `DONE` olabilir:

1. Canonical producer gerçek veriyi üretir.
2. Production consumer bunu gerçekten tüketir.
3. Gerçek entrypoint/ingress bu zinciri çağırır.
4. Effective config/policy yolu capability'yi gerçekten etkinleştirir.
5. Gerçek CLI/Terminal/Desktop/API/MCP/agent/system yüzeyinde beklenen sonuç görülür.
6. Exact attempt, result bytes/digest, accepted attempt ve Brain evaluation eşleşir.
7. Durable effect ve receipt aynı causation/operation zincirine bağlıdır.
8. Terminal settlement disk/event/receipt gerçekleriyle çelişmez.
9. Restart/adoption/recovery sonrasında aynı truth korunur.
10. Ayrı read-only verification aynı hükmü bağımsız kanıtlar.

Herhangi biri eksikse sonuç `DONE` değil, exact nedenli `HOLD` olur.

## 6. Test ve doğrulama politikası

Test başarı kanıtı değildir; yalnız yardımcı regression ve hata bulma sinyalidir.

Test çalıştırma ritmi:

1. Read-only audit ve plan aşamasında test yoktur.
2. Her bounded implementation slice'ta yalnız değişen contractın dar testleri gerekliyse
   çalıştırılır.
3. Ortak runtime/hot path değişimi birkaç slice boyunca biriktiğinde integration checkpoint
   bataryası çalıştırılır.
4. Full test suite her küçük değişiklikte çalıştırılmaz. Yalnız gerçek cross-cutting risk,
   büyük integration milestone'u, local closure/landing öncesi veya release kapısı bunu
   gerçekten gerektiriyorsa çalıştırılır.
5. Full suite uzun sürüyorsa önce manifesti, scope'u ve beklenen failure sınıfları yazılır;
   sonuç “repo green” diye genellenmez.
6. Test yeşil olsa bile real binary, real Docker/process, physical custody, disk effect,
   receipt ve restart kanıtı yoksa closure verilmez.

GitHub Actions aylık kota nedeniyle 2026-09-01'e kadar kırmızı/unavailable ise durum yalnız
`REMOTE_ADVISORY / QUOTA_UNAVAILABLE` olarak raporlanır. Local gerçek kanıtın yerine geçmez ve
tek başına regression sayılmaz.

## 7. Motor A — exact hedef

Canonical Work ID önerisi:

`RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001`

Kısa outcome label'ı:

`NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001`

Tek hedef, iki ayrı identity oluşturulmaz. `RECOVERY-BORN-*` biçimi MASTER'ın emergent dogfood
defect kuralını korur; kısa ad yalnız okunabilir label'dır.

Motor A şu gerçekleri birlikte kapatır:

- Task authority host tarafından doğar; worker kendi yetki belgesini yazamaz.
- Her attempt'ın result, partial-result, timeout, log ve IPC alanı fiziksel olarak ayrılır.
- Prior/sibling worker başka attempt'ın sonucunu veya terminal receipt'ini etkileyemez.
- Worker `runPolicy` ve evidence verisi acceptance katmanında kaybolmaz.
- Diskte sonuç varken `brainEvaluation:null` sessiz terminal karara dönüşmez.
- Accepted attempt kimliği gerçek çalışan worker attempt'ıyla aynıdır.
- Çalışmayan task için attempt/başarı kaydı üretilemez.
- FIX zinciri finite budget/ceiling ile sınırlıdır.
- `ABORTED`, force-finalize veya recovery geriye dönük başarı diye sunulmaz.
- Restart/adoption yalnız exact attempt authority ve immutable snapshot ile olur.
- Finalizer, settlement, archive ve CLI-finalize aynı exact identity/digest zincirini taşır.
- Eski flow ve `.tasks` kalıntıları canlı iş sanılmaz; cleanup yalnız resmi yüzey ve uygun
  authority ile yapılır.

Kapanış için test dışında en az şu gerçek kanıtlar gerekir:

- Compiled CLI üzerinden gerçek RunFlow/Do yolu.
- Networkless gerçek Docker canary.
- Host-authored immutable task snapshot.
- Attempt-private physical mount/custody.
- Tamper, replay, sibling/prior attempt ve symlink/no-follow negatifleri.
- Exact result/partial/timeout/log/IPC adoption.
- Pristine provider-capture receipt producer.
- Restart, crash adoption ve finalizer proof.
- Disk diff + receipt + settlement birebir uyumu.
- Bağımsız read-only verification.

## 8. Motor A sonrası 4030 sınırı

4030 yalnız şunları kapatır:

- Stable `operationId@version`.
- Semantic coverage ve fail-closed resolution.
- Invocation, transaction, correlation ve causation context'i.
- Durable effect causal attribution.

4030 şunları kapatmış sayılmaz:

- Permission/allow-deny/enforcement: `4040 CAPABILITY-001`.
- Approval decision authority: `4050 APPROVAL-001`.

4030 parent ancak 4031–4039, 4041–4049 ve 4057 terminal olduktan sonra authenticated
disposition adayıdır. 4057 bütün gerçek CLI/MCP/API/Desktop/Terminal/agent/system yüzeylerini
ve sıfır unexplained effect şartını doğrular. 4030 kapanışı 4040 veya 4050'nin kapandığını
iddia edemez.

4031, 4032 ve 4033 bugün governance/Closure OS düzeyinde DONE'dır. Bu ürün kurtarmaları motor
kusurlarını kapatmış sayılmaz. 4034+ child'ları Motor A tamamlanmadan başlatılmaz.

## 9. `current-flow.md` kullanımı

`follow-up-works/current-flow.md` kalıcı günlük veya rapor değildir. Her anda yalnız şunları
taşır:

- Active outcome ve canonical Work ID.
- Owner admission özeti.
- Base branch/SHA ve korunacak dirty paths özeti.
- Geçerli phase/gate.
- Son doğrulanmış gerçek sonuç.
- Açık HOLD ve exact next action.
- Çalıştırılmaması gereken kapılar.

Bir iş kapanınca uzun öykü eklenmez. Tüketilmiş satırlar silinir; yalnız sonraki imleç kalır.
Kalıcı kanıt gerekiyorsa productın canonical receipt/ledger/archive yoluna gider. `docs/` veya
`follow-up-works/` altında keyfi yeni rapor biriktirilmez.

## 10. Persona ve sorumluluk ayrımı

Main session gerektiğinde şu rollere girer fakat yetkilerini birbirine karıştırmaz:

| Rol | Sorumluluk |
|---|---|
| CTO / product architect | Bütün ürün, dependency, risk ve kullanıcı etkisi |
| Planner | Exact DAG, scope, collision ve closure manifesti |
| Worker | Bounded implementation |
| Observer | Canlı state, freshness, heartbeat, receipt ve disk diff |
| Evaluator/Auditor | Worker iddiasını bağımsız disk kanıtıyla değerlendirme |
| Recovery operator | Yalnız typed degraded motoru bounded biçimde kurtarma |
| Closure verifier | Real surface, restart ve settlement kapanışı |

Uygulayan ajan kendi iddiasıyla closure veremez. Kritik sonuç en az bir bağımsız pass ve main
session disk doğrulamasıyla fan-in olur.

## 11. Owner'a dönüş kuralları

Main session şu durumlarda işi Alperen'e geri getirir:

- İki veya daha fazla anlamlı product kararı kullanıcı sonucunu değiştiriyorsa.
- Exact authority mevcut değilse veya yeni destructive/external yetki gerekiyorsa.
- Güvenlik, tenant veya irreversible effect sınırı belirsizse.
- Canonical kaynaklar çelişiyor ve güvenli fail-closed yol tek başına seçilemiyorsa.
- Commit/push, kill/cleanup, bot restart, XVerify veya Closure signing kapısına gelindiyse.

Sorular teknik uygulama ayrıntısı yerine sonuç, kazanç ve risk üzerinden; her tur mümkünse bir
kısa soru olarak sorulur. Belirsizlik yoksa main session gereksiz onay tiyatrosu üretmeden
yetkili işi sonuna kadar yürütür.

## 12. 2026-08-30 doğrulanmış başlangıç snapshot'ı

Bu bölüm tarihli kanıttır; gelecekte yeniden ölçülür.

### 12.1 Eşleşen iddialar

- Branch: `main`.
- HEAD: `014d4c13a2b0e148bc3c3c837f6fd6d6b171946e`.
- Remote farkı: `origin/main`den 17 commit ileride.
- Push: bu 17 commit origin/main'de değildir.
- MASTER validator: 562 toplam, 474 aktif, 214 receipt, 13 blocker class; source stable,
  projections in-sync.
- 4030 `VERIFY`.
- 4031, 4032, 4033 `DONE`.
- 4034–4039, 4041–4049 ve 4057 `OPEN`.
- 4040 permission/enforcement parentı `OPEN`.
- 4050 approval authority parentı `OPEN`.
- Closure OS append-only ledger: 7 olay; chain/identity/lifecycle/append-only validator PASS.
- Son olay seq 7, `OPERATION-INVOCATION-CONTEXT-001` / 4033, digest prefix `080e2fab`.
- sprint-711, 712 ve 713 terminal archive receipt'leri `ABORTED`.
- 4033 ayrı ADR-D-007 manual recovery ve authenticated Closure OS receipt'iyle product
  düzeyinde kapanmış; sprint-713 geçmişi başarıya çevrilmemiştir.
- Aktif execution lock veya quarantine yok.
- Aktif Deckent worker/coordinator/container yok.
- `.brain/memory.db` mevcut: 34,586,624 bayt; silinmemiş veya yeniden oluşturulmamıştır.
- `.tasks` altında 33 dosya vardır; elle cleanup yapılmamıştır.
- Worktree kirli ve mevcut değişiklikler korunmalıdır.

### 12.2 Farklar ve açık HOLD'lar

1. **Bot drift:** beklenen PID `2964974`, doğrulamanın başındaki bağımsız snapshot'ta canlıydı;
   sonraki taze root ölçümünde `/proc/2964974` yok ve Deckent bot process bulunmuyor. Bot bu
   oturum içinde dışarıdan durmuş olabilir. Kendiliğinden restart edilmez.
2. **ABORTED çift-projection farkı:** terminal archive receipt'leri 711–713 için `ABORTED`
   authority taşırken canonical RunFlow event head'leri 711=`RUN_FAILED`, 712=`RUN_PAUSED`,
   713=`RUN_FAILED` gösterir. Attempt journal 711/712 için `BLOCKED`, 713 için `FAILED` sonlanır.
   Bu fark motor truth kusurudur; terminal archive receipt saklanır fakat diğer projectionlar
   temizmiş gibi gösterilmez.
3. **Cleanup HOLD:** 711/712 terminal receipt'lerinde birer unresolved logical lineage ve
   geçersiz boş attempt identity; 713'te 10 lineage'ın hiçbiri complete değil ve 7 boş attempt
   identity HOLD'u vardır. Her üç receipt cleanup eligibility=`HOLD` taşır.
4. **`.tasks` kalıntısı:** repair queue ve terminal attempt observation/heartbeat dosyaları
   aktif worker değildir; resmi cleanup uygunluğu kanıtlanmadan silinmez.
5. **Runtime writer HOLD:** `.brain/ERRORS.md` gözlem sırasında başka bir writer tarafından
   güncellenmiştir. Attribution bot/başka session arasında kanıtlanamamıştır.
6. **Remote CI:** GitHub Actions kotası 2026-09-01'e kadar unavailable; yalnız advisory.

### 12.3 Kanıt yolları

- `docs/MASTER-PLAN.md`
- `scripts/lint-master-plan.mjs --check --json`
- `docs/governance/closure-dispositions.jsonl`
- `scripts/lint-closure-dispositions.mjs`
- `.deckent/archive/sprints/sprint-711/sprint-711-terminal-receipt.json`
- `.deckent/archive/sprints/sprint-712/sprint-712-terminal-receipt.json`
- `.deckent/archive/sprints/sprint-713/sprint-713-terminal-receipt.json`
- `.deckent/runtime/run-flow-store/run-flow-authority.sqlite`
- `.locks/execution-lock-authority.sqlite3`
- `.tasks/`
- `.brain/memory.db`

## 13. İlk Goal taslağı

Goal gerçek Deckent yüzeyinde ancak fresh snapshot, canonical MASTER child admission, exact
capsule/DIRECTIVES ve dry-run plan doğrulamasından sonra oluşturulur.

### Goal kimliği

`RECOVERY-BORN-711-NORMAL-DOCKER-EXACT-ATTEMPT-CUSTODY-001`

### Goal sonucu

Deckent'in normal Docker worker yolunda task authority ve bütün attempt artefaktlarını fiziksel
olarak exact attempt'a bağlamak; worker sonucu, acceptance, Brain evaluation, finalizer,
settlement, archive ve restart/adoption zincirinin aynı immutable identity/digest gerçeğini
korumasını sağlamak; çalışmayan veya başka attempt tarafından üretilen sonucun başarıya,
receipt'e ya da sınırsız FIX zincirine dönüşmesini fail-closed engellemek.

### Başlangıç koşulu

- Main fresh snapshot tamamlanmış.
- Aktif run/worker/container/lock yok.
- Bot drift ve mevcut runtime writer ayrı HOLD olarak kaydedilmiş.
- MASTER'da aynı gün tarihli tek `RECOVERY-BORN-*` child satırı ve exact owner admission var.
- Retained 4033 `DIRECTIVES.md` yeni run authority'si olarak kullanılmıyor.
- Exact file allowlist, dependency DAG, budget ve stop/closure manifesti dry-run'da doğrulanmış.

### Başarı koşulu

Test sonucu değil; Bölüm 7'deki gerçek Docker physical custody, tamper/replay, exact result,
receipt, restart/adoption/finalizer, settlement ve bağımsız verification kanıtlarının tamamı.

### Dahil olmayan yetkiler

- Commit/push.
- Bot restart.
- Live sprint kill/cleanup.
- XVerify.
- Closure OS signing/disposition.
- Secret/auth mutation.

Bu kapılara ulaşılırsa exact durum ve risk Alperen'e sunulur.

## 14. Tamamlanma ve sonraki basamak

Motor A `GO` aldığında:

1. `deckent-closure` gerçek yüzey ve settlement zincirini bağımsız kapatır.
2. Gerekli canonical MASTER/Closure projectionları kendi authority yollarından geçirilir.
3. Operational skill ailesi Motor A'da görülen gerçek kusur ve doğru kullanım kanıtlarıyla
   dar biçimde revize edilir.
4. `current-flow.md` Motor A öyküsünü taşımaz; tüketilmiş imleç silinir.
5. Sonraki tek active outcome 4030 DAG'ın dependency-valid ilk açık child'ı olur; mevcut
   sırada bu `4034 OPERATION-EFFECT-CONTEXT-001`'dir.

4030 terminal olmadan 4040/4050 implementation dalgasına; trust/enforcement kapanmadan
post-product execution'a geçilmez.
