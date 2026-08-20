# TypeScript/Node statik mimari tanısı

Tarih: 2026-08-13  
Başlangıç durumu: `HEAD acb082b386ebe1d6bb7006b8e7437d92475f269b`  
Karşılaştırma: HEAD dosya içerikleri ile aktif çalışma ağacı değişiklikleri  
Durum: Yalnız tanı çalışmasıdır. Bu doküman runtime benchmark, ürün kodu değişikliği, refactor, dependency, configuration, sprint lifecycle, build veya authority değişikliği için yetki vermez.

## Teknik özet

Deckent kaynak kodunun TypeScript ile yazılması, JavaScript yeteneklerinin kullanılmadığı anlamına gelmiyor. Yayınlanan CLI, `dist/` altındaki derlenmiş ESM JavaScript dosyalarını çalıştırıyor. TypeScript kaynak kod ve type denetimi katmanı olarak kullanılıyor; type bilgileri Node programı çalıştırmadan önce kaldırılıyor. Repo ayrıca dynamic import, async iteration/generator, stream, event ve cancellation yapılarını kullanıyor. Bu nedenle TypeScript/Node üzerinde kalmak teknik olarak tutarlı.

Statik tanı dört farklı konu ortaya çıkardı. Bunların hiçbiri dil değişimini veya geniş kapsamlı bir yeniden yazımı gerektirmiyor:

1. Senkron Node API kullanımı yaygın, fakat yalnızca senkron API kullanılması hata değildir. Risk; senkron filesystem veya child-process işlemleri request, event, heartbeat, scan, monitor, worker-dispatch ya da retry akışlarından çağrılabiliyorsa ortaya çıkar. Başlangıç sırasında yapılan okumalar ve kısa atomic persistence işlemleri farklı değerlendirilmelidir ve doğru tercihler olabilir.
2. Layer yapısında `cli/` çevresinde kısmi ters bağımlılıklar bulunuyor. Bazı import'lar gerçek entrypoint adapter'ları, ikisi kayıtlı shim ve type-only bağlantılar zararsız. Asıl sinyal daha dar: foundation/application kodu bazı presentation veya command implementasyonlarını import ediyor; birden fazla yüzeyin kullandığı application ve i18n yardımcıları ise fiziksel olarak `cli/` altında bulunuyor.
3. Repoda 2.000 fiziksel satırın üzerinde 20 authored production dosyası ve 400 satırın üzerinde 40 function var. Dosya büyüklüğü tek başına hata değildir. Örneğin `messages.ts` gibi katalog dosyaları ile davranış içeren orchestrator dosyaları aynı risk sınıfında değildir. Daha yüksek riskli küme; büyük davranış alanını, uzun function'ları, cycle'ları, senkron I/O'yu ve runtime boundary parsing işlemlerini birlikte taşıyan dosyalardır.
4. TypeScript assertion'ları runtime verisini doğrulamaz. Deckent önemli bazı sınırlarda güçlü Zod contract'ları kullanıyor; buna rağmen birçok kalıcı veya dış kaynaktan gelen `JSON.parse(...) as T` yolu inceleme adayıdır. Bu, her internal nesneyi doğrulama veya TypeScript'ten vazgeçme gerekçesi değil; runtime boundary güçlendirme konusudur.

Aktif geliştirme değişiklikleri bu mimari sinyalleri anlamlı ölçüde kötüleştirmiyor. Çalışma ağacı 39 değiştirilmiş/yeni source dosyasında toplam dört authored production dosyası ve 3.147 fiziksel satır ekliyor; buna karşın yeni value-import cycle, yeni `JSON.parse` konumu veya 2.000 satırı aşan yeni dosya oluşturmuyor. Senkron filesystem çağrılarında net iki artış var ve ikisi de statik olarak belirlenen sıcak child-process kümesinin dışında. Bu tanıdan bağımsız tek aktif geliştirme bulgusu şu: yeni `approvals` CLI command'ı, mevcut CLI↔MCP parity ratchet tarafından yeni bir CLI-only capability olarak görülüyor.

Karar: TypeScript/Node üzerinde kalınmalı. Repo genelinde async dönüşümü, package yapısını tek seferde değiştiren big-bang çalışma veya bütün sınırları kapsayan schema kampanyası başlatılmamalı. Sınıflandırılmış bulgular mevcut açık mimari işlere ve var olan 2K+ dosya parçalama planına bağlanmalı. Gerçek runtime ölçümünün nerede, nasıl, hangi platformlarda ve hangi eşiklerle yapılacağı daha sonra owner onaylı ayrı bir çalışmada kararlaştırılmalı.

## Temel bulgular

### 1. JavaScript/Node yetenekleri kullanılıyor

Production bin, `dist/cli/entry.js` dosyasını çalıştırıyor; build süreci `tsc` ve asset kopyalama adımlarından oluşuyor. [`tsconfig.json`](../tsconfig.json), ES2022 hedefi ve Node16 ESM resolution kullanıyor; `strict`, `isolatedModules` ve `noUncheckedIndexedAccess` seçenekleri açık. Mevcut authored production ağacındaki statik sinyaller:

| Sinyal | Konum sayısı | Yorum |
|---|---:|---|
| Dynamic `import()` | 140 | Runtime module yükleme aktif olarak kullanılıyor. |
| `for await` | 35 | Async iteration kullanılıyor. |
| Async generator | 28 | Streaming/iterable composition kullanılıyor. |
| Stream API | 43 | Node stream yapıları kullanılıyor. |
| EventEmitter | 26 | Event-driven composition mevcut. |
| AbortController / AbortSignal | 13 / 8 | Cancellation yapıları var; ancak bu sayım propagation zincirinin eksiksiz olduğunu kanıtlamaz. |
| Worker thread | 1 | Kullanılabilir fakat yaygın değil; bu durum tek başına eksiklik değildir. |
| Açık `any` | 19 | Repo boyutuna göre düşük. |
| `unknown` anahtar sözcüğü | 2.894 | Kod genellikle belirsizliği doğrudan `any` olarak kabul etmek yerine koruyor. |

1.218 authored production dosyasının 614'ü bir Node builtin, `better-sqlite3`, `node-pty`, Ink veya MCP SDK import ediyor. Bu %50,41 oranındaki Node bağımlılığı, mevcut ürün ve runtime tercihi için beklenen bir sonuç. Gelecekte Node dışı bir runtime'a geçiş düşünülürse önem kazanır; fakat bugün TypeScript kod kalitesi sorunu değildir. TypeScript; filesystem, process, PTY, path, credential veya signal davranışlarını platformlar arasında kendiliğinden eşitlemediği için cross-platform davranışlar yine platform adapter'ları üzerinden yönetilmelidir.

### 2. Senkron Node API'leri: geniş envanter, dar risk tanımı

Import-aware sayım, çalışma ağacında 427 authored production dosyasına dağılmış 3.774 senkron çağrı buluyor; HEAD başlangıç durumunda bu sayı 3.772. Sayım, `node:fs`/`fs` modüllerinden named veya namespace import ile alınmış ve adı `Sync` ile biten API'leri ve senkron `child_process` API'lerini kapsıyor. Ayrı bir geniş syntax sayımı 432 dosyada 3.731 çağrı buluyor ancak `fsyncSync` gibi daha az kullanılan bazı filesystem API'lerini kapsamıyor. Bu rapor import-aware envanteri esas alıyor; iki yöntemdeki beş dosyalık precision/recall farkını belirsizlik olarak kaydediyor.

En çok kullanılan API'ler:

| API | Mevcut konum sayısı |
|---|---:|
| `existsSync` | 1.221 |
| `readFileSync` | 705 |
| `writeFileSync` | 395 |
| `mkdirSync` | 284 |
| `readdirSync` | 265 |
| `unlinkSync` | 159 |
| `spawnSync` | 129 |
| `closeSync` | 85 |
| `statSync` | 80 |
| `renameSync` | 70 |
| `openSync` | 69 |
| `fsyncSync` | 48 |
| Import üzerinden çözümlenen diğer senkron API'ler | 264 |

Statik sınıflandırma özellikle bir performance sonucu olarak sunulmuyor:

| Sınıf | Konum sayısı | Anlamı |
|---|---:|---|
| `UNKNOWN_REACHABILITY` | 2.182 | Statik syntax, çağrının yalnız startup, yalnız atomic işlem veya tekrarlanan akışta olduğunu göstermiyor. |
| `HOT_PATH_RISK` | 1.082 | Senkron filesystem çağrısı repo tarafından hot-path ilan edilmiş dosyada, loop/timer içinde veya hot-path çağrıştıran bir function'da. Bu bir aday kümesidir; migration iş sayısı değildir. |
| `SAFE_ATOMIC_CANDIDATE` | 281 | Persistence/atomicity amacı taşıyan bir akışta görünüyor. Senkron sıralama bilinçli olabilir; blocking bütçesi ölçülmedi. |
| `STARTUP_LIKELY` | 85 | Top-level, startup veya configuration amaçlı görünen yol. Çağrı zamanı tahmin ediliyor, kanıtlanmıyor. |
| `CHILD_PROCESS_REVIEW` | 91 | Senkron child process, çağıran thread'i bekletir; çağrı sıklığı ve reachability bilinmiyor. |
| `TRACKED_HOT_PATH_CHILD_PROCESS` | 40 | Repo ratchet'inin ilan ettiği altı hot-path dosyasındaki canlı `spawnSync` konumları. |
| `HEURISTIC_HOT_PATH_CHILD_PROCESS` | 13 | Child-process çağrısı syntax veya function adına göre tekrarlanan/hot görünüyor fakat ilan edilmiş hot-path dosya kümesinde değil. |

Gerçek zarar modeli daha sınırlıdır: senkron çağrı çalışırken Node event-loop thread'i başka bir callback işleyemez. Uzun ömürlü ve paylaşılan bir process içinde bu durum HTTP/SSE response'larını, approval delivery'yi, heartbeat/lease renewal işlemlerini, timer'ları, worker observation'ı ve shutdown işlemlerini geciktirebilir. Bu, CPU'nun verimsiz kullanıldığını göstermez ve her çağrının anlamlı süre boyunca blokladığı anlamına gelmez.

Somut statik adaylar:

- [`src/api/server.ts`](../src/api/server.ts) içindeki 1.086 satırlık `handleRequest` gövdesinde 24 senkron filesystem çağrı konumu var. Bunlar farklı branch'lerdeki konumlardır; her request'te 24 çağrının tamamının çalıştığı anlamına gelmez. Aynı dosyada startup/config okumaları ve atomic runtime-token yazma zinciri de bulunuyor; bunlar request-path işlemleriyle aynı sınıfta değerlendirilmemeli.
- [`src/api/live-events.ts`](../src/api/live-events.ts), `emitHeartbeat` içinde senkron okuma yapıyor ve retry amaçlı bir `setInterval` callback'inde senkron existence kontrolü içeriyor. Timing verisi olmadan bile event-loop hassasiyeti açısından makul bir inceleme adayıdır.
- [`src/monitor/auditor.ts`](../src/monitor/auditor.ts), [`src/orchestra/spawn-backend-docker.ts`](../src/orchestra/spawn-backend-docker.ts), [`src/orchestra/tmux.ts`](../src/orchestra/tmux.ts), [`src/orchestra/worker-liveness.ts`](../src/orchestra/worker-liveness.ts), [`src/orchestra/monitor-adapter.ts`](../src/orchestra/monitor-adapter.ts) ve [`src/core/output-collector.ts`](../src/core/output-collector.ts), [`scripts/lint-no-spawnsync.mjs`](../scripts/lint-no-spawnsync.mjs) tarafından zaten hot-path dosyaları olarak tanımlanmış.
- Mevcut ratchet geçiyor ve 89 grandfathered non-hot-path konumu ile 41 kayıtlı hot-path debt girdisi bildiriyor. Canlı taramada 40 hot-path çağrısı var. `spawn-backend-docker.ts` için kayıtlı bir `git hash-object` baseline girdisi artık kaynakta bulunmuyor; mevcut gate bu stale baseline girdisini hata olarak bildirmiyor.

Bu nedenle doğru yorum “3.774 çağrının tamamı async yapılmalı” değildir. Doğru yorum şudur: Yeni `spawnSync` eklenmesini engelleyen ratchet korunmalı; önce gerçekten uzun ömürlü sınırlardaki çağrılar incelenmeli; sınırlı startup/atomic istisnaları açık gerekçelerle korunmalı ve daha sonraki runtime ölçümüne kadar latency etkisi iddia edilmemeli. Bu çalışma, ölçümün nerede veya nasıl yapılacağını seçmez.

### 3. Layer bağlantıları: tek bir ihlal sayısı yerine sınıflandırma

Çalışma ağacında çözümlenmiş 5.510 relative import/export bağlantısı var. Graph, type-only bağlantılar ile runtime value bağlantılarını birbirinden ayırıyor.

| Sınıf | Bağlantı sayısı | Tanı |
|---|---:|---|
| `NOT_A_VIOLATION` | 3.950 | Aynı layer içinde veya normal bağımlılık yönünde. |
| `TYPE_ONLY_SAFE` | 1.469 | Runtime'da kaldırılır; runtime cycle bağlantısı değildir. |
| `SHARED_OR_APP_SERVICE_MISPLACED` | 44 | Birden fazla yüzey, fiziksel olarak `cli/` altında bulunan i18n/process/start yardımcılarına erişiyor; sorun bu kodun sahipliğidir. |
| `SURFACE_IMPLEMENTATION_REUSE` | 20 | API/MCP/connectors doğrudan CLI command implementasyonlarını import ediyor. Thin-wrapper amacı mevcut olsa da canonical service sahipliği bulunmuyor. |
| `INTENTIONAL_ADAPTER_CANDIDATE` | 18 | CLI→API/connectors veya Desktop→API entry composition. Muhtemelen doğru adapter yönü; kesin karar owner contract'ına bağlı. |
| `CONFIRMED_INVERSION` | 6 | Foundation/orchestration katmanı CLI presentation veya command implementasyonunu import ediyor. |
| `REGISTERED_SHIM` | 2 | `layer-shims.json` içinde kayıtlı iki Nervous shim'i. |
| `AMBIGUOUS_OWNER_DECISION` | 1 | API→connector composition için sahiplik kararı gerekiyor. |

Dar kapsamlı altı ters bağımlılık:

| Foundation kaynağı | CLI hedefi |
|---|---|
| `agents/agentic-worker-runner.ts` | `cli/commands/chat-tool-exec.ts` |
| `agents/http-agentic-worker.ts` | `cli/commands/chat-tool-exec.ts` |
| `orchestra/sprint-finalizer.ts` | `cli/helpers/sprint-summary-rich.ts` |
| `orchestra/sprint-phases.ts` | `cli/helpers/splash.ts` |
| `orchestra/task-mode-runner.ts` | `cli/commands/run.ts` |
| `orchestra/task-mode-runner.ts` | `cli/commands/spawn.ts` |

20 surface-implementation reuse bağlantısı da ilk ham “MCP/API/connectors CLI import ediyor” sayısından daha dardır: API→CLI command implementasyonları 6, MCP→CLI 7 ve connectors→CLI 7 bağlantı oluşturuyor. Shared helper'lar ve kayıtlı shim'ler bu sayıya dahil değil.

Graph, 48 dosyayı kapsayan 9 value-import strongly connected component içeriyor. En büyük component, 30 CLI/orchestra dosyasından oluşuyor; planning, spawning, finalization, result collection ve CLI command/helper modüllerini birlikte kapsıyor. Bu bulgu tek bir cross-layer bağlantıdan daha güçlüdür; çünkü runtime bağımlılık yönünü acyclic hale getirmek yalnızca tek bir import'u değiştirmekle mümkün değildir.

Mevcut kontroller durumu dürüstçe gösteriyor fakat tam kapsamlı değil:

- [`scripts/lint-layer-shims.mjs`](../scripts/lint-layer-shims.mjs), kayıtlı iki dosya için geçiyor; ancak dosyanın kendi açıklaması, kayıt altında olmayan yeni bir MCP dosyasındaki yeni crossing'i keşfetmediğini belirtiyor.
- [`.deckent/settings/layer-shims.json`](../.deckent/settings/layer-shims.json), aynı sınırlamayı ve gelecekteki full graph gate ihtiyacını kaydediyor.
- [`scripts/lint-cli-mcp-parity.mjs`](../scripts/lint-cli-mcp-parity.mjs), command/tool adı parity ratchet'idir; semantic application-service veya dependency direction kanıtı değildir.

Bu tanı için yeni bir umbrella iş açılması gerekmiyor; konu mevcut işlerde zaten temsil ediliyor:

- `LAYER-BOUNDARY-GATE-001`, source graph'ın tamamının keşfedilmesini ve fail-closed exception authority'yi kapsıyor.
- `APP-SERVICE-001`, transport/UI bağımsız use-case'leri kapsıyor.
- `SURFACE-CONTRACT-001`, canonical protocol/client sınırlarını kapsıyor.
- `API-CONTRACT-001` ve `SURFACE-PARITY-001`, versioned transport davranışını ve capability parity'yi kapsıyor.
- [`docs/design/DECKENT-DESKTOP-TERMINAL-RECONCILIATION.md`](../docs/design/DECKENT-DESKTOP-TERMINAL-RECONCILIATION.md), fiziksel package taşımasından önce mantıksal `application/`, `protocol/`, `client/`, `runtime/` ve `platform/` sınırlarının kurulmasını zaten seçiyor.

Sonuç: Bu rapor yeni bir package veya workspace parçalama işi açmaz. Mevcut işler yürütülürken önce davranış canonical application service'lere taşınmalı, ardından CLI/API/MCP/connectors ince adapter'lara dönüştürülmeli. Sahipliği değiştirmeden yalnızca dosyaları taşımak, aynı cycle'ları yeni path'ler altında korur.

### 4. Büyük modüller: 2K bir inceleme eşiğidir, tasarım sınırı değildir

Mevcut authored production boyut dağılımı:

| Eşik | Dosya/function sayısı |
|---|---:|
| 500 satırın üzerindeki dosyalar | 180 |
| 1.000 satırın üzerindeki dosyalar | 51 |
| 2.000 satırın üzerindeki dosyalar | 20 |
| 4.000 satırın üzerindeki dosyalar | 5 |
| 100 satırın üzerindeki function'lar | 401 |
| 200 satırın üzerindeki function'lar | 113 |
| 400 satırın üzerindeki function'lar | 40 |

En büyük dosyalar:

| Dosya | Fiziksel satır | Ek statik sinyal |
|---|---:|---|
| `orchestra/spawn-backend-docker.ts` | 7.868 | 195 senkron konum, value cycle ve birden fazla runtime boundary |
| `core/file-lock.ts` | 6.533 | 160 senkron konum ve durable authority parsing |
| `cli/helpers/messages.ts` | 5.752 | Data/i18n kataloğu; boyutunun risk biçimi executable orchestration kodundan farklı |
| `orchestra/sprint-phases.ts` | 4.446 | 1.159 satırlık `runEvaluatePhase` ve value cycle |
| `orchestra/sprint-finalizer.ts` | 4.220 | 1.239 satırlık `finalizeSprint` ve value cycle |
| `monitor/auditor.ts` | 3.455 | Repo tarafından ilan edilmiş hot path |
| `orchestra/result-evaluator.ts` | 3.109 | Evaluation davranışı tek yerde yoğunlaşıyor |
| `core/config.ts` | 3.096 | 839 satırlık `validateConfig` ve value cycle |
| `orchestra/sprint-controller.ts` | 3.055 | 1.449 satırlık `runSprint` ve value cycle |
| `api/server.ts` | 2.812 | 1.086 satırlık `handleRequest`; ingress, startup ve static-serving rolleri karışık |

2.000 satırın üzerindeki 20 dosyanın 10'u value cycle içinde, 18'i senkron Node çağrısı içeriyor ve 17'sinde en az bir `JSON.parse` konumu bulunuyor. Bu kesişimler önceliklendirme için yararlı; dosyanın hatalı olduğunu kanıtlamaz.

Mevcut 2K+ parçalama planı, yalnız satır kotasına değil davranış ve authority sınırlarına göre ilerlemeli. Statik olarak görülen doğal ayrım noktaları:

- `api/server.ts` içinde ingress/request routing ile server bootstrap, static asset ve terminal gateway sorumluluklarının ayrılması;
- sprint controller/phases/finalizer/collector içinde lifecycle phase'leri ile phase'e özel application service'lerin ayrılması;
- Docker backend içinde backend protocol/process execution ile observation, settlement, artifact publication ve platform adapter sorumluluklarının ayrılması;
- `file-lock.ts` içinde lock contract, platform primitive'leri, durable store, audit ve recovery/migration sorumluluklarının ayrılması;
- birden fazla configuration authority oluşturmadan config içindeki schema aileleri ve validation service'lerin ayrılması;
- tek i18n authority korunarak `messages.ts` için catalog sharding veya generated projection uygulanması.

Bu çalışmada source dosyaları parçalanmadı. Güvenli bir parçalama; canonical producer→consumer→ingress wiring zincirini, public export'ları, persisted formatları, error vocabulary'yi, i18n sahipliğini ve every-environment davranışını korumalıdır. Bu koşullar sağlanmadan yalnızca dosya boyutunun küçülmesi başarılı decomposition sayılmaz.

### 5. Runtime TypeScript sınırı: beşinci konu ne anlama geliyor?

TypeScript gelen byte'ları değil, kaynak programı denetler. Aşağıdaki kod:

```ts
const value = JSON.parse(raw) as SomeType;
```

runtime sırasında `SomeType` yapısını doğrulamaz. `as SomeType`, yalnızca compiler'a programmer'ın beyanına güvenmesini söyler. `raw` eski bir database kaydından, yarım yazılmış bir dosyadan, başka bir process'ten, provider'dan, API client'tan, plugin'den veya farklı Deckent sürümünden geliyorsa yanlış biçimli veri parse işlemini geçebilir ve daha sonra hata verebilir. Bazı durumlarda veri hata vermeden önce authority veya state kararını etkilemiş olabilir.

Mevcut statik sinyaller:

| Sinyal | Konum sayısı |
|---|---:|
| `JSON.parse` | 671 |
| Doğrudan `JSON.parse(...) as ...` assertion'ı | 465 |
| `safeParse` çağrısı | 69 |
| Zod import eden authored production dosyası | 48 |
| Yakınında validation sinyali bulunan parse function'ı, heuristic | 103 |
| Yakınında local validation sinyali bulunmayan durable/external doğrudan assertion adayı | 89 |

89 sayısı doğrulanmış hata sayısı değil, inceleme kuyruğudur. Validation başka bir function'a devredilmiş olabilir veya local syntax taramasının göremediği daha güçlü bir producer contract ile sağlanıyor olabilir.

Güçlü mevcut pattern örnekleri:

- [`src/core/approval-contract.ts`](../src/core/approval-contract.ts), kalıcı ve security açısından önemli approval verisi için strict, versioned Zod schema'ları ve `safeParse` kullanıyor.
- [`src/core/task-result-schema.ts`](../src/core/task-result-schema.ts), TypeScript type'ını versioned runtime schema'dan türetiyor ve worker result'larını runtime'da doğruluyor.

İnceleme adayı örnekleri:

- [`src/core/run-flow-store.ts`](../src/core/run-flow-store.ts), serialized payload hash'ini doğruladıktan sonra `JSON.parse(row.payload_json) as T` döndürüyor. Hash, byte bütünlüğünü kanıtlar; byte'ların istenen semantic shape'e uyduğunu kanıtlamaz.
- [`src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`](../src/orchestra/autonomous/mission-store/sqlite-mission-store.ts), persisted field'lar için generic bir `p<T>` JSON parser içeriyor.
- Provider stream/tool argument'ları, SSE/event satırları, CLI/MCP status log'ları ve bazı SQLite row mapper'ları external veya durable sınırlarda doğrudan assertion içeriyor.

TypeScript/Node üzerinde kalırken uygun kapsam:

- Versioned durable record'lar, API/MCP/connector input'ları, process/provider output'ları, plugin/config ingress ve security/authority kararları doğrulanmalı.
- Internal in-memory nesneler, yalnız validation yapmak amacıyla serialize edilip tekrar parse edilmemeli; normal TypeScript type sistemiyle korunmalı.
- Her private helper dönüşü için ayrı schema oluşturulmamalı.
- TypeScript type'ını türeten tek bir canonical schema tercih edilmeli; ayrı yazılmış interface ile zamanla ayrışabilecek validator birlikte tutulmamalı.
- Legacy/migration yollarında eksik alanlar sessizce uydurulmamalı; typed corrupt/unsupported/HOLD sonucu üretilmeli.

### 6. Aktif çalışma ağacının etkisi

HEAD ile aktif değişikliklerin ayrı karşılaştırılmasının nedeni, reponun aktif Sprint geliştirmesi altında olmasıdır. Bu değişiklikler bu tanıya değil, aktif çalışmaya aittir.

| Ölçüm | HEAD | Çalışma ağacı | Fark |
|---|---:|---:|---:|
| Authored production dosyası | 1.214 | 1.218 | +4 |
| Authored production fiziksel satırı | 383.060 | 386.207 | +3.147 |
| 2.000 satırın üzerindeki dosya | 20 | 20 | 0 |
| Senkron çağrı konumu | 3.772 | 3.774 | +2 |
| Value-import SCC | 9 | 9 | 0 |
| `JSON.parse` konumu | 671 | 671 | 0 |

Net iki senkron çağrı artışı; refactor sırasında adı değişen atomic file-publication helper hesaba katıldığında, bir ek `mkdirSync` ve bir ek `chmodSync` çağrısından oluşuyor. Kayıtlı veya heuristic hot-path child-process çağrılarında net artış yok.

Mevcut çalışma ağacında çalıştırılan read-only gate sonuçları:

| Gate | Sonuç | Yorum |
|---|---|---|
| `node scripts/lint-no-spawnsync.mjs` | GEÇTİ | Ratchet dışında yeni `spawnSync` yok. |
| `node scripts/lint-layer-shims.mjs` | GEÇTİ | Kayıtlı iki shim dosyası hesaba katılıyor; full-graph coverage bu gate'in kapsamında değil. |
| `node scripts/lint-cli-mcp-parity.mjs` | KALDI | Aktif ve untracked `src/cli/commands/approvals.ts` dosyasından gelen yeni bir CLI-only öğe var: `approvals`. Bu tanı dosyayı değiştirmedi ve baseline'a eklemedi. |

Son gate sonucu, aktif feature'ın kendi canonical application-service ve surface kapsamında karara bağlanmalı. Parity baseline'ını bu çalışmada otomatik güncellemek owner kararını gizler ve kapsam dışıdır.

## Kapsam, veri ve tanımlar

İncelenen küme authored production `src/**/*.{ts,tsx}` dosyalarıdır. Test/spec path'leri, generated/gen dosyaları, `node_modules`, `dist`, `build`, `coverage` ve `.vite` hariç tutuldu. İlk exploratory profile, bu ayrımın neden gerekli olduğunu gösterdi: nested dependency/build klasörleri görünen repo boyutunu on kattan fazla şişirebilir. Raporlanan bütün sayılar, population sınırı düzeltildikten sonra yeniden üretildi.

Tanımlar:

- Fiziksel satır: Source blob içindeki metin satırı; executable statement sayısı değildir.
- Runtime/value bağlantısı: Tamamı type-only olmayan, çözümlenmiş relative import/export bağlantısıdır.
- Cycle: Runtime/value graph içinde birden fazla dosyadan oluşan strongly connected component'tir.
- Senkron konum: Import edilmiş Node filesystem `*Sync` veya senkron child-process çağrı ifadesidir; execution sayısı değildir.
- Hot-path riski: Repo tarafından ilan edilen hot-path dosyaları, loop/timer yapıları ve function adları kullanılarak yapılan statik sınıflandırmadır. Gözlemlenmiş latency veya çağrı sıklığı değildir.
- Runtime boundary: Local source context'e göre sınıflandırılmış `JSON.parse` konumudur. Boundary sınıfı ve validation yakınlığı heuristic inceleme alanlarıdır.
- HEAD başlangıç durumu: Yukarıda belirtilen commit içindeki değişmez dosya içerikleridir.
- Çalışma ağacı değişiklikleri: Aktif değiştirilmiş ve untracked production dosyaları dahil, filesystem üzerindeki mevcut içeriktir.

Yeniden üretilebilir destekleyici kanıtlar:

- [Statik analiz aracı](../.analysis/deckent-ts-static-diagnosis-2026-08-13/analyze-static-diagnosis.mjs)
- [Tam tanı kaydı](../.analysis/deckent-ts-static-diagnosis-2026-08-13/diagnosis.json)
- [Senkron çağrı konumları kaydı](../.analysis/deckent-ts-static-diagnosis-2026-08-13/sync-call-sites.csv)
- [Layer bağlantıları kaydı](../.analysis/deckent-ts-static-diagnosis-2026-08-13/layer-edges.csv)
- [Runtime boundary kaydı](../.analysis/deckent-ts-static-diagnosis-2026-08-13/runtime-boundaries.csv)

`.analysis/` altındaki dosyalar local ve git tarafından ignore edilen destekleyici kanıtlardır. Kalıcı ve tracked sonuç bu follow-up dokümanıdır.

## Yöntem ve doğrulama

1. Repo architecture bilgisi, aktif directives, mevcut follow-up yazım biçimi, ilgili MASTER satırları ve Desktop/Terminal reconciliation dokümanı okundu.
2. Bütün authored production TS/TSX dosyaları, repoda kurulu TypeScript compiler API ile parse edildi.
3. `git HEAD` içerikleri ve mevcut çalışma ağacı dosyaları için ayrı source map'ler oluşturuldu.
4. Relative import'lar çözümlendi, type-only bağlantılar ayrıldı ve Tarjan strongly connected component hesabı yapıldı.
5. Senkron çağrılar Node module import'ları üzerinden çözümlendi; çağrıyı içeren function, loop ve timer context'i kaydedildi ve korumacı sınıflandırmalar uygulandı.
6. `JSON.parse` konumları local boundary kanıtına, doğrudan assertion kullanımına ve yakındaki validation sinyallerine göre sınıflandırıldı.
7. Statik iddialar reponun kendi `spawnSync`, layer-shim ve CLI↔MCP parity gate'leriyle karşılaştırıldı.
8. Sonuçlar yazılmadan önce API/event, durable-store, schema ve layer bağlantılarından temsilî source örnekleri elle incelendi.

Veri kalitesi korumaları:

- Sayımlarda test, dependency veya build output, authored production ile karıştırılmadı.
- HEAD ve aktif çalışma ağacı tek ve açıklamasız bir snapshot gibi birleştirilmedi.
- Syntax varlığı, statik reachability riski ve gözlemlenmiş runtime etkisi ayrı kanıt sınıfları olarak tutuldu.
- Kayıtlı shim'ler ve muhtemel entrypoint adapter'ları ihlal olarak etiketlenmedi.
- Aktif çalışmadaki başarısız parity gate sonucu gizlenmedi, otomatik kabul edilmedi veya bu çalışma içinde düzeltilmedi.
- Kesinlik görüntüsü oluşturmak için external benchmark, provider çağrısı veya source değişikliği kullanılmadı.

## Sınırlamalar ve belirsizlikler

- Statik analiz çağrı sıklığını, dosya boyutlarını, storage latency'yi, child-process latency'yi, event-loop delay'i veya kullanıcıya görünen etkiyi kanıtlayamaz.
- Function adları ve loop/timer ancestry yararlı inceleme sinyalleridir; false positive ve false negative üretebilir.
- Import resolution relative TS/TSX modüllerini kapsar. Package export'ları, runtime'da hesaplanan path'ler, `require` alias'ları ve bazı dynamic import'lar graph dışında kalabilir.
- Senkron envanter normal named/namespace Node import'larında yüksek precision taşır; alışılmadık dynamic/require alias'ları gözden kaçabilir.
- Local olarak Zod veya manual check görülmemesi, upstream producer ya da devredilmiş validator olmadığını kanıtlamaz.
- Satır eşikleri cohesion, ownership veya change coupling'i değil, yoğunlaşmayı ölçer. `messages.ts`, boyut sınıflarının neden semantic inceleme gerektirdiğini gösterir.
- Sprint çalışması ilerledikçe mevcut çalışma ağacı sonuçları değişebilir. HEAD başlangıç durumu sabit karşılaştırma noktasıdır.
- Bu dokümandaki hiçbir ifade production latency, throughput, SLO ihlali veya cross-platform runtime eşdeğerliği iddia etmez.

## Önerilen sonraki adımlar

Bunlar yeni implementation yetkileri değil, mevcut işlere yönlendirme kararlarıdır:

1. TypeScript/Node ve mevcut strict compiler yaklaşımı korunmalı. Bu kanıtlar Go/Rust migration ihtiyacı göstermiyor.
2. Altı foundation→CLI bağlantısı, 20 surface→CLI implementation bağlantısı ve yanlış sahiplenilmiş 44 shared/application-service bağlantısı `APP-SERVICE-001`, `SURFACE-CONTRACT-001` ve `LAYER-BOUNDARY-GATE-001` işlerine bağlanmalı; paralel umbrella açılmamalı.
3. Mevcut 2K+ decomposition planı yalnız satır sayısına göre değil; davranış büyüklüğü + uzun function + cycle + hot-path senkron çağrı + durable/external parsing bileşik riskine göre önceliklendirilmeli.
4. Yeni `spawnSync` eklenmesini engelleyen mevcut policy korunmalı. Stale kalan tek hot-path baseline girdisi bu tanı üzerinden değil, mevcut `TEST-SPAWN-001`/hot-path sahipliği altında düzeltilmeli.
5. 89 runtime boundary konumu inceleme adayı olarak ele alınmalı. Yalnız doğrulanan durable/external/security açıkları feature sahibinin işine dönüştürülmeli ve canonical schema'lar yeniden kullanılmalı.
6. Aktif `approvals` CLI↔MCP/application-service kararı kendi Sprint kapsamı içinde tamamlanmalı; varsayılan olarak baseline'a eklenmemeli.
7. Runtime ölçüm tasarımı istendiği gibi ertelenmeli. Herhangi bir ölçüm çalışması başlamadan önce owner; kullanıcı yolculuğunu/yüzeyini, process topology'yi, environment'ları, workload'u, SLI/SLO'yu, izin verilen instrumentation yükünü, veri retention/redaction politikasını ve promotion eşiğini belirlemeli.

## Daha sonraki owner kararına bırakılan sorular

- Event-loop kanıtı için hangi kullanıcı yüzeyleri önceliklidir: API/SSE, Terminal approval akışı, heartbeat/lease observation, worker dispatch veya ortak bir SLO contract üzerinden hepsi mi?
- İlk runtime çalışması production benzeri dogfood ortamını mı, hermetic workload'u mu, yoksa eşdeğer olmadıkları açıkça belirtilerek ikisini birden mi ölçmeli?
- Bir çağrının güvenli veya zararlı sayılmasından önce hangi environment matrisi ve storage/process backend'leri zorunlu olmalı?
- Statik `HOT_PATH_RISK` bulgusunu implementation işine dönüştürecek eşik hangisidir: event-loop delay, tail latency, kaçırılan heartbeat, approval gecikmesi, throughput veya bileşik bir bütçe mi?
- Hangi senkron atomic işlemler correctness açısından zorunludur ve mekanik async dönüşümü yerine açık bir bounded blocking budget gerektirir?

Bu kararlar verilene kadar runtime etki durumu `UNMEASURED` yani “ölçülmedi”dir; “güvenli” veya “yavaş” değildir.
