# Dogfood yürütme ve bütün yüzeyler — analiz / kapanış planı

Durum: OWNER-APPROVED analiz/uygulama sırası; mevcut R1 sınırındaki ilk paket başladı. Yeni MASTER admission veya ürün DONE değildir. Owner isteği: mevcut R1 onarımını diğer yüzeyleri kapsayacak biçimde analiz etmek. Ana outcome MASTER120 / RECOVERY-DO-DOGFOOD-001; yeni ürün kapsamı mevcut outcome'a sessizce eklenmez. Authority: epoch7 Astra; Terminal lane'i Alperen/Cursor. Tarih: 2026-09-13, UTC ölçüm zamanı eşlik eden manifestte.

## 1. Sonuç ve bilinen durum

Problem yalnız `.local` altında dosya bulunması değildir. Yerleşim, canonical kimlik ve authority çözümlemesi; pahalı geçmiş doğrulaması; event-loop canlılığı; plan/start ingress eşitliği; durum projeksiyonlarının tazeliği ayrı ayrı sınanmalıdır. `.local` kök neden varsayımı henüz bütün adapterlar için kanıt değildir.

- Build başarılıdır; bu, dogfood GO değildir.
- 751 dış sprint ABORTED; exact attempt için RELEASED_EFFECT_UNACCEPTED kalıcı negatif kayıt vardır. Başarılı task/result üretildiği iddia edilmez.
- `.tasks` son ölçümde boştur. Yeni sprint başlamadı.
- R1-E adayında native tarama 10,3 saniyede deadline'a takılıyor; default OFF. Önceki production taraması 75 saniyede sonuç vermedi. Cache sınırı veya timeout artırılmayacak.
- Attempt bazlı teşhiste 722-001 yaklaşık1,64s,747-001 yaklaşık2,33s,746-002 yaklaşık1,26s. Bunlar instrumented teşhistir, p95 değildir.
- Worker image candidate, start admission bütünlüğü, gerçek retention canary, auditor/Nervous canlılığı ve yüzeyler arası kanıt tamamlanmış değildir.

Önce engine'e dönüş, sonra yüzey kapanışı yapılır. Birbirinden ayrı kabul kapılarıdır; iki ayrı engine değildir.

## 2. Kaynakla doğrulanan bağlantılar ve analiz sınırı

| Bağlantı | Kaynak | Kanıtın sınırı |
|---|---|---|
| Proposal compiler → ortak planning preflight | `src/orchestra/run-proposal-compiler.ts:230`, `spawn-backend.ts:1363` | Docker geçmiş taraması proposal önünde senkron çalışıyor |
| Preflight → native custody health | `src/orchestra/spawn-backend.ts:1384`, `spawn-backend-docker.ts:5537` | Son canlı performans geçmedi |
| Store operation snapshot | `src/core/custody-read-snapshot.ts`, `task-attempt-custody-store.ts:5948` çevresi | Bounded aday; final native reread korunuyor; production default OFF |
| CLI status → canonical authority/read model | `src/cli/commands/status.ts:316`, `:466` | Kod bağlantısı; bütün modlarda live parity kanıtı değil |
| Terminal feed → canonical state | `src/cli/helpers/run-state-feed.ts:518` | UI event-loop ve tazelik ayrıca sınanmalı |
| MCP status → digest/authority eşleşen model | `src/mcp/tools/status.ts:345` | MCP kanalını execution authority yapmaz |
| API status → aynı authority ve matching model | `src/api/status-reconcile.ts:138` | Projection eksikliği/bozulması ayrı readiness olarak ele alınıyor |
| Desktop → daemon sprint stream | `src/desktop/src/renderer/shell/api-client.ts:459`, `RunsView.tsx:76` | REST/SSE consumer mevcut; tam lifecycle canlı eşitliği kanıtlanmadı |
| Dashboard → SSE ve task output | `src/dashboard/src/hooks/useSSE.ts:85`, `lib/useExactTaskOutput.ts:68` | Yalnız observability; yeni mutation authority kurulmayacak |
| Auditor ve Nervous | `src/monitor/auditor.ts:1601`, `sprint-controller.ts:732`, `:2985` | Kod/timer varlığı canlı tarama, karar veya receipt kanıtı değildir |

Bu belge odaklı bağlantı analizidir; tüm reponun içerik denetimi değildir. Dosya envanteri ayrı manifestte domainlere ayrılır; envantere girmek incelenmiş veya çalışan olmak demek değildir. Desktop, connectors, DB, uzak worker ve platform hücrelerinin canlı testi bu turda yapılmadı. Önceki raporlar tarihsel kanıttır; source line anchorları kaynak digestleriyle birlikte okunmalıdır.

## 3. Ortak sözleşme

Her ingress mevcut application-service'lerden aynı kimlik ve kararı almalı:

- Principal/tenant/project/installation ve runtime-root binding.
- Goal/Mission/Flow/Run/Task/Attempt/Operation kimliği, generation, causation ve idempotency.
- Effective backend/provider/model/role/skill/scope/policy/config revision.
- Lifecycle, freshness, authority, evidence ve outcome ayrı alanlar.
- Monotonic aşama süreleri; UTC gözlem zamanı; son gerçek heartbeat/event revision.
- Worker exit, effect landing, accepted result, verification ve settlement birbirinden ayrı.
- İzin/recovery kararı exact resource ve generation'a bağlı; eski UI state'i mutation yetkisi değildir.

Mevcut types/read-model/protocol alanları önce envanterlenir. Eksik alan kanıtlanmadan yeni generic envelope, ledger veya status servisi yazılmaz. Dashboard source of truth olmaz; UI kapanması process cancellation sayılmaz. Projection tazeliği execution admission yerine geçmez.

## 4. Analiz ve uygulama DAG'ı

`A → B → C → D → E`; yüzey analizi A'dan sonra yürüyebilir. Ürün mutation'ı engine kapılarından önce açılmaz. A–D mevcut R1 kapsamına bağlıdır; daha geniş yüzey açıkları bulgu olarak ayrılır.

### A — Mevcut kontrat ve runtime yerleşim haritası

Read-only envanter: CLI do/start/resume/recover; RunFlow/Goal/Mission/Autonomous/Process servisleri; API/MCP/connector adapterları; Terminal/Desktop/Dashboard consumers; Brain/Worker/Auditor/Nervous üreticileri.

Her yol için root resolution, effective config, invocation identity, admission, event producer, persisted state, projection ve terminal receipt satırları çıkarılır. Main ve `.local` ayrı kopya state tutuyorsa producer/custody belirlenir; path hardcode ederek main'e taşınmaz.

Çıktı: eksik bağlantı listesi ve custody matrisi. BLOCKS_CURRENT_DONE / RELATED_BUT_NONBLOCKING / UNRELATED ayrımı. Yeni outcome veya MASTER sınıflandırması elle yapılmaz.

### B — Admission okuma maliyeti ve canlı event loop

İlk kod paketi bu olmalı. Hotfiles: custody-read-snapshot, task-attempt-custody-store, execution-effect-store-adapter, spawn-backend / proposal compiler sınırı. Tek yazar Astra.

1. Tek immutable manifestin kaç kez parse/validate/hash/copy edildiğini; fiziksel byte okuması, semantic doğrulama ve final reread sürelerini ayır.
2. Aynı kanıtın immutable parsed düğümlerini paylaş. Anahtar root/tenant/project/attempt/generation/artifact proof/policy/native capability bağını içermeli. Daha gevşek limit altında okunan nesne, daha sıkı policy için doğrudan geçerli sayılmaz.
3. Yalnız request-local paylaşım ve mevcut snapshot kullan. Persistent READY/liveness cache yok. Eğer bounded index gerekirse canonical authority üretmeyen, değişiklikte invalidated ve eksik olduğunda açıkça rebuilding/HOLD olan projection olmalı; uygulanmadan writer/invalidation kontratı ayrıca çıkarılmalı.
4. Global discovery membership ile dosya değişimi/absence kontrolleri final fence'e kadar kalır. Parallel değişiklik, symlink/replacement, tenant mismatch, revoked capability ve restart negatif testleri zorunlu.
5. Pahalı native/senkron doğrulama UI/daemon event loop'unu bloke etmeyecek bir mevcut execution adapter sınırına taşınmalı. Async imza eklemek yeterli değildir. Worker thread/subprocess gerekiyorsa kendi sınırlı custody, cancellation ve sonuç generation kontrolü olmalı; eski sonuç yeni admission'a geçemez. Timeout iş başarılı demek değildir; timeout yükseltilmez.
6. İlk durum üretimi gerçek aşamadan gelir. Yüzey input, cancel ve inspection almaya devam eder; spinner sahte ilerleme üretmez.

Kabul: tam ordinary admission native proof, R1 hedefi p95≤5s ve mevcut10s/64MiB sınırı. Cold/warm/large-history, değişiklik ve concurrent writer ayrı ölçülür. En az20 ölçümlük ayrılmış cold/warm örneklem önerisi; fixture boyutu ve host koşulları raporlanır. Tek hızlı ölçümle default açılmaz. Cache muhasebesi ile RSS/heap ayrı ölçülür.

### C — Plan doğumu, worker image ve start/do parity

R1-C/D kalanlarını birlikte kapat; ayrı engine kurma. Exact-plan-start-service ve mevcut compiler/materializer esas alınır.

- Host deterministik taslağı oluşturur: ID, schema version, dependency slots, config binding, scope ve verification alanları. AI yalnız gerekli göreve özgü içeriği üretir; authority, receipt veya kimlik uyduramaz.
- Eksik/çelişen scope ve verification, worker doğmadan gösterilir. Yapılandırılmış yol LLM çağrısı yapmaz; AI yolunda planner süresi ayrı ölçülür. Görevlerin her durumda başarı garantisi verilmez; her kabul edilmiş invocation açık terminal disposition/recovery ile sonuçlanmalı.
- start/do/mission/autonomous/process adapterları aynı validasyon sınırına bağlanır. Seçenek isimlerinin eşitliği değil ortaya çıkan exact plan/admission eşitliği test edilir.
- Image recipe/lock/runtime/provider capability gerçek image üzerinde doğrulanır. Candidate image otomatik promote edilmez; eski aktif worker image'ı değiştirilmez.
- Brain/worker/auditor modelleri config+registry+capacity ile çözülür. Sabit model veya worker sayısı yok; büyük task/küçük task dağıtım optimizasyonu bu kurtarma paketine eklenmez.

Kabul: host deterministik taslak p95≤100ms ve ilk gerçek phase≤250ms hedefleri provider/native audit hariç ayrıca ölçülür; uçtan uca toplam da verilir. Bunlar yeni sabit timeout değildir. Provider süresi saklanmaz. Wrong image/policy/scope → worker/provider call0; doğru plan → gerçek task+skill/persona+worker doğumu.

### D — Tek gerçek canary ve supervision

Önce R1-F retention işiyle bir resmi CLI start; kapanınca bağımlı do. İlk failure aynı fingerprint ile tekrar edilmez. Sprint numarasını engine üretir.

Brain PLAN→settlement boyunca görünür ve izleyen taraftır. Worker claim/heartbeat/output/diff; Auditor gerçek tarama zamanı, bulgu, karar/adoption; Nervous öneri→policy kararı→sonuç bağlantısı izlenir. Sırf timer çağrıldı diye auditor çalışıyor sayılmaz.

Canary matrisi: normal sonuç, worker failure, provider unavailable, izin deny/expiry, controller restart, partial effect, recovery. Güvenli failure enjeksiyonu yalnız izole fixture/test realm'de; kullanıcı runtime'ı rastgele öldürülmez.

Kabul zinciri: approved plan → admission → skill/persona → real provider usage → worker heartbeat → exact effect → host verification → terminal task/run receipt → archive. XVerify gerçek farklı-provider call+usage+closed settlement+receipt gerektirir; yoksa unavailable/HOLD, self-verify yok. Bağımsız iki task ancak config/collision uygunluğunda paralel çalıştırılır; sırf gösterim için worker üretilmez.

### E — Bütün yüzeylerde aynı işin izlenmesi ve kontrolü

| Yüzey | Yapılacak doğrulama / onarım | Gerçek kabul |
|---|---|---|
| CLI start/do/resume/recover/status | Ortak admission, exact exit/outcome, JSON/prose eşitliği | Yeni binary ile normal ve negatif senaryo; exit0 salt spawn anlamına gelebilir, terminal başarıyla karışmaz |
| Terminal | Phase/worker tree/output/approval/recovery; REPL thread'i kilitlenmez | Aynı run canlı PTY; input/cancel, narrow/ASCII, reconnect ve paste; Cursor custody |
| Desktop | Daemon session, canonical run inspector, aynı request'e yetkili intervention | Gerçek app+daemon üzerinde Terminal'deki exact run/revision; reconnect/backfill, focus ve erişilebilirlik |
| Dashboard | Read-only run/worker/audit/progress/freshness | Aynı run kimliği, sıra/digest, dropped SSE sonrası resync; mutation authority yok |
| API | Authenticated scope, idempotency, operation lifecycle, status/SSE | Local daemon üzerinden request→same operation; stale generation ve wrong tenant reddi |
| MCP | Tool schema/response/error/resource parity, cancellation ve status | Gerçek stdio client; read status mutasyon yapmaz; approvals inbox read-only kalır |
| Goal/Mission/Autonomous/Process | Parent/child causation, dependency, durable continuation | Ortak servis zinciri; restart sonrası duplicate effect yok, task/result orphan yok |
| Connectors / extensions | Delivery dedupe, account/project binding, status/cancel yetkisi | Kontrollü test adapterıyla duplicate/out-of-order; canlı dış mesaj ayrı yetki ve proof ister |
| Brain/Worker/Auditor/Nervous | Aynı attempt/lease/decision/effect otoritesini görme | Gerçek activity + durable audit; stale worker ile unknown worker ayrılır |

Kontrol yüzeyleri sadece yetkili desteklenen eylemleri sunar. Onay akışı mevcut authenticated CLI karar authority'sini aşmaz; Desktop'ta yeni bağımsız allow mekanizması bu plana eklenmez. Aynı operation'ın başarısı bir yüzeyde gösterilirken diğerinde ACTIVE kalması FAIL'dir.

## 5. Ortak negatif senaryo ve enterprise matrisi

- Lifecycle: pending/admitted/running/recovering/settling/terminal; gerçek kod enumlarına eşleştir, yeni isimleri zorlamadan.
- Freshness: live/delayed/stale/disconnected/unknown. Unknown “idle” veya “failed” diye gösterilmez.
- İzin: required/allowed/denied/expired/unavailable; karar, execution ve effect ayrı görünür.
- Evidence: pending/partial/verified/contradicted/unavailable; accepted worker cevabı terminal settlement sayılmaz.
- Platform: Linux,WSL,macOS,Windows-native; path-case/symlink/filesystem/native capability ve process identity. Desteklenmeyen capability honest typed unsupported/HOLD; Linux başarısı diğer platformların kanıtı değil.
- Tenancy: iki tenant aynı task adı; aynı hostta iki checkout; uzak worker; boş/çok büyük history; event replay ve reconnect; policy/config revision değişimi; account değişimi.
- Enterprise effect: dosya yanında DB/API/business connector effects için idempotency/commit/compensation sınırı ayrıca haritalanır. Bu analiz mevcut kod görevlerini genel ERP entegrasyonu yapma yetkisine dönüştürmez.
- UI: i18n, keyboard, screen reader announcement, non-color states, reduced motion; terminalin tema/fontu kullanıcıdan gelir.

## 6. Kapılar, kapsam ve tempo

Engine GO: B+C+D gerçek kanıtı. Cross-surface GO: E matrisi. MASTER120 DONE: kendi geniş closure contractı ve authenticated ledger yolu; bu plan elle DONE işaretlemez.

Her paket için producer→consumer→ingress→policy enablement→real proof manifesti; exact dosyalar, SHA256, UTC, komut/exit, negatif sonuç ve kalan risk. Code/test/source eşleşmeden binary sonucu kullanma. Test ve build ardışık; canlı sprint sırasında build/auth değişikliği yok.

Bir implementation + bir verification, en fazla iki değişmiş-kanıt repair. Değişmeyen failure tekrarlanmaz. Bir sonraki recovery paketi yalnız ölçümün gösterdiği hotfile sınırında. Büyük refactor/god-object bölme performans kanıtı yerine geçmez.

Astra: engine/custody/admission/supervision ve fan-in. Cursor: mevcut Terminal/start teslimi; ek yüzey uygulaması ancak explicit scope verildiğinde. Ortak messages/types dosyalarında bir yazar. Bu analizde agent, run, build, test, cleanup, provider call veya commit/push başlatılmaz. Mevcut runtime ve `.brain/memory.db` korunur.

## 7. Owner'a açık tasarım kararları

Şu an yeni onay olmadan analiz edilebilir; mevcut R1 onarımı zaten kabul edilmişti. Öneri: mevcut R1 sırasını koru, B performans ve C admission/image kapanışından sonra tek canary, ardından yüzey matrisi. Görsel yeniden tasarım, yeni execution authority, yeni provider modeli veya mode değişimi önerilmiyor.

Yeni kapsam gerektirirse karar ayrı sunulur: desteklenmeyen bir platformu bu kapanışta canlı kanıta dahil etme; uzak enterprise DB/connector için gerçek test hesabı/realm; mevcut protocolün taşıyamadığı bir intervention için governance amendment. Bunların hiçbiri sessizce varsayılmaz; engine onarımını gereksiz yere bekletmez.
