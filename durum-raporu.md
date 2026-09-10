# Deckent — limit yenilenince devam raporu

Güncelleme: 2026-09-10T07:56:01+00:00 (UTC). Owner Alperen, haftalık kalan limit %7 iken “işleri main'e topla, yeni iş başlatma” dedi. **Çalışma durduruldu. Bu rapor devam noktasıdır; ürün DONE veya yeni execution authority değildir.**

## Main ve yetki

- Repo: `/home/alperen/deckent-dev`, branch `main`.
- Son ürün commit’i: `e84ca824db95a5f4996d1d90c48b72aebe0a52e4` — `fix(terminal): land reviewed reference and measurement work with partial proof`.
- 79 incelenmiş paket dosyası HEAD ile digest düzeyinde eşleşti; kanıt/raporlarla commit toplamı 94 dosya. Push yapılmadı. Main build alınmadı; mevcut `dist/` yeni commit'in derlemesi olarak kabul edilmemeli.
- Epoch-6 koordinatör/yürütücü Astra. Canonical receipt: [0003-committed.json](docs/execution/handoffs/ah-2026-09-10-fable-astra-terminal-v2/0003-committed.json), receiptDigest `b0268be125a628e77fe836ac15314699200976029871418d1af4cfc010e705ee`.
- Eski 9 Eylül raporundaki “epoch-5 Fable yürütücü” durumu artık tarihsel. Eski metin `/tmp/astra-main-landing-backup-20260910/durum-raporu-before-20260910.md` altında korundu.
- İş SSOT'u `docs/MASTER-PLAN.md`; bu rapor MASTER/closure-ledger değiştirmez. Tekrar çalışma owner'ın yeni devam talimatıyla başlayacak.

## Kim nerede kaldı?

| Oturum | Rol ve son iş | Son durum / devam yeri |
|---|---|---|
| Astra — Codex/gpt-6-astra | Epoch-6 ana koordinatör; bağımsız inceleme, özel entegrasyon, main landing/commit | **STOPPED.** Root session `01a08532-5360-7f92-a0b3-660a4402823f`. Yeni iş veya agent yok. Son stop mesajları communication1262 ve iletisim151. |
| Opus — claude-opus-5 | 7113 E: D0 süre ölçümleri + D1 erken ilk cevap izni + D2 küçük ilk parça | **FROZEN.** 1259 rev2 kabul edilip main'e alındı. `/tmp/deckent-7113-e-interim-opus-20260910`, `implementation/7113-e-interim-opus-20260910`. `proof/DELIVERY-first-answer.md`, `proof/ANALYSIS-90s.md`. D3/D4 başlamadı, yeni ASSIGN yok. |
| Cursor — cursor-composer | 7107-c gerçek PTY acceptance parser/collector; bölünmüş ANSI ve bildirim satırları, interim teslim zamanı | **FROZEN.** 149 kabul,150 yanıt; main'e alındı. `/tmp/deckent-7107-schema-cursor-20260910`, `implementation/7107-schema-cursor-20260910`. `proof/DELIVERY-CURSOR-7107-schema.md`. CLI resume session `b172794f-d0b2-4ff5-887c-3b1f157dce46`; yeni ASSIGN yok. |
| Fable — claude-fable-5-1 | Önceki epoch-5 yürütücü | Kullanıcının bildirdiği limit nedeniyle devre dışı; canonical devir epoch-6 Astra'ya tamamlandı. Limit dönüşü kendi başına authority devri değildir. |

Oturumların provider süreçleri öldürülmedi. FROZEN görev/custody durumudur; çalışan model turn'ü olduğu iddia edilmez. Eski worktree'ler silinmedi. Özellikle `/home/alperen/deckent-cursor-7109c`, `/home/alperen/deckent-lane-7109d`, `/home/alperen/deckent-lane-7111c` korunuyor.

## Main'e alınan işler ve kanıt

- **7109-c:** reasoning wire/ölçüm parity ve never-resolving descriptor için bounded deadline.
- **7109-d:** tam tool-result retention; gerçek ölçülen basınca göre bağlam admission/checkpoint. Beş okumada sahte token-pressure spiraline yönelik düzeltme.
- **7111-c:** büyük/uzun satırlı dosyalarda grep'in sessiz boş dönmesi yerine bounded okuma ve dürüst skip/refusal.
- **7114-b:** anlatımın ara teslim sayılmaması; gerçek cevap, finite bütçe ve süre sınırları.
- **7113 C/D/E:** large-reference production wiring, provider-neutral structured output, schema/citation doğrulaması, bounded length recovery, usage/cancellation custody, progress ve gerçek ara cevap. D0 faz süreleri/yarıda kesilme; D1 cadence dolmadan ilk doğrulanmış cevap; D2 ilk partition boyu. **Large-reference default OFF.**
- **7107-c:** altı gerçek PTY fixture, request≠delivery ayrımı, multiline/ANSI reconstruction ve canlı collector→final parser bağlantısı.

Main doğrulaması: **25 test dosyası / 324 test PASS, exit0; tsc --noEmit exit0; npm run lint:i18n exit0; staged diff check exit0.** Uzak CI koşulmadı (advisory). Özel entegrasyonda derlenmiş binary gerçek koşusu yapıldı; mock wiring kanıtları ayrıca açıkça etiketli.

Kalıcı kayıt: [LANDING.md](docs/execution/evidence/terminal-winddown-20260910/LANDING.md). Exact dosyalar/digest'ler: [landing-manifest.json](docs/execution/evidence/terminal-winddown-20260910/landing-manifest.json). Loglar ve journal'lar aynı dizinde.

## Gerçek ürün sonucu — kapanmayanlar

Son gerçek kaynak okuma: **PARTIAL / REFERENCE_DEADLINE**, actual battery exit1. İlk prose **60243ms**; önceki ayrı koşuda **106633ms**. Bu iki gözlem performans garantisi değildir.

- Bu kayıtta **90s ilk interim kontrolü PASS**; collector düzeltmesinden sonra gerçek dil kataloğuyla offline doğrulandı (6/6 replay exit0).
- **10s ilk anlamlı cevap hedefi FAIL.** 32KiB ilk parça yine2048 output tavanına çarptı; küçük parça tek başına hızlı cevap garantilemiyor.
- **Tam kaynak kapsaması yok.** 6issued/5settled;30725 input/7239 output; bir request'in usage rezervasyonu açık. İlk cevap yalnız doğrulanmış kısmi kaynağa dayanıyor.
- Kesilen son isteğin30667ms partial stream süresi ve deadline nedeni journal'da. Bilinmeyen usage sıfır veya settled sayılmadı.
- **Formal XVerify ve authenticated durable settlement HOLD.** Cursor/Opus host kod review'ı PASS, gerçek farklı-provider call+provider usage+terminal settlement+durable receipt zincirinin yerine geçmez.
- Onaylı **65536 + rope-scale2.0 deneyi uygulanmadı**; son kanıtlı canlı context131072. Yeni oturumda tekrar ölç; eski değeri canlı truth sayma.

[Son gerçek koşu incelemesi](docs/execution/evidence/terminal-winddown-20260910/e-first-answer-review.json) ve [son journal](docs/execution/evidence/terminal-winddown-20260910/e-first-answer-final-journal.json) canonical kanıt paketinde. Altı PTY fixture main `proof/fixtures/` altında. Model transcript/reference metni authority değildir.

## Otonom kanallar ve host kurulumu

- Astra dispatcher `STOPPED`, alive=false, queued0 olarak doğrulandı. Cursor enabled=false, dispatchService.running=false, pollWatcher.running=false olarak doğrulandı. Cursor status'ta stale metadata görülebiliyor; süreç çalışıyor anlamına gelmiyor.
- `communication.md`: son bakışta Astra'nın1260/1261/1262 mesajları duruyor; yeni incoming yok. `iletisim.md`: Astra151 stop mesajı duruyor. Worker'ın bunları tükettiği varsayılmamalı.
- Bu dosyalar geçici kanaldır, commit edilmez. Her yeni tur başında başlıkları oku, exact body SHA doğrula; sadece yeni incoming'i tüket, `re=` ile yanıtla. Zaten arşivlenmiş bildirimleri tekrar görevlendirme/test sebebi yapma.
- Astra kurulum: `.codex/coordinator/README.md`, `.codex/coordinator/OWNER-BUDGET-POLICY.md`; Cursor: `.cursor/coordinator/README.md`. Kurulum/bağlama/session evidence dosyaları **yerel ve uncommitted** korundu.
- Son karma host test süiti exit1: Cursor eski Stop-hook testleri idle/followup beklerken aktif CLI writer-lease nedeniyle defer aldı. [Hata logu](docs/execution/evidence/terminal-winddown-20260910/astra-host-landing-tests.log). Bu kontrol ürünün324 test sonucundan ayrıdır; host kurulumu tümüyle green sayılmıyor. Yeni düzeltme başlatılmadı.
- Şimdi hiçbir start/rebind/resume komutu çalıştırma. Devam talimatında önce README + gerçek custody/session durumunu doğrula; ikinci koordinatör açma. Queue acceptance, completed turn veya product closure değildir.

## Limit yenilenince devam sırası

1. Owner'ın devam talimatını almış yeni turda bu rapor, AGENTS.md/DECKENT.md, canonical mode/epoch receipt ve kanalları oku. `git branch -vv`, HEAD/diff ve provider budget/reachability durumunu salt-okunur doğrula. Yeni authority veya mode varsayma.
2. `e84ca824d` üstünden devam et; eski patch'leri tekrar apply etme. Main'de korunan ilgisiz dirty dosyaları topluca stage/reset etme. Kalan host Stop-hook/CLI lease ayrımını doğrulamadan otomatik dispatcherları yeniden başlatma.
3. Aktif Terminal7113E/7114 kapanışında **ilk10s FAIL ve tam kapsama** nedenlerini mevcut journal ölçümleriyle ele al. Yeni provider denemesi yalnız somut değişikliği doğrulamak için bounded olsun; aynı failed koşuyu tekrar tekrar çalıştırma, limiti artırıp PASS üretme.
4. Opus analizindeki **D3 predictive scheduling** (bu koşunun sürelerinden tahmin; hard90s garanti değil) ve **D4 parça sıralama heuristic'i** henüz uygulanmadı. Yeni açık ASSIGN olmadan başlama. D4 ilişki/coverage-order/bütçe etkisi kanıt gerektirir. Mevcut planın owner-admitted7113E/7114 scope'u içinde kaldığını tekrar doğrula.
5. Gerekli gerçek10s/90s/fullcoverage ve farklı-provider XVerify/usage/durable settlement zincirlerini tamamlamadan outer DONE yazma. Ana build/adapter reconnect, auth/mode, kill/cleanup ve push yetkisini eski kanal mesajından genişletme.

## Korunan diğer durum

Main çalışma ağacı bütünüyle clean değil: önceki ilgisiz kaynak/governance/generated/runtime değişiklikleri ve host kurulumu korunuyor. Ayrı model-registry hunk'ı terminal commit'ine katılmadı. Index son landing doğrulamasında clean idi. Worktree/backup temizliği yapılmadı.

Özel entegrasyon: `/tmp/deckent-terminal-integration-astra-20260910`; main landing öncesi yedek: `/tmp/astra-main-landing-backup-20260910`. `/tmp` geçicidir: yeniden başlatmada yoksa committed manifest/kanıt/fixture'ları kullan, varmış gibi davranma.

Önceki7099 VERIFY işleri bu Terminal diliminde yeniden doğrulanmadı: retained admission/failure, exact Docker lifecycle/custody, MCP checkpoint approval parity, gerçek bağlı Goal→landing→durable settlement ve platform kanıtları. Eski rapordaki PID/canlılık iddiaları güncel değildir. Bu liste yeni paralel outcome açma izni değildir; MASTER'dan devam edilir.

Bu rapor owner'ın dosyaya yazma talebiyle güncellendi; yeni ürün işi, build, provider call, auth/runtime mutation veya ek commit yapılmadı.

## Sonraki owner talimatı — push ve yerel dosya envanteri

2026-09-10T08:27:21+00:00: Owner mevcut durumu push etmeyi ve commit dışındaki dosyaları belirlemeyi istedi. Üstteki “push yapılmadı” ifadeleri wind-down anının tarihsel durumudur. Sonraki push kapsamı e84ca824d ürün commit’i + bu rapor ve [yerel envanter](docs/execution/evidence/terminal-winddown-20260910/LOCAL-UNCOMMITTED.md) için ayrı docs commit'idir; push sonucu işlem sonunda remote HEAD eşitliğiyle doğrulanır. Kalan eski implementation/authority/runtime/host değişiklikleri commit dışında korunur. Yeni ürün işi açılmadı.

## 2026-09-10 — owner deneyimi sonrası yeni devam planı

**Bu bölüm önceki devam sırasını günceller. Durum: PLAN HAZIR / IMPLEMENTATION BAŞLAMADI / ÜRÜN HOLD.** Owner'ın canlı talebi: araştırma, kapsamlı plan, mevcut işleri main'de toplama ve build. Bu turda ürün düzeltmesi veya yeni provider görevi açılmıyor. Deckent outcome-plan, product/terminal design ve agentic-UX sözleşmeleri plan için uygulandı; rakip davranışı resmî belgelerden kontrol edildi. MASTER veya authenticated closure ledger elle değiştirilmedi.

Owner'ın gerçek değerlendirmesi **0/100**. 324 testin yeşil olması bu deneyimi geçersiz kılmaz. Kullanıcının denediği özel entegrasyon dizinindeki benchmark ayarları normal kullanım tavsiyesi olarak sunulmamalıydı. Orada oturum bütçesi 180000ms, large-reference bütçesi 150000ms/12 request idi; görülen 150s ve sonraki session-budget durmaları bu deney bağlamında okunmalı. Bu değerler bütün kurulumların varsayılanı değildir. Normal varsayılanın daha uzun olması temel yaşam döngüsü problemini çözmez.

### A. Kabul edilen ürün sonucu ve sınırları

1. Kullanıcı işi sürerken keyfî toplam oturum süresi/tur sayısı nedeniyle sohbet kilitlenmez; `/renew` işletmek kullanıcının görevi olmaz. İç attempt timeout, cancellation deadline, loop detection ve finansal limitler ayrı kalır.
2. Model işi planlayıp araçlarla yürütür; harness devamlılığı yalnız modelin doğru aracı hatırlamasına bırakmaz. Zayıf veya farklı bir model de typed continuation/compaction sözleşmesini kullanır; model hatası yetki genişletemez.
3. Uzun iş kalıcı job kimliğiyle arka planda yürür. Kullanıcı durum görebilir, yeni mesaj yazabilir, yönlendirebilir ve iptal edebilir. On dakika süren gerçek iş mümkündür; on dakika görünür sonuç/durum vermeden sohbeti işgal etmek kabul edilmez.
4. “Ürün durmaz” = kontrol yüzeyi kullanılabilir, iş/state korunur, uygun kaynak olduğunda devam eder. Provider kapalıyken, gerçek kota bitmişken veya gerekli izin reddedilmişken sonuç uydurulmaz; `WAITING_FOR_PROVIDER`, `WAITING_FOR_QUOTA`, `NEEDS_DECISION` gibi sebebi ve devam koşulu belli durum gösterilir. Her modelin her görevi başarıyla tamamlaması teknik garanti olarak yazılamaz.
5. `/compact` isteğe bağlı kullanıcı kontrolü olarak kalır; otomatik ve model tarafından talep edilen compaction aynı application-service işlemini kullanır. Model shell'e `/compact` yazdırmaz. `/renew` zorunlu akıştan çıkar; eski komut için açıklamalı uyumluluk geçişi yapılır. Compaction hesap kotasını, maliyet tavanını veya izinleri sıfırlamaz.
6. Kazanım gerçek binary, aynı iş/veri ve karşılaştırılabilir kaynak koşullarında kanıtlanır. Süre/token limitini büyütmek veya fixture'ı küçültmek tek başına başarı değildir.

### B. Rakiplerden doğrulanan davranışlar

Araştırma tarihi 2026-09-10 UTC. Bunlar belgelenen mekanizmalardır; Deckent için ölçülmüş performans garantisi veya rakiplerin bütün sürümlerine dair iddia değildir.

| Yüzey | Doğrulanan davranış | Deckent'e uygulanacak sonuç |
|---|---|---|
| Codex CLI | `/compact`, `/status`, `/usage`, `/ps`, `/stop`, `/resume` mevcut; config'te `model_auto_compact_token_limit` var. | Bağlam bakımı, hesap kullanımı ve arka plan terminali ayrı yüzeyler. İncelenen katalogda zorunlu `/renew` döngüsü görülmedi. [Komutlar](https://developers.openai.com/codex/cli/slash-commands), [config](https://developers.openai.com/codex/config-reference). |
| Claude Code | Otomatik context yönetimi var; aynı büyük içerik compaction sonrası tekrar pencereyi doldurursa sınırlı denemeden sonra hata verir. CLI `--max-turns` varsayılan olarak sınırsız ve print-mode içindir; `--max-budget-usd` de print-mode kapsamındadır. | Interactive session yaşamını batch deneme tavanıyla eşitleme; compaction thrash'ini ayrıca önle. [Çalışma modeli](https://code.claude.com/docs/en/how-claude-code-works), [CLI](https://code.claude.com/docs/en/cli-reference). |
| Claude Code arka plan/hesap | Background görevlerin task kimliği ve çıktı dosyası vardır. Abonelik ve ek kullanım maliyeti ayrı politikalardır. | Job lifecycle ve conversation lifecycle ayrılır; background davranışının uygulama kapanışındaki ömrü açık tanımlanır. [Interactive mode](https://code.claude.com/docs/en/interactive-mode), [costs](https://code.claude.com/docs/en/costs). |
| Cursor | 1.6 changelog'u otomatik özetleme ve `/summarize` belirtir. Cloud Agents ayrı çalışma ortamı sunar; kullanım limiti sonrası on-demand harcama ayrıca etkinleştirilir. | Tarihsel changelog güncel tüm CLI sürümlerinin komut garantisi sayılmaz. Özetleme, background yürütme ve ödeme yetkisi birbirinden ayrılır. [Changelog](https://cursor.com/changelog/page/13), [Cloud Agents](https://cursor.com/docs/cloud-agent), [usage](https://cursor.com/help/models-and-usage/usage-limits). |
| OpenCode V2 | Otomatik compaction giriş/bağlam/çıktı rezervinden çözülür; özet kayıplıdır, özgün durable mesajlar korunur. Manuel istek güvenli adım sınırında işlenir. | Kalıcı özgün kayıt + küçültülmüş model görünümü; başarısız checkpoint eskisini yok etmez. [Compaction](https://opencode.ai/v2/docs/compaction). |
| Gemini CLI | `model.maxSessionTurns` varsayılanı -1; `model.compressionThreshold` ve ayrı loop detection ayarları var. | Tur tavanı ile bağlam yönetimi aynı şey değildir; döngü koruması bağımsızdır. [Configuration](https://geminicli.com/docs/reference/configuration/). |
| OpenAI API | Compaction şifreli/opak bir context öğesi üretebilir. | Provider-native checkpoint taşınabilir Deckent iş kaydının yerine geçmez; başka provider'a aynı opak öğenin çalışacağı varsayılmaz. [API compaction](https://developers.openai.com/api/docs/guides/compaction). |

Hiçbir kaynak abonelik kotası, API ödeme sınırı veya erişilemeyen provider karşısında sınırsız compute vaat etmiyor. Yerel modelde de context, RAM/VRAM, disk ve inference kapasitesi sonludur. Abonelik erişimi otomatik olarak aynı sağlayıcının API harcama yetkisi değildir.

### C. Kök bulgular ve kanıt kapsamı

Aşağıdakiler bu Terminal outcome'unun `BLOCKS_CURRENT_DONE` bulgularıdır. Kaynakların UTC/HEAD/digest envanteri: [continuity-plan-source-manifest.json](docs/execution/evidence/terminal-winddown-20260910/continuity-plan-source-manifest.json). Satır numarası yanında digest esas alınır; uygulamada drift kontrol edilir.

| Kanıt | Bulgu / gereken değişiklik |
|---|---|
| `src/core/execution-budget-policy.ts:117` | Varsayılan 45dk/120 round/400 tool/2M cumulative token; context high-water %75, tek tool %5, turn tool %20. Farklı amaçlı bu tavanların oturum ölümüne dönüşmesi yeniden tasarlanmalı. |
| `src/agent/session.ts:1611`; `src/cli/repl/native-agent-bridge.ts:137` | Renewal açıkça kullanıcı güdümlü; çalışma epoch'unu yeniler. Otomatik devam için yalnız bu çağrıyı gizlice tetiklemek yeterli değildir; finansal/permission sınırları ayrıştırılmalı. |
| `src/agent/loop.ts:1183`; `src/agent/tool-result-broker.ts:293` | Tool-result admission/storage yolları birden fazla sebebi aynı kullanıcı stop mesajına götürebiliyor. %11 request context kullanımı disk/receipt/turn payı engelini açıklamıyor. Her bütçe ayrı ölçülmeli. |
| `src/agent/session-tool-content.ts:26` | İçerik saklama kotası modelin context penceresi değildir. Kontrol komutları büyük dosyaların storage kapasitesini paylaşarak kullanılamaz hale gelmemeli. |
| `src/agent/reference-session.ts:128` | Bounded partition/map/reduce ve süre bütçesi var; tam dosya sorusunda kaynak kapsaması tamamlanmadan deadline görüldü. Görev odaklı seçme ve kalıcı devam gerekir. |
| `src/agent/identity.ts:128` + owner transcript | Header Qwen gösterirken model Fable diyebildi; proje referansı/orkestratör harcaması aktif inference kimliğiyle karıştı. Tek runtime snapshot üreticisi gerekir. |
| `src/cli/commands/chat-slash-registry.ts:1` | Slash yüzeyi katalogda var; bütün handler'ların native session amacı, izinleri, nested CLI/MCP davranışı ve provider bağımsızlığı tek tek doğrulanmalı. Katalog varlığı doğru çalışma kanıtı değildir. |
| Owner transcript + committed E journal | 150s stop, tekrar renew, model sorusu için bash izni, context hold ve 60s ilk kısmi cevap: kullanıcı görevi tamamlanmadı. Test-green ürün kabulü değildir. |

Bu turda tüm CLI/MCP handler'larının eksiksiz kod denetimi yapılmış sayılmıyor. Aşağıdaki P0 bu kapsama ilişkin sayılabilir envanter ve açık kalanların listesini üretmek zorunda; “tüm araçlar düzeldi” ancak o envanter sıfır açıkla kapanır.

### D. Tek outcome altında uygulama DAG'ı

P0–P8 aşağıdaki plan dilimlerinin adlarıdır; MASTER ID veya DONE disposition değildir. Mevcut 7107/7109/7111/7113/7114 ilişkisi canonical ledger ile eşlenir. Foundation dilimleri P8 kapanışına dependency-bound kalır. Scope dışı yeni bulgu otomatik uygulanmaz.

| Dilim | Bağımlılık / teslim | Üretim zinciri ve kapsam | Kapanış kanıtı |
|---|---|---|---|
| P0 — gerçek envanter ve baseline | İlk adım | CLI kayıtları, slash registry, native tools, MCP registry, handler/consumer/config eşlemesi; normal ve benchmark ayarları ayrımı. Her komut için purpose, input/output, auth, scope, latency, error, cancellation, pagination, provider kaynağı. | Registry ↔ envanter iki yönlü parity; her satır checked/blocked; owner senaryosunun mevcut binary baseline'ı, tekrar gereksiz pahalı koşu yok. |
| P1 — kimlik ve bütçe truth | P0 | Effective provider/model/backend/context/account/tenant/workspace snapshot → application service → model prompt/native read tool + slash/header. Session kullanımı, job harcaması, provider hesabı ayrı. | “Hangi modelsin/penceren kaç?” dış CLI, bash veya abonelik harcaması okumadan aynı gerçek snapshot'ı verir; stale/unknown açık. |
| P2 — sürekli oturum ve iş yaşamı | P1 | Conversation, job, attempt, operation durumları; iç lease/deadline bittiğinde kalıcı checkpoint ve yetkili devam. User idle süresi çalışma bütçesi gibi tüketilmez. | Eski 150/180s ve round sınırlarının ötesinde gerçek görevde renew gerekmemesi; sonsuz retry/yan etki tekrarı olmaması. |
| P3 — güvenli otomatik compaction | P1/P2 | Measured pressure → safe-boundary checkpoint request → durable state → verify → yeni request projection. Manuel/model/automatic aynı servis. | Birden fazla compaction ve process restart sonrası kaynak/karar/izin/iş kaybı yok; freed-token ve sonraki request fit ölçümü; başarısızlıkta rollback. |
| P4 — native araç ve komut semantiği | P0/P1; continuation P2/P3 ile bağlanır | Aşağıdaki tam slash listesi ve keşfedilen tüm native/CLI/MCP handler'ları. Ortak uygulama servisi, typed sonuç/error, EN/TR, bounded sayfalama, yerel metadata için model çağrısız yol. | Her satırın terminal ve machine-interface sözleşme testi; nested allow/deny tutarlılığı; ölçülen maliyet/latency. |
| P5 — büyük kaynak işi | P3/P4 | Dosya outline/index/arama → görevle ilgili aralıklar → kanıtlı ara sonuç → kalan coverage job'u. Dosya/çıktı artifact olarak kalır, yeniden okuma yalnız gerekli aralıkta. | 1.2MB MASTER durum sorusuna ilgili tablolar üzerinden kaynaklı sonuç; tüm belge iddiasında tam coverage; uzun satır/encoding/binary/permission testleri. |
| P6 — canlı foreground/background | P2/P4/P5 | Job event/projector → TUI/CLI; foreground yeni mesaj, status, steer/cancel; background progress ve sonuç teslimi. Concurrency config/capacity'den çözülür. | Uzun iş sırasında input/durum/iptal çalışır; iş iptalinden sonra konu değiştirme eski işi diriltmez; gerçek PTY zaman ölçümleri. |
| P7 — provider ve platform parity | P1–P6 sözleşmeleri | Local/API/subscription adapterları; actual usage, quota freshness, unknown settlement, disconnect/retry/cancel; Linux/macOS/Windows/WSL ve TTY/pipe. | Desteklenen gerçek backend canary'leri; desteklenmeyen typed unavailable; başka provider'ın sentetik receipt'i yok. |
| P8 — bağımsız doğrulama ve landing | P0–P7 | Aynı build/config provenance ile owner senaryosu, regresyon matrisi, farklı-provider inceleme ve canonical settlement. | Aşağıdaki kabul bataryası + production wiring + gerçek provider usage/receipt + durable settlement. Outer DONE ancak zincir tamamlanınca. |

`session.ts`, `loop.ts`, native bridge ve shared config üzerinde eşzamanlı birden fazla writer yok. Composer önce P0/P1 exact scope teslimi yapar; başka görevler bağımlılık ve dosya çakışması çözüldükten sonra atanır. Bu rapor bir çalışan ASSIGN veya authority devri değildir. D3/D4 eski optimizasyon önerileri P5/P6 kapsamında tekrar değerlendirilir; doğrudan kaldığı yerden kör uygulanmaz.

### E. Bütçe ve kullanım sözleşmesi

- **Context:** Gerçek request window/input ceiling, tokenizer/template ölçüm yöntemi, fixed prompt/tool schema, geçmiş, tool body, output/reasoning ve safety rezervi ayrı. `exact/estimated/unknown`, timestamp ve source gösterilir. Model katalog değeri gerçek server allocation'ı diye sunulmaz.
- **Çalışma:** Job/attempt token ve tool maliyeti ilerleme/tekrar analizi içindir. UI session TTL değildir. Attempt timeout sonrası mevcut yetki içinde yeniden planlama; no-progress tekrarında strateji değişimi veya dürüst blocker. Otomatik renew sonsuz retry mekanizmasına dönüşmez.
- **Para:** Session/job/tenant harcama tavanları ve para birimi; reservation → actual/unknown → settlement. Cancel sonrası usage gelmediyse sıfır yazılmaz. Compaction ve fallback çağrıları da maliyete dahil.
- **Account quota:** Provider'ın desteklediği resmî hesap/usage yüzeyi, freshness/reset zamanı ve entitlement. Bilinmiyorsa unknown; Claude Code hesap verisi local Qwen oturumunun kullanımı olamaz. Abonelik kotası ile API dolar faturası birleştirilmez.
- **Local kapasite:** RAM/VRAM, inference slot, gerçek context allocation, CPU/GPU süresi ve disk. API fiyatı yok diye tüm compute maliyeti doğrulanmış sıfır gösterilmez.
- **Storage:** Artifact/receipt/transcript kotaları ayrı; tenant isolation ve pin/retention. Metadata/control komutları için ayrılmış küçük kapasite. Model penceresi dolmadan storage engeli oluşabilir; sebebi ve recovery yolu doğru gösterilir.
- **Zaman:** Network connect/first byte/stream idle/tool execution/job elapsed/user idle ayrı. Wall-clock timeout bir request'i sonlandırabilir, bütün sohbeti kullanılamaz yapmaz.
- **Önerilen native servis yüzeyleri:** `session.inspect`, `context.inspect`, `usage.query(scope)`, `checkpoint.request`, `job.status`, `job.cancel`, `job.result.read`. Adlar taslak; mevcut application-service pattern'i incelenip aynı yetki zincirine bağlanır, paralel bir authority sistemi kurulmaz.

### F. Compaction doğruluk şartları

“Kayıpsız” sözcüğü semantik özet için garanti değildir. Garanti edilmesi gereken özgün veri ve yürütme kaydının korunması, erişilebilirliği ve devam sözleşmesidir.

1. Özgün mesaj/araç sonucu/source artifact immutable ve digest'li saklanır. Model görünümü küçültülür; tarih silinmez. Tenant retention ve mahremiyet politikasına bağlı saklama sınırı açık olur.
2. Yapılandırılmış checkpoint: user amacı, son düzeltmeler, kapsam/yasaklar, izinler ve retler, biten/kalan işler, kanıt referansları, dosya sürümleri, açık operations/tool-call IDs, budget reservations, provider compatibility, sonraki adım.
3. Başarı sırası: güvenli sınır → aday üret → kalıcılaştır → bütünlük/bağlantı ve restore doğrula → atomik aktif checkpoint değiştir → eski model projection'ını bırak. Disk-full, bozuk özet, provider hatası veya cancel sırasında eski geçerli state korunur.
4. Bekleyen tool sonucu orphan olmaz; aynı write/ödeme tekrar yürütülmez. Idempotency key ve effect reconciliation kullanılır; kaynak sonradan değiştiyse eski digest'le sessiz devam edilmez.
5. Compaction sonrası yer açılması ve bir sonraki request'in fit olması ölçülür. Aynı artifact'ın tekrar enjekte edilmesi engellenir; aynı girdiyi art arda özetleyen sarmalda farklı projection/read strategy seçilir. Kullanıcıyı otomatik olarak bütün geçmişi yeniden okutmaya zorlamaz.
6. Provider-native opak state için compatibility anahtarı; provider değişiminde canonical durable kayıttan yeni görünüm. Özet veya tool metni yeni owner talimatına yükseltilmez.
7. Manuel `/compact`, model isteği ve otomatik trigger tek pending işlemi paylaşır; duplicate talepler birleştirilir. Kullanıcı status/cancel erişimini kaybetmez. Hiç yer yoksa kontrol yanıtı ve recovery receipt'i için ayrılmış kapasite vardır.

### G. Slash komutları — tek tek plan kapsamı

Aşağıdaki satırlar hedef davranıştır; bugün çalıştıkları iddia edilmez. P0 ayrıca CLI altkomutlarını ve dinamik MCP/native araçları tek tek çıkarır. Her satır için EN/TR help, arg validation, keyboard/TTY/pipe, permission, error, cancel ve runtime wiring kanıtı gerekir. Komutlar açıklanmadan başka bir provider'ın CLI çıktısını native cevap gibi basamaz.

| Komut | Hedef / özel kabul koşulu |
|---|---|
| `/help` | Gerçek etkin registry'den aranabilir komut/arg/help; desteklenmeyeni varmış gibi sunma. |
| `/status` | Aktif sohbet + bağlı job durumu; provider çağrısız, taze yerel truth. |
| `/recall` | İstenen workspace/tenant belleği; kaynak ve filtreli/sayfalı sonuç. |
| `/queue` | Bekleyen kullanıcı girdisi/iş kuyruğu, sıra ve değişiklik etkisi. |
| `/interrupt` | Aktif attempt'i durdurma; job ve pending input sonucu açık. |
| `/steer` | Yeni talimatın hangi işe, ne zaman uygulandığı ve custody. |
| `/plan` | Etkileşimli plan inceleme; execution başlamasıyla karıştırma. |
| `/do` | Yetkili iş başlatma ve takip; scope/bütçe açık. |
| `/sprint` | Gerçek orchestration yüzeyine açık geçiş; native sohbetle aynı state diye sunma. |
| `/retro` | Seçilmiş gerçek yürütmenin kanıta dayalı retrospektifi. |
| `/doctor` | Native session sağlık özeti önce; geniş tanı açık kapsamla. |
| `/models` | Erişilebilir katalog/capability; aktif model ayrıca işaretli, gizli auth mutation yok. |
| `/analyze` | Kaynak/scope seçimi ve uzun iş için job; kısmi/tam kapsama ayrımı. |
| `/review` | Değişiklik/scope/kanıt seçimi; formal XVerify ile host review ayrımı. |
| `/explain` | Seçili içerik ve doğrulanmış kaynaklara bağlı açıklama. |
| `/agents` | Agent kataloğu ve mevcut görev durumlarını ayrı gösterme. |
| `/agent` | Belirli agent ayrıntısı/seçimi; seçim execution authority üretmez. |
| `/skills` | Etkin skill registry, scope ve availability. |
| `/skill` | Skill inceleme/uygulama; talimat provenance ve izinler korunur. |
| `/features` | Effective flag, kaynak/override ve destek durumu. |
| `/config` | Effective config gösterimi ve yetkili düzenleme; secret redaction. |
| `/nervous` | İlgili orchestration gözlemi; native kullanım gibi sunma. |
| `/interrogate` | Seçilmiş run/kanıt üzerinde sorgu; durumu uydurmama. |
| `/resume` | Kalıcı session/job seçimi, compatibility, açık operasyon reconciliation. |
| `/runs` | İlgili workspace/tenant işleri, sayfalama ve doğru terminal state. |
| `/sync` | Neyin senkronize edildiği/etkisi açık; preview ve yetki. |
| `/checkpoint` | Durable iş kaydı; context küçültme ile farkı anlaşılır. |
| `/kill` | Destructive execution etkisi; owner/live-auth gate korunur. |
| `/cleanup` | Canlı iş, retention ve veri kaybı etkisi; otomatik bakım bahanesiyle bypass yok. |
| `/recover` | Typed recovery planı ve gerçek devam koşulu; stale running düzeltmesi rastgele değil. |
| `/autonomous` | Kapsamı/bütçesi belli kalıcı iş; sohbeti engellemez. |
| `/audit` | Seçilmiş kapsam ve kanıt; salt-okunur inceleme execution başlatmaz. |
| `/usage` | Varsayılan aktif native session; job/orchestration/account ayrı scope. |
| `/resources` | Native compute/context/storage ile bağlı MCP resources ayrı kategoriler. |
| `/directives` | Geçerli talimat kaynağı ve kapsamı; generated veri authority değil. |
| `/mcp` | Bağlantı/tool discovery/health; availability ve permission ayrı. |
| `/model` | Aktif exact model ve yetkili seçim; context/checkpoint uyumluluğu. |
| `/provider` | Aktif backend/hesap kapsamı ve yetkili geçiş; maliyet/veri politikası. |
| `/approve` | Mevcut interactive live-auth approval servisi; MCP self-approval yok. |
| `/renew` | Zorunlu kullanım kaldırılır; açıklamalı eski-komut uyumluluğu, para/izin reset yok. |
| `/context` | Gerçek request ve tüm ayrı rezervler; exact/estimate/unknown bilgisi. |
| `/compact` | İsteğe bağlı aynı güvenli checkpoint servisi; öncesi/sonrası kazanım. |
| `/term` | Shell task/job erişimi; native metadata için gereksiz shell açılmaz. |
| `/cd` | Workspace/cwd değişimi; job ve tenant scope etkisi açık. |
| `/cancel` | Hangi işi/girdiyi iptal ettiği net; side-effect settlement korunur. |
| `/clear` | Ekran temizleme ve tarih/iş silme ayrı; sessiz veri kaybı yok. |
| `/exit` | Foreground kapanışında background işlerin devam/stop politikası açık. |
| `/quit` | `/exit` ile semantik parity; farklı gizli cleanup yok. |

Native tool incelemesi ayrıca read_file/read_content_ref/grep/glob, git, shell, search_tools/describe_tool/call_tool, skill ve her registered MCP adapterını kapsar. Büyük dosyada whole-file read sonra slice davranışı, uzun satır, sonuç byte/token tavanı, timeout, stderr, spill, digest, pagination ve kontrol mesajı rezervi ayrı değerlendirilir. İsimleri benziyor diye CLI/slash/MCP eşdeğer varsayılmaz.

### H. Gerçek kabul bataryası ve ölçüm

- Owner'ın verdiği konuşma sırası gerçek PTY'de: MASTER analizi → neden durdun → işi iptal → hangi model/context → selam → kullanım → yeni istek. Kullanıcı `/renew` yapmaz; önceki iptal edilen iş kendiliğinden dönmez.
- Büyük kaynak işi sürerken yerel model/context/status/cancel soruları dış model çağrısına veya permission gerektiren shell'e bağımlı değildir. İlgili görev sonuçları kaynak ve coverage ile gösterilir.
- Normal config ve benchmark config ayrı manifest; build/source/config digest, actual backend/window, UTC, ölçüm yöntemi her koşuda kayıtlı. Main'e test amaçlı 150/180s profile sızdırılmaz.
- Tekli ve art arda compaction; idle sonrası devam; restart/transport disconnect; provider switch; context overflow; disk quota; denied tool; bilinmeyen usage; concurrent cancel; uzun satır ve çok büyük tool sonucu.
- Local, gerçek API ve gerçek subscription backend canary'leri. Aynı provider'ın farklı modeli cross-provider review sayılmaz. Gerçek erişim yoksa ilgili hücre HOLD; sentetik provider receipt yok.
- Linux/macOS/native Windows/WSL, TTY/non-TTY, EN/TR, keyboard/focus, tenant isolation. Erişilemeyen platformlar kanıtlanmış gibi kapatılmaz.
- Ölçümler: input kabul gecikmesi, TTFT, ilk **anlamlı ve kaynaklı** sonuç, status freshness, cancel acknowledgment/settlement, tamamlanma süresi, toplam input/output/reasoning, compaction maliyeti, disk/RAM, tekrar okunan byte, source coverage, request/usage settlement. Spinner/anlatım gerçek sonuç sayılmaz.
- Önerilen kabul hedefleri: yerel kontrol yanıtı P95≤250ms, iptal bildirimi P95≤1s; uzun iş 2s içinde job/durum görünümü; ilk anlamlı kısmi sonuç P95≤10s hedefi. Bunlar yeni ürün SLO önerisidir, mevcut başarı veya tüm donanımlarda garanti değildir. Desteklenen donanım/backend yük profili P0'da sabitlenmeli. 10–20dk sessizlik hiçbir profilde kabul edilmez.
- Aynı fixture/veri ve eşdeğer kaynaklarla baseline/sonuç karşılaştırması; tek başarılı koşudan P95 çıkarılmaz. Örneklem ve tolerans uygulamadan önce proof planında belirlenir. P8: scoped tests + tsc/lint exit kodları, gerçek binary ve bağımsız review. Host review PASS, formal XVerify/durable settlement yerine geçmez.

### I. Açık owner kararları ve uygulanacak güvenli varsayımlar

| Karar | Öneri / mevcut durum |
|---|---|
| Provider fallback ve veri çıkışı | Kullanıcıya seçenekli soru gönderildi; yanıt henüz bu kayda ulaşmadı. Öneri: yalnız önceden yetkilendirilmiş provider'lar ve mevcut maliyet/veri sınırları içinde otomatik geçiş. Yanıt yokken yeni cloud veri aktarımı veya harcama yetkisi varsayılmaz. |
| Local tek inference slotunda uzun iş + yeni sohbet | UI/control sürekli açık; inference güvenli sınırda foreground önceliği. İkinci provider/slot yalnız mevcut policy izinliyse. Non-preemptible bir modelin anlık doğal dil yanıtı garanti edilemez; profil ve SLO açık olmalı. |
| SLO ve desteklenen donanım | H bölümündeki sayılar öneridir; hedef ürün profiline göre sabitlenmeli. Kullanıcıya hızlı cevap beklentisi kabul edildi; ölçülmemiş sayıları DONE gate olarak geriye dönük uydurma. |
| Para/retention tavanı | Mevcut tenant/owner politikası korunur; sınırsız dolar veya sonsuz disk varsayılmaz. Compaction için harcanan compute bütçeye dahil. Silme politikası yeniden yetki almadan genişletilmez. |
| 65536 + rope-scale2.0 | Önceden kabul edilmiş deney; henüz uygulanmadı. Bu planın süre/kimlik/bütçe doğruluğunu sağlamak için önkoşul değil. Kalite/performance ölçmeden kalıcı profile dönüşmez. |
| Main build için canlı bot | Read-only guard `E_CLEAN_BOT_ACTIVE` verdi. Build izni mevcut; canlı bot stop/cleanup izni bu talimattan türetilmedi. **Owner gate bekliyor**; aşağıdaki kanıtla Composer devamında çözülür. |

### J. Composer için yeniden başlama sözleşmesi

1. Bu raporun son bölümünü, AGENTS/DECKENT, epoch receipt ve kanalları oku; mevcut authority'yi doğrula. Rapor custody devri veya model seçimi değildir. Config/registry/capacity'den uygun execution route çöz.
2. Main'deki `e84ca824d` ürün landing'i ve `aaf6bd681` rapor commit'i zaten push edildi. Eski worktree patch'lerini yeniden apply etme. Güncel main HEAD'i başlangıç kanıtına yaz.
3. [LOCAL-UNCOMMITTED.md](docs/execution/evidence/terminal-winddown-20260910/LOCAL-UNCOMMITTED.md) kapsamındaki ilgisiz dirty dosyaları topluca stage/reset etme. Mevcut terminal deliverable'ları main'dedir; bütün eski raw runtime/host/governance dosyaları incelenmiş ürün paketi değildir.
4. P0 baseline/env ve P1 truth kapsamını somutlaştır; owner'ın Composer ile devam talimatı geldiğinde dogfood/typed recovery contractına göre yürüt. Eski durdurulmuş coordinatorları veya ikinci coordinator'ı kendiliğinden başlatma.
5. Bir writer + bağımsız farklı-provider verifier; exact path/base/digest/UTC, test exit, gerçek execution custody. Astra limiti yenilenince review edebilir; aynı-provider review formal kapanış olmaz.
6. Ürün hedefi tüm P0–P8 zinciridir. Ara teslim READY_FOR_REVIEW olabilir, owner deneyimi ve settlement tamamlanmadan MASTER DONE olmaz.

### K. Bu turun main/build teslim durumu

Main preflight komutu `inspectActiveExecutions(projectRoot)` **exit0**, fakat admission kararı **HOLD / E_CLEAN_ACTIVE_EXECUTION_HOLD**, sebep **E_CLEAN_BOT_ACTIVE**, surface `bot`, subject `telegram-bot`, observedStatus `OWNED`, evidence `.deckent/bot.pid`. Detay: [main-build-preflight-20260910.json](docs/execution/evidence/terminal-winddown-20260910/main-build-preflight-20260910.json).

Bu nedenle `npm run build` başlatılmadı; build exit kodu yok, **NOT_RUN**. Canlı botu öldürme, guard bypass, clean/auth/runtime mutation yapılmadı. Main `dist/` yeni ürün commit'inin build'i olarak sunulamaz. Main source hazır; kullanıcı tarafından raporlanan terminal problemleri bu turda düzeltilmedi. Ürün kaynakları önceki landing'de toplandı; eski ilgisiz dirty çalışma ayrıca korunuyor. Yeni test/provider benchmark yapılmadı: bu teslim araştırma ve plan değişikliğidir.

Son hesap kontrolü: 2026-09-10T09:33:34.187Z, `account/rateLimits/read`, haftalık kalan %6, modelCalls0. %5 rezerv politikası sürüyor; bu planı teslim ettikten sonra yeni implementation/provider işi açılmayacak.
