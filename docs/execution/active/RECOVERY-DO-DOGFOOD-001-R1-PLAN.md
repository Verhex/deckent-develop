# 751 sonrası onarım ve dogfood dönüş planı

Statü: **PLANNED — WAITING_OWNER_START**. Bu doküman execution/cleanup izni üretmez.
Owner son talimatı: önce plan ve rapor; yalnız sonraki **“başla”** talimatından sonra uygulama.
Plan checkpoint tarihi: 2026-09-12 UTC. Ürün outcome: **MASTER 120 / STATE-RETENTION-001**;
onarım bağı: **RECOVERY-DO-DOGFOOD-001**, epoch7 COMMITTED, DOGFOOD ON / HEALTH DEGRADED.
Yeni MASTER outcome, disposition veya DONE sınıflandırması oluşturulmadı.

## 1. Nereden başlıyoruz

- Main checkpoint `0f96f5b6b`; önceki checkpoint `3eaa44da5`. Plan öncesi git ağacı temiz.
  Terminal teslimleri ve 751 worker etkileri commit içinde; worker etkileri **UNACCEPTED/HOLD**.
- 19:27:46Z canonical kontrol: sprint751 **ABORTED / FAILED**, active=false, coordinator=dead;
  terminalReceipt=null. Task751-001 hâlâ EXECUTING. Process bitmiş olması settlement değildir.
- Bir gerçek `start`: 416748ms monotonic, exit1, admission reddi; worker doğmadı.
  Bir gerçek `do`: CLI347347ms, exit0 detached kabul; Flow RUN_FAILED, worker NO_GO,
  main'de üç dosya değişti, sonuç kabulü 0/1. Do→worker yaklaşık13dk UTC farkı.
- Yerel candidate71 testten69 pass, exit1; aynı host dependency ile baseline70/71, exit1.
  Candidate tsc exit0; worker tsc exit2, worker test başlangıcı exit1. Yeni test koşulmadı.
- Build canary öncesindeki kaynak için; worker değişiklikleri sonrası yeni dist doğrulanmadı.

Kaynak: [canary REPORT](../evidence/astra-canary-20260912/REPORT.md),
[yeni plan snapshot](../evidence/astra-canary-20260912/r1-plan-snapshot.json).
Eski kanıt manifesti korunur; aşağıdaki düzeltmeler eski rapor hash'lerini değiştirmez:

1. “Root lockfile yok” ifadesi eksik: **npm-shrinkwrap.json mevcut**, Ink7.0.5 kilitli;
   host node_modules Ink7.1.1, gerçek worker Ink7.0.5. Dockerfile npm ci kullanıyor.
   Sorun bağımlılık kilidinin yokluğu değil, kaynak ihtiyaçları/host/lock/image uyuşmazlığıdır.
2. Doğrulama komutu task açıklamasında korunmuş; **task.verification alanı yok**.
   `TaskVerificationAuthority` zaten mevcut (`src/core/task-types.ts:336`), yeni paralel
   sözleşme icat edilmeyecek. Plan→materialization→execution→evaluation bağlantısı tamamlanmalı.
3. 19:31:50.660Z `.tasks` sayımı **20 dosya**: 751 task+skill2, eski CAS sürümleri6, iki XVerify
   grubunda4+7 dosya, heartbeat identity1. Bu, 20 aktif iş veya hepsinin silinebilir olduğu anlamına gelmez.
   Snapshot SHA256: `c7b07cf4fa138d7ebc396ecede8ca5c63ce8f824597dc5df225ff67822e1bb24`.

## 2. Sonuç ve sınır

Ürün sonucu: kabul edilmiş iş; doğru ortamda gerçekten başlar, aşamaları görünür kalır,
sonucu bağımsız host kanıtıyla değerlendirilir ve başarılı/başarısız **kalıcı sonuca** bağlanır.
Dogfood sonucu: 751'in etkisi kaybolmadan negatif kapanışı, güvenli arşiv, ardından aynı
retention işinin resmi start/do yollarında yürüyebilmesi. Başarısız751 sonradan başarılı sayılmaz.

Bu plan tek dev yama değildir. Aşağıdaki bağımlı dilimler aynı mevcut outcome'un blokajlarını
giderir. Manuel kod yalnız normal engine yolunu açan typed ADR-D-007 recovery kapsamındadır.
Engine güvenli olduğunda ilk sınırda normal Deckent execution'a dönülür; retention ürün
onarımı host'ta elle yapılıp dogfood sonucu gibi sunulmaz. Her dilimde fresh gate kararı kaydedilir.

Kapsam dışı: terminal görünüm/paste/stream redesign, yeni auditor/nervous mimarisi,
adaptif görev sayısı/model performans öğrenmesi, tüm MASTER'ın eritilmesi, genel god-object
refactor, credential/provider login, yeni kalıcı authority store. Bunlar bu kapanışa eklenmez.
Rol/skill semantik eşleştirmesi ve planner usage-artifact eksikliği kaydedilir; eksik usage
maliyet veya XVerify closure kanıtı olarak kullanılmaz. Mevcut kanıt sözleşmesini bloklayan
exact producer/consumer boşluğu varsa ayrıca sınırlandırılır; provider telemetry yeniden yazılmaz.

## 3. Bağımlı iş sırası ve mekanizmalar

### R1-A — Etki release/replay ve 751'in gerçek kapanışı

**İlk iş budur.** Main değişikliği uygulanmışken release başarısız; düşük seviye hata
ARTIFACT_REPLAY_MISMATCH, sonra REHYDRATE_AUTHORITY_MISMATCH. İlk farklı artifact/alan
henüz bilinmiyor; yeni timestamp, tahmini JSON veya gate kaldırma çözüm değildir.

1. Exact dispatch/attempt kapsamındaki immutable artifact, progress, deletion/absence,
   landing receipt ve host postimage zincirini salt okunur karşılaştır. İlk uyuşmayan
   artifact key, eski/yeni digest, alan ve producer→reader yolunu kaydet. Tarihsel tüm
   custody'yi tekrar tekrar tarama; aynı hatada yeni kanıt olmadan yeniden recovery deneme.
2. Aynı operation yeniden yürütüldüğünde mevcut kanıtı aynen kullanan idempotent publication
   ve rehydration sözleşmesini düzelt. Dış kaynak silinmişse exact resource identity ve
   durable absence kanıtını kullan; “yok” bilgisinden başarı/authority üretme.
3. Main postimage+host attribution korunur; unaccepted worker sonucu hiçbir aşamada GO'ya
   çevrilmez. Product recovery, başarısız attempt/effect disposition ve sprint terminal
   receipt'ini negatif outcome ile üretir; Flow/child failure ile çelişmez.
4. CLI recovery/finalize sırasını receipt önkoşullarıyla doğrula. Checkpoint'i finalizer
   ihtiyacı bitmeden kaldıran sıra kullanılmaz. `--retain-committed-unsettled` yalnız
   retention'dır, terminal settlement değildir (`sprint-recovery-operation.ts:582`).

Yazma sınırı: `src/orchestra/spawn-backend-docker.ts` release/recovery bölümleri,
`execution-effect-store-adapter.ts`, gerekirse ilk mismatch'in sahibi
`src/core/task-attempt-custody-store.ts`; lifecycle bağlantısı için
`src/orchestra/sprint-recovery-operation.ts`, `src/cli/commands/recover.ts`,
`src/cli/commands/finalize.ts`, ilgili exact testler. Native ABI değişikliği bu scope'ta yok.
Hotfile'ların tek yazarı Astra; eşzamanlı Cursor müdahalesi yok.

Kanıt: aynı operation ikinci çağrıda yeni/çelişkili receipt üretmez; her release aşamasında
crash→restart, tamper, wrong tenant/project/attempt/generation, native absence ve committed
main effect senaryoları; gerçek751 native reread + CLI negatif terminal receipt + archive seal.
Muhtemel root-cause bu dosyalardan çıkmazsa scope genişletmeden bulgu/HOLD raporlanır.

### R1-B — `.tasks` güvenli arşiv ve temizlik

R1-A sonrasında yürür. Başlangıç inventory'si yalnız aday listesidir; silme izni değildir.

| Grup | Şu an | Planlanan işlem |
|---|---|---|
| 751 task + skill | 2 dosya, task EXECUTING, receipt yok | Negatif settlement ve byte-verified archive sonrası exact-sprint cleanup |
| İlk XVerify grubu `1789224472822…` | 4 dosya, task projection DONE | Gerçek invocation/result/terminal receipt'i doğrula; verdict HOLD ise aynen koru; yalnız kanıtlı terminal grubu arşivle |
| İkinci XVerify grubu `1789230815702…` | 7 dosya; wrapper DONE, child PENDING, timeout/result/log mevcut | Önce gerçek process + invocation + terminal settlement uzlaştırması; PENDING'i elle DONE yapma; kanıtlı timeout/negative closure sonrası arşiv |
| `.task-cas-*.previous` | 6 sürüm: 737,744,746,748 task kimlikleri | CAS publication/restore zincirindeki referansları çöz; rollback için hâlâ gerekli olanları tut; emekliye ayrılanları digest ile arşivle |
| `worker-heartbeat-authority/.../identity.json` | 1, sahipliği bu planda varsayılmadı | Exact attempt+generation+PID/start-token eşleştir; terminal ve referanssızsa birlikte arşivle |

Mevcut `src/core/sprint-archive.ts`, `src/core/runtime-hygiene.ts`, CLI cleanup ve
XVerify terminal producer'ı kullanılır. Historical cleanup `--history --plan-digest`
kontratına sahip; tüm bu türleri kapsadığı henüz kanıtlanmadı. Eksik tür desteği gerekiyorsa
aynı arşiv/retention servisinde exact adapter ile kapatılır; shell glob-delete yazılmaz.

Sıra: dry-run inventory → fresh identity/terminal/legal-hold/reference denetimi → archive
copy → SHA256 reread → canonical retirement → kalan dosya envanteri. Crash sırasında
arşiv ve kaynak birlikte kalabilir; iki kopyanın da kaybolması mümkün olmamalı.
`.tasks` görünürde boş diye başarı ilan edilmez: kalan her dosyanın sahibi ve tutulma
nedeni raporlanır. Bilinmeyen/live/sibling kayıt korunur. `.brain/memory.db`, immutable
custody, unrelated sprint ve owner credentials temizlik hedefi değildir.

### R1-C — Worker dependency ve verification sözleşmesi

Yeni ücretli worker'dan **önce** tamamlanır. Host'ta geçen kodun worker'da derlenememesi
ve verilen testin hiç başlamaması giderilir.

- Kaynakta kullanılan Ink API'sinin desteklenen dependency gereksinimini doğrula; mevcut
  sürüm politikasıyla package.json+shrinkwrap+image eşitliğini kur. API compatibility ve
  deterministik bağımlılık kurulumunu doğrula; tek başına “Ink sürümünü artır” kararı yok.
- `Dockerfile.worker` ve `assets/Dockerfile.worker` drift'i kapat: root CODEX_VERSION arg
  taşırken asset Codex'i sürümsüz kuruyor. Provider install/version/platform bilgisi mevcut
  `provider-packages`/image policy'den çözülmeli; pin reproducibility içindir, model/host
  adını iş mantığında hardcode etmek için değil. Selected provider readiness, Claude-only
  healthcheck yerine gerçek seçili CLI/capability kanıtından türemeli. Auth mutate edilmez.
- Image digest + dependency lock digest + toolchain/API capability + selected provider
  kimliğini dispatch öncesi kontrol et. Eksik/mismatch ortamda provider başlatma; typed
  açıklama ve görünür faz üret. Read-only node_modules korunur.
- Mevcut `TaskVerificationAuthority` alanını deterministic plan compiler/materializer
  ile taşı; serbest açıklamadan runtime'da komut tahmin etme. Test komutu string'i tek
  başına execution kanıtı değildir: trusted runner'a command/env/cwd/source+dependency
  identity→actual exit/result bağı kur. Modelin alternatif komutu gerçek adım olarak
  kaydedilir, admitted recipe'nin tamamlanması sayılmaz. Git olmayan workspace'te diff
  için mevcut host effect/inspection kanıtı kullanılır; sonda `date` exit0 olması önceki
  `git diff` hatasını gizleyemez.

Yazma sınırı: package.json/npm-shrinkwrap.json, iki Dockerfile, mevcut worker image checker
ve image-builder consumer'ı; task verification producer/consumer olarak
run-proposal-compiler/exact materializer, prompt-god-template, worker-verify,
result-evaluator ve exact dispatch authority. İlgili dosyalar yalnız kanıtlı wiring
boşluğunda değişir; yeni genel verification engine veya provider API revizyonu yok.

Kanıt: clean lock install ile aynı kaynak host+actual image tsc; exact read-only image'da
runner/no-cache test komutu gerçekten test çalıştırır; wrong recipe/missing evidence
result kabulünü reddeder; capability mismatch provider-call sayısı0. Yeni image yalnız
aktif sprint yokken kurulur, identity doğrulanmadan sonraki run'a verilmez.

### R1-D — `start` ve `do` ortak admission

`start.ts:1297` dry-run maliyet planı, `:1392` normal runSprint; exact hooks yokluğu
`sprint-controller.ts:3186` admission reddine gider. Do'nun çalışan snapshot/materializer
sözleşmesi esas alınır (`src/cli/helpers/exact-sprint-runtime.ts`).

DIRECTIVES/structured plan deterministik compile edilir; AI yalnız içerik gerekirken
proposal üretir. Identity, scope, schema, config, receipt ve admission metadata'sını host
doldurur. Aynı approved plan snapshot'ı scope/digest kontrolüyle materialize edilir; maliyet
preview yeni görev/çalışan sprint gibi sunulmaz. `--force-scope` veya admission bypass yok.
CLI ve diğer start adapterları aynı application-service kontrolünü tüketmeli; MCP'den
dogfood başlatılmaz, adapter parity hermetik/contract testleriyle doğrulanır.

Yazma sınırı: start.ts, exact-sprint-runtime.ts, mevcut RunFlow/compiler/materializer,
sprint-controller exact admission bağlantısı, ilgili testler. Worker başlamadan eksik
scope/verification/capability açıklanır. Structured yol ek LLM çağrısı üretmez. Gerçek start
ve do final fan-in'de aynı admission→task→result→settlement zincirine ulaşmalıdır.

### R1-E — Başlangıç gecikmesi ve doğru monitoring

Provider'dan önce ve sonuçtan sonra tekrar eden senkron custody taramaları ölçülmüş
darboğazdır. R0B opt-in candidate 10s/64MiB sınırını geçemedi; **default OFF kalır**.
Limit yükseltmek, eski liveness'ı cache etmek veya doğrulamayı atlamak çözüm değildir.

Mevcut operation snapshot içinde aynı verified byte/parsed fact fiziksel paylaşımı,
bounded indexing ve invalidation tamamlanır; mutation/identity/policy/platform sınırında
fresh read zorunlu. Yeni kalıcı authority/ikinci ledger yok. Ölçüm: monotonic host
preflight, provider, materialization, spawn, worker, effect/finalizer ayrı; wall-clock
farkı hassas benchmark gibi sunulmaz. Tek hotfile yazarı; R1-A ile paralel mutation yok.

Do/start ilk girişten canonical “hazırlanıyor / authority kontrolü / planlanıyor /
başlatılıyor” aşamalarını gerçek zamana bağlar. Senkron iş event loop'u kilitleyemez;
heartbeat'in callback olarak tanımlı olması yetmez. PID-dead, remote lease-fresh ve durable
Flow FAILED ayrı gerçekler olarak korunur; terminal failure yerel “ACTIVE” ile örtülmez.
Namespace desteği kaldırılmaz. Terminal/Desktop control, Dashboard observability aynı
durum kaynağını tüketir; `.local` path'i kullanıcıya kaybolmuş iş anlamına gelmemeli.

Yazma sınırı: R0B scope içindeki custody snapshot/store, execution-effect read consumer,
spawn-backend preflight/reconciliation; `run-status-authority.ts` ve mevcut RunFlow phase
producer/status projector. Görünür metinler i18n catalog'dan, yeni UI redesign yok.

Kabul ölçümü: mevcut ordinary native health hedefi p95≤5s; mevcut10s/64MiB sınırı içinde
tam doğrulama. Cold/warm/large-history/changed-file/absent-file/platform/tenant durumları
ayrı raporlanır, tek warm ölçüm p95 sayılmaz. Deterministik şema kurma için önerilen
local hedef p95≤100ms (provider/native audit hariç), ilk phase yayını≤250ms; bu iki hedef
ölçüm planıdır, config'e yeni hardcoded timeout ekleme değildir. AI süresi garanti diye
uydurulmaz; toplam süre ayrıca raporlanır. Başarısız proof feature'ı default açamaz.

### R1-F — Retention düzeltmesi ve gerçek dogfood kabulü

R1-A…E gerekli güvenli girişleri açınca normal Deckent task yürütmesi. Dört dosyalık scope:
`src/core/observability.ts`, `src/core/observability-rotation.ts`,
`tests/core/observability.test.ts`, `tests/core/observability-rotation.test.ts`.
751'in üç dosyalık WIP postimage'i baseline olarak korunur; silent revert yok.

İki kırmızı testin ürün kuralını değerlendir: gerçek effective size ceiling ve append
öncesi kontrol mü, eski scheduling çağrı-sayısı varsayımı mı? Amaç byte korunumu, doğru
policy değişimi, transient error sonrası aynı session recovery ve bounded filesystem
işidir. Assert gevşetmek/skip eklemek, legal hold'u kaldırmak çözüm değildir.

Mevcut registered production-wiring harness'i gerçek entrypoint üzerinden host çalıştırır;
worker host receipt yazamaz. Aynı dosyaya çakışan iki canary paralel çalışmaz. Uygun gerçek
admitted görevler ile önce bir `start`, sonra bir `do`; yeni sprint numarası engine'den
çözülür. İlk çalışmanın değişikliği ikinci işin base'ine açıkça bağlanır; değişiklik
üretmeyen tekrar/dummy task başarı ölçümü değildir. İlk canary başarısızsa ikincisi başlamaz.

## 4. Kanıt manifesti, custody ve toparlama

751 kimliği değiştirilmez:

- Flow `963bbc69-bfff-4b5f-b5ac-6ba130853feb`, revision1.
- Child `7942af91-42db-48ad-b0ad-e6f49d00c9ca`.
- Task751-001 / attempt `9d2ee9c9-500c-82a2-8f44-8b668521df43`, generation1.
- Dispatch `dreq-2c97eeee97075ce9b84b93893375b3dfaf91e219ab67bbfaa7b010c76757e83a`.
- Admission `sha256:3bb030b5d6b173803174421355671e34212502ad0768b2e5f84e5c1b69972192`.

Her dilimde path:line + full digest + UTC + exact command/exit kaydı; negatif/yetkisiz
ingress testleri dahil. Scope-admitted yerel testler VITEST_MAX_FORKS=2, full-suite yok.
İlgili effect-store/landing/custody, recovery/finalize/archive, Dockerfile/image,
verification, start/RunFlow, run-status ve observability testleri paketlerine ayrılır.
Kod/consumer değişmedikçe aynı ağır test veya discovery yeniden koşulmaz.

Ürün fan-in: accepted source/scope→task+skill/persona→effective provider/model→real call
ve provider-reported usage→fresh heartbeat→exact main effect→actual verification→host
acceptance→task/effect/sprint terminal receipt→archive. CLI detached exit0 final başarı
değildir. Host unit-green veya model NO_GO/GO beyanı tek başına sonuç değildir.
Kapasite varsa farklı-provider XVerify gerçek call+usage+closed-settlement+durable receipt
ile; yoksa unavailable/HOLD. Aynı Codex provider'ıyla bağımsız isim açıp doğrulama sayılmaz.

Linux/WSL live ölçümü bütün platformlara genellenmez. macOS/Windows-native ve tenant,
namespace, symlink/path-case/collision, native-capability yokluğu senaryoları contract
matrisinde yer alır; çalıştırılamayan live hücreler explicit HOLD/unsupported kanıtıdır.
Full enterprise/MASTER120 DONE ancak kendi geniş closure contract'ıyla mümkündür;
bu onarımın kapanışı tüm retention/scale/platform borcunu kapatmaz.

## 5. Tempo, retry ve yetki kapıları

- Sıra: **A → B → C → D → E → F**. Bağımsız test/read işleri paylaşılabilir; şu an
  alt agent veya provider işi açılmadı. Config/capacity uygunsa ileride gerçek Deckent
  worker'ları kullanılır; sayı/model prompttan zorlanmaz.
- Her dilim bir implementation + bir verification pass; en fazla iki ek değişmiş-kanıt
  onarımı. Aynı fingerprint'te tekrar yok. Local test/probe üst sınırı600s; küçük probe
  daha dar capability budget'ıyla. Timeout sonucu kayda girer; native state silinmez.
- Paid planner/worker bütçesi effective config+live entitlement+finite admission'dan;
  bilinmeyen bütçe sınırsız sayılmaz. İlk başarısız canary aynı haliyle tekrar edilmez.
  Worker sayısı/task karmaşıklığı artırılarak arıza örtülmez.
- İlk güvenli engine sınırında dogfood dönüşü; hâlâ gerekli bootstrap onarımı varsa
  exact blocker ve bir sonraki bounded recovery scope'u kayda alınır, mode değişmez.
- Build yalnız fresh inactive/process-dead kontrolünden sonra; source değişmiş paket
  tesliminde build:all ve worktree-binary-authority eşitliği. Aktif harness/MCP reconnect
  akışı dikkate alınır; kullanıcı terminali veya başka process sessizce kapatılmaz.
- Commit izni mevcut: önce bu plan, sonra yalnız kabul edilmiş veya açık WIP/HOLD olarak
  ayrıştırılmış coherent checkpoint. Her commit öncesi branch kontrolü; push bu planda yok.
- Runtime cleanup/751 kapatma niyeti owner tarafından verilmiş olsa da **“başla” gelene
  kadar hiçbir uygulama yapılmaz**. Başla sonrası exact preview ile aynı yetki kullanılır;
  tekrar genel onay istenmez. Fresh scope/liveness değişirse destructive işlem durur.
- Kill/auth/mode/ledger signing yeni yetki değildir; onaysız genişletilmez. Recovery
  `--force` bir canlı process öldürme/başarı uydurma kaçamağı olarak kullanılmaz.

Başla sonrası ilk eylem: git/751 identity ve canlılık tekrar kontrolü, R1-A exact artifact
karşılaştırması. Ardından uygun `deckent recover sprint-751 --dry-run` typed seçeneği;
`--close-rejected-result` ile `--retain-committed-unsettled` birbirinin alternatifi gibi
kör denenmez. Native custody semantiğiyle doğru işlem seçilir; normal finalize/cleanup
yalnız ilgili terminal önkoşulları sağlandığında. Bu dokümandaki komutlar henüz çalıştırılmadı.
